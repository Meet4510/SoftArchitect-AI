import re

from app.schemas.api_design import RestApiDesign
from app.schemas.architecture import SoftwareArchitecture
from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.diagrams import DiagramArtifact, UmlDiagramSet
from app.agents.database_design import build_entity_relationship_diagram


ROLE_PATTERNS = [
    (re.compile(r"\badmins?\b|\badministrators?\b", re.I), "Administrator"),
    (re.compile(r"\bteam leads?\b|\breviewers?\b", re.I), "Team lead"),
    (re.compile(r"\bdevelopers?\b|\bengineers?\b|\bprogrammers?\b", re.I), "Developer"),
    (re.compile(r"\bworkspace owners?\b", re.I), "Workspace owner"),
    (re.compile(r"\bcustomers?\b|\bbuyers?\b|\bclients?\b", re.I), "Customer"),
    (re.compile(r"\brestaurant owners?\b|\bowners?\b|\bsellers?\b|\bvendors?\b", re.I), "Business owner"),
    (re.compile(r"\bdelivery drivers?\b|\bdrivers?\b", re.I), "Delivery driver"),
]
USE_CASE_PATTERNS = [
    (re.compile(r"\b(register|sign up|log ?in|authenticate)\b", re.I), "Register and sign in"),
    (re.compile(r"\b(workspaces?|memberships?|invite members?)\b", re.I), "Manage workspaces and members"),
    (re.compile(r"\b(projects?|engineering instructions?)\b", re.I), "Manage software projects"),
    (re.compile(r"\b(coding tasks?|assign work|task status|tasks?)\b", re.I), "Create and manage coding tasks"),
    (re.compile(r"\b(repositories|git repository|connect.*git|git host)\b", re.I), "Connect a Git repository"),
    (re.compile(r"\b(agent runs?|run.*agent|AI assistant|AI software engineer)\b", re.I), "Run AI engineering workflow"),
    (re.compile(r"\b(proposed changes?|code diffs?|review comments?|approve|reject|code review)\b", re.I), "Review and approve proposed changes"),
    (re.compile(r"\b(notifications?|mark.*read)\b", re.I), "Review notifications"),
    (re.compile(r"\b(search|browse|discover|catalog|menu)\b", re.I), "Browse and search"),
    (re.compile(r"\b(cart|basket|order|booking|reservation)\b", re.I), "Manage and place orders"),
    (re.compile(r"\b(payments?|checkout|billing|invoice)\b", re.I), "Pay for an order"),
    (re.compile(r"\b(delivery|deliveries|track|tracking)\b", re.I), "Track a delivery"),
    (re.compile(r"\b(report|analytics|dashboard)\b", re.I), "Review reports"),
    (re.compile(r"\b(notification|email|sms|alert)\b", re.I), "Receive notifications"),
    (re.compile(r"\b(manage|update|create|restaurant|menu|product)\b", re.I), "Manage business catalog"),
]


def design_uml_diagrams(
    requirements: str,
    project_name: str,
    database_design: MongoDatabaseDesign,
    api_design: RestApiDesign,
    architecture: SoftwareArchitecture,
) -> UmlDiagramSet:
    """Generate role, workflow, and domain diagrams from validated project artifacts."""
    roles = [label for pattern, label in ROLE_PATTERNS if pattern.search(requirements)]
    if not roles:
        roles = ["User"]
    use_cases = [
        label for pattern, label in USE_CASE_PATTERNS if pattern.search(requirements)
    ]
    if not use_cases:
        use_cases = ["Complete the core workflow"]

    use_case_lines = ["flowchart LR"]
    role_ids = []
    for index, role in enumerate(roles, start=1):
        role_id = f"Actor{index}"
        role_ids.append(role_id)
        use_case_lines.append(f'    {role_id}["{role}"]')
    use_case_lines.append(f'    subgraph System["{_safe_label(project_name)}"]')
    for index, use_case in enumerate(use_cases, start=1):
        use_case_lines.append(f'        UseCase{index}(({use_case}))')
    use_case_lines.append("    end")
    for role_id in role_ids:
        for index in range(1, len(use_cases) + 1):
            use_case_lines.append(f"    {role_id} --> UseCase{index}")

    operations = sorted(
        [
            endpoint
            for endpoint in api_design.endpoints
            if endpoint.method in {"POST", "PATCH", "PUT"}
            and "webhook" not in endpoint.path
        ],
        key=_operation_priority,
    )[:4]
    sequence_lines = [
        "sequenceDiagram",
        "    actor User",
        "    participant Web as Web application",
        "    participant API as REST API",
        "    participant DB as MongoDB",
    ]
    for index, endpoint in enumerate(operations, start=1):
        action = _safe_label(endpoint.summary)
        sequence_lines.extend(
            [
                f"    User->>Web: {action}",
                f"    Web->>API: {endpoint.method} {_safe_label(endpoint.path)}",
                f"    API->>DB: Validate and persist operation {index}",
                f"    DB-->>API: Return operation result {index}",
                "    API-->>Web: Return response",
            ]
        )
    if not operations:
        sequence_lines.extend(
            [
                "    User->>Web: Submit a project workflow",
                "    Web->>API: Send a validated request",
                "    API->>DB: Read or persist project data",
                "    DB-->>API: Return operation result",
                "    API-->>Web: Return response",
            ]
        )

    class_lines = ["classDiagram"]
    for collection in database_design.collections:
        class_name = _safe_identifier(collection.name)
        class_lines.append(f"    class {class_name} {{")
        for field in collection.fields:
            field_name = _safe_identifier(field.name.replace(".", "_"))
            field_type = _safe_identifier(field.bson_type.replace(" ", ""))
            class_lines.append(f"        +{field_type} {field_name}")
        class_lines.append("    }")
    for collection in database_design.collections:
        source = _safe_identifier(collection.name)
        for foreign_key in collection.foreign_keys:
            target = _safe_identifier(foreign_key.references_collection)
            class_lines.append(
                f'    {target} "1" --> "0..*" {source} : {_safe_label(foreign_key.field)}'
            )

    module_groups = {}
    for component in architecture.components:
        module_groups.setdefault(component.component_type, []).append(component)
    hierarchy_lines = ["flowchart TB", f'    Project["{_safe_label(project_name)}"]']
    for group_index, (group_name, components) in enumerate(module_groups.items(), start=1):
        group_id = f"Group{group_index}"
        hierarchy_lines.append(f'    {group_id}["{_safe_label(group_name)}"]')
        hierarchy_lines.append(f"    Project --> {group_id}")
        for component_index, component in enumerate(components, start=1):
            component_id = f"Module{group_index}_{component_index}"
            hierarchy_lines.append(f'    {component_id}["{_safe_label(component.name)}"]')
            hierarchy_lines.append(f"    {group_id} --> {component_id}")

    return UmlDiagramSet(
        project_summary=(
            f"UML and workflow diagrams for {_safe_label(project_name)}, "
            "derived from the stated requirements, saved API contract, and MongoDB design."
        ),
        diagrams=[
            DiagramArtifact(
                diagram_type="use_case",
                title="Use-case diagram",
                description="Project actors and the capabilities identified in the requirements.",
                mermaid_source="\n".join(use_case_lines),
            ),
            DiagramArtifact(
                diagram_type="sequence",
                title="Request sequence diagram",
                description="Representative API operations flowing through the web application to MongoDB.",
                mermaid_source="\n".join(sequence_lines),
            ),
            DiagramArtifact(
                diagram_type="class",
                title="Domain class diagram",
                description="MongoDB collections, their declared fields, and logical references.",
                mermaid_source="\n".join(class_lines),
            ),
            DiagramArtifact(
                diagram_type="entity_relationship",
                title="Entity-Relationship diagram",
                description="Chen notation: entity rectangles, relationship diamonds, attribute ovals, and 1/N cardinalities.",
                mermaid_source=build_entity_relationship_diagram(
                    database_design.collections,
                    database_design.relationships,
                ),
            ),
            DiagramArtifact(
                diagram_type="module_hierarchy",
                title="Module hierarchy",
                description="Architecture components grouped by their responsibility and system layer.",
                mermaid_source="\n".join(hierarchy_lines),
            ),
        ],
        design_decisions=[
            "Use-case actors and capabilities are selected from requirement keywords; labels are fixed to keep Mermaid syntax safe.",
            "The sequence diagram uses saved API operations and shows the application boundary before database access.",
            "The class diagram represents MongoDB documents and logical references; MongoDB does not enforce these references.",
            "The Chen-style ER diagram uses rectangles for entities, diamonds for relationships, ovals for attributes, and 1/N cardinalities; PK and FK prefixes identify key attributes.",
            "The module hierarchy groups saved architecture components by responsibility.",
        ],
    )


def _safe_label(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9 .,_/-]", "", value).strip()[:80] or "Project"


def _safe_identifier(value: str) -> str:
    identifier = re.sub(r"[^A-Za-z0-9_]", "_", value)
    if not identifier or identifier[0].isdigit():
        identifier = f"Entity_{identifier}"
    return identifier


def _operation_priority(endpoint) -> int:
    if endpoint.path == "/api/v1/orders" and endpoint.method == "POST":
        return 0
    if endpoint.path.startswith("/api/v1/orders"):
        return 1
    if endpoint.path.startswith("/api/v1/payments"):
        return 2
    if endpoint.path.startswith("/api/v1/deliveries"):
        return 3
    if endpoint.path.startswith("/api/v1/auth"):
        return 5
    return 4
