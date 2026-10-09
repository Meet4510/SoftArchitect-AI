from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, validator


class ApiField(BaseModel):
    name: str = Field(..., min_length=1)
    data_type: str = Field(..., min_length=1)
    required: bool
    description: str = Field(..., min_length=1)


class ApiResponse(BaseModel):
    status_code: int = Field(..., ge=100, le=599)
    description: str = Field(..., min_length=1)
    fields: List[ApiField] = Field(default_factory=list)

    @validator("fields")
    def require_unique_field_names(cls, value):
        names = [field.name for field in value]
        if len(names) != len(set(names)):
            raise ValueError("Response field names must be unique")
        return value


class ApiEndpoint(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    path: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    auth_required: bool
    roles: List[str] = Field(default_factory=list)
    request_fields: List[ApiField] = Field(default_factory=list)
    responses: List[ApiResponse] = Field(..., min_items=1)

    @validator("path")
    def require_absolute_api_path(cls, value):
        if not value.startswith("/api/v1/"):
            raise ValueError("Endpoint paths must start with /api/v1/")
        if value.count("{") != value.count("}"):
            raise ValueError("Path parameters must use balanced braces")
        return value

    @validator("request_fields")
    def require_unique_request_fields(cls, value):
        names = [field.name for field in value]
        if len(names) != len(set(names)):
            raise ValueError("Request field names must be unique")
        return value

    @validator("responses")
    def require_unique_response_statuses(cls, value):
        statuses = [response.status_code for response in value]
        if len(statuses) != len(set(statuses)):
            raise ValueError("Response status codes must be unique per endpoint")
        return value


class RestApiDesign(BaseModel):
    project_summary: str = Field(..., min_length=1)
    api_title: str = Field(..., min_length=1)
    version: str = Field(default="1.0.0", min_length=1)
    base_path: str = Field(default="/api/v1", min_length=1)
    authentication: str = Field(..., min_length=1)
    endpoints: List[ApiEndpoint] = Field(..., min_items=1)
    design_decisions: List[str] = Field(..., min_items=1)
    openapi_spec: Dict[str, Any]

    @validator("endpoints")
    def require_unique_endpoint_operations(cls, value):
        operations = [(endpoint.method, endpoint.path) for endpoint in value]
        if len(operations) != len(set(operations)):
            raise ValueError("HTTP method and path pairs must be unique")
        return value

    @validator("openapi_spec")
    def require_openapi_document(cls, value):
        if value.get("openapi") != "3.0.3":
            raise ValueError("OpenAPI document must use version 3.0.3")
        if not isinstance(value.get("paths"), dict) or not value["paths"]:
            raise ValueError("OpenAPI document must define paths")
        return value

    @validator("openapi_spec")
    def require_every_endpoint_in_openapi(cls, value, values):
        paths = value.get("paths", {})
        for endpoint in values.get("endpoints", []):
            if endpoint.path not in paths or endpoint.method.lower() not in paths[endpoint.path]:
                raise ValueError("Every API endpoint must exist in the OpenAPI document")
        return value


class RestApiDesignOut(RestApiDesign):
    id: Optional[str] = None
    project_id: str
    created_at: datetime
