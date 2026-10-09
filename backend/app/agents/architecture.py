from app.schemas.architecture import (
    ArchitectureComponent,
    ArchitectureConnection,
    SoftwareArchitecture,
)
from app.schemas.technology_recommendation import TechnologyRecommendation


def design_architecture(
    requirements: str,
    project_name: str,
    technology_recommendation: TechnologyRecommendation,
) -> SoftwareArchitecture:
    text = requirements.casefold()
    if any(term in text for term in ("repository", "repositories", "agent run", "agent runs", "proposed change", "proposed changes", "coding task", "coding tasks", "workspace membership", "workspace memberships")):
        return _design_software_engineering_architecture(requirements, project_name, technology_recommendation)
    technology_by_category = {
        item.category.casefold(): item.recommendation
        for item in technology_recommendation.recommendations
    }

    def technology(category: str, fallback: str) -> str:
        return technology_by_category.get(category.casefold(), fallback)

    components = [
        ArchitectureComponent(
            id="web-app",
            name="Web application",
            component_type="Frontend",
            description="Responsive interfaces for customers, restaurant owners, delivery drivers, and administrators.",
            technologies=[technology("Frontend", "React and TypeScript")],
        ),
        ArchitectureComponent(
            id="api",
            name="REST API",
            component_type="Application entry point",
            description="Authenticates requests, validates payloads, applies authorization, and routes requests to domain modules.",
            technologies=[technology("Backend API", "FastAPI and Pydantic")],
        ),
        ArchitectureComponent(
            id="identity",
            name="Identity and access",
            component_type="Domain module",
            description="Registration, login, JWT verification, role checks, and resource ownership enforcement.",
            technologies=[technology("Authentication and authorization", "JWT and role-based access control")],
        ),
        ArchitectureComponent(
            id="catalog",
            name="Restaurant and menu catalog",
            component_type="Domain module",
            description="Restaurant profiles, searchable menus, item availability, and pricing.",
            technologies=["FastAPI module"],
        ),
        ArchitectureComponent(
            id="orders",
            name="Cart and order management",
            component_type="Domain module",
            description="Cart validation, order lifecycle, restaurant order handling, and order status.",
            technologies=["FastAPI module"],
        ),
        ArchitectureComponent(
            id="database",
            name="Primary document database",
            component_type="Persistence",
            description="Stores users, restaurants, menus, orders, payment references, delivery assignments, and audit records.",
            technologies=[technology("Primary database", "MongoDB Atlas")],
        ),
    ]
    connections = [
        ArchitectureConnection(source="web-app", target="api", label="HTTPS REST / JSON"),
        ArchitectureConnection(source="api", target="identity", label="authenticate and authorize"),
        ArchitectureConnection(source="api", target="catalog", label="catalog requests"),
        ArchitectureConnection(source="api", target="orders", label="cart and order requests"),
        ArchitectureConnection(source="identity", target="database", label="users and roles"),
        ArchitectureConnection(source="catalog", target="database", label="restaurants and menus"),
        ArchitectureConnection(source="orders", target="database", label="orders and status"),
    ]

    if any(term in text for term in ("payment", "checkout", "billing", "invoice")):
        components.extend(
            [
                ArchitectureComponent(
                    id="payments",
                    name="Payment adapter",
                    component_type="Domain module",
                    description="Creates provider checkout sessions, verifies signed webhooks, and stores payment references without card data.",
                    technologies=[technology("Payments", "Hosted payment provider adapter")],
                ),
                ArchitectureComponent(
                    id="payment-provider",
                    name="External payment provider",
                    component_type="External system",
                    description="Hosted checkout and payment processing; provider selection remains a project decision.",
                    technologies=technology_by_category.get("payments", "Provider to be selected").split(";"),
                ),
            ]
        )
        connections.extend(
            [
                ArchitectureConnection(source="api", target="payments", label="payment requests"),
                ArchitectureConnection(source="payments", target="database", label="payment references"),
                ArchitectureConnection(source="payments", target="payment-provider", label="hosted checkout and signed webhooks"),
            ]
        )

    if any(term in text for term in ("delivery", "driver", "track", "tracking")):
        components.append(
            ArchitectureComponent(
                id="delivery",
                name="Delivery and tracking",
                component_type="Domain module",
                description="Assigns deliveries to drivers and records delivery status updates for customer tracking.",
                technologies=["FastAPI module"],
            )
        )
        connections.extend(
            [
                ArchitectureConnection(source="api", target="delivery", label="assignments and status updates"),
                ArchitectureConnection(source="delivery", target="database", label="assignments and tracking state"),
            ]
        )

    if any(term in text for term in ("notification", "email", "sms", "alert")):
        components.extend(
            [
                ArchitectureComponent(
                    id="notifications",
                    name="Notification worker",
                    component_type="Background processing",
                    description="Sends order and account notifications asynchronously with retryable, idempotent delivery.",
                    technologies=[technology("Notifications", "Provider adapter and durable job queue")],
                ),
                ArchitectureComponent(
                    id="messaging-provider",
                    name="Email or SMS provider",
                    component_type="External system",
                    description="Delivers messages through a replaceable provider integration.",
                    technologies=["Provider to be selected"],
                ),
            ]
        )
        connections.extend(
            [
                ArchitectureConnection(source="orders", target="notifications", label="enqueue order events"),
                ArchitectureConnection(source="notifications", target="database", label="jobs and delivery status"),
                ArchitectureConnection(source="notifications", target="messaging-provider", label="send messages"),
            ]
        )

    decisions = [
        "Use a modular monolith: domain modules share one API deployment and are separated by clear service boundaries.",
        "Keep MongoDB as the primary datastore and persist provider references rather than sensitive card data.",
        "Enforce role-based access and resource ownership in the API; the frontend is not an authorization boundary.",
        "Use HTTPS for client traffic and verify signatures on external payment webhooks.",
        "Move slow or retryable notifications to background processing; begin with a durable job collection and add a dedicated broker when measured load justifies it.",
    ]
    diagram_lines = [
        "flowchart LR",
        '  client["Responsive web application"] -->|"HTTPS REST / JSON"| api["FastAPI REST API"]',
        '  api --> identity["Identity and access"]',
        '  api --> catalog["Restaurant and menu catalog"]',
        '  api --> orders["Cart and order management"]',
        '  identity --> db[("MongoDB Atlas")]',
        '  catalog --> db',
        '  orders --> db',
    ]
    if any(component.id == "payments" for component in components):
        diagram_lines.extend(
            [
                '  api --> payments["Payment adapter"]',
                '  payments --> db',
                '  payments <-->|"Checkout / signed webhook"| gateway["External payment provider"]',
            ]
        )
    if any(component.id == "delivery" for component in components):
        diagram_lines.extend(
            [
                '  api --> delivery["Delivery and tracking"]',
                '  delivery --> db',
            ]
        )
    if any(component.id == "notifications" for component in components):
        diagram_lines.extend(
            [
                '  orders -->|"Order events"| worker["Notification worker"]',
                '  worker --> db',
                '  worker --> messaging["Email or SMS provider"]',
            ]
        )

    return SoftwareArchitecture(
        project_summary=f"Proposed system architecture for {project_name}, grounded in the project requirements and saved technology recommendations.",
        architectural_style="Modular monolith with a responsive web client, authenticated REST API, domain modules, MongoDB persistence, and replaceable external-service adapters.",
        components=components,
        connections=connections,
        design_decisions=decisions,
        mermaid_diagram="\n".join(diagram_lines),
    )


def _design_software_engineering_architecture(
    requirements: str,
    project_name: str,
    technology_recommendation: TechnologyRecommendation,
) -> SoftwareArchitecture:
    technology_by_category = {
        item.category.casefold(): item.recommendation
        for item in technology_recommendation.recommendations
    }

    def technology(category: str, fallback: str) -> list[str]:
        return [technology_by_category.get(category.casefold(), fallback)]

    components = [
        ArchitectureComponent(
            id="web-app",
            name="Engineering workspace",
            component_type="Frontend",
            description="Responsive workspace for projects, coding tasks, agent runs, and change reviews.",
            technologies=technology("Frontend", "React and TypeScript"),
        ),
        ArchitectureComponent(
            id="api",
            name="REST API",
            component_type="Application entry point",
            description="Validates requests, enforces workspace membership and role permissions, and routes domain operations.",
            technologies=technology("Backend API", "FastAPI and Pydantic"),
        ),
        ArchitectureComponent(
            id="identity",
            name="Identity and workspace access",
            component_type="Domain module",
            description="Authentication, workspace memberships, role checks, and project-level authorization.",
            technologies=technology("Authentication and authorization", "JWT and role-based access control"),
        ),
        ArchitectureComponent(
            id="project-management",
            name="Workspace and project management",
            component_type="Domain module",
            description="Workspace membership, project instructions, settings, and task assignments.",
            technologies=["FastAPI module"],
        ),
        ArchitectureComponent(
            id="task-management",
            name="Coding task lifecycle",
            component_type="Domain module",
            description="Task validation, priority, assignment, status transitions, and implementation planning.",
            technologies=["FastAPI module"],
        ),
        ArchitectureComponent(
            id="repository",
            name="Repository integration",
            component_type="Integration",
            description="Connects Git repositories using credentials held in an external secret manager.",
            technologies=["Git provider adapter"],
        ),
        ArchitectureComponent(
            id="agent-orchestrator",
            name="AI engineering orchestrator",
            component_type="Agent workflow",
            description="Runs specialized analysis and implementation steps, validates outputs, and records failures explicitly.",
            technologies=technology("AI provider", "Provider abstraction with Demo Mode and optional Gemini"),
        ),
        ArchitectureComponent(
            id="change-review",
            name="Code proposal and review",
            component_type="Domain module",
            description="Stores proposed diffs, review comments, and approval decisions; changes are not applied before authorized approval.",
            technologies=["FastAPI module"],
        ),
        ArchitectureComponent(
            id="database",
            name="Primary document database",
            component_type="Persistence",
            description="Persists workspaces, tasks, repository references, agent runs, proposals, reviews, and notifications.",
            technologies=technology("Primary database", "MongoDB Atlas"),
        ),
    ]
    connections = [
        ArchitectureConnection(source="web-app", target="api", label="HTTPS REST / JSON"),
        ArchitectureConnection(source="api", target="identity", label="authenticate and authorize"),
        ArchitectureConnection(source="api", target="project-management", label="workspace and project operations"),
        ArchitectureConnection(source="api", target="task-management", label="task lifecycle"),
        ArchitectureConnection(source="api", target="agent-orchestrator", label="start validated agent run"),
        ArchitectureConnection(source="task-management", target="agent-orchestrator", label="approved task input"),
        ArchitectureConnection(source="agent-orchestrator", target="repository", label="read repository context"),
        ArchitectureConnection(source="agent-orchestrator", target="change-review", label="create reviewable proposal"),
        ArchitectureConnection(source="change-review", target="repository", label="apply diff only after approval"),
        ArchitectureConnection(source="identity", target="database", label="users and memberships"),
        ArchitectureConnection(source="project-management", target="database", label="workspaces and projects"),
        ArchitectureConnection(source="task-management", target="database", label="tasks and assignments"),
        ArchitectureConnection(source="agent-orchestrator", target="database", label="runs and validated results"),
        ArchitectureConnection(source="change-review", target="database", label="proposals and review history"),
    ]
    if any(term in requirements.casefold() for term in ("notification", "in-app notification", "email", "sms")):
        components.append(
            ArchitectureComponent(
                id="notifications",
                name="Notification service",
                component_type="Background processing",
                description="Delivers run-completion and review-decision notifications and tracks read state.",
                technologies=["In-app notification module"],
            )
        )
        connections.extend(
            [
                ArchitectureConnection(source="agent-orchestrator", target="notifications", label="run completion events"),
                ArchitectureConnection(source="change-review", target="notifications", label="review decision events"),
                ArchitectureConnection(source="notifications", target="database", label="recipient and read state"),
            ]
        )

    diagram_lines = [
        "flowchart LR",
        '  client["Engineering workspace"] -->|"HTTPS REST / JSON"| api["REST API"]',
        '  api --> identity["Identity and workspace access"]',
        '  api --> projects["Workspace and project management"]',
        '  api --> tasks["Coding task lifecycle"]',
        '  api --> agent["AI engineering orchestrator"]',
        '  agent -->|"Read repository context"| repo["Git provider adapter"]',
        '  agent -->|"Reviewable diff"| review["Code proposal and review"]',
        '  review -->|"Approved changes only"| repo',
        '  identity --> db[("MongoDB")]',
        '  projects --> db',
        '  tasks --> db',
        '  agent -->|"Runs and validated output"| db',
        '  review -->|"Proposals and decisions"| db',
    ]
    if any(component.id == "notifications" for component in components):
        diagram_lines.extend(
            [
                '  agent -->|"Run completed"| notifications["Notifications"]',
                '  review -->|"Decision recorded"| notifications',
                '  notifications --> db',
            ]
        )

    return SoftwareArchitecture(
        project_summary=f"Proposed AI engineering architecture for {project_name}, grounded in the stated software-development workflows.",
        architectural_style="Modular monolith with an authenticated engineering workspace, validated agent workflow, Git provider adapter, approval-gated code proposals, and MongoDB persistence.",
        components=components,
        connections=connections,
        design_decisions=[
            "Enforce workspace membership, project ownership, and role permissions at the API boundary.",
            "Keep agent runs and proposed changes auditable; a failed output validation must not produce a successful run.",
            "Never apply generated changes to a repository before an authorized user approves them.",
            "Keep repository credentials in a managed secret store and expose only secret references to application services.",
            "Use MongoDB as the primary datastore and index workspace, project, task status, and event chronology.",
        ],
        mermaid_diagram="\n".join(diagram_lines),
    )
