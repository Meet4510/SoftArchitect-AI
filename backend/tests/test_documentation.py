from datetime import datetime

import pytest
from httpx import AsyncClient

from app.agents.documentation import generate_technical_documentation
from app.auth.deps import get_current_user
from app.main import app


REQUIREMENTS = (
    "Customers register, browse restaurants, add meals to a cart, place orders, "
    "make payments, and track deliveries. Restaurant owners manage menus."
)


def test_documentation_contains_project_roadmap_risks_and_required_sections():
    project = {
        "name": "QuickBite",
        "description": "Food delivery marketplace",
        "domain": "FoodTech",
        "requirements": REQUIREMENTS,
    }
    prompt = "Create an API-focused guide for backend developers, including endpoint access roles."
    documentation = generate_technical_documentation(project, prompt=prompt)

    assert len(documentation.roadmap) >= 4
    assert any(risk.category == "Payment integration" for risk in documentation.risks)
    assert documentation.generation_prompt == prompt
    assert any(section.title == "API implementation details" for section in documentation.custom_sections)
    assert "## Requirements" in documentation.markdown
    assert "## Documentation request" in documentation.markdown
    assert prompt in documentation.markdown
    assert "## Development roadmap" in documentation.markdown
    assert "## Risk register" in documentation.markdown
    assert "README.md" in documentation.folder_structure
    assert "frontend/" in documentation.folder_structure


@pytest.mark.asyncio
async def test_documentation_routes_generate_retrieve_and_enforce_ownership(monkeypatch):
    project_id = "64b000000000000000000001"
    project = {
        "id": project_id,
        "user_id": "user-1",
        "name": "QuickBite",
        "description": "Food delivery marketplace",
        "requirements": REQUIREMENTS,
    }
    saved_document = {}

    async def fake_get_project(requested_project_id):
        return project if requested_project_id == project_id else None

    async def fake_get_sources(requested_project_id, requirements):
        assert requested_project_id == project_id
        assert requirements == project["requirements"]
        return (None, None, None, None)

    async def fake_save(requested_project_id, user_id, source_requirements, documentation):
        saved_document.update({
            "id": "documentation-1",
            "project_id": requested_project_id,
            "source_requirements": source_requirements,
            "documentation": documentation.dict(),
            "created_at": datetime(2026, 1, 1),
        })
        return saved_document

    async def fake_get_latest(requested_project_id):
        return saved_document or None

    monkeypatch.setattr("app.api.documentation.get_project", fake_get_project)
    monkeypatch.setattr("app.api.documentation.gemini_enabled", lambda: False)
    monkeypatch.setattr("app.api.documentation._get_sources", fake_get_sources)
    monkeypatch.setattr("app.api.documentation.save_documentation", fake_save)
    monkeypatch.setattr("app.api.documentation.get_latest_documentation", fake_get_latest)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            generated = await client.post(
                f"/api/v1/projects/{project_id}/documentation/generate",
                json={"prompt": "Create a concise technical handoff focused on testing and security."},
                headers={"Authorization": "Bearer test"},
            )
            assert generated.status_code == 200
            assert generated.json()["project_id"] == project_id
            assert generated.json()["roadmap"]
            assert generated.json()["generation_prompt"] == "Create a concise technical handoff focused on testing and security."
            assert any(section["title"] == "Testing guidance" for section in generated.json()["custom_sections"])

            invalid_prompt = await client.post(
                f"/api/v1/projects/{project_id}/documentation/generate",
                json={"prompt": "short"},
                headers={"Authorization": "Bearer test"},
            )
            assert invalid_prompt.status_code == 422

            loaded = await client.get(
                f"/api/v1/projects/{project_id}/documentation",
                headers={"Authorization": "Bearer test"},
            )
            assert loaded.status_code == 200
            assert loaded.json()["id"] == "documentation-1"

            project["requirements"] += " Customers also receive dispatch updates."
            stale_documentation = await client.get(
                f"/api/v1/projects/{project_id}/documentation",
                headers={"Authorization": "******"},
            )
            assert stale_documentation.status_code == 404
            assert stale_documentation.json()["detail"]["code"] == "documentation_not_found"

            app.dependency_overrides[get_current_user] = lambda: {"id": "someone-else", "role": "USER"}
            forbidden = await client.get(
                f"/api/v1/projects/{project_id}/documentation",
                headers={"Authorization": "Bearer test"},
            )
            assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)
