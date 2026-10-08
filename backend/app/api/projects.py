from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectOut, ProjectListResponse
from app.models.project import create_project, get_project, list_projects, update_project, delete_project
from app.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


def _serialize_project(doc: dict):
    return {
        "id": str(doc.get("id") or doc.get("_id")),
        "user_id": str(doc.get("user_id")),
        "name": doc.get("name"),
        "description": doc.get("description"),
        "domain": doc.get("domain"),
        "requirements": doc.get("requirements"),
        "status": doc.get("status"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _can_access(project: dict, user: dict):
    return str(project.get("user_id")) == str(user.get("id")) or user.get("role") == "ADMIN"


@router.get("/", response_model=ProjectListResponse)
async def list_projects_endpoint(
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    domain: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    user=Depends(get_current_user),
):
    page_data = await list_projects(
        user_id=str(user.get("id")) if user.get("role") != "ADMIN" else None,
        search=search,
        status=status,
        domain=domain,
        page=page,
        limit=limit,
    )
    return {
        "items": [_serialize_project(item) for item in page_data["items"]],
        "total": page_data["total"],
        "page": page_data["page"],
        "limit": page_data["limit"],
        "total_pages": page_data["total_pages"],
    }


@router.post("/", response_model=ProjectOut)
async def create_project_endpoint(payload: ProjectCreate, user=Depends(get_current_user)):
    created = await create_project(
        str(user.get("id") or user.get("_id")),
        payload.name,
        payload.description,
        payload.domain,
        payload.requirements,
        payload.status or "DRAFT",
    )
    return _serialize_project(created)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project_endpoint(project_id: str, user=Depends(get_current_user)):
    proj = await get_project(project_id)
    if not proj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code":"not_found","message":"Project not found"})
    if not _can_access(proj, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code":"forbidden","message":"Not allowed to view this project"})
    return _serialize_project(proj)


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project_endpoint(project_id: str, payload: ProjectUpdate, user=Depends(get_current_user)):
    existing = await get_project(project_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code":"not_found","message":"Project not found"})
    if not _can_access(existing, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code":"forbidden","message":"Not allowed to edit this project"})

    updates = payload.dict(exclude_unset=True)
    updated = await update_project(project_id, updates)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code":"not_found","message":"Project not found"})
    return _serialize_project(updated)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_endpoint(project_id: str, user=Depends(get_current_user)):
    existing = await get_project(project_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code":"not_found","message":"Project not found"})
    if not _can_access(existing, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code":"forbidden","message":"Not allowed to delete this project"})

    deleted = await delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code":"not_found","message":"Project not found"})
    return None
