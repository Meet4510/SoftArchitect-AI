from fastapi import APIRouter, Depends, HTTPException, status

from app.api.artifact_freshness import requirements_match, require_current_requirements
from app.api.llm import gemini_enabled, generate_gemini_blueprint
from app.agents.database_design import design_mongodb_schema
from app.agents.diagrams import design_uml_diagrams
from app.auth.deps import get_current_user
from app.models.api_design import get_latest_api_design
from app.models.architecture import get_latest_architecture
from app.models.diagrams import get_latest_diagrams, save_diagrams
from app.models.project import get_project
from app.schemas.api_design import RestApiDesign
from app.schemas.diagrams import UmlDiagramSet, UmlDiagramSetOut
from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.architecture import SoftwareArchitecture
from app.models.database_design import get_latest_database_design, save_database_design

router = APIRouter(prefix="/api/v1/projects", tags=["UML diagrams"])


async def _get_accessible_project(project_id: str, user: dict) -> dict:
    project = await get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Project not found"},
        )
    if str(project.get("user_id")) != str(user.get("id")) and user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Not allowed to access this project"},
        )
    return project


@router.post("/{project_id}/diagrams/generate", response_model=UmlDiagramSetOut)
async def generate_project_diagrams(project_id: str, user=Depends(get_current_user)):
    project = await _get_accessible_project(project_id, user)
    requirements = (project.get("requirements") or "").strip()
    if len(requirements) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "requirements_too_short",
                "message": "Add at least 20 characters of project requirements before generating diagrams.",
            },
        )

    saved_api_design = await get_latest_api_design(project_id)
    saved_database_design = await get_latest_database_design(project_id)
    saved_architecture = await get_latest_architecture(project_id)
    if not all(
        requirements_match(saved, requirements)
        for saved in (saved_api_design, saved_database_design, saved_architecture)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "api_design_required",
                "message": "Generate and save the software architecture, MongoDB design, and REST API design before UML diagrams.",
            },
        )
    api_design = RestApiDesign(**saved_api_design["api_design"])
    architecture = SoftwareArchitecture(**saved_architecture["architecture"])
    saved_database_payload = saved_database_design["database_design"]
    chen_markers = (
        "classDef erEntity",
        "classDef erRelationship",
        "classDef erAttribute",
        "classDef erKey",
    )
    if not all(
        marker in saved_database_payload.get("mermaid_diagram", "")
        for marker in chen_markers
    ):
        database_design = design_mongodb_schema(
            requirements,
            project.get("name", "Project"),
            architecture,
        )
        saved_database_design = await save_database_design(
            project_id,
            str(user.get("id")),
            requirements,
            saved_architecture["id"],
            database_design,
        )
    else:
        database_design = MongoDatabaseDesign(**saved_database_payload)
    if gemini_enabled():
        diagrams = await generate_gemini_blueprint(
            "UML designer. Return exactly five diagrams, each with its matching diagram_type "
            "and Mermaid source. Required mapping: use_case starts `flowchart`; sequence starts "
            "`sequenceDiagram`; class starts `classDiagram`; entity_relationship starts "
            "`flowchart`; module_hierarchy starts `flowchart`. These declarations must be the "
            "first text in mermaid_source, with no Markdown fences or prose. The "
            "entity_relationship diagram must be a Chen ERD defining classDef erEntity, "
            "erRelationship, erAttribute, erKey and using those shapes.",
            {
                "project_name": project.get("name", "Project"),
                "requirements": requirements,
                "architecture": architecture.dict(),
                "database_design": database_design.dict(),
                "api_design": api_design.dict(),
            },
            UmlDiagramSet,
        )
    else:
        diagrams = design_uml_diagrams(
            requirements,
            project.get("name", "Project"),
            database_design,
            api_design,
            architecture,
        )
    saved = await save_diagrams(
        project_id,
        str(user.get("id")),
        requirements,
        saved_api_design["id"],
        diagrams,
    )
    return {
        **saved["diagram_set"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


@router.get("/{project_id}/diagrams", response_model=UmlDiagramSetOut)
async def get_project_diagrams(project_id: str, user=Depends(get_current_user)):
    project = await _get_accessible_project(project_id, user)
    saved = require_current_requirements(
        await get_latest_diagrams(project_id),
        project.get("requirements") or "",
        "diagrams_not_found",
        "No current UML diagrams exist for this project's requirements.",
    )
    required_types = {
        "use_case",
        "sequence",
        "class",
        "entity_relationship",
        "module_hierarchy",
    }
    saved_types = {
        diagram.get("diagram_type")
        for diagram in saved["diagram_set"].get("diagrams", [])
    }
    saved_erd = next(
        (
            diagram.get("mermaid_source", "")
            for diagram in saved["diagram_set"].get("diagrams", [])
            if diagram.get("diagram_type") == "entity_relationship"
        ),
        "",
    )
    required_erd_shapes = (
        "classDef erEntity",
        "classDef erRelationship",
        "classDef erAttribute",
        "classDef erKey",
    )
    if saved_types != required_types or not all(marker in saved_erd for marker in required_erd_shapes):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "diagrams_outdated",
                "message": "The saved diagram set predates the ER and module hierarchy diagrams. Generate the diagrams again.",
            },
        )
    return {
        **saved["diagram_set"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


@router.put("/{project_id}/diagrams", response_model=UmlDiagramSetOut)
async def update_project_diagrams(
    project_id: str,
    diagram_set: UmlDiagramSet,
    user=Depends(get_current_user),
):
    project = await _get_accessible_project(project_id, user)
    requirements = (project.get("requirements") or "").strip()
    saved = await get_latest_diagrams(project_id)
    if not requirements_match(saved, requirements):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "diagrams_not_found",
                "message": "No current UML diagrams exist for this project's requirements.",
            },
        )
    updated = await save_diagrams(
        project_id,
        str(user.get("id")),
        requirements,
        saved["source_api_design_id"],
        diagram_set,
    )
    return {
        **updated["diagram_set"],
        "id": updated["id"],
        "project_id": updated["project_id"],
        "created_at": updated["created_at"],
    }
