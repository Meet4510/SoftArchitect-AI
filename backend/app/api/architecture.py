from fastapi import APIRouter, Depends, HTTPException, status

from app.api.artifact_freshness import requirements_match, require_current_requirements
from app.api.llm import gemini_enabled, generate_gemini_blueprint
from app.agents.architecture import design_architecture
from app.auth.deps import get_current_user
from app.models.architecture import get_latest_architecture, save_architecture
from app.models.project import get_project
from app.models.technology_recommendation import get_latest_technology_recommendation
from app.schemas.architecture import SoftwareArchitecture, SoftwareArchitectureOut
from app.schemas.technology_recommendation import TechnologyRecommendation

router = APIRouter(prefix="/api/v1/projects", tags=["software architecture"])


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


@router.post("/{project_id}/architecture/generate", response_model=SoftwareArchitectureOut)
async def generate_project_architecture(project_id: str, user=Depends(get_current_user)):
    project = await _get_accessible_project(project_id, user)
    requirements = (project.get("requirements") or "").strip()
    if len(requirements) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "requirements_too_short",
                "message": "Add at least 20 characters of project requirements before generating architecture.",
            },
        )

    saved_recommendation = await get_latest_technology_recommendation(project_id)
    if not requirements_match(saved_recommendation, requirements):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "technology_recommendation_required",
                "message": "Generate and save technology recommendations before the software architecture.",
            },
        )

    technology_recommendation = TechnologyRecommendation(**saved_recommendation["recommendation"])
    if gemini_enabled():
        architecture = await generate_gemini_blueprint(
            "software architect. Design a coherent, appropriately scoped system architecture "
            "that uses the supplied technology recommendations. Mermaid source must be a valid "
            "flowchart LR diagram. Connection endpoints must use declared component IDs.",
            {
                "project_name": project.get("name", "Project"),
                "requirements": requirements,
                "technology_recommendation": technology_recommendation.dict(),
            },
            SoftwareArchitecture,
        )
    else:
        architecture = design_architecture(
            requirements=requirements,
            project_name=project.get("name", "Project"),
            technology_recommendation=technology_recommendation,
        )
    saved = await save_architecture(
        project_id,
        str(user.get("id")),
        requirements,
        saved_recommendation["id"],
        architecture,
    )
    return {
        **saved["architecture"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


@router.get("/{project_id}/architecture", response_model=SoftwareArchitectureOut)
async def get_project_architecture(project_id: str, user=Depends(get_current_user)):
    project = await _get_accessible_project(project_id, user)
    saved = require_current_requirements(
        await get_latest_architecture(project_id),
        project.get("requirements") or "",
        "architecture_not_found",
        "No current architecture exists for this project's requirements.",
    )
    return {
        **saved["architecture"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }
