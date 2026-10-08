from app.database.mongodb import get_database
from datetime import datetime
from typing import Optional, Dict, Any
from bson.objectid import ObjectId

COLLECTION = "projects"


def _serialize_project(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    serialized = dict(doc)
    if "_id" in serialized:
        serialized["id"] = str(serialized["_id"])
        serialized["_id"] = str(serialized["_id"])
    if "user_id" in serialized:
        serialized["user_id"] = str(serialized["user_id"])
    return serialized


async def create_project(user_id: str, name: str, description: Optional[str] = None, domain: Optional[str] = None, requirements: Optional[str] = None, status: str = "DRAFT"):
    db = get_database()
    now = datetime.utcnow()
    doc = {
        "user_id": user_id,
        "name": name,
        "description": description,
        "domain": domain,
        "requirements": requirements,
        "status": status,
        "created_at": now,
        "updated_at": now
    }
    res = await db[COLLECTION].insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_project(doc)


async def get_project(project_id: str):
    db = get_database()
    try:
        oid = ObjectId(project_id)
    except Exception:
        return None
    doc = await db[COLLECTION].find_one({"_id": oid})
    if doc:
        return _serialize_project(doc)
    return None


async def list_projects(user_id: Optional[str] = None, search: Optional[str] = None, status: Optional[str] = None, domain: Optional[str] = None, page: int = 1, limit: int = 10):
    db = get_database()
    query = {}
    if user_id:
        query["user_id"] = user_id
    if status:
        query["status"] = status
    if domain:
        query["domain"] = domain
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"requirements": {"$regex": search, "$options": "i"}}  
        ]

    total = await db[COLLECTION].count_documents(query)
    skip = (max(page, 1) - 1) * max(limit, 1)
    cursor = db[COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(max(limit, 1))
    items = await cursor.to_list(length=max(limit, 1))
    return {
        "items": [_serialize_project(item) for item in items],
        "total": total,
        "page": max(page, 1),
        "limit": max(limit, 1),
        "total_pages": max((total + max(limit, 1) - 1) // max(limit, 1), 1)
    }


async def update_project(project_id: str, updates: Dict[str, Any]):
    db = get_database()
    try:
        oid = ObjectId(project_id)
    except Exception:
        return None

    safe_updates = {k: v for k, v in updates.items() if v is not None}
    if not safe_updates:
        return await get_project(project_id)

    safe_updates["updated_at"] = datetime.utcnow()
    result = await db[COLLECTION].update_one({"_id": oid}, {"$set": safe_updates})
    if result.matched_count == 0:
        return None
    return await get_project(project_id)


async def delete_project(project_id: str):
    db = get_database()
    try:
        oid = ObjectId(project_id)
    except Exception:
        return False
    result = await db[COLLECTION].delete_one({"_id": oid})
    return result.deleted_count > 0
