import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from app.schemas.database_design import MongoDatabaseDesign
from app.schemas.datasets import SyntheticCollectionData, SyntheticDataset


_FIRST_NAMES = ("Avery", "Jordan", "Morgan", "Riley", "Casey", "Taylor", "Jamie", "Quinn")
_LAST_NAMES = ("Parker", "Reed", "Morgan", "Carter", "Hayes", "Brooks", "Bennett", "Gray")
_RESTAURANTS = ("Cedar Kitchen", "Northstar Cafe", "Copper Spoon", "Juniper Table", "Harbor Grill")
_MENU_ITEMS = ("Garden bowl", "Roasted tomato pasta", "Crispy tofu wrap", "Mushroom rice", "Citrus tart")
_STATUSES = ("pending", "confirmed", "in_progress", "completed")


def generate_synthetic_dataset(
    database_design: MongoDatabaseDesign,
    project_summary: str,
    source_database_design_id: str,
    records_by_collection: Dict[str, int],
) -> SyntheticDataset:
    collection_names = {collection.name for collection in database_design.collections}
    if set(records_by_collection) != collection_names:
        raise ValueError("Record counts must be provided for every database collection.")
    if any(not 1 <= count <= 500 for count in records_by_collection.values()):
        raise ValueError("Each collection must contain between 1 and 500 records.")
    for relationship in database_design.relationships:
        if relationship.cardinality.casefold().replace(" ", "") in {"one-to-one", "1:1"}:
            if records_by_collection[relationship.from_collection] != records_by_collection[relationship.to_collection]:
                raise ValueError(
                    "One-to-one relationships require equal record counts for "
                    f"{relationship.from_collection} and {relationship.to_collection}."
                )

    rng = random.Random()
    ids = {
        collection.name: [
            uuid.uuid4().hex[:24]
            for _ in range(records_by_collection[collection.name])
        ]
        for collection in database_design.collections
    }
    generated: Dict[str, List[dict]] = {}
    for collection in database_design.collections:
        foreign_keys = {
            key.field: key
            for key in collection.foreign_keys
        }
        records = []
        for row_index in range(records_by_collection[collection.name]):
            record = {}
            for field in collection.fields:
                foreign_key = foreign_keys.get(field.name)
                if field.name == collection.primary_key:
                    value = ids[collection.name][row_index]
                elif foreign_key:
                    target_ids = ids[foreign_key.references_collection]
                    relationship = next(
                        (
                            relation
                            for relation in database_design.relationships
                            if {
                                relation.from_collection,
                                relation.to_collection,
                            }
                            == {
                                collection.name,
                                foreign_key.references_collection,
                            }
                        ),
                        None,
                    )
                    value = _related_reference(
                        row_index,
                        target_ids,
                        collection.name,
                        foreign_key.references_collection,
                        relationship.cardinality if relationship else "",
                    )
                elif field.bson_type.casefold() in {"array", "arrayobject", "array[object]", "array<object>"}:
                    value = _array_value(
                        collection.name,
                        field.name.split(".", 1)[0],
                        row_index,
                        ids,
                        rng,
                    )
                else:
                    value = _field_value(
                        field.name,
                        field.bson_type,
                        collection.name,
                        row_index,
                        rng,
                    )
                if field.name == "items" and collection.name in {"orders", "carts"}:
                    value = _order_items(ids.get("menu_items", []), rng)
                _set_field(record, field.name, value)
            records.append(record)
        generated[collection.name] = records

    return SyntheticDataset(
        project_summary=project_summary,
        source_database_design_id=source_database_design_id,
        records_by_collection=records_by_collection,
        collections=[
            SyntheticCollectionData(name=name, records=records)
            for name, records in generated.items()
        ],
    )


def _set_field(record: dict, dotted_name: str, value) -> None:
    parts = dotted_name.split(".")
    current = record
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def _array_value(collection: str, field: str, row_index: int, ids: dict, rng):
    if field == "items" and "menu_items" in ids:
        return _order_items(ids["menu_items"], rng)
    if field == "status_history":
        return [
            {
                "status": "assigned",
                "occurred_at": _timestamp(row_index, 0),
            },
            {
                "status": "in_transit",
                "occurred_at": _timestamp(row_index, 1),
            },
        ]
    return [f"{field}_{row_index + 1}"]


def _order_items(menu_item_ids: list, rng) -> list:
    if not menu_item_ids:
        return []
    item_count = min(len(menu_item_ids), rng.randint(1, 4))
    selected = rng.sample(menu_item_ids, item_count)
    return [
        {"menu_item_id": menu_item_id, "quantity": rng.randint(1, 4)}
        for menu_item_id in selected
    ]


def _related_reference(
    row_index: int,
    target_ids: list,
    source_collection: str,
    target_collection: str,
    cardinality: str,
):
    normalized = cardinality.casefold().replace(" ", "")
    if not target_ids:
        raise ValueError(
            f"Cannot create a reference from {source_collection} to an empty {target_collection} collection."
        )
    if normalized not in {"", "one-to-one", "one-to-many", "many-to-one", "many-to-many", "1:1"}:
        raise ValueError(f"Unsupported relationship cardinality: {cardinality}")
    return target_ids[row_index % len(target_ids)]


def _field_value(name: str, bson_type: str, collection: str, row_index: int, rng):
    normalized = name.casefold()
    kind = bson_type.casefold()
    first = _FIRST_NAMES[row_index % len(_FIRST_NAMES)]
    last = _LAST_NAMES[row_index % len(_LAST_NAMES)]
    if "email" in normalized:
        return f"{first.lower()}.{last.lower()}{row_index + 1}@example.test"
    if "password" in normalized:
        return "$argon2id$synthetic$not-for-authentication"
    if "role" in normalized:
        return ("CUSTOMER", "OWNER", "DRIVER", "ADMIN")[row_index % 4]
    if "status" in normalized:
        return _STATUSES[row_index % len(_STATUSES)]
    if normalized in {"name", "display_name"}:
        if collection == "restaurants":
            return _RESTAURANTS[row_index % len(_RESTAURANTS)]
        if collection == "menu_items":
            return _MENU_ITEMS[row_index % len(_MENU_ITEMS)]
        return f"{first} {last}"
    if normalized in {"provider", "currency"}:
        return "demo" if normalized == "provider" else "USD"
    if normalized == "provider_payment_id":
        return f"pay_demo_{row_index + 1:04d}"
    if normalized in {"action", "resource_type"}:
        return "order.updated" if normalized == "action" else "order"
    if normalized == "resource_id":
        return uuid.uuid4().hex[:24]
    if normalized in {"description", "purpose"}:
        return f"Synthetic {collection.replace('_', ' ')} record {row_index + 1}"
    if normalized in {"price", "amount", "subtotal"} or kind in {"decimal", "decimal128"}:
        return round(8.5 + row_index * 3.25, 2)
    if normalized in {"quantity", "count"} or kind in {"int", "integer", "long"}:
        return row_index % 4 + 1
    if kind in {"bool", "boolean"}:
        return row_index % 5 != 0
    if kind in {"date", "datetime"} or normalized.endswith("_at") or normalized.endswith("_date"):
        return _timestamp(row_index)
    if kind in {"object", "embedded"} or normalized in {"address", "metadata"}:
        return _object_value(normalized, row_index)
    if kind in {"objectid", "uuid"}:
        return uuid.uuid4().hex[:24]
    if kind in {"array", "arrayobject", "array[object]", "array<object>"}:
        return _array_value(collection, normalized, row_index, {}, rng)
    return f"{name.replace('_', ' ').title()} {row_index + 1}"


def _object_value(name: str, row_index: int) -> dict:
    if name == "address":
        return {
            "street": f"{100 + row_index} Market Street",
            "city": ("Portland", "Austin", "Denver", "Madison")[row_index % 4],
            "region": "CA",
            "postal_code": f"{90000 + row_index:05d}",
        }
    return {"source": "synthetic", "sequence": row_index + 1}


def _timestamp(row_index: int, day_offset: int = 0) -> str:
    value = datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(
        days=row_index + day_offset,
        hours=12,
    )
    return value.isoformat().replace("+00:00", "Z")
