import json

import httpx
import pytest

from app.config.settings import settings
from app.llm.gemini import (
    GeminiProviderError,
    generate_requirement_analysis,
    generate_structured_output,
)
from app.schemas.technology_recommendation import TechnologyRecommendation


ANALYSIS = {
    "project_summary": "A school records application for managing students and courses.",
    "functional_requirements": ["The system shall manage student records."],
    "non_functional_requirements": ["The system shall protect student data."],
    "user_roles": ["Administrator"],
    "modules": ["Student management"],
    "business_rules": ["Only authorized staff may modify student records."],
    "assumptions": ["The application is web-based."],
    "missing_information": ["The retention period is unspecified."],
    "risks": ["Unauthorized access could expose student data."],
}


@pytest.mark.asyncio
async def test_gemini_provider_sends_requirements_and_validates_structured_response(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-test-model")
    captured = {}

    async def handler(request):
        captured["url"] = str(request.url)
        captured["headers"] = request.headers
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "candidates": [{
                    "content": {"parts": [{"text": json.dumps(ANALYSIS)}],
                                "role": "model"},
                }],
            },
        )

    result = await generate_requirement_analysis(
        "A school platform manages students and courses.",
        "School Records",
        transport=httpx.MockTransport(handler),
    )

    assert result.project_summary == ANALYSIS["project_summary"]
    assert captured["url"].endswith("/models/gemini-test-model:generateContent")
    assert captured["headers"]["x-goog-api-key"] == "test-key"
    assert "school platform manages students" in captured["body"]["contents"][0]["parts"][0]["text"]
    assert captured["body"]["generationConfig"]["responseMimeType"] == "application/json"
    response_schema = captured["body"]["generationConfig"]["responseJsonSchema"]
    assert "definitions" not in response_schema
    assert "functional_requirements" in response_schema["properties"]


@pytest.mark.asyncio
async def test_gemini_provider_requires_key_without_making_request(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    with pytest.raises(GeminiProviderError, match="GEMINI_API_KEY is not configured"):
        await generate_requirement_analysis("Requirements", "Project")


@pytest.mark.asyncio
async def test_gemini_provider_rejects_invalid_model_output(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")

    async def handler(request):
        del request
        invalid = {**ANALYSIS, "functional_requirements": []}
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": json.dumps(invalid)}]}}]},
        )

    with pytest.raises(GeminiProviderError, match="did not match the required schema after one correction attempt"):
        await generate_requirement_analysis(
            "A school platform manages students and courses.",
            "School Records",
            transport=httpx.MockTransport(handler),
        )


@pytest.mark.asyncio
async def test_gemini_provider_retries_with_validation_feedback(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-test-model")
    captured_prompts = []
    invalid = {**ANALYSIS, "functional_requirements": []}

    async def handler(request):
        body = json.loads(request.content)
        captured_prompts.append(body["contents"][0]["parts"][0]["text"])
        output = invalid if len(captured_prompts) == 1 else ANALYSIS
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": json.dumps(output)}]}}]},
        )

    result = await generate_requirement_analysis(
        "A school platform manages students and courses.",
        "School Records",
        transport=httpx.MockTransport(handler),
    )

    assert result.project_summary == ANALYSIS["project_summary"]
    assert len(captured_prompts) == 2
    assert "functional_requirements: Analysis lists must contain at least one item" in captured_prompts[1]
    assert json.dumps(invalid) in captured_prompts[1]


@pytest.mark.asyncio
async def test_gemini_provider_generates_other_validated_blueprint_models(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    output = {
        "project_summary": "A school web application.",
        "recommendations": [
            {
                "category": "Backend API",
                "recommendation": "FastAPI",
                "rationale": "Supports typed REST APIs.",
                "alternatives": ["Django"],
                "trade_offs": ["Requires Python expertise."],
            }
        ],
    }
    captured = {}

    async def handler(request):
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": json.dumps(output)}]}}]},
        )

    result = await generate_structured_output(
        "software technology architect",
        {"project_name": "School", "requirements": "Manage courses and student records."},
        TechnologyRecommendation,
        transport=httpx.MockTransport(handler),
        max_output_tokens=20000,
    )

    assert isinstance(result, TechnologyRecommendation)
    assert result.recommendations[0].recommendation == "FastAPI"
    prompt = captured["body"]["contents"][0]["parts"][0]["text"]
    assert "TechnologyRecommendation" in prompt
    assert "Manage courses and student records." in prompt
    assert captured["body"]["generationConfig"]["maxOutputTokens"] == 20000


@pytest.mark.asyncio
async def test_gemini_provider_reports_upstream_http_errors_without_fallback(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")

    async def handler(request):
        del request
        return httpx.Response(429, json={"error": {"message": "rate limited"}})

    with pytest.raises(GeminiProviderError, match="rate limit or quota"):
        await generate_requirement_analysis(
            "A school platform manages students and courses.",
            "School Records",
            transport=httpx.MockTransport(handler),
        )


@pytest.mark.asyncio
async def test_gemini_provider_explains_unavailable_models(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")

    async def handler(request):
        del request
        return httpx.Response(404, json={"error": {"message": "model unavailable"}})

    with pytest.raises(GeminiProviderError, match="Set GEMINI_MODEL"):
        await generate_requirement_analysis(
            "A school platform manages students and courses.",
            "School Records",
            transport=httpx.MockTransport(handler),
        )


@pytest.mark.asyncio
async def test_gemini_provider_explains_temporary_overload(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-primary-model")
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "gemini-fallback-model")
    requested_models = []

    async def handler(request):
        requested_models.append(request.url.path.split("/")[-1].removesuffix(":generateContent"))
        if len(requested_models) == 1:
            return httpx.Response(503, json={"error": {"message": "temporarily unavailable"}})
        return httpx.Response(503, json={"error": {"message": "fallback temporarily unavailable"}})

    with pytest.raises(GeminiProviderError, match="temporarily overloaded"):
        await generate_requirement_analysis(
            "A school platform manages students and courses.",
            "School Records",
            transport=httpx.MockTransport(handler),
        )
    assert requested_models == ["gemini-primary-model", "gemini-fallback-model"]


@pytest.mark.asyncio
async def test_gemini_provider_falls_back_when_primary_model_is_overloaded(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-primary-model")
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "gemini-fallback-model")
    requested_models = []

    async def handler(request):
        requested_models.append(request.url.path.split("/")[-1].removesuffix(":generateContent"))
        if len(requested_models) == 1:
            return httpx.Response(503, json={"error": {"message": "temporarily unavailable"}})
        return httpx.Response(
            200,
            json={
                "candidates": [{
                    "content": {"parts": [{"text": json.dumps(ANALYSIS)}]},
                }],
            },
        )

    result = await generate_requirement_analysis(
        "A school platform manages students and courses.",
        "School Records",
        transport=httpx.MockTransport(handler),
    )

    assert result.project_summary == ANALYSIS["project_summary"]
    assert requested_models == ["gemini-primary-model", "gemini-fallback-model"]
