from datetime import datetime

import pytest
from httpx import AsyncClient

from app.agents.architecture import design_architecture
from app.agents.api_design import design_rest_api
from app.agents.database_design import design_mongodb_schema
from app.auth.deps import get_current_user
from app.main import app
from app.schemas.api_design import RestApiDesign
from app.schemas.technology_recommendation import TechnologyRecommendation


REQUIREMENTS = (
    "Customers register, browse restaurants, search menus, add items to a cart, place orders, "
    "make payments, and track deliveries. Restaurant owners manage menus and orders. "
    "Delivery drivers update delivery status. Administrators view reports and users receive notifications."
)


def build_database_design():
    technology = TechnologyRecommendation(
        project_summary="QuickBite technology stack",
        recommendations=[
            {
                "category": category,
                "recommendation": category,
                "rationale": "Fits the project requirements.",
                "alternatives": [],
                "trade_offs": [],
            }
            for category in ["Frontend", "Backend API", "Primary database"]
        ],
    )
    architecture = design_architecture(REQUIREMENTS, "QuickBite", technology)
    return design_mongodb_schema(REQUIREMENTS, "QuickBite", architecture)


def test_api_design_is_valid_and_openapi_matches_endpoint_contract():
    design = design_rest_api(REQUIREMENTS, "QuickBite", build_database_design())
    operations = {(endpoint.method.lower(), endpoint.path) for endpoint in design.endpoints}

    assert design.api_title == "QuickBite API"
    assert design.openapi_spec["openapi"] == "3.0.3"
    assert design.openapi_spec["components"]["securitySchemes"]["BearerAuth"]["scheme"] == "bearer"
    assert ("post", "/api/v1/auth/register") in operations
    assert ("post", "/api/v1/payments/checkout") in operations
    assert ("patch", "/api/v1/deliveries/{delivery_id}/status") in operations
    assert design.openapi_spec["paths"]["/api/v1/orders"]["get"]["x-required-roles"] == [
        "CUSTOMER",
        "RESTAURANT_OWNER",
        "DELIVERY_DRIVER",
        "ADMIN",
    ]
    assert design.openapi_spec["paths"]["/api/v1/orders"]["get"]["parameters"][0]["in"] == "query"
    for method, path in operations:
        assert method in design.openapi_spec["paths"][path]
    assert "password_hash" not in str(
        design.openapi_spec["paths"].get("/api/v1/users", {}).get("post", {})
    )


def test_api_design_schema_rejects_duplicate_operations_and_invalid_openapi():
    base = design_rest_api(REQUIREMENTS, "QuickBite", build_database_design()).dict()
    base["endpoints"].append(base["endpoints"][0])
    with pytest.raises(ValueError, match="method and path"):
        RestApiDesign(**base)

    base = design_rest_api(REQUIREMENTS, "QuickBite", build_database_design()).dict()
    base["openapi_spec"] = {"openapi": "2.0", "paths": {"/api/v1/test": {}}}
    with pytest.raises(ValueError, match="3.0.3"):
        RestApiDesign(**base)


@pytest.mark.asyncio
async def test_api_design_endpoint_requires_database_design_persists_and_enforces_ownership(monkeypatch):
    project = {
        "id": "project-1",
        "user_id": "user-1",
        "name": "QuickBite",
        "requirements": REQUIREMENTS,
    }
    database_design = {
        "id": "database-design-1",
        "database_design": build_database_design().dict(),
    }
    saved = {}

    async def fake_get_project(project_id):
        return project if project_id == "project-1" else None

    async def fake_get_database_design(project_id):
        return database_design

    async def fake_save(project_id, user_id, source, source_database_design_id, api_design):
        saved["document"] = {
            "id": "api-design-1",
            "project_id": project_id,
            "api_design": api_design.dict(),
            "created_at": datetime.utcnow(),
        }
        return saved["document"]

    async def fake_get_latest(project_id):
        return saved.get("document")

    monkeypatch.setattr("app.api.api_design.get_project", fake_get_project)
    monkeypatch.setattr("app.api.api_design.get_latest_database_design", fake_get_database_design)
    monkeypatch.setattr("app.api.api_design.save_api_design", fake_save)
    monkeypatch.setattr("app.api.api_design.get_latest_api_design", fake_get_latest)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/projects/project-1/api-design/generate")
            assert response.status_code == 200
            assert response.json()["id"] == "api-design-1"
            assert response.json()["api_title"] == "QuickBite API"
            assert response.json()["openapi_spec"]["openapi"] == "3.0.3"

            fetched = await client.get("/api/v1/projects/project-1/api-design")
            assert fetched.status_code == 200

            monkeypatch.setattr(
                "app.api.api_design.get_latest_database_design",
                _no_database_design,
            )
            missing_database_design = await client.post(
                "/api/v1/projects/project-1/api-design/generate"
            )
            assert missing_database_design.status_code == 409
            assert missing_database_design.json()["detail"]["code"] == "database_design_required"

        app.dependency_overrides[get_current_user] = lambda: {"id": "user-2", "role": "USER"}
        async with AsyncClient(app=app, base_url="http://test") as client:
            forbidden = await client.post("/api/v1/projects/project-1/api-design/generate")
            assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.clear()


async def _no_database_design(project_id):
    return None
