from typing import Type

from fastapi import HTTPException, status
from pydantic import BaseModel

from app.config.settings import settings
from app.llm.gemini import GeminiProviderError, generate_structured_output


def gemini_enabled() -> bool:
    return not settings.DEMO_MODE and settings.LLM_PROVIDER.lower() == "gemini"


async def generate_gemini_blueprint(
    task: str,
    context: dict,
    output_model: Type[BaseModel],
    max_output_tokens: int = 12288,
) -> BaseModel:
    try:
        return await generate_structured_output(
            task,
            context,
            output_model,
            max_output_tokens=max_output_tokens,
        )
    except GeminiProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "llm_provider_error", "message": str(exc)},
        ) from exc
