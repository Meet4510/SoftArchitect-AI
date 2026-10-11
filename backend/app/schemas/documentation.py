from datetime import datetime
import re
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


REQUIRED_DOCUMENTATION_SECTIONS = (
    "Abstract",
    "Table of Contents",
    "1. Introduction",
    "2. Literature Review",
    "3. System Analysis",
    "4. Design",
    "5. Implementation",
    "6. Testing",
    "7. Results and Discussion",
    "8. Conclusion and Future Scope",
    "References",
    "Requirements",
    "Architecture",
    "Data design",
    "API design",
    "Development roadmap",
    "Risk register",
    "Project structure",
    "Deployment and validation",
)


def missing_documentation_sections(markdown: str) -> list[str]:
    headings = {
        re.sub(r"^#+\s+", "", line).strip().casefold()
        for line in markdown.splitlines()
        if re.match(r"^#{1,6}\s+", line)
    }
    missing_sections = [
        section
        for section in REQUIRED_DOCUMENTATION_SECTIONS
        if section.casefold() not in headings
    ]
    if not markdown.lstrip().startswith("# "):
        missing_sections.insert(0, "Title")
    return missing_sections


class TechnicalDocumentationDraft(BaseModel):
    project_summary: str = Field(..., min_length=1)
    generation_prompt: str = Field(..., min_length=1)
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


def minimum_documentation_words(prompt: str) -> int:
    concise_request = any(
        term in prompt.casefold()
        for term in ("concise", "brief", "short report", "executive summary")
    )
    return 600 if concise_request else 1800


class TechnicalDocumentation(TechnicalDocumentationDraft):
    @validator("markdown")
    def require_comprehensive_documentation(cls, value, values):
        missing_sections = missing_documentation_sections(value)
        if missing_sections:
            raise ValueError(
                "Technical documentation is missing required blueprint sections: "
                + ", ".join(missing_sections)
            )
        minimum_words = minimum_documentation_words(values.get("generation_prompt", ""))
        word_count = len(value.split())
        if word_count < minimum_words:
            raise ValueError(
                f"Technical documentation is incomplete: {word_count} words provided; "
                f"at least {minimum_words} are required for this prompt."
            )
        return value


class DocumentationExpansion(BaseModel):
    markdown: str = Field(..., min_length=1)

    @validator("markdown")
    def require_substantial_expansion(cls, value):
        if len(value.split()) < 750:
            raise ValueError("Documentation expansion must contain at least 750 words")
        return value


class TechnicalDocumentationOut(TechnicalDocumentation):
    id: Optional[str] = None
    project_id: str
    created_at: datetime
