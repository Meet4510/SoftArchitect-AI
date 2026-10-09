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
- `POST /api/v1/projects/{project_id}/database-design/generate` creates a validated MongoDB collections-and-indexes design from project requirements and the latest saved architecture.
- `GET /api/v1/projects/{project_id}/database-design` retrieves the latest saved MongoDB design.
- `POST /api/v1/projects/{project_id}/api-design/generate` creates a validated, versioned REST API contract and OpenAPI 3.0.3 document from project requirements and the latest saved MongoDB design.
- `GET /api/v1/projects/{project_id}/api-design` retrieves the latest saved REST API design, including its OpenAPI document.
- `POST /api/v1/projects/{project_id}/diagrams/generate` generates validated use-case, request-sequence, domain-class, entity-relationship, and module-hierarchy Mermaid diagrams from the saved architecture, database, and REST API designs.
- `GET /api/v1/projects/{project_id}/diagrams` retrieves the latest saved UML diagram set.
- `POST /api/v1/projects/{project_id}/datasets/generate` creates and saves synthetic records for every collection in the latest MongoDB design. The request accepts `records_by_collection`, a collection-name-to-count map (1–500 records per collection).
- `GET /api/v1/projects/{project_id}/datasets/latest` retrieves the latest saved synthetic dataset.
- `POST /api/v1/projects/{project_id}/documentation/generate` accepts a user-authored `prompt` (10–4000 characters) and compiles a technical blueprint, implementation roadmap, risk register, project structure, and prompt-focused sections using the project's requirements and any saved technology, architecture, database, and API designs.
- `GET /api/v1/projects/{project_id}/documentation` retrieves the latest saved technical documentation.
- Project routes require `Authorization: Bearer <token>`; user-owned project reads and changes are enforced by the API.
- If the API cannot be reached, the frontend uses browser-local demo data. API authentication/validation errors are shown rather than silently switching to demo mode.

The authenticated interface separates a project overview (`/dashboard`), project management (`/projects`), and each project's blueprint workspace (`/projects/{project_id}`). The overview summarizes project status and recent activity; project creation, search, status filtering, editing, and deletion are managed on the projects page. Workflow results and requirement editing live in the individual project workspace. Generated blueprint panels can be closed from view and reopened with "View saved"; closing a panel does not delete its saved result.

Requirement analysis, technology recommendations, software architecture, MongoDB database design, REST API design, UML diagram generation, synthetic dataset generation, and technical documentation currently run through deterministic Demo Mode agents; they do not call an external AI provider. The documentation stage accepts a user prompt specifying audience, format, level of detail, and technical focus, preserves the prompt with the saved document, and adds relevant sections based on the prompt and available blueprint artifacts. The technology agent explains each selection, lists alternatives and trade-offs, and only recommends payment or notification integrations when the requirements indicate those features. Database design produces validated collections, fields, explicit `_id` primary keys, logical ObjectId foreign-key references, indexes, embedding decisions, and relationships. Its Chen-style Entity-Relationship diagram follows ER notation: rectangles for entities, diamonds for relationships, ovals for attributes, and 1/N cardinality labels, with PK/FK markers for key attributes. MongoDB does not enforce foreign keys automatically, so the design calls out application-level reference validation. REST API design uses the saved database design to produce role-scoped endpoint contracts and a downloadable OpenAPI 3.0.3 JSON file. UML diagrams use requirements, the architecture, API contract, and MongoDB design to create use-case, request-sequence, domain-class, Chen-style entity-relationship, and module-hierarchy diagrams. Synthetic data generation lets users configure each collection from 1 to 500 records, distributes many-side references across parent records, preserves embedded menu-item references, validates one-to-one record counts, versions each generated snapshot in `dataset_versions`, and offers JSON and CSV exports. Technical documentation compiles the latest available blueprint artifacts into Markdown with an implementation roadmap, risk register, folder structure, and release guidance; it can be downloaded as Markdown or as a Word `.docx` that embeds the generated architecture diagram, database ERD, and UML diagrams. Synthetic password-hash values are explicitly non-authenticating. The frontend automatically saves missing prerequisite artifacts when generating later workflow stages, and the API validates those prerequisites. Project-scoped capabilities enforce ownership and also work offline using browser-local demo storage.

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
npm test
npm run build
npm run lint
```
