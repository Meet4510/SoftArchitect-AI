from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, validator


class RequirementAnalysis(BaseModel):
    project_summary: str = Field(..., min_length=1)
    functional_requirements: List[str]
    non_functional_requirements: List[str]
    user_roles: List[str]
    modules: List[str]
    business_rules: List[str]
    assumptions: List[str]
    missing_information: List[str]
    risks: List[str]

    @validator(
        "functional_requirements",
        "non_functional_requirements",
        "user_roles",
        "modules",
        "business_rules",
        "assumptions",
        "missing_information",
        "risks",
    )
    def remove_empty_items(cls, value):
        cleaned = [item.strip() for item in value if item and item.strip()]
        if not cleaned:
            raise ValueError("Analysis lists must contain at least one item")
        return cleaned


class RequirementAnalysisOut(RequirementAnalysis):
    id: Optional[str] = None
    project_id: str
    created_at: datetime
