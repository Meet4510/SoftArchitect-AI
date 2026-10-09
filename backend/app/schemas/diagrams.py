from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, validator


class DiagramArtifact(BaseModel):
    diagram_type: Literal["use_case", "sequence", "class", "entity_relationship", "module_hierarchy"]
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    mermaid_source: str = Field(..., min_length=1)

    @validator("mermaid_source")
    def require_matching_mermaid_type(cls, value, values):
        source = value.strip()
        expected_prefix = {
            "use_case": "flowchart",
            "sequence": "sequenceDiagram",
            "class": "classDiagram",
            "entity_relationship": "flowchart",
            "module_hierarchy": "flowchart",
        }.get(values.get("diagram_type"))
        if not expected_prefix or not source.startswith(expected_prefix):
            raise ValueError("Mermaid source must match the declared diagram type")
        if values.get("diagram_type") == "entity_relationship" and not all(
            marker in source
            for marker in ("classDef erEntity", "classDef erRelationship", "classDef erAttribute", "classDef erKey")
        ):
            raise ValueError("Entity-relationship diagrams must define entity, relationship, attribute, and key shapes")
        return source


class UmlDiagramSet(BaseModel):
    project_summary: str = Field(..., min_length=1)
    diagrams: List[DiagramArtifact]
    design_decisions: List[str] = Field(..., min_items=1)

    @validator("diagrams")
    def require_all_unique_diagram_types(cls, value):
        types = [diagram.diagram_type for diagram in value]
        if len(types) != len(set(types)):
            raise ValueError("Diagram types must be unique")
        required = {"use_case", "sequence", "class", "entity_relationship", "module_hierarchy"}
        if set(types) != required:
            raise ValueError("Use-case, sequence, class, entity-relationship, and module-hierarchy diagrams are required")
        return value


class UmlDiagramSetOut(UmlDiagramSet):
    id: Optional[str] = None
    project_id: str
    created_at: datetime
