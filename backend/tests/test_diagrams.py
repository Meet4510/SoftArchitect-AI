from datetime import datetime

import pytest
from httpx import AsyncClient

from app.agents.architecture import design_architecture
from app.agents.api_design import design_rest_api
from app.agents.database_design import design_mongodb_schema
from app.agents.diagrams import design_uml_diagrams
from app.auth.deps import get_current_user
from app.main import app
from app.schemas.diagrams import UmlDiagramSet
from app.schemas.technology_recommendation import TechnologyRecommendation


REQUIREMENTS = (
    "Customers register, browse restaurants, search menus, add items to a cart, place orders, "
    "make payments, and track deliveries. Restaurant owners manage menus and orders. "
    "Delivery drivers update delivery status. Administrators view reports and users receive notifications."
)


def build_source_designs():
    technology = TechnologyRecommendation(
        project_summary="QuickBite stack",
        recommendations=[
            {
                "category": category,
                "recommendation": category,
                "rationale": "Fits project requirements.",
                "alternatives": [],
                "trade_offs": [],
            }
            for category in ["Frontend", "Backend API", "Primary database"]
        ],
    )
    architecture = design_architecture(REQUIREMENTS, "QuickBite", technology)
    database_design = design_mongodb_schema(REQUIREMENTS, "QuickBite", architecture)
    api_design = design_rest_api(REQUIREMENTS, "QuickBite", database_design)
    return database_design, api_design, architecture


def test_uml_diagrams_are_complete_and_derived_from_saved_blueprint_contracts():
    database_design, api_design, architecture = build_source_designs()
    diagrams = design_uml_diagrams(
        REQUIREMENTS,
        "QuickBite",
        database_design,
        api_design,
        architecture,
    )
    by_type = {diagram.diagram_type: diagram for diagram in diagrams.diagrams}

    assert set(by_type) == {"use_case", "sequence", "class", "entity_relationship", "module_hierarchy"}
    assert "Customer" in by_type["use_case"].mermaid_source
    assert "Pay for an order" in by_type["use_case"].mermaid_source
    assert "sequenceDiagram" in by_type["sequence"].mermaid_source
    assert "POST /api/v1/orders" in by_type["sequence"].mermaid_source
    assert "classDiagram" in by_type["class"].mermaid_source
    assert "ObjectId _id" in by_type["class"].mermaid_source
    assert 'orders "1" --> "0..*" payments : order_id' in by_type["class"].mermaid_source
    erd = by_type["entity_relationship"].mermaid_source
    assert erd.startswith("flowchart LR")
    assert 'Entity1["users"]:::erEntity' in erd
    assert 'Relationship1{"Each restaurant has one owner"}:::erRelationship' in erd
    assert 'Attribute1_1(["PK _id: ObjectId"]):::erKey' in erd
    assert 'Attribute2_2(["FK owner_id: ObjectId"]):::erKey' in erd
    assert "Entity2 ---|N| Relationship1" in erd
    assert "Relationship1 ---|1| Entity1" in erd
    assert "classDef erAttribute" in erd
    assert by_type["module_hierarchy"].mermaid_source.startswith("flowchart TB")
    assert "Domain module" in by_type["module_hierarchy"].mermaid_source
    assert "Restaurant and menu catalog" in by_type["module_hierarchy"].mermaid_source


def test_uml_schema_rejects_missing_types_and_mismatched_mermaid():
    database_design, api_design, architecture = build_source_designs()
    payload = design_uml_diagrams(
        REQUIREMENTS,
        "QuickBite",
        database_design,
        api_design,
        architecture,
    ).dict()
    payload["diagrams"] = payload["diagrams"][:-1]
    with pytest.raises(ValueError, match="module-hierarchy diagrams"):
        UmlDiagramSet(**payload)

    payload = design_uml_diagrams(
        REQUIREMENTS,
        "QuickBite",
        database_design,
        api_design,
        architecture,
    ).dict()
    payload["diagrams"][0]["mermaid_source"] = "sequenceDiagram"
    with pytest.raises(ValueError, match="match the declared diagram type"):
        UmlDiagramSet(**payload)


@pytest.mark.asyncio
async def test_diagram_routes_persist_require_api_design_and_enforce_ownership(monkeypatch):
    project = {
        "id": "project-1",
        "user_id": "user-1",
        "name": "QuickBite",
        "requirements": REQUIREMENTS,
    }
    database_design, api_design, architecture = build_source_designs()
    saved_api = {"id": "api-design-1", "api_design": api_design.dict()}
    saved_database = {"id": "database-design-1", "database_design": database_design.dict()}
    saved_architecture = {"id": "architecture-1", "architecture": architecture.dict()}
    saved = {}

    async def fake_get_project(project_id):
        return project if project_id == "project-1" else None

    async def fake_get_api_design(project_id):
        return saved_api

    async def fake_get_database_design(project_id):
        return saved_database

    async def fake_get_architecture(project_id):
        return saved_architecture

    async def fake_save_database_design(
        project_id,
        user_id,
        source_requirements,
        source_architecture_id,
        database_design,
    ):
        saved["database_design"] = database_design
        return {
            "id": "database-design-upgraded",
            "database_design": database_design.dict(),
        }

    async def fake_save(project_id, user_id, source, source_api_design_id, diagram_set):
        saved["document"] = {
            "id": "diagrams-1",
            "project_id": project_id,
            "diagram_set": diagram_set.dict(),
            "created_at": datetime.utcnow(),
        }
        return saved["document"]

    async def fake_get_latest(project_id):
        return saved.get("document")

    monkeypatch.setattr("app.api.diagrams.get_project", fake_get_project)
    monkeypatch.setattr("app.api.diagrams.get_latest_api_design", fake_get_api_design)
    monkeypatch.setattr("app.api.diagrams.get_latest_database_design", fake_get_database_design)
    monkeypatch.setattr("app.api.diagrams.get_latest_architecture", fake_get_architecture)
    monkeypatch.setattr("app.api.diagrams.save_diagrams", fake_save)
    monkeypatch.setattr("app.api.diagrams.get_latest_diagrams", fake_get_latest)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/projects/project-1/diagrams/generate")
            assert response.status_code == 200
            assert response.json()["id"] == "diagrams-1"
            assert len(response.json()["diagrams"]) == 5

            fetched = await client.get("/api/v1/projects/project-1/diagrams")
            assert fetched.status_code == 200

            stale_database_design = database_design.dict()
            stale_database_design["mermaid_diagram"] = "erDiagram\n  users {}"
            monkeypatch.setattr(
                "app.api.diagrams.get_latest_database_design",
                lambda project_id: _saved_database_design(stale_database_design),
            )
            monkeypatch.setattr(
                "app.api.diagrams.save_database_design",
                fake_save_database_design,
            )
            upgraded = await client.post("/api/v1/projects/project-1/diagrams/generate")
            assert upgraded.status_code == 200
            assert saved["database_design"].mermaid_diagram.startswith("flowchart LR")

            monkeypatch.setattr("app.api.diagrams.get_latest_api_design", _no_api_design)
            missing_api = await client.post("/api/v1/projects/project-1/diagrams/generate")
            assert missing_api.status_code == 409
            assert missing_api.json()["detail"]["code"] == "api_design_required"

        app.dependency_overrides[get_current_user] = lambda: {"id": "user-2", "role": "USER"}
        async with AsyncClient(app=app, base_url="http://test") as client:
            forbidden = await client.post("/api/v1/projects/project-1/diagrams/generate")
            assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.clear()


async def _no_api_design(project_id):
    return None


async def _saved_database_design(database_design):
    return {
        "id": "database-design-stale",
        "database_design": database_design,
    }
