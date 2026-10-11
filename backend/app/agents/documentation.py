import re
from typing import Optional

from app.schemas.api_design import RestApiDesign
from app.schemas.architecture import SoftwareArchitecture
from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.diagrams import UmlDiagramSet
from app.schemas.documentation import (
    DocumentationSection,
    ProjectRisk,
    RoadmapPhase,
    TechnicalDocumentation,
)
from app.schemas.technology_recommendation import TechnologyRecommendation


def render_database_schema(database_design: Optional[MongoDatabaseDesign]) -> str:
    if not database_design:
        return "MongoDB database design has not yet been generated."

    sections = [
        f"**Database:** `{database_design.database_name}` (MongoDB document collections).",
        (
            "Required fields are enforced through application validation. MongoDB does not "
            "enforce relational foreign keys; references must be validated by application logic."
        ),
    ]
    for collection in database_design.collections:
        foreign_keys = {
            foreign_key.field: (
                f"{foreign_key.references_collection}.{foreign_key.references_field}"
            )
            for foreign_key in collection.foreign_keys
        }
        rows = [
            "| Field | BSON type | Required | Description |",
            "|---|---|:---:|---|",
        ]
        for field in collection.fields:
            references = [
                f"Reference: `{target}` via `{path}`."
                for path, target in foreign_keys.items()
                if path == field.name or path.startswith(f"{field.name}.")
            ]
            description_parts = [field.description]
            if field.name == collection.primary_key and "primary key" not in field.description.casefold():
                description_parts.append("Primary key.")
            description_parts.extend(_unique_index_descriptions(collection.indexes, field.name))
            description_parts.extend(references)
            if field.default_expression:
                description_parts.append(f"Default: `{field.default_expression}`.")
            rows.append(
                "| "
                + " | ".join(
                    _escape_markdown_table_cell(value)
                    for value in (
                        f"`{field.name}`",
                        f"`{field.bson_type}`",
                        "Yes" if field.required else "No",
                        " ".join(description_parts),
                    )
                )
                + " |"
            )
        indexes = "; ".join(collection.indexes) or "None specified."
        sections.extend(
            [
                f"### `{collection.name}` collection",
                collection.purpose,
                *rows,
                f"**Indexes:** {indexes}",
                f"**Embedding strategy:** {collection.embedding_strategy}",
            ]
        )
    return "\n\n".join(sections)


def replace_documentation_section(markdown: str, heading: str, content: str) -> str:
    lines = markdown.splitlines()
    target = heading.casefold()
    replacement = [f"## {heading}", "", *content.splitlines(), ""]
    output = []
    inserted = False
    index = 0
    while index < len(lines):
        match = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", lines[index])
        if match and match.group(2).strip().casefold() == target:
            if not inserted:
                output.extend(replacement)
                inserted = True
            index += 1
            while index < len(lines):
                next_heading = re.match(r"^(#{1,6})\s+", lines[index])
                if next_heading and len(next_heading.group(1)) <= 2:
                    break
                index += 1
            continue
        output.append(lines[index])
        index += 1

    if not inserted:
        references_index = next(
            (
                index
                for index, line in enumerate(output)
                if re.match(r"^#{1,2}\s+References\s*#*\s*$", line, re.IGNORECASE)
            ),
            len(output),
        )
        output[references_index:references_index] = ["", *replacement]
    return "\n".join(output).strip() + "\n"


def _unique_index_descriptions(indexes: list[str], field_name: str) -> list[str]:
    descriptions = []
    for index in indexes:
        match = re.match(r"^\s*unique\s*:\s*(.+)$", index, re.IGNORECASE)
        if not match:
            continue
        indexed_fields = [
            re.sub(r"\s+(?:ASC|DESC)\s*$", "", item, flags=re.IGNORECASE).strip().split()[-1]
            for item in match.group(1).split(",")
        ]
        if field_name in indexed_fields:
            descriptions.append(
                "Unique index."
                if len(indexed_fields) == 1
                else "Member of unique compound index on "
                + ", ".join(f"`{name}`" for name in indexed_fields)
                + "."
            )
    return descriptions


def _escape_markdown_table_cell(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")


def generate_technical_documentation(
    project: dict,
    technology: Optional[TechnologyRecommendation] = None,
    architecture: Optional[SoftwareArchitecture] = None,
    database_design: Optional[MongoDatabaseDesign] = None,
    api_design: Optional[RestApiDesign] = None,
    prompt: str = (
        "Create a comprehensive MCA final-year software project report based on the "
        "project requirements and available saved artifacts."
    ),
    requirement_analysis: Optional[dict] = None,
    diagrams: Optional[UmlDiagramSet] = None,
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
    if requirement_analysis:
        sources.append("requirement analysis")
    if diagrams:
        sources.append("UML diagrams")

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
        database_design,
        endpoints,
        roadmap,
        risks,
        folder_structure,
        prompt,
        custom_sections,
        requirement_analysis,
        diagrams,
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
    database_design,
    endpoints,
    roadmap,
    risks,
    folder_structure,
    prompt,
    custom_sections,
    requirement_analysis,
    diagrams,
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
    database_summary = "\n".join(
        f"- **{collection.name}:** {collection.purpose}"
        for collection in collections
    ) or "MongoDB collection design has not yet been generated."
    database_text = render_database_schema(database_design)
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
    functional_requirements = (
        "\n".join(f"- {item}" for item in requirement_analysis["functional_requirements"])
        if requirement_analysis
        else "- Derive and approve detailed functional requirements from the supplied requirements."
    )
    non_functional_requirements = (
        "\n".join(f"- {item}" for item in requirement_analysis["non_functional_requirements"])
        if requirement_analysis
        else "- Define measurable performance, security, usability, reliability, and scalability targets with stakeholders."
    )
    user_roles = (
        ", ".join(requirement_analysis["user_roles"])
        if requirement_analysis
        else "User roles should be confirmed during requirements refinement."
    )
    modules = (
        ", ".join(requirement_analysis["modules"])
        if requirement_analysis
        else ", ".join(item.name for item in architecture.components)
        if architecture
        else "Modules are not yet specified."
    )
    diagram_summary = (
        "\n".join(f"- **{item.title}:** {item.description}" for item in diagrams.diagrams)
        if diagrams
        else "UML diagrams have not yet been generated."
    )
    endpoint_details = "\n".join(
        f"- `{endpoint.method} {endpoint.path}`: {endpoint.summary}. "
        f"Access: {'authenticated' if endpoint.auth_required else 'public'}; "
        f"roles: {', '.join(endpoint.roles) or 'not restricted'}."
        for endpoint in endpoints
    ) or "Generate the REST API contract to document concrete endpoint details."
    chapters = (
        "1. [Introduction](#1-introduction)\n"
        "2. [Literature Review](#2-literature-review)\n"
        "3. [System Analysis](#3-system-analysis)\n"
        "4. [Design](#4-design)\n"
        "5. [Implementation](#5-implementation)\n"
        "6. [Testing](#6-testing)\n"
        "7. [Results and Discussion](#7-results-and-discussion)\n"
        "8. [Conclusion and Future Scope](#8-conclusion-and-future-scope)\n"
        "9. [References](#references)"
    )
    return (
        f"# {name}\n\n"
        "## Project Report\n\n"
        f"**Project title:** {name}  \n"
        "**Submitted by:** [Student name and roll number]  \n"
        "**Under the guidance of:** [Guide name and designation]  \n"
        "**Institution:** [Institution and department]  \n"
        "**Academic year:** [Academic year]\n\n"
        "## Abstract\n\n"
        f"{summary} This report translates the supplied requirements into a software blueprint "
        "covering system scope, requirements, architecture, data and API design, implementation "
        "approach, validation, risks, and future work. Technical statements are based on the "
        "requirements and saved artifacts listed below; unavailable evidence is identified "
        "rather than assumed.\n\n"
        "## Acknowledgement\n\n"
        "Add acknowledgements after confirming the people and contributions to recognize; "
        "names were not supplied for this report.\n\n"
        "## Declaration\n\n"
        "Author-completion template: replace this section with the institution-approved "
        "declaration and verify it before signing. This generated report does not certify "
        "authorship or originality.\n\n"
        f"## Table of Contents\n\n{chapters}\n\n"
        "## 1. Introduction\n\n"
        "### Background and problem statement\n\n"
        f"{requirements or 'Project requirements have not been recorded.'}\n\n"
        "### Objectives\n\n"
        f"Define and deliver a reliable solution for {name} that supports the requested user "
        "workflows and can be validated against explicit acceptance criteria. Convert broad "
        "goals into observable outcomes: identify the user, the action they need to perform, "
        "the information required, and the result that confirms success. Prioritize workflows "
        "that directly address the stated problem; treat optional integrations and quality "
        "improvements as separate decisions until stakeholders approve them.\n\n"
        "### Scope and limitations\n\n"
        "The scope is limited to the capabilities stated in the requirements and available "
        "artifacts. Unspecified integrations, operating targets, and deployment choices require "
        "stakeholder confirmation. The project boundary should identify what the system owns, "
        "what remains the responsibility of external services or users, and which assumptions "
        "need confirmation. Record exclusions explicitly so they are not mistaken for delivered "
        "features. Non-functional targets should be measurable before implementation; avoid "
        "promising availability, throughput, or compliance levels that have not been agreed.\n\n"
        "### Organization of the report\n\n"
        "The report moves from project context and related work through requirements, design, "
        "implementation, testing, results, and future scope.\n\n"
        "## 2. Literature Review\n\n"
        "### Existing approaches and comparison\n\n"
        "Compare this project with established approaches in its domain using verifiable "
        "sources selected for the final submission. No external literature or benchmark evidence "
        "was supplied, so no unsupported claims or citations are asserted here. A useful review "
        "compares alternatives on the same criteria: supported user tasks, accessibility, "
        "security and privacy controls, integration effort, deployment needs, maintainability, "
        "and cost. Distinguish documented product capabilities from evaluation or opinion. "
        "For every external source, record its title, publisher, date where available, and a "
        "working URL; cite it near the claim it supports. Do not treat a feature list as proof "
        "of quality or claim that the proposed design is superior without comparable evidence.\n\n"
        "### Identified gaps\n\n"
        "Use the requirements to identify workflow, data, security, and integration gaps in the "
        "approaches selected for comparison. Validate this analysis against cited sources. "
        "Explain how each gap affects a named user or business outcome and show which stated "
        "requirement addresses it. Where the available evidence is incomplete, describe the "
        "comparison as a question for further study rather than a conclusion.\n\n"
        "## 3. System Analysis\n\n"
        "### Requirements specification\n\n"
        f"**User roles:** {user_roles}\n\n"
        f"**Modules:** {modules}\n\n"
        f"**Functional requirements**\n\n{functional_requirements}\n\n"
        f"**Non-functional requirements**\n\n{non_functional_requirements}\n\n"
        "Separate externally visible system behavior from quality constraints. Requirements "
        "should be testable, unambiguous, and traceable to a user need. Confirm business rules, "
        "validation boundaries, exception paths, data-retention expectations, accessibility "
        "needs, and authorization decisions with stakeholders when they are not specified. "
        "Assumptions and missing information must remain visible rather than being silently "
        "converted into requirements.\n\n"
        "### Feasibility study\n\n"
        "Confirm technical, economic, and operational feasibility against the deployment "
        "environment, team skills, hosting costs, and intended users. Project-specific estimates "
        "were not supplied and are not invented. **Technical feasibility** considers whether "
        "the chosen technologies, data model, integrations, skills, and target environment can "
        "support the required workflows. **Economic feasibility** compares implementation, "
        "hosting, storage, support, and external service costs with available resources; mark "
        "any unpriced item for estimation. **Operational feasibility** checks whether intended "
        "users can adopt the workflows, administrators can operate the service, and support "
        "staff can diagnose routine failures. **Schedule feasibility** should be confirmed "
        "against team capacity, dependencies, and institutional milestones. These are evaluation "
        "criteria, not completed feasibility approvals.\n\n"
        f"### Tools and technology\n\n{stack}\n\n"
        f"## Documentation request\n\n{prompt}\n\n"
        f"## Requirements\n\n{requirements or 'No requirements have been recorded.'}\n\n"
        "## 4. Design\n\n"
        f"### System architecture\n\n{architecture_text}\n\n"
        "Describe component responsibilities and the direction of their interactions. Keep "
        "business rules in appropriate application modules, isolate external integrations "
        "behind explicit interfaces, and make security boundaries visible. Explain important "
        "decisions and alternatives, including the reason for the selected architectural style. "
        "A diagram is a communication aid; it should agree with the component descriptions and "
        "the interfaces documented below.\n\n"
        f"## Architecture\n\n{architecture_text}\n\n"
        f"### UML and system diagrams\n\n{diagram_summary}\n\n"
        f"### Database design\n\n{database_summary}\n\n"
        "For each collection, document its purpose, primary identifier, important fields, "
        "validation rules, indexes, and expected access patterns. Explain embedded documents "
        "versus references and show how references are validated by application logic. Treat "
        "sample or synthetic records as examples only; do not include real personal data.\n\n"
        f"### API design\n\n{api_text}\n\n"
        "For each API operation, document its caller, authorization rule, input constraints, "
        "success response, and relevant failure responses. Keep the OpenAPI contract aligned "
        "with the database design and user roles. Do not include credentials or sensitive "
        "values in example payloads.\n\n"
        f"## Data design\n\n{database_text}\n\n"
        f"## API design\n\n{api_text}\n\n"
        "## 5. Implementation\n\n"
        f"### Modules and components\n\n{architecture_text}\n\n"
        f"### Key workflows and interfaces\n\n{endpoint_details}\n\n"
        "### Implementation status\n\n"
        "This document describes supplied design artifacts. A generated blueprint alone does "
        "not prove that the proposed software has been implemented or deployed. Organize "
        "implementation around small, reviewable modules with explicit service and persistence "
        "boundaries. Keep configuration outside source code, validate data at API boundaries, "
        "and record decisions that affect compatibility. The roadmap below is a proposed "
        "sequence; update status and evidence only after work is completed.\n\n"
        "## 6. Testing\n\n"
        "### Testing methodology\n\n"
        "Plan unit, integration, authorization, and end-to-end tests for the critical "
        "requirements. No test execution results were supplied; the cases below are planned "
        "and are not claims of completed testing.\n\n"
        "### Planned test cases\n\n"
        "- Verify each functional requirement using valid and invalid inputs.\n"
        "- Verify authentication, roles, ownership, and denied-access paths.\n"
        "- Verify data constraints, references, and API/persistence error handling.\n"
        "- Verify primary user journeys in the intended deployment environment.\n\n"
        "For each case, record an identifier, preconditions, test data, action, expected result, "
        "actual result, execution date, and pass/fail status. Include boundary values, duplicate "
        "requests, unavailable dependencies, malformed input, and attempts to access another "
        "user's data where applicable. Keep test data synthetic and ensure test environments "
        "cannot accidentally send messages or charge real payment methods. Link failed tests "
        "to tracked defects and rerun affected regression cases after fixes. Performance and "
        "security testing require explicit measures and approved test conditions; do not infer "
        "those results from a successful build or unit-test run.\n\n"
        "### Bug fixes and validation results\n\n"
        "No issue log or test-run evidence was supplied. Record actual defects, fixes, test "
        "counts, and pass/fail outcomes here after execution.\n\n"
        "## 7. Results and Discussion\n\n"
        "### Project outcomes\n\n"
        "The available outcome is a reviewable software blueprint composed of the requirements "
        "and artifacts listed in this report. Measured runtime results, user-study findings, "
        "and production outcomes were not supplied. Evaluate the project against approved "
        "acceptance criteria: requirement coverage, successful completion of representative "
        "user workflows, correctness of stored data, enforcement of access rules, and quality "
        "attributes that can be measured in the intended environment. Report the test method, "
        "sample size, environment, observed result, and known limitation for each claim. A "
        "planned feature or generated design is not evidence that the feature is implemented.\n\n"
        "### Comparison and challenges\n\n"
        "Compare the implemented system with alternatives after collecting comparable evidence. "
        "Record actual integration, usability, data-quality, and performance challenges as they "
        "are observed. Explain the approach taken to resolve each challenge and whether the "
        "resolution was retested. If no implementation evidence is available, state what "
        "evaluation remains to be performed instead of assigning scores or claiming improvement.\n\n"
        f"## 8. Conclusion and Future Scope\n\n"
        f"The blueprint for {name} organizes the supplied requirements into a traceable design "
        "and delivery plan. Confirm open assumptions, complete planned tests, and validate the "
        "design with stakeholders before release. Prioritize future work from unmet requirements, "
        "measured results, and operational feedback.\n\n"
        "### Limitations and future enhancements\n\n"
        "Deployment evidence, test results, external literature, and stakeholder feedback were "
        "not supplied. Add verified information before final submission.\n\n"
        f"## Development roadmap\n\n{roadmap_text}\n\n"
        f"## Risk register\n\n{risk_text}\n\n"
        f"## Prompt-tailored content\n\n{custom_text}\n\n"
        f"## Project structure\n\n```text\n{folder_structure}\n```\n\n"
        "## Deployment and validation\n\n"
        "- Externalize secrets and environment-specific settings; do not commit credentials.\n"
        "- Run backend unit and integration tests, frontend type-check/build, and authorization tests before release.\n"
        "- Deploy with health checks, persistent MongoDB storage, backups, and a documented rollback plan.\n\n"
        "## References\n\n"
        "No external references were supplied. Add and verify authoritative sources for the "
        "selected technologies, methods, and related work before academic submission.\n"
    )
