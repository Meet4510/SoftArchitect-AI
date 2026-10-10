from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.artifact_freshness import requirements_match, require_current_requirements
from app.api.llm import gemini_enabled, generate_gemini_blueprint
from app.agents.documentation import generate_technical_documentation
from app.auth.deps import get_current_user
from app.models.api_design import get_latest_api_design
from app.models.architecture import get_latest_architecture
from app.models.database_design import get_latest_database_design
from app.models.documentation import get_latest_documentation, save_documentation
from app.models.project import get_project
from app.models.technology_recommendation import get_latest_technology_recommendation
from app.schemas.api_design import RestApiDesign
from app.schemas.architecture import SoftwareArchitecture
from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.documentation import GenerateDocumentationRequest, TechnicalDocumentationOut
from app.schemas.technology_recommendation import TechnologyRecommendation
from app.schemas.documentation import TechnicalDocumentation

router = APIRouter(prefix="/api/v1/projects", tags=["Documentation"])


async def _get_accessible_project(project_id: str, user: dict) -> dict:
    if not ObjectId.is_valid(project_id):
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Project not found"})
    project = await get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Project not found"})
    if str(project.get("user_id")) != str(user.get("id")) and user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Not allowed to access this project"},
        )
    return project


def _response(saved: dict) -> dict:
    return {
        **saved["documentation"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


async def _get_sources(project_id: str, requirements: str):
    saved_technology = await get_latest_technology_recommendation(project_id)
    saved_architecture = await get_latest_architecture(project_id)
    saved_database = await get_latest_database_design(project_id)
    saved_api = await get_latest_api_design(project_id)
    return (
        TechnologyRecommendation(**saved_technology["recommendation"])
        if requirements_match(saved_technology, requirements)
        else None,
        SoftwareArchitecture(**saved_architecture["architecture"])
        if requirements_match(saved_architecture, requirements)
        else None,
        MongoDatabaseDesign(**saved_database["database_design"])
        if requirements_match(saved_database, requirements)
        else None,
        RestApiDesign(**saved_api["api_design"])
        if requirements_match(saved_api, requirements)
        else None,
    )


@router.post("/{project_id}/documentation/generate", response_model=TechnicalDocumentationOut)
async def generate_project_documentation(
    project_id: str,
    request: GenerateDocumentationRequest,
    user=Depends(get_current_user),
):
    project = await _get_accessible_project(project_id, user)
    requirements = (project.get("requirements") or "").strip()
    if len(requirements) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "requirements_too_short",
                "message": "Add at least 20 characters of project requirements before generating documentation.",
            },
        )
    technology, architecture, database_design, api_design = await _get_sources(project_id, requirements)
    if gemini_enabled():
        documentation = await generate_gemini_blueprint(
            "senior technical writer and software architect. Generate complete, implementable "
            "project documentation grounded in the supplied requirements and artifacts. Include "
            "all required sections in markdown: Requirements, Architecture, Data design, API "
            "design, Development roadmap, Risk register, Project structure, Deployment and "
            "validation. source_artifacts must name only supplied artifacts. Preserve the user's "
            "documentation request as generation_prompt and satisfy its audience, format, depth, "
            "and focus.",
            {
                "project": {
                    "name": project.get("name", "Project"),
                    "domain": project.get("domain", ""),
                    "requirements": requirements,
                },
                "documentation_request": request.prompt,
                "available_artifacts": {
                    "technology_recommendation": technology.dict() if technology else None,
                    "architecture": architecture.dict() if architecture else None,
                    "database_design": database_design.dict() if database_design else None,
                    "api_design": api_design.dict() if api_design else None,
                },
            },
            TechnicalDocumentation,
        )
        documentation.generation_prompt = request.prompt
    else:
        documentation = generate_technical_documentation(
            project,
            technology,
            architecture,
            database_design,
            api_design,
            request.prompt,
        )
    saved = await save_documentation(project_id, str(user.get("id")), requirements, documentation)
    return _response(saved)


@router.get("/{project_id}/documentation", response_model=TechnicalDocumentationOut)
async def fetch_project_documentation(project_id: str, user=Depends(get_current_user)):
    project = await _get_accessible_project(project_id, user)
    saved = require_current_requirements(
        await get_latest_documentation(project_id),
        project.get("requirements") or "",
        "documentation_not_found",
        "No current technical documentation exists for this project's requirements.",
    )
    return _response(saved)
