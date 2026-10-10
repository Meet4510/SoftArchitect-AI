from datetime import datetime

import pytest
from httpx import AsyncClient

from app.auth.deps import get_current_user
from app.agents.requirement_analysis import analyze_requirements
from app.main import app
from app.schemas.requirement_analysis import RequirementAnalysis


def test_demo_agent_preserves_role_workflows_and_builds_grounded_modules():
    requirements = (
        "Customers can register, log in, browse restaurants, search menus, add food items "
        "to a cart, place orders, make payments, and track deliveries. Restaurant owners "
        "can manage restaurant profiles, menus, prices, and incoming orders. Delivery "
        "drivers can view assigned deliveries and update delivery status. Administrators "
        "can manage users, restaurants, payments, and reports. The system should protect "
        "customer data and send order notifications."
    )

    result = analyze_requirements(requirements, "QuickBite Food Delivery")

    assert len(result.project_summary) > 360
    assert result.project_summary.endswith("notifications.")
    assert result.user_roles == [
        "Administrator",
        "Customer",
        "Restaurant owner",
        "Delivery driver",
    ]
    assert len(result.functional_requirements) == 5
    assert any("Delivery drivers can view assigned deliveries" in item for item in result.functional_requirements)
    assert any("Administrators can manage users" in item for item in result.functional_requirements)
    assert all("stated requirement" not in item for item in result.functional_requirements)
    assert result.functional_requirements[0].startswith("Customers can register")
    assert "Delivery Tracking" in result.modules
    assert "Payments And Billing" in result.modules


@pytest.mark.asyncio
async def test_requirement_analysis_is_validated_saved_and_owner_protected(monkeypatch):
    monkeypatch.setattr("app.api.requirement_analysis.settings.DEMO_MODE", True)
    monkeypatch.setattr("app.api.requirement_analysis.settings.LLM_PROVIDER", "gemini")
    project = {
        "_id": "project-1",
        "id": "project-1",
        "user_id": "user-1",
        "name": "Food Delivery",
        "requirements": (
            "Customers can register and browse restaurants, place orders, pay, "
            "and track delivery. Restaurant owners can manage menus and orders."
        ),
    }
    saved = {}

    async def fake_get_project(project_id):
        return project if project_id == "project-1" else None

    async def fake_update_project(project_id, updates):
        project.update(updates)
        return project

    async def fake_save(project_id, user_id, source, analysis):
        document = {
            "id": "analysis-1",
            "project_id": project_id,
            "source_requirements": source,
            "analysis": analysis.dict(),
            "created_at": datetime.utcnow(),
        }
        saved["document"] = document
        return document

    async def fake_get_latest(project_id):
        return saved.get("document")

    monkeypatch.setattr("app.api.requirement_analysis.get_project", fake_get_project)
    monkeypatch.setattr("app.api.requirement_analysis.update_project", fake_update_project)
    monkeypatch.setattr("app.api.requirement_analysis.save_requirement_analysis", fake_save)
    monkeypatch.setattr("app.api.requirement_analysis.get_latest_requirement_analysis", fake_get_latest)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/projects/project-1/requirements/analyze",
            )
            assert response.status_code == 200
            result = response.json()
            assert result["project_id"] == "project-1"
            assert "customer" in result["user_roles"][0].lower()
            assert result["functional_requirements"]
            assert "password_hash" not in result

            fetched = await client.get(
                "/api/v1/projects/project-1/requirements/analysis",
            )
            assert fetched.status_code == 200
            assert fetched.json()["id"] == "analysis-1"

            project["requirements"] += " Customers also receive dispatch updates."
            stale_analysis = await client.get(
                "/api/v1/projects/project-1/requirements/analysis",
            )
            assert stale_analysis.status_code == 404
            assert stale_analysis.json()["detail"]["code"] == "analysis_not_found"

            short = await client.post(
                "/api/v1/projects/project-1/requirements/analyze",
                json={"requirements": "Too short"},
            )
            assert short.status_code == 422

        app.dependency_overrides[get_current_user] = lambda: {"id": "user-2", "role": "USER"}
        async with AsyncClient(app=app, base_url="http://test") as client:
            forbidden = await client.post(
                "/api/v1/projects/project-1/requirements/analyze",
            )
            assert forbidden.status_code == 403

        invalid_analysis = {
            "project_summary": "Bad",
            "functional_requirements": [],
            "non_functional_requirements": ["Valid"],
            "user_roles": ["User"],
            "modules": ["Module"],
            "business_rules": ["Rule"],
            "assumptions": ["Assumption"],
            "missing_information": ["Unknown"],
            "risks": ["Risk"],
        }
        with pytest.raises(ValueError):
            RequirementAnalysis(**invalid_analysis)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_gemini_provider_is_used_only_when_explicitly_enabled(monkeypatch):
    project = {
        "_id": "project-1",
        "id": "project-1",
        "user_id": "user-1",
        "name": "School Records",
        "requirements": "A school system manages student records and course enrollment.",
    }
    calls = {}
    expected = analyze_requirements(project["requirements"], project["name"])

    async def fake_get_project(project_id):
        return project if project_id == "project-1" else None

    async def fake_generate(requirements, project_name):
        calls["generation"] = (requirements, project_name)
        return expected

    async def fake_save(project_id, user_id, source, analysis):
        calls["saved"] = (project_id, user_id, source, analysis)
        return {
            "id": "analysis-1",
            "project_id": project_id,
            "created_at": datetime.utcnow(),
            "analysis": analysis.dict(),
        }

    monkeypatch.setattr("app.api.requirement_analysis.get_project", fake_get_project)
    monkeypatch.setattr("app.api.requirement_analysis.generate_requirement_analysis", fake_generate)
    monkeypatch.setattr("app.api.requirement_analysis.save_requirement_analysis", fake_save)
    monkeypatch.setattr("app.api.requirement_analysis.settings.DEMO_MODE", False)
    monkeypatch.setattr("app.api.requirement_analysis.settings.LLM_PROVIDER", "gemini")
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/projects/project-1/requirements/analyze")

        assert response.status_code == 200
        assert calls["generation"] == (project["requirements"], project["name"])
        assert calls["saved"][2] == project["requirements"]
        assert response.json()["id"] == "analysis-1"
    finally:
        app.dependency_overrides.clear()
