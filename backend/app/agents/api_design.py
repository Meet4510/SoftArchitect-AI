import re

from app.schemas.api_design import ApiEndpoint, ApiField, ApiResponse, RestApiDesign
from app.schemas.database_design import MongoDatabaseDesign


COLLECTION_PATHS = {
    "menu_items": "menu-items",
    "audit_logs": "audit-logs",
    "api_designs": "api-designs",
}
SYSTEM_COLLECTIONS = {
    "requirements",
    "technology_recommendations",
    "architectures",
    "database_designs",
    "api_designs",
    "datasets",
    "dataset_versions",
    "documentation",
    "audit_logs",
}
COLLECTION_ROLES = {
    "users": ["USER", "ADMIN"],
    "workspaces": ["WORKSPACE_OWNER", "TEAM_LEAD", "ADMIN"],
    "workspace_memberships": ["WORKSPACE_OWNER", "TEAM_LEAD", "ADMIN"],
    "projects": ["DEVELOPER", "TEAM_LEAD", "ADMIN"],
    "tasks": ["DEVELOPER", "TEAM_LEAD", "ADMIN"],
    "repository_connections": ["TEAM_LEAD", "ADMIN"],
    "agent_runs": ["DEVELOPER", "TEAM_LEAD", "ADMIN"],
    "proposed_changes": ["DEVELOPER", "TEAM_LEAD", "ADMIN"],
    "reviews": ["TEAM_LEAD", "ADMIN"],
    "review_comments": ["DEVELOPER", "TEAM_LEAD", "ADMIN"],
    "notifications": ["USER", "ADMIN"],
    "restaurants": ["RESTAURANT_OWNER", "ADMIN"],
    "menu_items": ["RESTAURANT_OWNER", "ADMIN"],
    "orders": ["CUSTOMER", "RESTAURANT_OWNER", "DELIVERY_DRIVER", "ADMIN"],
    "carts": ["CUSTOMER"],
    "payments": ["CUSTOMER", "ADMIN"],
    "deliveries": ["DELIVERY_DRIVER", "ADMIN"],
}


def design_rest_api(
    requirements: str,
    project_name: str,
    database_design: MongoDatabaseDesign,
) -> RestApiDesign:
    """Create a deterministic REST contract and its matching OpenAPI document."""
    resources = [
        collection
        for collection in database_design.collections
        if collection.name not in SYSTEM_COLLECTIONS
    ]
    endpoints = [
        ApiEndpoint(
            method="POST",
            path="/api/v1/auth/register",
            summary="Register an account",
            description="Create an account and return an authenticated session.",
            auth_required=False,
            roles=[],
            request_fields=[
                ApiField(name="name", data_type="string", required=True, description="Display name."),
                ApiField(name="email", data_type="string", required=True, description="Unique email address."),
                ApiField(name="password", data_type="string", required=True, description="Password meeting account policy."),
            ],
            responses=[
                _response(201, "Account created.", ["id", "name", "email", "access_token"]),
                _response(409, "Email is already registered.", ["code", "message"]),
                _response(422, "Request validation failed.", ["detail"]),
            ],
        ),
        ApiEndpoint(
            method="POST",
            path="/api/v1/auth/login",
            summary="Authenticate an account",
            description="Verify credentials and return a short-lived bearer access token.",
            auth_required=False,
            roles=[],
            request_fields=[
                ApiField(name="email", data_type="string", required=True, description="Registered email address."),
                ApiField(name="password", data_type="string", required=True, description="Account password."),
            ],
            responses=[
                _response(200, "Credentials accepted.", ["access_token", "token_type", "expires_in"]),
                _response(401, "Credentials are invalid.", ["code", "message"]),
            ],
        ),
        ApiEndpoint(
            method="GET",
            path="/api/v1/auth/me",
            summary="Get the current account",
            description="Return the authenticated user's safe profile.",
            auth_required=True,
            roles=["USER", "ADMIN"],
            responses=[
                _response(200, "Current account profile.", ["id", "name", "email", "role"]),
                _response(401, "Authentication is required.", ["detail"]),
            ],
        ),
    ]

    for collection in resources:
        path = COLLECTION_PATHS.get(collection.name, collection.name.replace("_", "-"))
        label = collection.name.replace("_", " ").rstrip("s")
        roles = COLLECTION_ROLES.get(
            collection.name,
            ["ADMIN"] if collection.name == "users" else ["USER", "ADMIN"],
        )
        resource_fields = [
            ApiField(
                name=field.name,
                data_type=field.bson_type,
                required=field.required,
                description=field.description,
            )
            for field in collection.fields
            if field.name != collection.primary_key and field.name != "password_hash"
        ]
        endpoints.extend(
            [
                ApiEndpoint(
                    method="GET",
                    path=f"/api/v1/{path}",
                    summary=f"List {collection.name.replace('_', ' ')}",
                    description=f"Return a paginated list of {collection.name.replace('_', ' ')} visible to the current account.",
                    auth_required=True,
                    roles=roles,
                    request_fields=[
                        ApiField(name="page", data_type="integer", required=False, description="1-based page number."),
                        ApiField(name="limit", data_type="integer", required=False, description="Page size, maximum 100."),
                    ],
                    responses=[
                        _response(200, "Paginated resource collection.", ["items", "total", "page", "limit"]),
                        _response(401, "Authentication is required.", ["detail"]),
                    ],
                ),
                ApiEndpoint(
                    method="POST",
                    path=f"/api/v1/{path}",
                    summary=f"Create {label}",
                    description=f"Create a {label} after validating fields and referenced resources.",
                    auth_required=True,
                    roles=roles,
                    request_fields=resource_fields,
                    responses=[
                        _response(201, "Resource created.", ["id", "created_at", "updated_at"]),
                        _response(422, "Request validation failed.", ["detail"]),
                    ],
                ),
                ApiEndpoint(
                    method="GET",
                    path=f"/api/v1/{path}/{{resource_id}}",
                    summary=f"Get {label}",
                    description=f"Return one {label} when the account has access to it.",
                    auth_required=True,
                    roles=roles,
                    responses=[
                        _response(200, "Resource returned.", ["id", "created_at", "updated_at"]),
                        _response(404, "Resource does not exist.", ["code", "message"]),
                    ],
                ),
                ApiEndpoint(
                    method="PATCH",
                    path=f"/api/v1/{path}/{{resource_id}}",
                    summary=f"Update {label}",
                    description=f"Update allowed {label} fields after checking ownership and role permissions.",
                    auth_required=True,
                    roles=roles,
                    request_fields=[
                        field.copy(update={"required": False}) for field in resource_fields
                    ],
                    responses=[
                        _response(200, "Resource updated.", ["id", "updated_at"]),
                        _response(404, "Resource does not exist.", ["code", "message"]),
                        _response(422, "Request validation failed.", ["detail"]),
                    ],
                ),
                ApiEndpoint(
                    method="DELETE",
                    path=f"/api/v1/{path}/{{resource_id}}",
                    summary=f"Delete {label}",
                    description=f"Delete a {label} only when permitted by the resource lifecycle rules.",
                    auth_required=True,
                    roles=roles,
                    responses=[
                        _response(204, "Resource deleted.", []),
                        _response(404, "Resource does not exist.", ["code", "message"]),
                    ],
                ),
            ]
        )

    normalized_name = re.sub(r"\s+", " ", project_name).strip() or "Software project"
    endpoints = _add_requirement_driven_routes(endpoints, requirements)
    project_summary = f"Versioned REST API for {normalized_name}, derived from the validated MongoDB collection design."
    api_title = f"{normalized_name} API"
    version = "1.0.0"
    base_path = "/api/v1"
    design = RestApiDesign(
        project_summary=project_summary,
        api_title=api_title,
        version=version,
        base_path=base_path,
        authentication="JWT bearer access token using the Authorization header.",
        endpoints=endpoints,
        design_decisions=[
            "Use versioned REST paths under /api/v1 and JSON request and response bodies.",
            "Require JWT authentication for account and business data; enforce role permissions and resource ownership in the API.",
            "Use pagination for list operations and cap page size to protect service resources.",
            "Validate payloads and MongoDB references server-side; never trust client-provided ownership identifiers.",
            "Return consistent validation, authentication, authorization, and not-found errors.",
            "Never accept or persist raw payment card data; delegate checkout and payment handling to a hosted provider.",
        ],
        openapi_spec=_build_openapi_spec(api_title, version, project_summary, endpoints),
    )
    return design


def _add_requirement_driven_routes(
    endpoints: list[ApiEndpoint],
    requirements: str,
) -> list[ApiEndpoint]:
    lowered = requirements.lower()
    if any(term in lowered for term in ("payment", "checkout", "billing")):
        endpoints.extend(
            [
                ApiEndpoint(
                    method="POST",
                    path="/api/v1/payments/checkout",
                    summary="Create a payment checkout",
                    description="Create a hosted payment checkout for an authorized order.",
                    auth_required=True,
                    roles=["CUSTOMER"],
                    request_fields=[
                        ApiField(name="order_id", data_type="ObjectId", required=True, description="Order to pay for.")
                    ],
                    responses=[
                        _response(201, "Hosted checkout created.", ["checkout_url", "payment_id"]),
                        _response(409, "Order is not payable.", ["code", "message"]),
                    ],
                ),
                ApiEndpoint(
                    method="POST",
                    path="/api/v1/payments/webhooks/{provider}",
                    summary="Receive a payment provider event",
                    description="Verify the provider signature and process the event idempotently.",
                    auth_required=False,
                    roles=[],
                    request_fields=[
                        ApiField(name="signature", data_type="string", required=True, description="Provider webhook signature.")
                    ],
                    responses=[_response(200, "Event accepted.", ["received"])],
                ),
            ]
        )
    if any(term in lowered for term in ("delivery", "deliveries", "track")):
        endpoints.append(
            ApiEndpoint(
                method="PATCH",
                path="/api/v1/deliveries/{delivery_id}/status",
                summary="Update delivery status",
                description="Allow the assigned driver to advance a delivery through valid lifecycle states.",
                auth_required=True,
                roles=["DELIVERY_DRIVER", "ADMIN"],
                request_fields=[
                    ApiField(name="status", data_type="string", required=True, description="Next valid delivery status.")
                ],
                responses=[
                    _response(200, "Delivery status updated.", ["id", "status", "updated_at"]),
                    _response(403, "Account is not assigned to this delivery.", ["code", "message"]),
                    _response(409, "Status transition is not allowed.", ["code", "message"]),
                ],
            )
        )
    return endpoints


def _response(status_code: int, description: str, fields: list[str]) -> ApiResponse:
    return ApiResponse(
        status_code=status_code,
        description=description,
        fields=[
            ApiField(
                name=field,
                data_type="array<object>" if field == "items" else "object" if field == "detail" else "string",
                required=False,
                description=f"{field.replace('_', ' ').capitalize()} value.",
            )
            for field in fields
        ],
    )


def _build_openapi_spec(
    api_title: str,
    version: str,
    project_summary: str,
    endpoints: list[ApiEndpoint],
) -> dict:
    paths: dict = {}
    for endpoint in endpoints:
        path_item = paths.setdefault(endpoint.path, {})
        operation_id = re.sub(
            r"[^a-zA-Z0-9]+",
            "_",
            f"{endpoint.method}_{endpoint.path}",
        ).strip("_").lower()
        responses = {
            str(response.status_code): {
                "description": response.description,
                **(
                    {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        field.name: _openapi_schema(field.data_type)
                                        for field in response.fields
                                    },
                                }
                            }
                        }
                    }
                    if response.fields
                    else {}
                ),
            }
            for response in endpoint.responses
        }
        parameters = [
            {
                "name": name,
                "in": "path",
                "required": True,
                "schema": {"type": "string"},
            }
            for name in re.findall(r"{([^}]+)}", endpoint.path)
        ]
        query_parameters = [
            field
            for field in endpoint.request_fields
            if endpoint.method == "GET" and field.name in {"page", "limit"}
        ]
        parameters.extend(
            {
                "name": field.name,
                "in": "query",
                "required": field.required,
                "description": field.description,
                "schema": _openapi_schema(field.data_type),
            }
            for field in query_parameters
        )
        operation = {
            "operationId": operation_id,
            "summary": endpoint.summary,
            "description": endpoint.description,
            "tags": [_tag_for_path(endpoint.path)],
            "parameters": parameters,
            "responses": responses,
        }
        if endpoint.roles:
            operation["x-required-roles"] = endpoint.roles
        if endpoint.auth_required:
            operation["security"] = [{"BearerAuth": []}]
        if endpoint.method in {"POST", "PUT", "PATCH"} and endpoint.request_fields:
            operation["requestBody"] = {
                "required": True,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                field.name for field in endpoint.request_fields if field.required
                            ],
                            "properties": {
                                field.name: {
                                    **_openapi_schema(field.data_type),
                                    "description": field.description,
                                }
                                for field in endpoint.request_fields
                            },
                        }
                    }
                },
            }
        path_item[endpoint.method.lower()] = operation

    return {
        "openapi": "3.0.3",
        "info": {
            "title": api_title,
            "version": version,
            "description": project_summary,
        },
        "servers": [{"url": "/"}],
        "paths": paths,
        "components": {
            "securitySchemes": {
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT",
                }
            }
        },
    }


def _openapi_schema(data_type: str) -> dict:
    lowered = data_type.lower()
    if lowered in {"int", "integer", "number", "float", "double"}:
        return {"type": "integer" if lowered in {"int", "integer"} else "number"}
    if lowered in {"bool", "boolean"}:
        return {"type": "boolean"}
    if lowered.startswith("array"):
        return {"type": "array", "items": {"type": "object"}}
    if lowered in {"object", "dict", "document", "array<object>"}:
        if lowered == "array<object>":
            return {"type": "array", "items": {"type": "object"}}
        return {"type": "object"}
    return {"type": "string"}


def _tag_for_path(path: str) -> str:
    return path.split("/")[3].replace("-", " ").title()
