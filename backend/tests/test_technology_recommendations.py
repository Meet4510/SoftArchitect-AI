from datetime import datetime

import pytest
from httpx import AsyncClient

from app.agents.technology_recommendation import recommend_technology
from app.auth.deps import get_current_user
from app.main import app
from app.schemas.technology_recommendation import TechnologyRecommendation


def test_recommendations_include_rationales_and_requirement_relevant_components():
    recommendation = recommend_technology(
        "Customers browse menus, place orders, make payments, and receive order notifications.",
        "QuickBite Food Delivery",
        "Food delivery",
    )

    categories = {item.category for item in recommendation.recommendations}
    assert {"Frontend", "Backend API", "Primary database", "Payments", "Notifications"} <= categories
    assert all(item.recommendation and item.rationale and item.trade_offs for item in recommendation.recommendations)
    assert any("MongoDB Atlas" in item.recommendation for item in recommendation.recommendations)


@pytest.mark.asyncio
async def test_recommendations_are_saved_retrieved_and_owner_protected(monkeypatch):
    project = {
        "id": "project-1",
        "user_id": "user-1",
        "name": "QuickBite",
        "domain": "Food delivery",
        "requirements": "Customers place orders, make payments, and receive delivery notifications.",
    }
    saved = {}

    async def fake_get_project(project_id):
        return project if project_id == "project-1" else None

    async def fake_save(project_id, user_id, source, recommendation):
        saved["document"] = {
            "id": "recommendation-1",
            "project_id": project_id,
            "source_requirements": source,
            "recommendation": recommendation.dict(),
            "created_at": datetime.utcnow(),
        }
        return saved["document"]

    async def fake_get_latest(project_id):
        return saved.get("document")

    monkeypatch.setattr("app.api.technology_recommendations.get_project", fake_get_project)
    monkeypatch.setattr(
        "app.api.technology_recommendations.gemini_enabled", lambda: False
    )
    monkeypatch.setattr(
        "app.api.technology_recommendations.save_technology_recommendation",
        fake_save,
    )
    monkeypatch.setattr(
        "app.api.technology_recommendations.get_latest_technology_recommendation",
        fake_get_latest,
    )
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/projects/project-1/technology/recommend")
            assert response.status_code == 200
            body = response.json()
            assert body["project_id"] == "project-1"
            assert body["id"] == "recommendation-1"
            assert any(item["category"] == "Payments" for item in body["recommendations"])

            fetched = await client.get("/api/v1/projects/project-1/technology/recommendation")
            assert fetched.status_code == 200
            assert fetched.json()["id"] == "recommendation-1"

            project["requirements"] += " Customers also receive dispatch updates."
            stale_recommendation = await client.get(
                "/api/v1/projects/project-1/technology/recommendation"
            )
            assert stale_recommendation.status_code == 404
            assert stale_recommendation.json()["detail"]["code"] == "recommendation_not_found"

        app.dependency_overrides[get_current_user] = lambda: {"id": "user-2", "role": "USER"}
        async with AsyncClient(app=app, base_url="http://test") as client:
            forbidden = await client.post("/api/v1/projects/project-1/technology/recommend")
            assert forbidden.status_code == 403

        duplicate_categories = {
            "project_summary": "Stack",
            "recommendations": [
                {
                    "category": "Frontend",
                    "recommendation": "React",
                    "rationale": "Typed component UI.",
                    "alternatives": [],
                    "trade_offs": [],
                },
                {
                    "category": "frontend",
                    "recommendation": "Vue",
                    "rationale": "Alternative UI.",
                    "alternatives": [],
                    "trade_offs": [],
                },
            ],
        }
        with pytest.raises(ValueError):
            TechnologyRecommendation(**duplicate_categories)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_recommendation_route_uses_gemini_output_when_enabled(monkeypatch):
    project = {
        "id": "project-gemini",
        "user_id": "user-1",
        "name": "QuickBite",
        "domain": "Food delivery",
        "requirements": "Customers browse restaurants, place orders, and track deliveries.",
    }
    captured = {}

    async def fake_get_project(project_id):
        return project if project_id == "project-gemini" else None

    async def fake_gemini(task, context, output_model):
        captured["task"] = task
        captured["context"] = context
        captured["output_model"] = output_model
        return recommend_technology(
            context["requirements"], context["project_name"], context["domain"]
        )

    async def fake_save(project_id, user_id, source, recommendation):
        return {
            "id": "gemini-recommendation-1",
            "project_id": project_id,
            "source_requirements": source,
            "recommendation": recommendation.dict(),
            "created_at": datetime.utcnow(),
        }

    monkeypatch.setattr("app.api.technology_recommendations.get_project", fake_get_project)
    monkeypatch.setattr("app.api.technology_recommendations.gemini_enabled", lambda: True)
    monkeypatch.setattr(
        "app.api.technology_recommendations.generate_gemini_blueprint",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.api.technology_recommendations.save_technology_recommendation",
        fake_save,
    )
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/projects/project-gemini/technology/recommend"
            )

        assert response.status_code == 200
        assert response.json()["id"] == "gemini-recommendation-1"
        assert captured["output_model"] is TechnologyRecommendation
        assert captured["context"]["project_name"] == "QuickBite"
        assert "technology architect" in captured["task"]
    finally:
        app.dependency_overrides.clear()
