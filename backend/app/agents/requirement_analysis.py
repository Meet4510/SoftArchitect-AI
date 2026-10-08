import re

from app.schemas.requirement_analysis import RequirementAnalysis

FEATURES = {
    "authentication": (r"\bregister\b", r"\blog\s?in\b", r"\bsign in\b", r"\bauthentication\b", r"\bpassword\b"),
    "user profile management": (r"\bprofile\b", r"\baccount settings\b", r"\buser details\b"),
    "search and discovery": (r"\bsearch\b", r"\bfilter\b", r"\bbrowse\b", r"\bdiscover\b"),
    "payments and billing": (r"\bpayment(?:s)?\b", r"\bcheckout\b", r"\bbilling\b", r"\binvoice\b", r"\bpay\b"),
    "notifications": (r"\bnotifications?\b", r"\balerts?\b", r"\bemail\b", r"\bsms\b"),
    "reporting and analytics": (r"\breports?\b", r"\banalytics\b", r"\bdashboards?\b", r"\bmetrics\b"),
    "order management": (r"\borders?\b", r"\bbookings?\b", r"\breservations?\b", r"\bcart\b"),
    "catalog management": (r"\bcatalog\b", r"\bproducts?\b", r"\bmenus?\b", r"\binventory\b"),
    "delivery tracking": (r"\btrack(?:ing)?\b", r"\bdeliver(?:y|ies)\b", r"\blocation\b"),
    "administration": (r"\badmins?\b", r"\badministrators?\b", r"\bmoderators?\b", r"\bmanage users\b"),
}


def _split_requirement_statements(text: str) -> list[str]:
    return [
        part.strip(" \t\r\n.-")
        for part in re.split(r"(?<=[.!?])\s+|[\n;]+", text)
        if part.strip(" \t\r\n.-")
    ]


def _find_roles(text: str) -> list[str]:
    role_terms = (
        ("Administrator", r"\badmins?\b|\badministrators?\b"),
        ("Customer", r"\bcustomers?\b|\bbuyers?\b|\bclients?\b"),
        ("Restaurant owner", r"\brestaurant owners?\b"),
        ("Business owner", r"\bowners?\b|\bsellers?\b|\bvendors?\b|\bstaff\b"),
        ("Delivery driver", r"\bdelivery drivers?\b|\bdrivers?\b"),
        ("Service provider", r"\bproviders?\b|\bagents?\b"),
        ("End user", r"\bend users?\b|\bmembers?\b"),
    )
    roles = [role for role, pattern in role_terms if re.search(pattern, text, re.IGNORECASE)]
    if "Restaurant owner" in roles:
        roles.remove("Business owner")
    return roles


def analyze_requirements(requirements: str, project_name: str) -> RequirementAnalysis:
    text = " ".join(requirements.split())
    sentences = _split_requirement_statements(text)
    matched_features = [
        feature
        for feature, patterns in FEATURES.items()
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)
    ]
    if not matched_features:
        matched_features = ["Core workflow management"]

    roles = _find_roles(text)
    if not roles:
        roles = ["End user", "Administrator"]

    functional = [f"{sentence.rstrip(' .!?')}." for sentence in sentences[:12]]
    if not functional:
        functional = ["The system shall support the core workflow management described for the project."]

    modules = [feature.title() for feature in matched_features]
    modules.extend(["Identity and access", "Audit and operational settings"])
    modules = list(dict.fromkeys(modules))
    summary = f"{project_name} is a software solution for {text}"
    if len(summary) > 620:
        summary = summary[:617].rsplit(" ", 1)[0] + "..."

    return RequirementAnalysis(
        project_summary=summary,
        functional_requirements=functional,
        non_functional_requirements=[
            "Protect personal and business data with authenticated, role-appropriate access.",
            "Validate user input and return clear, actionable errors.",
            "Keep core user workflows responsive under the expected project workload.",
            "Record relevant changes and failures to support troubleshooting and auditability.",
        ],
        user_roles=roles,
        modules=modules,
        business_rules=[
            "Users may perform actions only when permitted by their role and resource ownership.",
            "Persisted records must include creation and last-updated timestamps.",
        ],
        assumptions=[
            "The initial release is a web application with a responsive user interface.",
            "MongoDB is the primary application database.",
            "External payment, messaging, or identity services require credentials and integration decisions.",
        ],
        missing_information=[
            "Expected user volume, peak request rate, and availability target are unspecified.",
            "Data retention, privacy, and regulatory requirements are unspecified.",
            "Required external integrations and their failure-handling rules are unspecified.",
        ],
        risks=[
            "Broad requirements may lead to inconsistent behavior unless workflows and acceptance criteria are clarified.",
            "Third-party service outages may interrupt dependent workflows without retries or fallback procedures.",
            "Sensitive user data may be exposed if access control and data retention requirements remain undefined.",
        ],
    )
