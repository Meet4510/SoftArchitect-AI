from datetime import datetime
from typing import Any, Dict, Optional

from bson import ObjectId
from pymongo import ReturnDocument

from app.database.mongodb import get_database
from app.schemas.datasets import SyntheticDataset

COLLECTION = "datasets"
VERSION_COLLECTION = "dataset_versions"


def _serialize(document: Optional[Dict[str, Any]]) -> Optional[dict]:
    if not document:
        return None
    serialized = dict(document)
    serialized["id"] = str(serialized.pop("_id"))
    serialized["project_id"] = str(serialized["project_id"])
    return serialized


async def save_dataset(project_id: str, user_id: str, dataset: SyntheticDataset) -> dict:
    database = get_database()
    project_object_id = ObjectId(project_id)
    created_at = datetime.utcnow()
    current = await database[COLLECTION].find_one_and_update(
        {"project_id": project_object_id},
        [
            {
                "$set": {
                    "version": {"$add": [{"$ifNull": ["$version", 0]}, 1]},
                    "dataset": dataset.dict(),
                    "user_id": user_id,
                    "created_at": created_at,
                }
            },
            {"$set": {"dataset.version": "$version"}},
        ],
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    version_document = {
        "project_id": project_object_id,
        "user_id": user_id,
        "version": current["version"],
        "dataset": current["dataset"],
        "created_at": created_at,
    }
    await database[VERSION_COLLECTION].insert_one(version_document)
    return _serialize(current)


async def get_latest_dataset(project_id: str) -> Optional[dict]:
    database = get_database()
    document = await database[COLLECTION].find_one(
        {"project_id": ObjectId(project_id)},
        sort=[("created_at", -1)],
    )
    return _serialize(document)
