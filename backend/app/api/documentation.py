from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

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


async def _get_sources(project_id: str):
    saved_technology = await get_latest_technology_recommendation(project_id)
    saved_architecture = await get_latest_architecture(project_id)
    saved_database = await get_latest_database_design(project_id)
    saved_api = await get_latest_api_design(project_id)
    return (
        TechnologyRecommendation(**saved_technology["recommendation"]) if saved_technology else None,
        SoftwareArchitecture(**saved_architecture["architecture"]) if saved_architecture else None,
        MongoDatabaseDesign(**saved_database["database_design"]) if saved_database else None,
        RestApiDesign(**saved_api["api_design"]) if saved_api else None,
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
    technology, architecture, database_design, api_design = await _get_sources(project_id)
    documentation = generate_technical_documentation(
        project,
        technology,
        architecture,
        database_design,
        api_design,
        request.prompt,
    )
    saved = await save_documentation(project_id, str(user.get("id")), documentation)
    return _response(saved)


@router.get("/{project_id}/documentation", response_model=TechnicalDocumentationOut)
async def fetch_project_documentation(project_id: str, user=Depends(get_current_user)):
    await _get_accessible_project(project_id, user)
    saved = await get_latest_documentation(project_id)
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "documentation_not_found",
                "message": "No technical documentation has been generated for this project.",
            },
        )
    return _response(saved)
