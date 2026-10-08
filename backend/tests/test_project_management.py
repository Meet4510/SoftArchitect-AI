import pytest
from httpx import AsyncClient

from app.main import app
from app.auth.deps import get_current_user


@pytest.mark.asyncio
async def test_project_crud_and_ownership(monkeypatch):
    project_store = {
        "proj-1": {
            "_id": "proj-1",
            "id": "proj-1",
            "user_id": "user-123",
            "name": "Food Delivery",
            "description": "Demo",
            "domain": "food-delivery",
            "requirements": "Need delivery app",
            "status": "DRAFT",
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:00:00",
        }
    }

    async def fake_create_project(user_id, name, description=None, domain=None, requirements=None, status="DRAFT"):
        project_id = "proj-2"
        created = {
            "_id": project_id,
            "id": project_id,
            "user_id": user_id,
            "name": name,
            "description": description,
            "domain": domain,
            "requirements": requirements,
            "status": status,
            "created_at": "2024-01-02T00:00:00",
            "updated_at": "2024-01-02T00:00:00",
        }
        project_store[project_id] = created
        return created

    async def fake_get_project(project_id):
        return project_store.get(project_id)

    async def fake_list_projects(user_id=None, search=None, status=None, domain=None, page=1, limit=10):
        items = list(project_store.values())
        if user_id:
            items = [p for p in items if p.get("user_id") == user_id]
        if search:
            items = [p for p in items if search.lower() in (p.get("name") or "").lower() or search.lower() in (p.get("description") or "").lower()]
        if status:
            items = [p for p in items if p.get("status") == status]
        if domain:
            items = [p for p in items if p.get("domain") == domain]
        total = len(items)
        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, (total + limit - 1) // limit) if total else 1,
        }

    async def fake_update_project(project_id, updates):
        project = project_store.get(project_id)
        if not project:
            return None
        project.update(updates)
        project["updated_at"] = "2024-01-03T00:00:00"
        return project

    async def fake_delete_project(project_id):
        return project_store.pop(project_id, None) is not None

    monkeypatch.setattr("app.api.projects.create_project", fake_create_project)
    monkeypatch.setattr("app.api.projects.get_project", fake_get_project)
    monkeypatch.setattr("app.api.projects.list_projects", fake_list_projects)
    monkeypatch.setattr("app.api.projects.update_project", fake_update_project)
    monkeypatch.setattr("app.api.projects.delete_project", fake_delete_project)

    app.dependency_overrides[get_current_user] = lambda: {"id": "user-123", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as ac:
            create_rsp = await ac.post("/api/v1/projects/", json={"name": "Billing App", "domain": "banking"})
            assert create_rsp.status_code == 200
            project = create_rsp.json()
            assert project["name"] == "Billing App"
            assert project["requirements"] is None

            list_rsp = await ac.get("/api/v1/projects/", params={"search": "Billing", "page": 1, "limit": 10})
            assert list_rsp.status_code == 200
            payload = list_rsp.json()
            assert payload["total"] >= 1

            update_rsp = await ac.put(f"/api/v1/projects/{project['id']}", json={"status": "ANALYZING"})
            assert update_rsp.status_code == 200
            assert update_rsp.json()["status"] == "ANALYZING"

            delete_rsp = await ac.delete(f"/api/v1/projects/{project['id']}")
            assert delete_rsp.status_code == 204

            not_found_rsp = await ac.get(f"/api/v1/projects/{project['id']}")
            assert not_found_rsp.status_code == 404

        app.dependency_overrides[get_current_user] = lambda: {"id": "user-456", "role": "USER"}
        async with AsyncClient(app=app, base_url="http://test") as ac:
            forbidden_rsp = await ac.get("/api/v1/projects/proj-1")
            assert forbidden_rsp.status_code == 403
            forbidden_update = await ac.put("/api/v1/projects/proj-1", json={"name": "Hijacked"})
            assert forbidden_update.status_code == 403
            forbidden_delete = await ac.delete("/api/v1/projects/proj-1")
            assert forbidden_delete.status_code == 403
            assert "proj-1" in project_store
    finally:
        app.dependency_overrides.clear()
