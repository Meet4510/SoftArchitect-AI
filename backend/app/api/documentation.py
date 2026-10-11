from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError

from app.api.artifact_freshness import requirements_match, require_current_requirements
from app.api.llm import gemini_enabled, generate_gemini_blueprint
from app.agents.documentation import (
    generate_technical_documentation,
    render_database_schema,
    replace_documentation_section,
)
from app.auth.deps import get_current_user
from app.models.api_design import get_latest_api_design
from app.models.architecture import get_latest_architecture
from app.models.database_design import get_latest_database_design
from app.models.diagrams import get_latest_diagrams
from app.models.documentation import get_latest_documentation, save_documentation
from app.models.project import get_project
from app.models.requirement_analysis import get_latest_requirement_analysis
from app.models.technology_recommendation import get_latest_technology_recommendation
from app.schemas.api_design import RestApiDesign
from app.schemas.architecture import SoftwareArchitecture
from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.diagrams import UmlDiagramSet
from app.schemas.documentation import (
    DocumentationExpansion,
    GenerateDocumentationRequest,
    TechnicalDocumentation,
    TechnicalDocumentationDraft,
    TechnicalDocumentationOut,
    missing_documentation_sections,
    minimum_documentation_words,
)
from app.schemas.technology_recommendation import TechnologyRecommendation

router = APIRouter(prefix="/api/v1/projects", tags=["Documentation"])


async def _get_accessible_project(project_id: str, user: dict) -> dict:
    if not ObjectId.is_valid(project_id):
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Project not found"})
    project = await get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Project not found"})
    if str(project.get("user_id")) != str(user.get("id")) and user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Not allowed to access this project"},
        )
    return project


def _response(saved: dict) -> dict:
    return {
        **saved["documentation"],
        "id": saved["id"],
        "project_id": saved["project_id"],
        "created_at": saved["created_at"],
    }


async def _get_sources(project_id: str, requirements: str):
    saved_analysis = await get_latest_requirement_analysis(project_id)
    saved_technology = await get_latest_technology_recommendation(project_id)
    saved_architecture = await get_latest_architecture(project_id)
    saved_database = await get_latest_database_design(project_id)
    saved_api = await get_latest_api_design(project_id)
    saved_diagrams = await get_latest_diagrams(project_id)
    return (
        saved_analysis["analysis"]
        if requirements_match(saved_analysis, requirements)
        else None,
        TechnologyRecommendation(**saved_technology["recommendation"])
        if requirements_match(saved_technology, requirements)
        else None,
        SoftwareArchitecture(**saved_architecture["architecture"])
        if requirements_match(saved_architecture, requirements)
        else None,
        MongoDatabaseDesign(**saved_database["database_design"])
        if requirements_match(saved_database, requirements)
        else None,
        RestApiDesign(**saved_api["api_design"])
        if requirements_match(saved_api, requirements)
        else None,
        UmlDiagramSet(**saved_diagrams["diagram_set"])
        if requirements_match(saved_diagrams, requirements)
        else None,
    )


@router.post("/{project_id}/documentation/generate", response_model=TechnicalDocumentationOut)
async def generate_project_documentation(
    project_id: str,
    request: GenerateDocumentationRequest,
    user=Depends(get_current_user),
):
    project = await _get_accessible_project(project_id, user)
    requirements = (project.get("requirements") or "").strip()
    if len(requirements) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "requirements_too_short",
                "message": "Add at least 20 characters of project requirements before generating documentation.",
            },
        )
    (
        requirement_analysis,
        technology,
        architecture,
        database_design,
        api_design,
        diagrams,
    ) = await _get_sources(project_id, requirements)
    if gemini_enabled():
        documentation_draft = await generate_gemini_blueprint(
            "senior academic project-report writer and software architect. Create a thorough, "
            "submission-ready MCA final-year software project report in Markdown, following the "
            "academic structure of a university project report. Follow the user's requested "
            "audience, format, scope, and depth; unless they explicitly request a shorter "
            "document, write a comprehensive report with substantive project-specific content "
            "in every chapter, not a short outline or repeated filler. Write at least 1,800 "
            "words and aim for approximately 2,200 unless the user explicitly requests a "
            "concise or brief document. Include a title page with "
            "clearly marked placeholders for unknown student, guide, and institution details; "
            "an abstract; acknowledgement only when contributor details are supplied; a clearly "
            "editable declaration template that does not assert unverified authorship; and a "
            "table of contents without invented page numbers. Include these exact Markdown "
            "headings: `## Abstract`, `## Table of Contents`, `## 1. Introduction`, "
            "`## 2. Literature Review`, `## 3. System Analysis`, `## 4. Design`, "
            "`## 5. Implementation`, `## 6. Testing`, `## 7. Results and Discussion`, "
            "`## 8. Conclusion and Future Scope`, and `## References`. Cover the problem "
            "statement, objectives, scope and report organization; related approaches and "
            "evidence-based comparison; functional/non-functional requirements, feasibility and "
            "technology; architecture, diagrams, database and API design; implementation "
            "modules and workflows; test methodology, traceable test cases and observed results; "
            "outcomes, comparison, challenges; limitations and future enhancements. Include "
            "these additional exact headings somewhere in the report: `## Requirements`, "
            "`## Architecture`, `## Data design`, `## API design`, `## Development roadmap`, "
            "`## Risk register`, `## Project structure`, and `## Deployment and validation`. "
            "Use the supplied saved artifacts as the source of truth and explain missing artifacts "
            "as not yet available. Do not claim tests, deployments, screenshots, performance "
            "measurements, user studies, or implementation outcomes were completed unless the "
            "context provides evidence; label proposed test cases as planned/not executed. Do not "
            "invent personal, institutional, citation, product, or project facts. Use only real, "
            "relevant references you can identify confidently, and flag references needing "
            "author verification. Mermaid is source material: summarize diagrams and their "
            "relationships in prose rather than dumping source code into the report. Populate the "
            "structured roadmap and risk register consistently with the Markdown; list only "
            "artifacts actually supplied in source_artifacts.",
            {
                "project": {
                    "name": project.get("name", "Project"),
                    "domain": project.get("domain", ""),
                    "requirements": requirements,
                },
                "requirement_analysis": requirement_analysis,
                "documentation_request": request.prompt,
                "available_artifacts": {
                    "technology_recommendation": technology.dict() if technology else None,
                    "architecture": architecture.dict() if architecture else None,
                    "database_design": database_design.dict() if database_design else None,
                    "api_design": api_design.dict() if api_design else None,
                    "uml_diagrams": diagrams.dict() if diagrams else None,
                },
            },
            TechnicalDocumentationDraft,
            max_output_tokens=20000,
        )
        documentation_draft.generation_prompt = request.prompt
        if not documentation_draft.markdown.lstrip().startswith("# "):
            title = project.get("name", "Project").strip() or "Project"
            documentation_draft.markdown = (
                f"# {title}\n\n{documentation_draft.markdown.lstrip()}"
            )
        documentation_draft.source_artifacts = ["project requirements"] + [
            name
            for available, name in (
                (requirement_analysis, "requirement analysis"),
                (technology, "technology recommendations"),
                (architecture, "software architecture"),
                (database_design, "MongoDB database design"),
                (api_design, "REST API design"),
                (diagrams, "UML diagrams"),
            )
            if available is not None
        ]
        minimum_words = minimum_documentation_words(request.prompt)
        current_word_count = len(documentation_draft.markdown.split())
        missing_sections = missing_documentation_sections(documentation_draft.markdown)
        if current_word_count < minimum_words or missing_sections:
            expansion_sections = []
            focus_areas = (
                "requirements traceability, authorization boundaries, MongoDB data integrity, "
                "and detailed planned test cases",
                "deployment and operational risks, project limitations, and realistic future enhancements",
            )
            if current_word_count < minimum_words:
                for focus_area in focus_areas:
                    if current_word_count >= minimum_words:
                        break
                    target_expansion_words = max(
                        900,
                        minimum_words - current_word_count + 150,
                    )
                    expansion = await generate_gemini_blueprint(
                        "academic software engineering report editor. Write a detailed, "
                        "project-specific Markdown expansion for an existing MCA project report. "
                        f"Add at least {target_expansion_words} useful words focused on {focus_area}. "
                        "Use meaningful subsection headings, do not repeat existing content, and "
                        "label tests or deployment as planned when the supplied context contains no "
                        "evidence they were executed. Do not invent technologies, results, references, "
                        "personal details, or institutional facts. "
                        + (
                            "Also add substantive sections with these exact missing headings: "
                            + ", ".join(f"`## {section}`" for section in missing_sections)
                            + "."
                            if missing_sections
                            else ""
                        ),
                        {
                            "project": {
                                "name": project.get("name", "Project"),
                                "domain": project.get("domain", ""),
                                "requirements": requirements,
                            },
                            "documentation_request": request.prompt,
                            "available_artifacts": {
                                "requirement_analysis": requirement_analysis,
                                "technology_recommendation": technology.dict() if technology else None,
                                "architecture": architecture.dict() if architecture else None,
                                "database_design": database_design.dict() if database_design else None,
                                "api_design": api_design.dict() if api_design else None,
                                "uml_diagrams": diagrams.dict() if diagrams else None,
                            },
                            "existing_report": (
                                documentation_draft.markdown
                                + "\n\n"
                                + "\n\n".join(expansion_sections)
                            ),
                            "missing_required_sections": missing_sections,
                        },
                        DocumentationExpansion,
                        max_output_tokens=12000,
                    )
                    expansion_markdown = expansion.markdown.strip()
                    expansion_sections.append(expansion_markdown)
                    current_word_count += len(expansion_markdown.split())

            current_report = (
                documentation_draft.markdown
                + "\n\n"
                + "\n\n".join(expansion_sections)
            )
            missing_sections = missing_documentation_sections(current_report)
            if missing_sections:
                completion = await generate_gemini_blueprint(
                    "academic software engineering report editor. Repair an incomplete "
                    "MCA project report by writing substantive Markdown sections using the "
                    "exact headings listed below. Return only the missing sections. Use project "
                    "facts from the context and do not claim unverified implementation, testing, "
                    "or deployment outcomes. Required headings:\n"
                    + "\n".join(f"## {section}" for section in missing_sections),
                    {
                        "project": {
                            "name": project.get("name", "Project"),
                            "domain": project.get("domain", ""),
                            "requirements": requirements,
                        },
                        "documentation_request": request.prompt,
                        "missing_required_sections": missing_sections,
                        "existing_report": current_report,
                    },
                    DocumentationExpansion,
                    max_output_tokens=12000,
                )
                completion_markdown = completion.markdown.strip()
                expansion_sections.append(completion_markdown)
                current_word_count += len(completion_markdown.split())
                completed_report = (
                    documentation_draft.markdown
                    + "\n\n"
                    + "\n\n".join(expansion_sections)
                )
                missing_sections = missing_documentation_sections(completed_report)
                if missing_sections:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={
                            "code": "documentation_incomplete",
                            "message": (
                                "Gemini could not complete these required report headings; "
                                f"no documentation was saved: {', '.join(missing_sections)}."
                            ),
                        },
                    )
            report_before_references, references_heading, after_references = (
                documentation_draft.markdown.rpartition("## References")
            )
            expansion_markdown = "\n\n".join(expansion_sections)
            if references_heading:
                documentation_draft.markdown = (
                    f"{report_before_references.rstrip()}\n\n"
                    f"## Detailed Technical Analysis\n\n"
                    f"{expansion_markdown}\n\n"
                    f"## References{after_references}"
                )
            else:
                documentation_draft.markdown = (
                    f"{documentation_draft.markdown.rstrip()}\n\n"
                    f"## Detailed Technical Analysis\n\n{expansion_markdown}"
                )
            still_missing = missing_documentation_sections(documentation_draft.markdown)
            if still_missing:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "code": "documentation_incomplete",
                        "message": (
                            "Gemini could not complete these required report headings; "
                            f"no documentation was saved: {', '.join(still_missing)}."
                        ),
                    },
                )
        try:
            documentation = TechnicalDocumentation(**documentation_draft.dict())
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "documentation_incomplete",
                    "message": (
                        "Gemini could not produce a complete report that meets the required "
                        f"structure and length; no documentation was saved. {exc}"
                    ),
                },
            ) from exc
    else:
        documentation = generate_technical_documentation(
            project,
            technology,
            architecture,
            database_design,
            api_design,
            request.prompt,
            requirement_analysis=requirement_analysis,
            diagrams=diagrams,
        )
    documentation.markdown = replace_documentation_section(
        documentation.markdown,
        "Data design",
        render_database_schema(database_design),
    )
    documentation = TechnicalDocumentation(**documentation.dict())
    saved = await save_documentation(project_id, str(user.get("id")), requirements, documentation)
    return _response(saved)


@router.get("/{project_id}/documentation", response_model=TechnicalDocumentationOut)
async def fetch_project_documentation(project_id: str, user=Depends(get_current_user)):
    project = await _get_accessible_project(project_id, user)
    requirements = project.get("requirements") or ""
    saved = require_current_requirements(
        await get_latest_documentation(project_id),
        requirements,
        "documentation_not_found",
        "No current technical documentation exists for this project's requirements.",
    )
    saved_database = await get_latest_database_design(project_id)
    database_design = (
        MongoDatabaseDesign(**saved_database["database_design"])
        if requirements_match(saved_database, requirements)
        else None
    )
    saved = {
        **saved,
        "documentation": {
            **saved["documentation"],
            "markdown": replace_documentation_section(
                saved["documentation"]["markdown"],
                "Data design",
                render_database_schema(database_design),
            ),
        },
    }
    return _response(saved)
