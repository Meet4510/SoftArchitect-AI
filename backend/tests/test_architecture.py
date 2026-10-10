from datetime import datetime

import pytest
from httpx import AsyncClient

from app.agents.architecture import design_architecture
from app.auth.deps import get_current_user
from app.main import app
from app.schemas.architecture import SoftwareArchitecture
from app.schemas.technology_recommendation import TechnologyRecommendation


def sample_technology_recommendation():
    return TechnologyRecommendation(
        project_summary="Stack for QuickBite",
        recommendations=[
            {
                "category": "Frontend",
                "recommendation": "React and TypeScript",
                "rationale": "Typed responsive UI.",
                "alternatives": ["Vue"],
                "trade_offs": ["Separate build."],
            },
            {
                "category": "Backend API",
                "recommendation": "FastAPI and Pydantic",
                "rationale": "Typed REST API.",
                "alternatives": ["Django"],
                "trade_offs": ["Python conventions."],
            },
            {
                "category": "Primary database",
                "recommendation": "MongoDB Atlas with Motor",
                "rationale": "Document database.",
                "alternatives": ["Local MongoDB"],
                "trade_offs": ["Index design."],
            },
            {
                "category": "Payments",
                "recommendation": "Hosted payment adapter",
                "rationale": "Keep card data outside the app.",
                "alternatives": ["Stripe"],
                "trade_offs": ["Provider fees."],
            },
            {
                "category": "Notifications",
                "recommendation": "Notification provider and retryable jobs",
                "rationale": "Decouple message delivery.",
                "alternatives": ["Email only"],
                "trade_offs": ["Queue operations."],
            },
        ],
    )


def test_architecture_uses_saved_stack_and_requirement_driven_modules():
    architecture = design_architecture(
        "Customers place orders, make payments, track deliveries, and receive order notifications.",
        "QuickBite",
        sample_technology_recommendation(),
    )

    component_ids = {component.id for component in architecture.components}
    assert {"web-app", "api", "orders", "database", "payments", "delivery", "notifications"} <= component_ids
    assert next(item for item in architecture.components if item.id == "web-app").technologies == [
        "React and TypeScript"
    ]
    assert "MongoDB Atlas with Motor" in next(
        item for item in architecture.components if item.id == "database"
    ).technologies
    assert all(edge.source in component_ids and edge.target in component_ids for edge in architecture.connections)
    assert "flowchart LR" in architecture.mermaid_diagram


@pytest.mark.asyncio
async def test_architecture_generation_requires_stack_and_saves_owner_scoped_result(monkeypatch):
    project = {
        "id": "project-1",
        "user_id": "user-1",
        "name": "QuickBite",
        "requirements": "Customers place orders, make payments, and track deliveries.",
    }
    saved = {}
    recommendation = {
        "id": "technology-1",
        "source_requirements": project["requirements"],
        "recommendation": sample_technology_recommendation().dict(),
    }

    async def fake_get_project(project_id):
        return project if project_id == "project-1" else None

    async def fake_get_technology(project_id):
        return recommendation

    async def fake_save(project_id, user_id, source, recommendation_id, architecture):
        saved["document"] = {
            "id": "architecture-1",
            "project_id": project_id,
            "source_requirements": source,
            "architecture": architecture.dict(),
            "created_at": datetime.utcnow(),
        }
        return saved["document"]

    async def fake_get_latest(project_id):
        return saved.get("document")

    monkeypatch.setattr("app.api.architecture.get_project", fake_get_project)
    monkeypatch.setattr("app.api.architecture.gemini_enabled", lambda: False)
    monkeypatch.setattr("app.api.architecture.get_latest_technology_recommendation", fake_get_technology)
    monkeypatch.setattr("app.api.architecture.save_architecture", fake_save)
    monkeypatch.setattr("app.api.architecture.get_latest_architecture", fake_get_latest)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/projects/project-1/architecture/generate")
            assert response.status_code == 200
            assert response.json()["id"] == "architecture-1"
            assert response.json()["project_id"] == "project-1"

            fetched = await client.get("/api/v1/projects/project-1/architecture")
            assert fetched.status_code == 200
            assert fetched.json()["id"] == "architecture-1"

            project["requirements"] += " Customers also receive dispatch updates."
            stale_architecture = await client.get("/api/v1/projects/project-1/architecture")
            assert stale_architecture.status_code == 404
            assert stale_architecture.json()["detail"]["code"] == "architecture_not_found"
            project["requirements"] = project["requirements"].removesuffix(
                " Customers also receive dispatch updates."
            )

            monkeypatch.setattr(
                "app.api.architecture.get_latest_technology_recommendation",
                lambda project_id: _no_technology(),
            )
            missing_stack = await client.post("/api/v1/projects/project-1/architecture/generate")
            assert missing_stack.status_code == 409
            assert missing_stack.json()["detail"]["code"] == "technology_recommendation_required"

        app.dependency_overrides[get_current_user] = lambda: {"id": "user-2", "role": "USER"}
        async with AsyncClient(app=app, base_url="http://test") as client:
            forbidden = await client.post("/api/v1/projects/project-1/architecture/generate")
            assert forbidden.status_code == 403

        invalid_architecture = {
            "project_summary": "Architecture",
            "architectural_style": "Modular monolith",
            "components": [{"id": "client", "name": "Client", "component_type": "UI", "description": "Web UI", "technologies": []}],
            "connections": [{"source": "client", "target": "missing", "label": "invalid edge"}],
            "design_decisions": ["Use a modular monolith."],
            "mermaid_diagram": "flowchart LR",
        }
        with pytest.raises(ValueError):
            SoftwareArchitecture(**invalid_architecture)
    finally:
        app.dependency_overrides.clear()


async def _no_technology():
    return None
