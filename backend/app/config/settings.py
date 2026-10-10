from pydantic import BaseSettings
from typing import List
from pathlib import Path

class Settings(BaseSettings):
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DATABASE: str = "softarchitect_ai"
    JWT_SECRET: str = "replace_this_with_a_strong_secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRES_MINUTES: int = 60
    LLM_PROVIDER: str = "mock"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.1-flash-lite"
    DEMO_MODE: bool = True
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:4173"]

    class Config:
        env_file = Path(__file__).resolve().parents[3] / ".env"

settings = Settings()
