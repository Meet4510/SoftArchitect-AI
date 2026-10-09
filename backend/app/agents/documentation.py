from typing import Optional

from app.schemas.api_design import RestApiDesign
from app.schemas.architecture import SoftwareArchitecture
from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.documentation import (
    DocumentationSection,
    ProjectRisk,
    RoadmapPhase,
    TechnicalDocumentation,
)
from app.schemas.technology_recommendation import TechnologyRecommendation


def generate_technical_documentation(
    project: dict,
    technology: Optional[TechnologyRecommendation] = None,
    architecture: Optional[SoftwareArchitecture] = None,
    database_design: Optional[MongoDatabaseDesign] = None,
    api_design: Optional[RestApiDesign] = None,
    prompt: str = "Create a complete technical blueprint based on the project requirements and available saved artifacts.",
) -> TechnicalDocumentation:
    name = project.get("name", "Project").strip() or "Project"
    requirements = (project.get("requirements") or "").strip()
    summary = project.get("description", "").strip() or f"Software blueprint for {name}."

    sources = ["project requirements"]
    if technology:
        sources.append("technology recommendations")
    if architecture:
        sources.append("software architecture")
    if database_design:
        sources.append("MongoDB database design")
    if api_design:
        sources.append("REST API design")

    recommendations = technology.recommendations if technology else []
    components = architecture.components if architecture else []
    collections = database_design.collections if database_design else []
    endpoints = api_design.endpoints if api_design else []
    risks = _build_risks(requirements, endpoints)
    roadmap = _build_roadmap(name, bool(api_design), bool(database_design))
    folder_structure = _build_folder_structure(components)
    custom_sections = _build_prompt_sections(prompt, architecture, collections, endpoints, recommendations)
    markdown = _render_markdown(
        name,
        summary,
        requirements,
        recommendations,
        architecture,
        collections,
        endpoints,
        roadmap,
        risks,
        folder_structure,
        prompt,
        custom_sections,
    )

    return TechnicalDocumentation(
        project_summary=summary,
        generation_prompt=prompt,
        source_artifacts=sources,
        roadmap=roadmap,
        risks=risks,
        custom_sections=custom_sections,
        folder_structure=folder_structure,
        markdown=markdown,
    )


def _build_prompt_sections(prompt, architecture, collections, endpoints, recommendations):
    normalized = prompt.casefold()
    sections = []
    topics = [
        (
            ("api", "endpoint", "integration", "openapi", "rest"),
            "API implementation details",
            "\n".join(
                f"- `{endpoint.method} {endpoint.path}` — {endpoint.summary}. "
                f"Authentication: {'required' if endpoint.auth_required else 'not required'}; "
                f"roles: {', '.join(endpoint.roles) or 'public'}."
                for endpoint in endpoints
            ) or "The API contract has not been generated yet. Generate the REST API design to include endpoint details.",
        ),
        (
            ("database", "data model", "collection", "schema", "mongodb"),
            "Database implementation details",
            "\n".join(
                f"- **{collection.name}:** {collection.purpose} Fields: "
                f"{', '.join(field.name for field in collection.fields)}. "
                f"Indexes: {', '.join(collection.indexes) or 'none specified'}."
                for collection in collections
            ) or "The MongoDB design has not been generated yet. Generate the database design to include collections and indexes.",
        ),
        (
            ("architecture", "component", "system design", "module"),
            "Architecture implementation details",
            (
                f"Architectural style: {architecture.architectural_style}\n\n"
                + "\n".join(
                    f"- **{component.name}:** {component.description} Technologies: "
                    f"{', '.join(component.technologies) or 'not specified'}."
                    for component in architecture.components
                )
                if architecture
                else "The software architecture has not been generated yet. Generate it to include component details."
            ),
        ),
        (
            ("technology", "tech stack", "framework", "platform"),
            "Technology choices",
            "\n".join(
                f"- **{item.category}:** {item.recommendation}. {item.rationale}"
                for item in recommendations
            ) or "Technology recommendations have not been generated yet.",
        ),
    ]
    for keywords, title, content in topics:
        if any(keyword in normalized for keyword in keywords):
            sections.append(DocumentationSection(title=title, content=content))

    focus_terms = (
        ("testing", "test plan", "quality assurance", "qa"),
        ("deployment", "deploy", "devops", "operations", "hosting"),
        ("security", "privacy", "threat"),
        ("roadmap", "milestone", "timeline", "project plan"),
        ("risk", "mitigation"),
    )
    for terms in focus_terms:
        if any(term in normalized for term in terms):
            sections.append(
                DocumentationSection(
                    title=f"{terms[0].replace('_', ' ').title()} guidance",
                    content=_prompt_guidance(terms[0]),
                )
            )

    if not sections:
        sections.append(
            DocumentationSection(
                title="Prompt-specific overview",
                content=(
                    "This document follows the requested audience, format, and scope while using the project requirements "
                    "and any available saved blueprint artifacts as its factual source."
                ),
            )
        )
    return sections


def _prompt_guidance(topic):
    guidance = {
        "testing": (
            "Validate unit behavior for domain services and schema rules, API integration including authorization failures, "
            "and end-to-end critical user journeys. Run regression tests before release."
        ),
        "deployment": (
            "Externalize secrets and environment-specific settings, deploy with health checks, persist and back up MongoDB data, "
            "and document a tested rollback procedure."
        ),
        "security": (
            "Enforce authentication, role and ownership checks server-side; validate inputs; store only password hashes; "
            "protect secrets; and avoid retaining payment-card data."
        ),
        "roadmap": (
            "Deliver in gated phases: confirm scope, establish the platform foundation, implement core domain workflows, "
            "then verify, harden, and prepare the release."
        ),
        "risk": (
            "Review likelihood and impact with stakeholders, assign an owner to each high-impact item, and track mitigation "
            "actions through each release."
        ),
    }
    return guidance[topic]


def _build_roadmap(name: str, has_database: bool, has_api: bool):
    return [
        RoadmapPhase(
            title="1. Confirm scope and acceptance criteria",
            objective=f"Turn the requirements for {name} into testable user stories and release boundaries.",
            deliverables=["Prioritized user stories", "Functional and non-functional acceptance criteria"],
            acceptance_criteria=["Stakeholders approve the MVP scope", "Out-of-scope items are recorded"],
        ),
        RoadmapPhase(
            title="2. Establish the platform foundation",
            objective="Create the application structure, environments, authentication, and CI checks.",
            deliverables=["Frontend and FastAPI application skeleton", "MongoDB connection and indexes", "CI build and test pipeline"],
            acceptance_criteria=["Local and test environments start reproducibly", "Protected routes reject unauthenticated access"],
        ),
        RoadmapPhase(
            title="3. Implement core domain workflows",
            objective="Deliver the highest-priority user journeys using the approved architecture and data model.",
            deliverables=[
                "Domain services and user-facing workflows",
                "Validated persistence and API contracts" if has_api else "Versioned API contracts and domain services",
                "Database constraints and reference validation" if has_database else "MongoDB collections and indexes",
            ],
            acceptance_criteria=["Primary user journeys pass integration tests", "Authorization and ownership rules are enforced"],
        ),
        RoadmapPhase(
            title="4. Verify, harden, and prepare release",
            objective="Validate security, reliability, usability, and operational readiness before deployment.",
            deliverables=["Automated unit and integration tests", "Dependency and configuration review", "Deployment and rollback checklist"],
            acceptance_criteria=["Critical workflows pass regression tests", "Secrets and production configuration are externalized"],
        ),
    ]


def _build_risks(requirements: str, endpoints: list):
    text = requirements.casefold()
    risks = [
        ProjectRisk(
            category="Security and privacy",
            description="User data or privileged operations may be exposed if authentication, authorization, and input validation are inconsistent.",
            likelihood="Medium",
            impact="High",
            mitigation="Enforce role and ownership checks server-side, validate requests with schemas, hash credentials, and test unauthorized access.",
        ),
        ProjectRisk(
            category="Data integrity",
            description="References between MongoDB documents can become inconsistent because MongoDB does not enforce foreign keys.",
            likelihood="Medium",
            impact="High",
            mitigation="Validate referenced IDs in application services, use transactions where supported, and add integration tests for deletion and updates.",
        ),
        ProjectRisk(
            category="Scope and requirement gaps",
            description="Unspecified edge cases can cause rework or incompatible assumptions between stakeholders and implementation.",
            likelihood="Medium",
            impact="Medium",
            mitigation="Review assumptions, missing information, and acceptance criteria with stakeholders before committing to each release.",
        ),
    ]
    if any(term in text for term in ("payment", "checkout", "billing", "subscription")):
        risks.append(
            ProjectRisk(
                category="Payment integration",
                description="Payment-provider failures, duplicate callbacks, or mishandled sensitive data can interrupt checkout or cause incorrect payment state.",
                likelihood="Medium",
                impact="High",
                mitigation="Use an established provider, verify webhook signatures, make payment operations idempotent, and never store raw card data.",
            )
        )
    if endpoints and any(endpoint.auth_required for endpoint in endpoints):
        risks.append(
            ProjectRisk(
                category="Authorization drift",
                description="API access rules may diverge from the roles and ownership rules expected by the product.",
                likelihood="Low",
                impact="High",
                mitigation="Keep authorization policies centralized and test every role-sensitive endpoint for allowed and denied cases.",
            )
        )
    return risks


def _build_folder_structure(components):
    component_names = [component.name for component in components]
    module_lines = "\n".join(
        f"│   ├── {name.lower().replace(' ', '_')}/" for name in component_names[:8]
    )
    if not module_lines:
        module_lines = "│   ├── api/\n│   ├── services/\n│   └── models/"
    return (
        "softarchitect-project/\n"
        "├── frontend/\n"
        "│   └── src/\n"
        "│       ├── components/\n"
        "│       ├── features/\n"
        "│       └── services/\n"
        "├── backend/\n"
        "│   └── app/\n"
        f"{module_lines}\n"
        "├── tests/\n"
        "├── docker-compose.yml\n"
        "└── README.md"
    )


def _render_markdown(
    name,
    summary,
    requirements,
    recommendations,
    architecture,
    collections,
    endpoints,
    roadmap,
    risks,
    folder_structure,
    prompt,
    custom_sections,
):
    stack = "\n".join(
        f"- **{choice.category}:** {choice.recommendation} — {choice.rationale}"
        for choice in recommendations
    ) or "- Technology choices have not yet been generated."
    architecture_text = (
        f"**Style:** {architecture.architectural_style}\n\n"
        + "\n".join(f"- **{item.name}:** {item.description}" for item in architecture.components)
        if architecture
        else "Architecture artifact has not yet been generated."
    )
    database_text = "\n".join(
        f"- **{collection.name}:** {', '.join(field.name for field in collection.fields)}"
        for collection in collections
    ) or "MongoDB collection design has not yet been generated."
    api_text = "\n".join(
        f"- `{endpoint.method} {endpoint.path}` — {endpoint.summary}"
        for endpoint in endpoints
    ) or "REST API contract has not yet been generated."
    roadmap_text = "\n".join(
        f"### {phase.title}\n\n{phase.objective}\n\n"
        + "\n".join(f"- {item}" for item in phase.deliverables)
        for phase in roadmap
    )
    risk_text = "\n".join(
        f"- **{risk.category} ({risk.likelihood} likelihood, {risk.impact} impact):** "
        f"{risk.description} Mitigation: {risk.mitigation}"
        for risk in risks
    )
    custom_text = "\n\n".join(
        f"### {section.title}\n\n{section.content}"
        for section in custom_sections
    )
    return (
        f"# {name} — Technical Blueprint\n\n"
        f"> {summary}\n\n"
        f"## Documentation request\n\n{prompt}\n\n"
        f"## Requirements\n\n{requirements or 'No requirements have been recorded.'}\n\n"
        f"## Recommended technology\n\n{stack}\n\n"
        f"## Architecture\n\n{architecture_text}\n\n"
        f"## Data design\n\n{database_text}\n\n"
        f"## API design\n\n{api_text}\n\n"
        f"## Development roadmap\n\n{roadmap_text}\n\n"
        f"## Risk register\n\n{risk_text}\n\n"
        f"## Prompt-tailored content\n\n{custom_text}\n\n"
        f"## Project structure\n\n```text\n{folder_structure}\n```\n\n"
        "## Deployment and validation\n\n"
        "- Externalize secrets and environment-specific settings; do not commit credentials.\n"
        "- Run backend unit and integration tests, frontend type-check/build, and authorization tests before release.\n"
        "- Deploy with health checks, persistent MongoDB storage, backups, and a documented rollback plan.\n"
    )
