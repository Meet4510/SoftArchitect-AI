from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, validator


class TechnologyChoice(BaseModel):
    category: str = Field(..., min_length=1)
    recommendation: str = Field(..., min_length=1)
    rationale: str = Field(..., min_length=1)
    alternatives: List[str]
    trade_offs: List[str]

    @validator("alternatives", "trade_offs")
    def remove_empty_items(cls, value):
        return [item.strip() for item in value if item and item.strip()]


class TechnologyRecommendation(BaseModel):
    project_summary: str = Field(..., min_length=1)
    recommendations: List[TechnologyChoice] = Field(..., min_items=1)

    @validator("recommendations")
    def require_unique_categories(cls, value):
        categories = [item.category.casefold() for item in value]
        if len(categories) != len(set(categories)):
            raise ValueError("Technology recommendation categories must be unique")
        return value


class TechnologyRecommendationOut(TechnologyRecommendation):
    id: Optional[str] = None
    project_id: str
    created_at: datetime
