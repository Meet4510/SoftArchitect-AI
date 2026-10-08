from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, validator


class ArchitectureComponent(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    component_type: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    technologies: List[str]

    @validator("technologies")
    def remove_empty_technologies(cls, value):
        return [item.strip() for item in value if item and item.strip()]


class ArchitectureConnection(BaseModel):
    source: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)


class SoftwareArchitecture(BaseModel):
    project_summary: str = Field(..., min_length=1)
    architectural_style: str = Field(..., min_length=1)
    components: List[ArchitectureComponent] = Field(..., min_items=1)
    connections: List[ArchitectureConnection] = Field(..., min_items=1)
    design_decisions: List[str] = Field(..., min_items=1)
    mermaid_diagram: str = Field(..., min_length=1)

    @validator("components")
    def require_unique_component_ids(cls, value):
        ids = [component.id for component in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Architecture component IDs must be unique")
        return value

    @validator("connections")
    def require_known_component_endpoints(cls, value, values):
        component_ids = {component.id for component in values.get("components", [])}
        if any(connection.source not in component_ids or connection.target not in component_ids for connection in value):
            raise ValueError("Every architecture connection must reference an existing component")
        return value


class SoftwareArchitectureOut(SoftwareArchitecture):
    id: Optional[str] = None
    project_id: str
    created_at: datetime
