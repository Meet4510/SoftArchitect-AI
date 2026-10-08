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
