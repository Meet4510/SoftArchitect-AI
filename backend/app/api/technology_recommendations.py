from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.agents.technology_recommendation import recommend_technology
from app.auth.deps import get_current_user
from app.models.project import get_project
from app.models.technology_recommendation import (
    get_latest_technology_recommendation,
    save_technology_recommendation,
)
from app.schemas.technology_recommendation import TechnologyRecommendationOut

router = APIRouter(prefix="/api/v1/projects", tags=["technology recommendations"])


class RecommendTechnologyRequest(BaseModel):
    requirements: Optional[str] = Field(default=None, min_length=20, max_length=20000)


def _can_access(project: dict, user: dict) -> bool:
    return str(project.get("user_id")) == str(user.get("id")) or user.get("role") == "ADMIN"


async def _get_accessible_project(project_id: str, user: dict) -> dict:
    project = await get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Project not found"},
        )
    if not _can_access(project, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Not allowed to access this project"},
        )
    return project


@router.post(
    "/{project_id}/technology/recommend",
    response_model=TechnologyRecommendationOut,
)
async def recommend_project_technology(
    project_id: str,
    payload: RecommendTechnologyRequest = RecommendTechnologyRequest(),
    user=Depends(get_current_user),
):
    project = await _get_accessible_project(project_id, user)
    source = payload.requirements or project.get("requirements")
    if not source or len(source.strip()) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "requirements_too_short",
                "message": "Provide at least 20 characters of software requirements.",
            },
        )

    result = recommend_technology(source, project.get("name", "Project"), project.get("domain", ""))
    saved = await save_technology_recommendation(
        project_id,
        str(user.get("id")),
        source,
        result,
    )
    return {
        **saved["recommendation"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


@router.get(
    "/{project_id}/technology/recommendation",
    response_model=TechnologyRecommendationOut,
)
async def get_project_technology_recommendation(
    project_id: str,
    user=Depends(get_current_user),
):
    await _get_accessible_project(project_id, user)
    saved = await get_latest_technology_recommendation(project_id)
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "recommendation_not_found",
                "message": "No technology recommendation exists for this project.",
            },
        )
    return {
        **saved["recommendation"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }
