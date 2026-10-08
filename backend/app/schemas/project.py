from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=3)
    description: Optional[str] = None
    domain: Optional[str] = None
    requirements: Optional[str] = None
    status: Optional[str] = "DRAFT"

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=3)
    description: Optional[str] = None
    domain: Optional[str] = None
    requirements: Optional[str] = None
    status: Optional[str] = None

class ProjectOut(BaseModel):
    id: Optional[str]
    user_id: Optional[str]
    name: str
    description: Optional[str]
    domain: Optional[str]
    requirements: Optional[str] = None
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        orm_mode = True

class ProjectListResponse(BaseModel):
    items: List[ProjectOut]
    total: int
    page: int
    limit: int
    total_pages: int
