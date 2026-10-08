from motor.motor_asyncio import AsyncIOMotorClient
from app.config.settings import settings

client: AsyncIOMotorClient | None = None

def get_client() -> AsyncIOMotorClient:
    global client
    if client is None:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client


def get_database():
    c = get_client()
    return c[settings.MONGODB_DATABASE]


def close_client() -> None:
    global client
    if client is not None:
        client.close()
        client = None
