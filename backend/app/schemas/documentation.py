from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, validator


class GenerateDocumentationRequest(BaseModel):
    prompt: str = Field(..., min_length=10, max_length=4000)

    @validator("prompt")
    def require_nonempty_prompt(cls, value):
        cleaned = value.strip()
        if len(cleaned) < 10:
            raise ValueError("Describe the documentation you want in at least 10 characters")
        return cleaned


class RoadmapPhase(BaseModel):
    title: str = Field(..., min_length=1)
    objective: str = Field(..., min_length=1)
    deliverables: List[str] = Field(..., min_items=1)
    acceptance_criteria: List[str] = Field(..., min_items=1)


class ProjectRisk(BaseModel):
    category: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    likelihood: str = Field(..., min_length=1)
    impact: str = Field(..., min_length=1)
    mitigation: str = Field(..., min_length=1)


class DocumentationSection(BaseModel):
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)


class TechnicalDocumentation(BaseModel):
    project_summary: str = Field(..., min_length=1)
    generation_prompt: str = Field(
        default="Create a complete technical blueprint based on the project requirements and available saved artifacts.",
        min_length=1,
    )
    source_artifacts: List[str] = Field(..., min_items=1)
    roadmap: List[RoadmapPhase] = Field(..., min_items=1)
    risks: List[ProjectRisk] = Field(..., min_items=1)
    custom_sections: List[DocumentationSection] = Field(default_factory=list)
    folder_structure: str = Field(..., min_length=1)
    markdown: str = Field(..., min_length=1)

    @validator("source_artifacts")
    def require_unique_sources(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Documentation source artifacts must be unique")
        return value

    @validator("markdown")
    def require_document_sections(cls, value):
        required_sections = (
            "# ",
            "## Requirements",
            "## Architecture",
            "## Data design",
            "## API design",
            "## Development roadmap",
            "## Risk register",
            "## Project structure",
            "## Deployment and validation",
        )
        if any(section not in value for section in required_sections):
            raise ValueError("Technical documentation is missing required blueprint sections")
        return value


class TechnicalDocumentationOut(TechnicalDocumentation):
    id: Optional[str] = None
    project_id: str
    created_at: datetime
