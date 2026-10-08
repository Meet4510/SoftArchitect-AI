from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import settings
from app.api import auth, projects, requirement_analysis, technology_recommendations, architecture
from app.database.mongodb import close_client, get_client, get_database
from app.database.indexes import create_indexes

app = FastAPI(title="SoftArchitect AI - Backend (Phase 1)")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(requirement_analysis.router)
app.include_router(technology_recommendations.router)
app.include_router(architecture.router)

@app.on_event("startup")
async def startup_event():
    get_client()
    await get_database().command("ping")
    await create_indexes()


@app.on_event("shutdown")
async def shutdown_event():
    close_client()

@app.get("/healthz")
async def healthz():
    await get_database().command("ping")
    return {"status": "ok"}
