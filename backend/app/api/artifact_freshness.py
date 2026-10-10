from fastapi import HTTPException, status


def requirements_match(saved: dict | None, requirements: str) -> bool:
    source_requirements = saved.get("source_requirements") if saved else None
    return bool(
        isinstance(source_requirements, str)
        and source_requirements.strip() == requirements.strip()
    )


def require_current_requirements(saved: dict | None, requirements: str, code: str, message: str) -> dict:
    if not requirements_match(saved, requirements):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": code, "message": message},
        )
    return saved
