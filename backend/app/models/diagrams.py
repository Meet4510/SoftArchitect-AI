from datetime import datetime
from typing import Any, Dict, Optional

from bson import ObjectId

from app.database.mongodb import get_database
from app.schemas.diagrams import UmlDiagramSet

COLLECTION = "diagrams"


def _serialize(document: Optional[Dict[str, Any]]) -> Optional[dict]:
    if not document:
        return None
    serialized = dict(document)
    serialized["id"] = str(serialized.pop("_id"))
    serialized["project_id"] = str(serialized["project_id"])
    return serialized


async def save_diagrams(
    project_id: str,
    user_id: str,
    source_requirements: str,
    source_api_design_id: str,
    diagrams: UmlDiagramSet,
) -> dict:
    database = get_database()
    document = {
        "project_id": ObjectId(project_id),
        "user_id": user_id,
        "source_requirements": source_requirements,
        "source_api_design_id": source_api_design_id,
        "diagram_set": diagrams.dict(),
        "created_at": datetime.utcnow(),
    }
    result = await database[COLLECTION].insert_one(document)
    document["_id"] = result.inserted_id
    return _serialize(document)


async def get_latest_diagrams(project_id: str) -> Optional[dict]:
    database = get_database()
    document = await database[COLLECTION].find_one(
        {"project_id": ObjectId(project_id)},
        sort=[("created_at", -1)],
    )
    return _serialize(document)
