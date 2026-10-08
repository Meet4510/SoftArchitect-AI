from typing import Optional
from app.database.mongodb import get_database
from bson.objectid import ObjectId
from datetime import datetime
from pymongo.collation import Collation

COLLECTION = "users"

async def find_user_by_email(email: str) -> Optional[dict]:
    db = get_database()
    doc = await db[COLLECTION].find_one(
        {"email": email.strip()},
        collation=Collation(locale="en", strength=2),
    )
    return doc

async def find_user_by_id(user_id: str) -> Optional[dict]:
    db = get_database()
    try:
        oid = ObjectId(user_id)
    except Exception:
        return None
    doc = await db[COLLECTION].find_one({"_id": oid})
    return doc

async def create_user(name: str, email: str, password_hash: str) -> dict:
    db = get_database()
    now = datetime.utcnow()
    user = {
        "name": name,
        "email": email.strip().lower(),
        "password_hash": password_hash,
        "role": "USER",
        "created_at": now,
        "updated_at": now,
    }
    res = await db[COLLECTION].insert_one(user)
    user["_id"] = res.inserted_id
    # remove password_hash for returned object
    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    return user_safe
