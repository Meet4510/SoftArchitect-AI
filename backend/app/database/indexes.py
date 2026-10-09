from app.database.mongodb import get_database

async def create_indexes():
    db = get_database()
    # users.email unique
    await db["users"].create_index("email", unique=True)
    # projects indexes
    await db["projects"].create_index("user_id")
    await db["projects"].create_index("created_at")
    await db["requirements"].create_index([("project_id", 1), ("created_at", -1)])
    await db["technology_recommendations"].create_index([("project_id", 1), ("created_at", -1)])
    await db["architectures"].create_index([("project_id", 1), ("created_at", -1)])
    await db["database_designs"].create_index([("project_id", 1), ("created_at", -1)])
    await db["api_designs"].create_index([("project_id", 1), ("created_at", -1)])
    await db["diagrams"].create_index([("project_id", 1), ("created_at", -1)])
    # datasets
    await db["datasets"].create_index("project_id")
    await db["dataset_versions"].create_index([("project_id", 1), ("created_at", -1)])
    await db["documentation"].create_index([("project_id", 1), ("created_at", -1)])
    # agent_runs
    await db["agent_runs"].create_index("project_id")
    print("Indexes created.")

if __name__ == "__main__":
    import asyncio
    asyncio.run(create_indexes())
