from fastapi import APIRouter, Depends, HTTPException, status

from app.agents.database_design import design_mongodb_schema
from app.auth.deps import get_current_user
from app.models.architecture import get_latest_architecture
from app.models.database_design import get_latest_database_design, save_database_design
from app.models.project import get_project
from app.schemas.architecture import SoftwareArchitecture
from app.schemas.database_design import MongoDatabaseDesignOut

router = APIRouter(prefix="/api/v1/projects", tags=["MongoDB database design"])


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


@router.post("/{project_id}/database-design/generate", response_model=MongoDatabaseDesignOut)
async def generate_project_database_design(project_id: str, user=Depends(get_current_user)):
    project = await _get_accessible_project(project_id, user)
    requirements = (project.get("requirements") or "").strip()
    if len(requirements) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "requirements_too_short",
                "message": "Add at least 20 characters of project requirements before generating the database design.",
            },
        )

    saved_architecture = await get_latest_architecture(project_id)
    if not saved_architecture:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "architecture_required",
                "message": "Generate and save the software architecture before the MongoDB database design.",
            },
        )

    architecture = SoftwareArchitecture(**saved_architecture["architecture"])
    database_design = design_mongodb_schema(
        requirements,
        project.get("name", "Project"),
        architecture,
    )
    saved = await save_database_design(
        project_id,
        str(user.get("id")),
        requirements,
        saved_architecture["id"],
        database_design,
    )
    return {
        **saved["database_design"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


@router.get("/{project_id}/database-design", response_model=MongoDatabaseDesignOut)
async def get_project_database_design(project_id: str, user=Depends(get_current_user)):
    await _get_accessible_project(project_id, user)
    saved = await get_latest_database_design(project_id)
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "database_design_not_found",
                "message": "No MongoDB database design has been generated for this project.",
            },
        )
    return {
        **saved["database_design"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }
