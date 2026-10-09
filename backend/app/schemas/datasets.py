from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


class SyntheticCollectionData(BaseModel):
    name: str = Field(..., min_length=1)
    records: List[Dict[str, Any]] = Field(..., min_items=1)


class SyntheticDataset(BaseModel):
    project_summary: str = Field(..., min_length=1)
    source_database_design_id: str = Field(..., min_length=1)
    version: int = Field(default=1, ge=1)
    records_by_collection: Dict[str, int]
    collections: List[SyntheticCollectionData] = Field(..., min_items=1)

    @validator("collections")
    def require_unique_collections(cls, value):
        names = [collection.name for collection in value]
        if len(names) != len(set(names)):
            raise ValueError("Dataset collection names must be unique")
        return value

    @validator("records_by_collection")
    def require_positive_collection_counts(cls, value):
        if not value:
            raise ValueError("Record counts must be provided for every generated collection")
        if any(not 1 <= count <= 500 for count in value.values()):
            raise ValueError("Each collection must contain between 1 and 500 records")
        return value

    @validator("records_by_collection")
    def require_matching_collection_counts(cls, value, values):
        collections = values.get("collections", [])
        if collections and set(value) != {collection.name for collection in collections}:
            raise ValueError("Record counts must be provided for every generated collection")
        return value

class SyntheticDatasetOut(SyntheticDataset):
    id: Optional[str] = None
    project_id: str
    created_at: datetime


class GenerateDatasetRequest(BaseModel):
    records_by_collection: Dict[str, int]

    @validator("records_by_collection")
    def require_valid_counts(cls, value):
        if not value:
            raise ValueError("Record counts must be provided for every collection")
        if any(not 1 <= count <= 500 for count in value.values()):
            raise ValueError("Each collection must contain between 1 and 500 records")
        return value
