from app.schemas.technology_recommendation import TechnologyChoice, TechnologyRecommendation


def recommend_technology(requirements: str, project_name: str, domain: str = "") -> TechnologyRecommendation:
    text = f"{requirements} {domain}".casefold()
    recommendations = [
        TechnologyChoice(
            category="Frontend",
            recommendation="React, TypeScript, Vite, and Tailwind CSS",
            rationale="A component-based UI with strict typing supports responsive customer, operator, driver, and administrator workflows.",
            alternatives=["Vue 3 with TypeScript", "Angular"],
            trade_offs=["The team must maintain a separate frontend build and coordinate API contracts with the backend."],
        ),
        TechnologyChoice(
            category="Backend API",
            recommendation="Python 3.11+, FastAPI, and Pydantic",
            rationale="FastAPI provides typed REST endpoints, request validation, and generated OpenAPI documentation for a modular monolith.",
            alternatives=["Django REST Framework", "NestJS"],
            trade_offs=["Python typing and asynchronous database access need consistent conventions as the codebase grows."],
        ),
        TechnologyChoice(
            category="Primary database",
            recommendation="MongoDB Atlas with PyMongo Async or Motor",
            rationale="MongoDB is the required primary database and supports evolving project, order, menu, and blueprint documents.",
            alternatives=["Local MongoDB for development"],
            trade_offs=["Schema validation, indexes, and transaction boundaries must be designed explicitly; Atlas requires network and credential configuration."],
        ),
        TechnologyChoice(
            category="Authentication and authorization",
            recommendation="JWT access tokens, Argon2 password hashing, and role-based access control",
            rationale="Short-lived authenticated requests can enforce separate permissions for customers, restaurant owners, delivery drivers, and administrators.",
            alternatives=["Secure server-side sessions"],
            trade_offs=["JWT expiration, refresh, revocation, and secret rotation require deliberate handling."],
        ),
        TechnologyChoice(
            category="AI provider",
            recommendation="Deterministic Demo Mode by default, with an optional Gemini provider behind a provider interface",
            rationale="The product remains demonstrable without external credentials while allowing an online model to be added without changing workflow contracts.",
            alternatives=["Other providers implementing the same interface"],
            trade_offs=["Demo recommendations are rule-based; online provider calls add latency, cost, and output-validation requirements."],
        ),
        TechnologyChoice(
            category="Deployment",
            recommendation="Docker and Docker Compose for the modular monolith",
            rationale="Containerized frontend and API services provide a repeatable local demo and a straightforward path to hosted deployment.",
            alternatives=["Managed container platform"],
            trade_offs=["Production deployment still needs managed secrets, monitoring, backups, and a TLS-terminating ingress."],
        ),
    ]

    if any(term in text for term in ("payment", "checkout", "billing", "invoice")):
        recommendations.append(
            TechnologyChoice(
                category="Payments",
                recommendation="Integrate a hosted payment provider through a backend payment adapter; keep card data out of the application",
                rationale="A provider-hosted checkout reduces direct handling of sensitive payment data and isolates provider-specific APIs.",
                alternatives=["Stripe Checkout", "Razorpay Checkout"],
                trade_offs=["Provider selection, regional availability, fees, webhook verification, and refund workflows must be confirmed."],
            )
        )

    if any(term in text for term in ("notification", "email", "sms", "alert")):
        recommendations.append(
            TechnologyChoice(
                category="Notifications",
                recommendation="Use a provider adapter with a durable notification queue and retryable delivery jobs",
                rationale="Order and account notifications should remain decoupled from request processing and tolerate temporary provider outages.",
                alternatives=["Email-only provider integration for the initial release"],
                trade_offs=["A queue and delivery-status tracking add operational components and require idempotent retry handling."],
            )
        )

    return TechnologyRecommendation(
        project_summary=f"Recommended implementation stack for {project_name}, selected for the stated workflows and the MongoDB-based modular monolith.",
        recommendations=recommendations,
    )
