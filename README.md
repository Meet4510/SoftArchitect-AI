# SoftArchitect AI

SoftArchitect AI turns natural-language software requirements into structured software blueprints. The current foundation includes a FastAPI backend, MongoDB persistence, JWT authentication, project management, and a React/Vite dashboard with offline demo mode.

## Run locally

1. Create a MongoDB Atlas cluster and a database user with read/write access to `softarchitect_ai`.
2. In Atlas Network Access, allow the public IP of the machine running the backend. Avoid allowing access from all IPs for normal use.
3. Copy `.env.example` to `.env`. Replace the Atlas URI placeholders with the cluster host and database credentials; URL-encode special characters in the password. Set `JWT_SECRET` to a unique random secret of at least 32 characters. Never commit `.env` or send database credentials in chat.
4. Install and run the backend:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r backend\requirements.txt
   Set-Location backend
   uvicorn app.main:app --reload --port 8000
   ```

5. In another terminal, start the frontend:

   ```powershell
   Set-Location frontend
   npm ci
   npm run dev
   ```

The backend reads the root `.env` file in local runs. It checks the MongoDB connection at startup and creates the application's indexes; `/healthz` also pings MongoDB. The frontend uses `VITE_API_URL` when set and otherwise calls `http://localhost:8000`. Vite's default origin (`http://localhost:5173`) and the demo launch origin (`http://localhost:4173`) are allowed by the backend CORS defaults. If you use a different origin, add it to `CORS_ORIGINS`.

## Docker

With Docker Desktop running and the root `.env` configured for Atlas, use:

```powershell
docker compose --env-file .env up --build
```

The frontend is available at `http://localhost:5173` and the API at `http://localhost:8000`. The Compose MongoDB service is retained for local development; when `MONGODB_URI` is an Atlas URI, the backend uses Atlas and does not store application data in that local container.

To use the Compose MongoDB instead, set `MONGODB_URI=mongodb://mongodb:27017` in `.env`. Its data persists in the `mongo_data` volume. Do not run `docker compose down -v` if you need to preserve that local database.

## Authentication and project API

- `POST /api/v1/auth/register` creates a user.
- `POST /api/v1/auth/login` returns a JWT access token.
- `GET /api/v1/auth/me` returns the authenticated user's safe profile.
- No user is created automatically at startup. Register an account before signing in; the login form does not prefill a non-existent demo account. Email matching is case-insensitive.
- `GET`, `POST`, `GET /{project_id}`, `PUT /{project_id}`, and `DELETE /{project_id}` are available under `/api/v1/projects/`.
- `POST /api/v1/projects/{project_id}/requirements/analyze` validates and stores a structured requirement analysis in the MongoDB `requirements` collection.
- `GET /api/v1/projects/{project_id}/requirements/analysis` retrieves the latest saved analysis.
- `POST /api/v1/projects/{project_id}/technology/recommend` validates and stores a project-specific technology stack recommendation in the MongoDB `technology_recommendations` collection.
- `GET /api/v1/projects/{project_id}/technology/recommendation` retrieves the latest saved recommendation.
- `POST /api/v1/projects/{project_id}/architecture/generate` generates and stores an architecture using project requirements and the latest saved technology recommendations.
- `GET /api/v1/projects/{project_id}/architecture` retrieves the latest saved architecture, including its Mermaid diagram source.
- Project routes require `Authorization: Bearer <token>`; user-owned project reads and changes are enforced by the API.
- If the API cannot be reached, the frontend uses browser-local demo data. API authentication/validation errors are shown rather than silently switching to demo mode.

Requirement analysis, technology recommendations, and software architecture currently run through deterministic Demo Mode agents; they do not call an external AI provider. The technology agent explains each selection, lists alternatives and trade-offs, and only recommends payment or notification integrations when the requirements indicate those features. Architecture generation requires a saved technology recommendation, creates a validated component-and-connection model, and enforces project ownership. All three capabilities also work offline using browser-local demo storage.

## Tests

Backend tests:

```powershell
Set-Location backend
pytest -q
```

Docker-based backend test runner:

```powershell
.\run-tests.ps1
```

Frontend production build:

```powershell
Set-Location frontend
npm run build
```
