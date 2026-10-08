from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.agents.requirement_analysis import analyze_requirements
from app.auth.deps import get_current_user
from app.models.project import get_project, update_project
from app.models.requirement_analysis import (
    get_latest_requirement_analysis,
    save_requirement_analysis,
)
from app.schemas.requirement_analysis import RequirementAnalysisOut

router = APIRouter(prefix="/api/v1/projects", tags=["requirement analysis"])


class AnalyzeRequirementsRequest(BaseModel):
    requirements: Optional[str] = Field(default=None, min_length=20, max_length=20000)


def _can_access(project: dict, user: dict) -> bool:
    return (
        str(project.get("user_id")) == str(user.get("id"))
        or user.get("role") == "ADMIN"
    )


@router.post(
    "/{project_id}/requirements/analyze",
    response_model=RequirementAnalysisOut,
)
async def analyze_project_requirements(
    project_id: str,
    payload: AnalyzeRequirementsRequest = AnalyzeRequirementsRequest(),
    user=Depends(get_current_user),
):
    project = await get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Project not found"},
        )
    if not _can_access(project, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Not allowed to analyze this project"},
        )

    source = payload.requirements or project.get("requirements")
    if not source or len(source.strip()) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "requirements_too_short",
                "message": "Provide at least 20 characters of software requirements.",
            },
        )

    analysis = analyze_requirements(source, project.get("name", "Project"))
    if payload.requirements is not None:
        await update_project(project_id, {"requirements": payload.requirements})

    saved = await save_requirement_analysis(
        project_id,
        str(user.get("id")),
        source,
        analysis,
    )
    return {
        **saved["analysis"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


@router.get(
    "/{project_id}/requirements/analysis",
    response_model=RequirementAnalysisOut,
)
async def get_project_requirement_analysis(
    project_id: str,
    user=Depends(get_current_user),
):
    project = await get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Project not found"},
        )
    if not _can_access(project, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Not allowed to view this project"},
        )

    saved = await get_latest_requirement_analysis(project_id)
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "analysis_not_found", "message": "No requirement analysis exists for this project"},
        )
    return {
        **saved["analysis"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }
