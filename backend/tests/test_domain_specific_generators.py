from app.agents.api_design import design_rest_api
from app.agents.architecture import design_architecture
from app.agents.database_design import design_mongodb_schema
from app.agents.diagrams import design_uml_diagrams
from app.schemas.technology_recommendation import TechnologyRecommendation


REQUIREMENTS = (
    "Developers and team leads work in shared workspaces, invite members, and manage software projects. "
    "Developers create coding tasks and connect Git repositories. An AI agent analyzes tasks, records agent runs, "
    "and creates proposed code changes. Team leads review diffs, leave comments, and approve or reject changes "
    "before any changes are applied. Administrators manage users. Notify users when runs finish or a review is requested."
)


def test_ai_software_engineering_blueprint_uses_project_domain_artifacts():
    technology = TechnologyRecommendation(
        project_summary="AI engineering technology stack",
        recommendations=[
            {
                "category": category,
                "recommendation": category,
                "rationale": "Fits the project requirements.",
                "alternatives": [],
                "trade_offs": [],
            }
            for category in ("Frontend", "Backend API", "Primary database", "AI provider")
        ],
    )

    architecture = design_architecture(REQUIREMENTS, "AI Software Engineer", technology)
    design = design_mongodb_schema(REQUIREMENTS, "AI Software Engineer", architecture)
    api = design_rest_api(REQUIREMENTS, "AI Software Engineer", design)
    diagrams = design_uml_diagrams(REQUIREMENTS, "AI Software Engineer", design, api, architecture)

    collection_names = {collection.name for collection in design.collections}
    assert {
        "workspaces",
        "workspace_memberships",
        "projects",
        "tasks",
        "repository_connections",
        "agent_runs",
        "proposed_changes",
        "reviews",
        "review_comments",
        "notifications",
    } <= collection_names
    assert not {"restaurants", "menu_items", "orders", "payments", "deliveries"} & collection_names

    endpoints = {(endpoint.method, endpoint.path) for endpoint in api.endpoints}
    assert ("POST", "/api/v1/agent-runs") in endpoints
    assert ("POST", "/api/v1/proposed-changes") in endpoints
    assert ("POST", "/api/v1/reviews") in endpoints
    review_endpoint = next(
        endpoint for endpoint in api.endpoints
        if endpoint.method == "POST" and endpoint.path == "/api/v1/reviews"
    )
    assert review_endpoint.roles == ["TEAM_LEAD", "ADMIN"]
    assert "restaurants" not in api.openapi_spec["info"]["description"].casefold()

    component_names = {component.name for component in architecture.components}
    assert "AI engineering orchestrator" in component_names
    assert "Code proposal and review" in component_names
    assert "Restaurant and menu catalog" not in component_names
    assert "Approved changes only" in architecture.mermaid_diagram

    diagrams_by_type = {diagram.diagram_type: diagram for diagram in diagrams.diagrams}
    assert "Manage workspaces and members" in diagrams_by_type["use_case"].mermaid_source
    assert "Run AI engineering workflow" in diagrams_by_type["use_case"].mermaid_source
    assert "Review and approve proposed changes" in diagrams_by_type["use_case"].mermaid_source
    assert "agent_runs" in diagrams_by_type["class"].mermaid_source
    assert "restaurants" not in str(diagrams.diagrams).casefold()
