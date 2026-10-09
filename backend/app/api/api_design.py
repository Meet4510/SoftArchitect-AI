from fastapi import APIRouter, Depends, HTTPException, status

from app.agents.api_design import design_rest_api
from app.auth.deps import get_current_user
from app.models.api_design import get_latest_api_design, save_api_design
from app.models.database_design import get_latest_database_design
from app.models.project import get_project
from app.schemas.api_design import RestApiDesignOut
from app.schemas.database_design import MongoDatabaseDesign

router = APIRouter(prefix="/api/v1/projects", tags=["REST API design"])


async def _get_accessible_project(project_id: str, user: dict) -> dict:
    project = await get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Project not found"},
        )
    if str(project.get("user_id")) != str(user.get("id")) and user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Not allowed to access this project"},
        )
    return project


@router.post("/{project_id}/api-design/generate", response_model=RestApiDesignOut)
async def generate_project_api_design(project_id: str, user=Depends(get_current_user)):
    project = await _get_accessible_project(project_id, user)
    requirements = (project.get("requirements") or "").strip()
    if len(requirements) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "requirements_too_short",
                "message": "Add at least 20 characters of project requirements before generating the API design.",
            },
        )
    saved_database_design = await get_latest_database_design(project_id)
    if not saved_database_design:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "database_design_required",
                "message": "Generate and save the MongoDB database design before the REST API design.",
            },
        )
    database_design = MongoDatabaseDesign(**saved_database_design["database_design"])
    api_design = design_rest_api(
        requirements=requirements,
        project_name=project.get("name", "Project"),
        database_design=database_design,
    )
    saved = await save_api_design(
        project_id,
        str(user.get("id")),
        requirements,
        saved_database_design["id"],
        api_design,
    )
    return {
        **saved["api_design"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


@router.get("/{project_id}/api-design", response_model=RestApiDesignOut)
async def get_project_api_design(project_id: str, user=Depends(get_current_user)):
    await _get_accessible_project(project_id, user)
    saved = await get_latest_api_design(project_id)
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "api_design_not_found",
                "message": "No REST API design has been generated for this project.",
            },
        )
    return {
        **saved["api_design"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }
