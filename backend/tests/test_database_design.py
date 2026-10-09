from datetime import datetime

import pytest
from httpx import AsyncClient

from app.agents.architecture import design_architecture
from app.agents.database_design import design_mongodb_schema
from app.auth.deps import get_current_user
from app.main import app
from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.technology_recommendation import TechnologyRecommendation


REQUIREMENTS = (
    "Customers register, browse restaurants, search menus, add items to a cart, place orders, "
    "make payments, and track deliveries. Restaurant owners manage menus and orders. "
    "Delivery drivers update delivery status. Administrators view reports and users receive notifications."
)

CHEN_ERD = """flowchart LR
Entity1["users"]:::erEntity
Attribute1(["PK _id: ObjectId"]):::erKey
Entity1 --- Attribute1
classDef erEntity fill:#0f172a
classDef erRelationship fill:#312e81
classDef erAttribute fill:#1e293b
classDef erKey fill:#164e63
"""


def sample_technology_recommendation():
    categories = ["Frontend", "Backend API", "Primary database", "Payments", "Notifications"]
    return TechnologyRecommendation(
        project_summary="QuickBite stack",
        recommendations=[
            {
                "category": category,
                "recommendation": f"Selected {category}",
                "rationale": "Fits the project requirements.",
                "alternatives": [],
                "trade_offs": [],
            }
            for category in categories
        ],
    )


def test_database_design_contains_requirement_driven_collections_indexes_and_relationships():
    architecture = design_architecture(
        REQUIREMENTS,
        "QuickBite",
        sample_technology_recommendation(),
    )
    design = design_mongodb_schema(REQUIREMENTS, "QuickBite", architecture)
    collections = {collection.name: collection for collection in design.collections}

    assert design.database_name == "softarchitect_ai"
    assert {"users", "restaurants", "menu_items", "carts", "orders", "payments", "deliveries", "notifications", "audit_logs"} <= set(collections)
    assert "unique: email" in collections["users"].indexes
    assert collections["users"].primary_key == "_id"
    assert collections["users"].foreign_keys == []
    assert any(
        foreign_key.field == "restaurant_id"
        and foreign_key.references_collection == "restaurants"
        and foreign_key.references_field == "_id"
        for foreign_key in collections["menu_items"].foreign_keys
    )
    assert any(
        foreign_key.field == "order_id" and foreign_key.references_collection == "orders"
        for foreign_key in collections["payments"].foreign_keys
    )
    assert any(field.name == "password_hash" and "raw password" in field.description for field in collections["users"].fields)
    assert any(field.name == "items" and field.bson_type == "array<object>" for field in collections["orders"].fields)
    assert all(
        relationship.from_collection in collections and relationship.to_collection in collections
        for relationship in design.relationships
    )
    assert design.mermaid_diagram.startswith("flowchart LR")
    assert 'Entity1["users"]:::erEntity' in design.mermaid_diagram
    assert 'Attribute1_1(["PK _id: ObjectId"]):::erKey' in design.mermaid_diagram
    assert 'Relationship1{"Each restaurant has one owner"}:::erRelationship' in design.mermaid_diagram
    assert "Entity2 ---|N| Relationship1" in design.mermaid_diagram
    assert "Relationship1 ---|1| Entity1" in design.mermaid_diagram


@pytest.mark.asyncio
async def test_database_design_requires_architecture_saves_and_enforces_ownership(monkeypatch):
    project = {
        "id": "project-1",
        "user_id": "user-1",
        "name": "QuickBite",
        "requirements": REQUIREMENTS,
    }
    architecture_model = design_architecture(
        REQUIREMENTS,
        "QuickBite",
        sample_technology_recommendation(),
    )
    architecture = {
        "id": "architecture-1",
        "architecture": architecture_model.dict(),
    }
    saved = {}

    async def fake_get_project(project_id):
        return project if project_id == "project-1" else None

    async def fake_get_architecture(project_id):
        return architecture

    async def fake_save(project_id, user_id, source, architecture_id, database_design):
        saved["document"] = {
            "id": "database-design-1",
            "project_id": project_id,
            "database_design": database_design.dict(),
            "created_at": datetime.utcnow(),
        }
        return saved["document"]

    async def fake_get_latest(project_id):
        return saved.get("document")

    monkeypatch.setattr("app.api.database_design.get_project", fake_get_project)
    monkeypatch.setattr("app.api.database_design.get_latest_architecture", fake_get_architecture)
    monkeypatch.setattr("app.api.database_design.save_database_design", fake_save)
    monkeypatch.setattr("app.api.database_design.get_latest_database_design", fake_get_latest)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/projects/project-1/database-design/generate")
            assert response.status_code == 200
            assert response.json()["id"] == "database-design-1"
            assert response.json()["database_name"] == "softarchitect_ai"

            fetched = await client.get("/api/v1/projects/project-1/database-design")
            assert fetched.status_code == 200

            monkeypatch.setattr(
                "app.api.database_design.get_latest_architecture",
                _no_architecture,
            )
            missing_architecture = await client.post(
                "/api/v1/projects/project-1/database-design/generate"
            )
            assert missing_architecture.status_code == 409
            assert missing_architecture.json()["detail"]["code"] == "architecture_required"

        app.dependency_overrides[get_current_user] = lambda: {"id": "user-2", "role": "USER"}
        async with AsyncClient(app=app, base_url="http://test") as client:
            forbidden = await client.post("/api/v1/projects/project-1/database-design/generate")
            assert forbidden.status_code == 403

        invalid_design = {
            "project_summary": "Invalid model",
            "database_name": "softarchitect_ai",
            "collections": [
                {
                    "name": "users",
                    "purpose": "Users",
                    "primary_key": "_id",
                    "foreign_keys": [],
                    "fields": [
                        {"name": "_id", "bson_type": "ObjectId", "required": True, "description": "ID"},
                        {"name": "_id", "bson_type": "string", "required": True, "description": "Duplicate"},
                    ],
                    "indexes": [],
                    "embedding_strategy": "Separate",
                }
            ],
            "relationships": [],
            "design_decisions": ["Use MongoDB."],
            "mermaid_diagram": CHEN_ERD,
        }
        with pytest.raises(ValueError):
            MongoDatabaseDesign(**invalid_design)

        invalid_foreign_key_design = {
            "project_summary": "Invalid foreign key",
            "database_name": "softarchitect_ai",
            "collections": [
                {
                    "name": "users",
                    "purpose": "Users",
                    "primary_key": "_id",
                    "foreign_keys": [
                        {
                            "field": "missing_id",
                            "references_collection": "users",
                            "references_field": "_id",
                            "description": "Unknown local field",
                        }
                    ],
                    "fields": [
                        {"name": "_id", "bson_type": "ObjectId", "required": True, "description": "ID"},
                    ],
                    "indexes": [],
                    "embedding_strategy": "Separate",
                }
            ],
            "relationships": [],
            "design_decisions": ["Use MongoDB."],
            "mermaid_diagram": CHEN_ERD,
        }
        with pytest.raises(ValueError, match="local field"):
            MongoDatabaseDesign(**invalid_foreign_key_design)
    finally:
        app.dependency_overrides.clear()


async def _no_architecture(project_id):
    return None
