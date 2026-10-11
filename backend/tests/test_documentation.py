from datetime import datetime

import pytest
from httpx import AsyncClient

from app.agents.documentation import (
    generate_technical_documentation,
    render_database_schema,
    replace_documentation_section,
)
from app.auth.deps import get_current_user
from app.main import app
from app.schemas.database_design import (
    CollectionDesign,
    DatabaseField,
    DatabaseForeignKey,
    MongoDatabaseDesign,
)
from app.schemas.documentation import (
    DocumentationExpansion,
    TechnicalDocumentation,
    TechnicalDocumentationDraft,
)


REQUIREMENTS = (
    "Customers register, browse restaurants, add meals to a cart, place orders, "
    "make payments, and track deliveries. Restaurant owners manage menus."
)


def _minimal_database_design():
    return MongoDatabaseDesign(
        project_summary="A test MongoDB design.",
        database_name="test_project",
        collections=[
            CollectionDesign(
                name="users",
                purpose="Account data.",
                fields=[
                    DatabaseField(
                        name="_id",
                        bson_type="ObjectId",
                        required=True,
                        description="MongoDB identifier.",
                    ),
                    DatabaseField(
                        name="email",
                        bson_type="string",
                        required=True,
                        description="Normalized sign-in address.",
                    ),
                ],
                indexes=["unique: email"],
                embedding_strategy="Keep the profile with the account.",
            )
        ],
        relationships=[],
        design_decisions=["Validate references in application services."],
        mermaid_diagram=(
            "flowchart LR\n"
            "classDef erEntity fill:#fff\n"
            "classDef erRelationship fill:#fff\n"
            "classDef erAttribute fill:#fff\n"
            "classDef erKey fill:#fff\n"
            'Entity1(["PK _id users"]):::erEntity'
        ),
    )


def test_database_schema_renders_collection_tables_with_keys_references_and_defaults():
    design = MongoDatabaseDesign(
        project_summary="A test MongoDB design.",
        database_name="test_project",
        collections=[
            CollectionDesign(
                name="users",
                purpose="Account data.",
                fields=[
                    DatabaseField(
                        name="_id",
                        bson_type="ObjectId",
                        required=True,
                        description="MongoDB identifier.",
                    ),
                    DatabaseField(
                        name="email",
                        bson_type="string",
                        required=True,
                        description="Normalized sign-in address.",
                    ),
                    DatabaseField(
                        name="created_at",
                        bson_type="date",
                        required=True,
                        default_expression="CURRENT_TIMESTAMP",
                        description="Creation time.",
                    ),
                ],
                indexes=["unique: email"],
                embedding_strategy="Keep the profile with the account.",
            ),
            CollectionDesign(
                name="projects",
                purpose="User-owned project data.",
                foreign_keys=[
                    DatabaseForeignKey(
                        field="user_id",
                        references_collection="users",
                        description="Project owner.",
                    )
                ],
                fields=[
                    DatabaseField(
                        name="_id",
                        bson_type="ObjectId",
                        required=True,
                        description="MongoDB identifier.",
                    ),
                    DatabaseField(
                        name="user_id",
                        bson_type="ObjectId",
                        required=True,
                        description="Owner reference.",
                    ),
                ],
                indexes=["user_id"],
                embedding_strategy="Keep projects in their own collection.",
            ),
        ],
        relationships=[],
        design_decisions=["Validate ObjectId references in application services."],
        mermaid_diagram=(
            "flowchart LR\n"
            "classDef erEntity fill:#fff\n"
            "classDef erRelationship fill:#fff\n"
            "classDef erAttribute fill:#fff\n"
            "classDef erKey fill:#fff\n"
            'Entity1(["users"]):::erEntity\n'
            'Attribute1(["PK _id"]):::erKey'
        ),
    )

    section = render_database_schema(design)

    assert "**Database:** `test_project`" in section
    assert "### `users` collection" in section
    assert "| Field | BSON type | Required | Description |" in section
    assert "| `_id` | `ObjectId` | Yes | MongoDB identifier. Primary key. |" in section
    assert "| `email` | `string` | Yes | Normalized sign-in address. Unique index. |" in section
    assert "| `created_at` | `date` | Yes | Creation time. Default: `CURRENT_TIMESTAMP`. |" in section
    assert "| `user_id` | `ObjectId` | Yes | Owner reference. Reference: `users._id` via `user_id`. |" in section


def test_replace_documentation_section_replaces_duplicate_database_summaries():
    markdown = (
        "# Project\n\n## Data design\n\nOld summary.\n\n"
        "### Details\n\nOld details.\n\n## API design\n\nAPI."
    )

    replaced = replace_documentation_section(markdown, "Data design", "| Field | Type |")

    assert replaced.count("## Data design") == 1
    assert "| Field | Type |" in replaced
    assert "Old summary." not in replaced
    assert "## API design" in replaced


def test_documentation_contains_project_roadmap_risks_and_required_sections():
    project = {
        "name": "QuickBite",
        "description": "Food delivery marketplace",
        "domain": "FoodTech",
        "requirements": REQUIREMENTS,
    }
    prompt = "Create an API-focused guide for backend developers, including endpoint access roles."
    documentation = generate_technical_documentation(project, prompt=prompt)

    assert len(documentation.roadmap) >= 4
    assert any(risk.category == "Payment integration" for risk in documentation.risks)
    assert documentation.generation_prompt == prompt
    assert any(section.title == "API implementation details" for section in documentation.custom_sections)
    assert "## Requirements" in documentation.markdown
    assert "## Documentation request" in documentation.markdown
    assert prompt in documentation.markdown
    assert "## Development roadmap" in documentation.markdown
    assert "## Risk register" in documentation.markdown
    assert "## Abstract" in documentation.markdown
    assert "## Table of Contents" in documentation.markdown
    assert "## 8. Conclusion and Future Scope" in documentation.markdown
    assert "## References" in documentation.markdown
    assert "not claims of completed testing" in documentation.markdown
    assert len(documentation.markdown.split()) >= 1800
    assert "README.md" in documentation.folder_structure
    assert "frontend/" in documentation.folder_structure


def test_documentation_schema_rejects_a_short_report():
    documentation = generate_technical_documentation(
        {"name": "QuickBite", "requirements": REQUIREMENTS},
        prompt="Create a comprehensive MCA final-year software project report.",
    )
    payload = documentation.dict()
    required_sections = (
        "Abstract",
        "Table of Contents",
        "1. Introduction",
        "2. Literature Review",
        "3. System Analysis",
        "4. Design",
        "5. Implementation",
        "6. Testing",
        "7. Results and Discussion",
        "8. Conclusion and Future Scope",
        "References",
        "Requirements",
        "Architecture",
        "Data design",
        "API design",
        "Development roadmap",
        "Risk register",
        "Project structure",
        "Deployment and validation",
    )
    payload["markdown"] = "# QuickBite\n\n" + "\n".join(
        f"## {section}" for section in required_sections
    )

    with pytest.raises(ValueError, match="at least 1800 are required"):
        TechnicalDocumentation(**payload)


@pytest.mark.asyncio
async def test_documentation_routes_generate_retrieve_and_enforce_ownership(monkeypatch):
    project_id = "64b000000000000000000001"
    project = {
        "id": project_id,
        "user_id": "user-1",
        "name": "QuickBite",
        "description": "Food delivery marketplace",
        "requirements": REQUIREMENTS,
    }
    saved_document = {}

    async def fake_get_project(requested_project_id):
        return project if requested_project_id == project_id else None

    async def fake_get_sources(requested_project_id, requirements):
        assert requested_project_id == project_id
        assert requirements == project["requirements"]
        return (None, None, None, None, None, None)

    async def fake_save(requested_project_id, user_id, source_requirements, documentation):
        saved_document.update({
            "id": "documentation-1",
            "project_id": requested_project_id,
            "source_requirements": source_requirements,
            "documentation": documentation.dict(),
            "created_at": datetime(2026, 1, 1),
        })
        return saved_document

    async def fake_get_latest(requested_project_id):
        return saved_document or None

    async def fake_get_latest_database(requested_project_id):
        return {
            "source_requirements": REQUIREMENTS,
            "database_design": _minimal_database_design().dict(),
        }

    monkeypatch.setattr("app.api.documentation.get_project", fake_get_project)
    monkeypatch.setattr("app.api.documentation.gemini_enabled", lambda: False)
    monkeypatch.setattr("app.api.documentation._get_sources", fake_get_sources)
    monkeypatch.setattr("app.api.documentation.save_documentation", fake_save)
    monkeypatch.setattr("app.api.documentation.get_latest_documentation", fake_get_latest)
    monkeypatch.setattr(
        "app.api.documentation.get_latest_database_design",
        fake_get_latest_database,
    )
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}
    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            generated = await client.post(
                f"/api/v1/projects/{project_id}/documentation/generate",
                json={"prompt": "Create a concise technical handoff focused on testing and security."},
                headers={"Authorization": "Bearer test"},
            )
            assert generated.status_code == 200
            assert generated.json()["project_id"] == project_id
            assert generated.json()["roadmap"]
            assert generated.json()["generation_prompt"] == "Create a concise technical handoff focused on testing and security."
            assert any(section["title"] == "Testing guidance" for section in generated.json()["custom_sections"])

            invalid_prompt = await client.post(
                f"/api/v1/projects/{project_id}/documentation/generate",
                json={"prompt": "short"},
                headers={"Authorization": "Bearer test"},
            )
            assert invalid_prompt.status_code == 422

            loaded = await client.get(
                f"/api/v1/projects/{project_id}/documentation",
                headers={"Authorization": "Bearer test"},
            )
            assert loaded.status_code == 200
            assert loaded.json()["id"] == "documentation-1"
            assert "| Field | BSON type | Required | Description |" in loaded.json()["markdown"]
            assert "### `users` collection" in loaded.json()["markdown"]
            assert "| `email` | `string` | Yes | Normalized sign-in address. Unique index." in loaded.json()["markdown"]

            project["requirements"] += " Customers also receive dispatch updates."
            stale_documentation = await client.get(
                f"/api/v1/projects/{project_id}/documentation",
                headers={"Authorization": "******"},
            )
            assert stale_documentation.status_code == 404
            assert stale_documentation.json()["detail"]["code"] == "documentation_not_found"

            app.dependency_overrides[get_current_user] = lambda: {"id": "someone-else", "role": "USER"}
            forbidden = await client.get(
                f"/api/v1/projects/{project_id}/documentation",
                headers={"Authorization": "Bearer test"},
            )
            assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_documentation_route_uses_gemini_and_supplies_academic_report_context(monkeypatch):
    project_id = "64b000000000000000000002"
    project = {
        "id": project_id,
        "user_id": "user-1",
        "name": "QuickBite",
        "description": "Food delivery marketplace",
        "domain": "FoodTech",
        "requirements": REQUIREMENTS,
    }
    captured = {}
    prompt = "Prepare a complete project report with special emphasis on payment security."

    async def fake_get_project(requested_project_id):
        return project if requested_project_id == project_id else None

    async def fake_get_sources(requested_project_id, requirements):
        assert requested_project_id == project_id
        assert requirements == REQUIREMENTS
        return (None, None, None, None, None, None)

    async def fake_gemini(task, context, output_model, max_output_tokens):
        captured["task"] = task
        captured["context"] = context
        captured["output_model"] = output_model
        captured["max_output_tokens"] = max_output_tokens
        return generate_technical_documentation(
            project,
            prompt=context["documentation_request"],
        )

    async def fake_save(requested_project_id, user_id, requirements, documentation):
        captured["saved_documentation"] = documentation
        return {
            "id": "gemini-documentation-1",
            "project_id": requested_project_id,
            "documentation": documentation.dict(),
            "created_at": datetime(2026, 1, 1),
        }

    monkeypatch.setattr("app.api.documentation.get_project", fake_get_project)
    monkeypatch.setattr("app.api.documentation._get_sources", fake_get_sources)
    monkeypatch.setattr("app.api.documentation.gemini_enabled", lambda: True)
    monkeypatch.setattr(
        "app.api.documentation.generate_gemini_blueprint",
        fake_gemini,
    )
    monkeypatch.setattr("app.api.documentation.save_documentation", fake_save)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/projects/{project_id}/documentation/generate",
                json={"prompt": prompt},
            )

        assert response.status_code == 200
        assert response.json()["generation_prompt"] == prompt
        assert response.json()["source_artifacts"] == ["project requirements"]
        assert captured["output_model"] is TechnicalDocumentationDraft
        assert captured["max_output_tokens"] == 20000
        assert prompt in captured["context"]["documentation_request"]
        assert "## 8. Conclusion and Future Scope" in captured["task"]
        assert "at least 1,800 words" in captured["task"]
        assert "Do not claim tests" in captured["task"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_documentation_route_repairs_missing_sections_before_saving(monkeypatch):
    project_id = "64b000000000000000000003"
    project = {
        "id": project_id,
        "user_id": "user-1",
        "name": "QuickBite",
        "domain": "FoodTech",
        "requirements": REQUIREMENTS,
    }
    template = generate_technical_documentation(project, prompt="A complete project report.")
    headings = (
        "Abstract",
        "Table of Contents",
        "1. Introduction",
        "2. Literature Review",
        "3. System Analysis",
        "References",
    )
    short_markdown = (
        "# QuickBite\n\n"
        + (
            "The requirements identify readers, librarians, catalog search, reservations, "
            "and availability notifications. "
            * 200
        )
        + "\n\n"
        + "\n\n".join(f"## {heading}" for heading in headings)
    )
    draft = TechnicalDocumentationDraft(
        **{**template.dict(), "markdown": short_markdown}
    )
    captured = {"calls": 0}
    saved_document = {}

    async def fake_get_project(requested_project_id):
        return project if requested_project_id == project_id else None

    async def fake_get_sources(requested_project_id, requirements):
        assert requested_project_id == project_id
        assert requirements == REQUIREMENTS
        return (None, None, None, None, None, None)

    async def fake_gemini(task, context, output_model, max_output_tokens):
        captured["calls"] += 1
        if output_model is TechnicalDocumentationDraft:
            captured["initial_task"] = task
            return draft
        assert output_model is DocumentationExpansion
        assert "existing_report" in context
        assert "## 4. Design" in task
        assert context["missing_required_sections"]
        captured["missing_sections"] = context["missing_required_sections"]
        assert max_output_tokens == 12000
        return DocumentationExpansion(
            markdown=(
                "\n\n".join(
                    f"## {section}" for section in context["missing_required_sections"]
                )
                + "\n\n"
                + (
                    "The planned reader reservation workflow must verify ownership, "
                    "availability, and notification state before updating records. "
                    * 100
                )
            )
        )

    async def fake_save(requested_project_id, user_id, requirements, documentation):
        saved_document.update(
            {
                "id": "expanded-documentation-1",
                "project_id": requested_project_id,
                "documentation": documentation.dict(),
                "created_at": datetime(2026, 1, 1),
            }
        )
        return saved_document

    monkeypatch.setattr("app.api.documentation.get_project", fake_get_project)
    monkeypatch.setattr("app.api.documentation._get_sources", fake_get_sources)
    monkeypatch.setattr("app.api.documentation.gemini_enabled", lambda: True)
    monkeypatch.setattr(
        "app.api.documentation.generate_gemini_blueprint",
        fake_gemini,
    )
    monkeypatch.setattr("app.api.documentation.save_documentation", fake_save)
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "USER"}

    try:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/projects/{project_id}/documentation/generate",
                json={"prompt": "Create a comprehensive MCA final-year project report."},
            )

        assert response.status_code == 200
        markdown = response.json()["markdown"]
        assert len(markdown.split()) >= 1800
        assert len(short_markdown.split()) >= 1800
        assert captured["calls"] == 2
        assert "4. Design" in captured["missing_sections"]
        assert "5. Implementation" in captured["missing_sections"]
        assert "## 4. Design" in markdown
        assert "## 5. Implementation" in markdown
        assert markdown.index("## Detailed Technical Analysis") < markdown.index("## References")
        assert response.json()["generation_prompt"] == "Create a comprehensive MCA final-year project report."
        assert saved_document["documentation"]["markdown"] == markdown
    finally:
        app.dependency_overrides.clear()
