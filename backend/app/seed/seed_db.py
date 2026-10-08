import asyncio
from app.database.indexes import create_indexes
from app.models.user import create_user, find_user_by_email
from app.models.project import create_project
from app.auth.security import hash_password

async def seed():
    # ensure indexes
    await create_indexes()

    # create demo admin user
    admin_email = "admin@softarchitect.local"
    existing = await find_user_by_email(admin_email)
    if not existing:
        pw = hash_password("AdminPass123")
        await create_user("Admin", admin_email, pw)
        print("Created admin user")

    # create a demo project owner
    user_email = "demo@softarchitect.local"
    existing = await find_user_by_email(user_email)
    if not existing:
        pw = hash_password("DemoPass123")
        user = await create_user("Demo User", user_email, pw)
        print("Created demo user")
        # create demo projects
        await create_project(str(user.get("_id")), "Food Delivery Demo", "Demo project for food delivery", domain="food-delivery")
        print("Created demo project")

if __name__ == "__main__":
    asyncio.run(seed())
