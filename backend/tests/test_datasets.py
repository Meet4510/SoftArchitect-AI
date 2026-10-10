from datetime import datetime

import pytest
from httpx import AsyncClient

from app.agents.architecture import design_architecture
from app.agents.dataset_generator import generate_synthetic_dataset
from app.agents.database_design import design_mongodb_schema
from app.auth.deps import get_current_user
from app.main import app
from app.schemas.technology_recommendation import TechnologyRecommendation


REQUIREMENTS = (
    "Customers browse restaurant menus, add menu items to carts, place orders, "
    "make payments, and track deliveries. Restaurant owners manage menus and orders."
)


def sample_database_design():
    technology = TechnologyRecommendation(
        project_summary="Sample stack",
        recommendations=[
            {
                "category": category,
                "recommendation": "Selected",
                "rationale": "Fits requirements.",
                "alternatives": [],
                "trade_offs": [],
            }
            for category in ["Frontend", "Backend API", "Primary database"]
        ],
    )
    architecture = design_architecture(REQUIREMENTS, "QuickBite", technology)
    return design_mongodb_schema(REQUIREMENTS, "QuickBite", architecture)


def test_synthetic_dataset_matches_design_and_preserves_references():
    design = sample_database_design()
    counts = {collection.name: 3 for collection in design.collections}
    counts.update(
        {
            name: count
            for name, count in {
                "users": 3,
                "restaurants": 2,
                "menu_items": 8,
                "orders": 12,
                "carts": 3,
                "payments": 24,
                "deliveries": 12,
                "audit_logs": 4,
            }.items()
            if name in counts
        }
    )
    dataset = generate_synthetic_dataset(
        design,
        "QuickBite",
        "database-design-1",
        counts,
    )
    collections = {collection.name: collection.records for collection in dataset.collections}

    assert set(collections) == {collection.name for collection in design.collections}
    assert {name: len(records) for name, records in collections.items()} == counts
    assert all(record["_id"] for records in collections.values() for record in records)

    user_ids = {record["_id"] for record in collections["users"]}
    assert all(record["owner_id"] in user_ids for record in collections["restaurants"])
    order_counts_by_user = {
        user_id: sum(order["customer_id"] == user_id for order in collections["orders"])
        for user_id in user_ids
    }
    assert set(order_counts_by_user.values()) == {4}

    menu_item_ids = {row["_id"] for row in collections["menu_items"]}
    menu_item_counts_by_restaurant = {
        restaurant["_id"]: sum(
            item["restaurant_id"] == restaurant["_id"]
            for item in collections["menu_items"]
        )
        for restaurant in collections["restaurants"]
    }
    assert set(menu_item_counts_by_restaurant.values()) == {4}
    assert all(
        item["menu_item_id"] in menu_item_ids
        for order in collections["orders"]
        for item in order.get("items", [])
    )
    assert len({delivery["order_id"] for delivery in collections["deliveries"]}) == 12
    assert all(
        sum(payment["order_id"] == order["_id"] for payment in collections["payments"]) == 2
        for order in collections["orders"]
    )
    assert all(
        record["password_hash"].endswith("not-for-authentication")
        for record in collections["users"]
    )


@pytest.mark.parametrize("count", [0, 501])
def test_synthetic_dataset_rejects_out_of_range_record_counts(count):
    counts = {collection.name: 3 for collection in sample_database_design().collections}
    with pytest.raises(ValueError, match="between 1 and 500"):
        counts["users"] = count
        generate_synthetic_dataset(sample_database_design(), "QuickBite", "design-1", counts)


def test_synthetic_dataset_requires_equal_counts_for_one_to_one_relationships():
    design = sample_database_design()
    counts = {collection.name: 3 for collection in design.collections}
    counts["deliveries"] = 4
    with pytest.raises(ValueError, match="One-to-one relationships require equal"):
        generate_synthetic_dataset(design, "QuickBite", "design-1", counts)


@pytest.mark.asyncio
async def test_dataset_routes_generate_load_and_enforce_ownership(monkeypatch):
    design = sample_database_design()
    project = {
        "id": "64b000000000000000000001",
        "user_id": "user-1",
        "name": "QuickBite",
        "requirements": REQUIREMENTS,
    }
    saved_design = {
        "id": "database-design-1",
        "source_requirements": project["requirements"],
        "database_design": design.dict(),
    }
    counts = {collection.name: 2 for collection in design.collections}
    saved = {}

    async def fake_get_project(project_id):
        return project if project_id == "64b000000000000000000001" else None

    async def fake_get_design(project_id):
        return saved_design

    async def fake_save_dataset(project_id, user_id, dataset):
        saved["document"] = {
            "id": "dataset-1",
            "project_id": project_id,
            "dataset": dataset.dict(),
            "created_at": datetime.utcnow(),
        }
        return saved["document"]

    async def fake_get_dataset(project_id):
        return saved.get("document")

    monkeypatch.setattr("app.api.datasets.get_project", fake_get_project)
    monkeypatch.setattr("app.api.datasets.get_latest_database_design", fake_get_design)
    monkeypatch.setattr("app.api.datasets.save_dataset", fake_save_dataset)
    monkeypatch.setattr("app.api.datasets.get_latest_dataset", fake_get_dataset)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/projects/64b000000000000000000001/datasets/generate",
                json={"records_by_collection": counts},
            )
            assert response.status_code == 200
            assert response.json()["id"] == "dataset-1"
            assert response.json()["records_by_collection"] == counts

            fetched = await client.get(
                "/api/v1/projects/64b000000000000000000001/datasets/latest"
            )
            assert fetched.status_code == 200
            assert fetched.json()["project_id"] == "64b000000000000000000001"

            project["requirements"] += " Customers also receive dispatch updates."
            stale_dataset = await client.get(
                "/api/v1/projects/64b000000000000000000001/datasets/latest"
            )
            assert stale_dataset.status_code == 404
            assert stale_dataset.json()["detail"]["code"] == "dataset_not_found"

        app.dependency_overrides[get_current_user] = lambda: {"id": "user-2", "role": "USER"}
        async with AsyncClient(app=app, base_url="http://test") as client:
            forbidden = await client.post(
                "/api/v1/projects/64b000000000000000000001/datasets/generate",
                json={"records_by_collection": counts},
            )
            assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.clear()
