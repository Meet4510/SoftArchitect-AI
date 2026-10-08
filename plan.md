PHASE 1: Project setup and architecture

Goal
- Initialize project skeleton for backend (FastAPI) and frontend (Vite React TypeScript) with Docker support and environment examples.
- Provide a minimal but working FastAPI app with JWT auth and MongoDB connection to validate core flows.
- Prepare CI-friendly layout and tests for authentication.

Next steps after PHASE 1
- Implement MongoDB models, services, and project CRUD.
- Build frontend scaffold, connect auth, and implement project creation UI.
- Add LLM abstraction and Mock LLM provider.

Files created in PHASE 1 (summary)
- backend/: FastAPI app with auth endpoints, settings, MongoDB connection, Dockerfile, requirements.txt
- docker-compose.yml: backend + mongodb + placeholder frontend
- .env.example
- README.md

Conventions
- Database: MongoDB database name: softarchitect_ai
- Environment variables: see .env.example
- Use Async Motor client for MongoDB
- Tests use pytest and pytest-asyncio with httpx AsyncClient

How to run (local)
- Install Python 3.11+
- Create virtualenv and install requirements: pip install -r backend\requirements.txt
- Start local MongoDB or use MONGODB_URI from .env
- Start backend: uvicorn app.main:app --reload --port 8000

Do not proceed to later phases until backend tests pass.
