from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.agents.dataset_generator import generate_synthetic_dataset
from app.auth.deps import get_current_user
from app.agents.database_design import design_mongodb_schema
from app.models.architecture import get_latest_architecture
from app.models.database_design import get_latest_database_design, save_database_design
from app.models.datasets import get_latest_dataset, save_dataset
from app.models.project import get_project
from app.schemas.architecture import SoftwareArchitecture
from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.datasets import GenerateDatasetRequest, SyntheticDatasetOut

router = APIRouter(prefix="/api/v1/projects", tags=["Synthetic datasets"])


async def _get_accessible_project(project_id: str, user: dict) -> dict:
    if not ObjectId.is_valid(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Project not found"},
        )
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


def _dataset_response(saved: dict) -> dict:
    return {
        **saved["dataset"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


@router.post(
    "/{project_id}/datasets/generate",
    response_model=SyntheticDatasetOut,
)
async def generate_project_dataset(
    project_id: str,
    request: GenerateDatasetRequest,
    user=Depends(get_current_user),
):
    project = await _get_accessible_project(project_id, user)
    saved_design = await get_latest_database_design(project_id)
    if not saved_design:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "database_design_required",
                "message": "Generate the MongoDB database design before creating synthetic data.",
            },
        )
    database_payload = saved_design["database_design"]
    required_erd_markers = (
        "classDef erEntity",
        "classDef erRelationship",
        "classDef erAttribute",
        "classDef erKey",
    )
    if not all(
        marker in database_payload.get("mermaid_diagram", "")
        for marker in required_erd_markers
    ):
        saved_architecture = await get_latest_architecture(project_id)
        if not saved_architecture:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "architecture_required",
                    "message": "Regenerate the software architecture before creating synthetic data.",
                },
            )
        architecture = SoftwareArchitecture(**saved_architecture["architecture"])
        design = design_mongodb_schema(
            (project.get("requirements") or "").strip(),
            project.get("name", "Project"),
            architecture,
        )
        saved_design = await save_database_design(
            project_id,
            str(user.get("id")),
            (project.get("requirements") or "").strip(),
            saved_architecture["id"],
            design,
        )
    else:
        design = MongoDatabaseDesign(**database_payload)
    try:
        dataset = generate_synthetic_dataset(
            design,
            project.get("name", "Project"),
            saved_design["id"],
            request.records_by_collection,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_dataset_configuration", "message": str(error)},
        ) from error
    saved = await save_dataset(project_id, str(user.get("id")), dataset)
    return _dataset_response(saved)


@router.get("/{project_id}/datasets/latest", response_model=SyntheticDatasetOut)
async def fetch_project_dataset(project_id: str, user=Depends(get_current_user)):
    await _get_accessible_project(project_id, user)
    saved = await get_latest_dataset(project_id)
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "dataset_not_found",
                "message": "No synthetic dataset has been generated for this project.",
            },
        )
    return _dataset_response(saved)
