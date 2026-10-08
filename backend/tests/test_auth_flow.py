import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_registration_validation(monkeypatch):
    from app.main import app
    # Prepare fake storage
    users = {}

    async def fake_find_user_by_email(email: str):
        return users.get(email)

    async def fake_create_user(name: str, email: str, password_hash: str):
        user = {"_id": "uid1", "name": name, "email": email, "password_hash": password_hash, "role": "USER"}
        users[email] = user
        return {k: v for k, v in user.items() if k != "password_hash"}

    monkeypatch.setattr("app.api.auth.find_user_by_email", fake_find_user_by_email)
    monkeypatch.setattr("app.api.auth.create_user", fake_create_user)

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # invalid email
        r = await ac.post("/api/v1/auth/register", json={"name":"A","email":"not-an-email","password":"short"})
        assert r.status_code == 422

        # weak password length enforced by schema (min_length=8)
        r2 = await ac.post("/api/v1/auth/register", json={"name":"Bob","email":"bob@example.com","password":"short"})
        assert r2.status_code == 422

        # valid registration
        r3 = await ac.post("/api/v1/auth/register", json={"name":"Bob","email":"BOB@EXAMPLE.COM","password":"strongpass"})
        assert r3.status_code == 200
        data = r3.json()
        assert data["email"] == "bob@example.com"

        # duplicate
        r4 = await ac.post("/api/v1/auth/register", json={"name":"Bob","email":"bob@example.com","password":"strongpass"})
        assert r4.status_code == 400

@pytest.mark.asyncio
async def test_login_and_protected_project(monkeypatch):
    from app.main import app
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

    # fake DB user
    user = {"_id": "uid2", "name": "Carol", "email": "carol@example.com", "password_hash": pwd.hash("Secret123"), "role": "USER"}

    async def fake_find_user_by_email(email: str):
        if email == user["email"]:
            return user
        return None

    async def fake_find_user_by_id(uid: str):
        if uid == "uid2":
            return user
        return None

    async def fake_create_project(user_id: str, name: str, description=None, domain=None, requirements=None, status="DRAFT"):
        return {"_id": "proj1", "user_id": user_id, "name": name, "description": description, "domain": domain, "requirements": requirements, "status": status, "created_at": None, "updated_at": None}

    monkeypatch.setattr("app.api.auth.find_user_by_email", fake_find_user_by_email)
    monkeypatch.setattr("app.auth.deps.find_user_by_id", fake_find_user_by_id)
    monkeypatch.setattr("app.api.projects.create_project", fake_create_project)

    async with AsyncClient(app=app, base_url="http://test") as ac:
        missing_current_user = await ac.get("/api/v1/auth/me")
        assert missing_current_user.status_code in (401, 403)

        # wrong password
        r = await ac.post("/api/v1/auth/login", json={"email":"carol@example.com","password":"WrongPass"})
        assert r.status_code == 401

        # correct login
        r2 = await ac.post("/api/v1/auth/login", json={"email":"CAROL@EXAMPLE.COM","password":"Secret123"})
        assert r2.status_code == 200
        tok = r2.json().get("access_token")
        assert tok

        current_user = await ac.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert current_user.status_code == 200
        assert current_user.json()["email"] == "carol@example.com"
        assert current_user.json()["role"] == "USER"
        assert "password_hash" not in current_user.json()

        # missing token when creating project
        r3 = await ac.post("/api/v1/projects/", json={"name":"MyProj"})
        assert r3.status_code == 403 or r3.status_code == 401

        # create project with token
        headers = {"Authorization": f"Bearer {tok}"}
        r4 = await ac.post("/api/v1/projects/", json={"name":"MyProj","description":"x"}, headers=headers)
        assert r4.status_code == 200
        proj = r4.json()
        assert proj["name"] == "MyProj"
