from datetime import datetime
import re
from typing import List, Optional

from pydantic import BaseModel, Field, validator


class DatabaseField(BaseModel):
    name: str = Field(..., min_length=1)
    bson_type: str = Field(..., min_length=1)
    required: bool
    description: str = Field(..., min_length=1)
    default_expression: Optional[str] = None


class DatabaseForeignKey(BaseModel):
    field: str = Field(..., min_length=1)
    references_collection: str = Field(..., min_length=1)
    references_field: str = Field(default="_id", min_length=1)
    description: str = Field(..., min_length=1)


class CollectionDesign(BaseModel):
    name: str = Field(..., min_length=1)
    purpose: str = Field(..., min_length=1)
    primary_key: str = Field(default="_id", min_length=1)
    foreign_keys: List[DatabaseForeignKey] = Field(default_factory=list)
    fields: List[DatabaseField] = Field(..., min_items=1)
    indexes: List[str]
    embedding_strategy: str = Field(..., min_length=1)

    @validator("fields")
    def require_unique_field_names(cls, value):
        names = [field.name for field in value]
        if len(names) != len(set(names)):
            raise ValueError("Field names must be unique within a collection")
        return value

    @validator("foreign_keys")
    def require_unique_foreign_key_fields(cls, value):
        fields = [foreign_key.field for foreign_key in value]
        if len(fields) != len(set(fields)):
            raise ValueError("Foreign key fields must be unique within a collection")
        return value

    @validator("fields")
    def require_primary_key_field(cls, value, values):
        primary_key = values.get("primary_key", "_id")
        if primary_key not in {field.name for field in value}:
            raise ValueError("The primary key must be declared as a collection field")
        return value


class DatabaseRelationship(BaseModel):
    from_collection: str = Field(..., min_length=1)
    to_collection: str = Field(..., min_length=1)
    cardinality: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)


class MongoDatabaseDesign(BaseModel):
    project_summary: str = Field(..., min_length=1)
    database_name: str = Field(default="softarchitect_ai", min_length=1)
    collections: List[CollectionDesign] = Field(..., min_items=1)
    relationships: List[DatabaseRelationship]
    design_decisions: List[str] = Field(..., min_items=1)
    mermaid_diagram: str = Field(..., min_length=1)

    @validator("collections")
    def require_unique_collection_names(cls, value):
        names = [collection.name for collection in value]
        if len(names) != len(set(names)):
            raise ValueError("Collection names must be unique")
        return value

    @validator("relationships")
    def require_known_relationship_collections(cls, value, values):
        collections = {collection.name: collection for collection in values.get("collections", [])}
        if any(
            relationship.from_collection not in collections or relationship.to_collection not in collections
            for relationship in value
        ):
            raise ValueError("Every relationship must reference an existing collection")
        for collection in collections.values():
            for foreign_key in collection.foreign_keys:
                target = collections.get(foreign_key.references_collection)
                if target is None:
                    raise ValueError("Every foreign key must reference an existing collection")
                if foreign_key.references_field not in {field.name for field in target.fields}:
                    raise ValueError("Every foreign key must reference an existing field")
                local_field = foreign_key.field.split(".", 1)[0]
                if local_field not in {field.name for field in collection.fields}:
                    raise ValueError("Every foreign key must reference a declared local field")
        return value

    @validator("mermaid_diagram")
    def require_chen_erd_shapes(cls, value, values):
        source = value.strip()
        required_markers = (
            "classDef erEntity",
            "classDef erRelationship",
            "classDef erAttribute",
            "classDef erKey",
            ":::erEntity",
            '(["',
            "PK ",
        )
        if not source.startswith("flowchart") or not all(marker in source for marker in required_markers):
            raise ValueError("Database diagram must use Chen ERD entity, relationship, attribute, and key notation")
        relationship_count = len(values.get("relationships", []))
        cardinality_edges = re.findall(r"---\|(1|N)\|", source)
        if relationship_count and (
            '::erRelationship' not in source
            or len(cardinality_edges) < relationship_count * 2
        ):
            raise ValueError("Chen ERD relationships must show diamonds and 1/N cardinalities")
        return source


class MongoDatabaseDesignOut(MongoDatabaseDesign):
    id: Optional[str] = None
    project_id: str
    created_at: datetime
