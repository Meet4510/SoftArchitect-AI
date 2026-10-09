import re

from app.schemas.database_design import (
    CollectionDesign,
    DatabaseField,
    DatabaseForeignKey,
    DatabaseRelationship,
    MongoDatabaseDesign,
)
from app.schemas.architecture import SoftwareArchitecture


def _field(name: str, bson_type: str, required: bool, description: str) -> DatabaseField:
    return DatabaseField(name=name, bson_type=bson_type, required=required, description=description)


def _foreign_key(field: str, references_collection: str, description: str) -> DatabaseForeignKey:
    return DatabaseForeignKey(
        field=field,
        references_collection=references_collection,
        references_field="_id",
        description=description,
    )


def build_entity_relationship_diagram(
    collections: list[CollectionDesign],
    relationships: list[DatabaseRelationship],
) -> str:
    """Render a Chen-style ERD with entity rectangles, relationship diamonds, and attribute ovals."""
    lines = [
        "flowchart LR",
        "  %% Chen ERD: rectangles are entities, diamonds are relationships, ovals are attributes.",
        "  %% 1 and N labels show cardinality; PK and FK prefixes identify key attributes.",
    ]
    collection_ids = {
        collection.name: f"Entity{index}"
        for index, collection in enumerate(collections, start=1)
    }

    for collection_index, collection in enumerate(collections, start=1):
        entity_id = f"Entity{collection_index}"
        lines.append(
            f'  {entity_id}["{_erd_label(collection.name)}"]:::erEntity'
        )
        foreign_keys = {
            foreign_key.field.split(".", 1)[0]: foreign_key
            for foreign_key in collection.foreign_keys
        }
        for field_index, field in enumerate(collection.fields, start=1):
            attribute_id = f"Attribute{collection_index}_{field_index}"
            if field.name == collection.primary_key:
                marker = "PK"
                style = "erKey"
            elif field.name in foreign_keys:
                marker = "FK"
                style = "erKey"
            else:
                marker = ""
                style = "erAttribute"
            foreign_key = foreign_keys.get(field.name)
            attribute_name = field.name
            if foreign_key and foreign_key.field != field.name:
                attribute_name = f"{foreign_key.field} -> {foreign_key.references_collection}.{foreign_key.references_field}"
            prefix = f"{marker} " if marker else ""
            label = _erd_label(f"{prefix}{attribute_name}: {field.bson_type}")
            lines.append(
                f'  {attribute_id}(["{label}"]):::{style}'
            )
            lines.append(f"  {entity_id} --- {attribute_id}")

    for relationship_index, relationship in enumerate(relationships, start=1):
        from_id = collection_ids[relationship.from_collection]
        to_id = collection_ids[relationship.to_collection]
        relationship_id = f"Relationship{relationship_index}"
        label = _erd_label(re.split(r"[.;]", relationship.description, maxsplit=1)[0])[:48]
        from_cardinality, to_cardinality = _erd_cardinalities(relationship.cardinality)
        lines.append(
            f'  {relationship_id}{{"{label}"}}:::erRelationship'
        )
        lines.append(f"  {from_id} ---|{from_cardinality}| {relationship_id}")
        lines.append(f"  {relationship_id} ---|{to_cardinality}| {to_id}")

    lines.extend(
        [
            "  classDef erEntity fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc",
            "  classDef erRelationship fill:#312e81,stroke:#a5b4fc,stroke-width:2px,color:#f8fafc",
            "  classDef erAttribute fill:#1e293b,stroke:#64748b,color:#e2e8f0",
            "  classDef erKey fill:#164e63,stroke:#22d3ee,stroke-width:2px,color:#ecfeff",
        ]
    )
    return "\n".join(lines)


def _erd_cardinalities(cardinality: str) -> tuple[str, str]:
    normalized = cardinality.casefold().replace(" ", "")
    return {
        "one-to-one": ("1", "1"),
        "one-to-many": ("1", "N"),
        "many-to-one": ("N", "1"),
        "many-to-many": ("N", "N"),
    }.get(normalized, ("N", "1"))


def _erd_label(value: str) -> str:
    return re.sub(r'[^A-Za-z0-9 _.,:()/-]', "", value).strip() or "Attribute"


def design_mongodb_schema(
    requirements: str,
    project_name: str,
    architecture: SoftwareArchitecture,
) -> MongoDatabaseDesign:
    text = requirements.casefold()
    architecture_modules = " ".join(component.name for component in architecture.components).casefold()

    collections = [
        CollectionDesign(
            name="users",
            purpose="Customer, operator, driver, and administrator identity and profile records.",
            fields=[
                _field("_id", "ObjectId", True, "MongoDB document identifier."),
                _field("name", "string", True, "Display name."),
                _field("email", "string", True, "Normalized unique sign-in address."),
                _field("password_hash", "string", True, "Argon2 or bcrypt hash; never store a raw password."),
                _field("role", "string", True, "Role used for server-side authorization."),
                _field("created_at", "date", True, "Creation timestamp."),
                _field("updated_at", "date", True, "Last update timestamp."),
            ],
            indexes=["unique: email", "role"],
            embedding_strategy="Store profile attributes with the user. Keep high-volume activity such as orders in separate collections.",
        ),
        CollectionDesign(
            name="restaurants",
            purpose="Restaurant profile, ownership, address, and operating state.",
            foreign_keys=[
                _foreign_key("owner_id", "users", "Restaurant owner account."),
            ],
            fields=[
                _field("_id", "ObjectId", True, "MongoDB document identifier."),
                _field("owner_id", "ObjectId", True, "Reference to users._id for the restaurant owner."),
                _field("name", "string", True, "Restaurant name."),
                _field("description", "string", False, "Restaurant description."),
                _field("address", "object", True, "Embedded structured address."),
                _field("status", "string", True, "Review and availability status."),
                _field("created_at", "date", True, "Creation timestamp."),
                _field("updated_at", "date", True, "Last update timestamp."),
            ],
            indexes=["owner_id", "status", "text: name, description"],
            embedding_strategy="Embed the bounded address value object; keep menu items separate so they can be independently queried and updated.",
        ),
        CollectionDesign(
            name="menu_items",
            purpose="Searchable restaurant menu items, prices, and availability.",
            foreign_keys=[
                _foreign_key("restaurant_id", "restaurants", "Parent restaurant."),
            ],
            fields=[
                _field("_id", "ObjectId", True, "MongoDB document identifier."),
                _field("restaurant_id", "ObjectId", True, "Reference to restaurants._id."),
                _field("name", "string", True, "Menu item name."),
                _field("description", "string", False, "Menu item description."),
                _field("price", "decimal", True, "Price stored as Decimal128 with currency."),
                _field("currency", "string", True, "ISO 4217 currency code."),
                _field("is_available", "bool", True, "Whether customers can order the item."),
                _field("created_at", "date", True, "Creation timestamp."),
                _field("updated_at", "date", True, "Last update timestamp."),
            ],
            indexes=["restaurant_id, is_available", "text: name, description"],
            embedding_strategy="Keep menu items separate to support menu search, availability changes, and restaurant-level pagination.",
        ),
        CollectionDesign(
            name="orders",
            purpose="Order lifecycle and immutable snapshots of ordered items and prices.",
            foreign_keys=[
                _foreign_key("customer_id", "users", "Customer who placed the order."),
                _foreign_key("restaurant_id", "restaurants", "Restaurant fulfilling the order."),
                _foreign_key("items.menu_item_id", "menu_items", "Original menu item for each embedded order line, when retained."),
            ],
            fields=[
                _field("_id", "ObjectId", True, "MongoDB document identifier."),
                _field("customer_id", "ObjectId", True, "Reference to users._id."),
                _field("restaurant_id", "ObjectId", True, "Reference to restaurants._id."),
                _field("items", "array<object>", True, "Bounded item snapshots with menu_item_id, name, quantity, unit_price, and currency."),
                _field("delivery_address", "object", True, "Address snapshot so later profile edits do not change an order."),
                _field("status", "string", True, "Validated order-state value."),
                _field("subtotal", "decimal", True, "Order subtotal stored as Decimal128."),
                _field("created_at", "date", True, "Creation timestamp."),
                _field("updated_at", "date", True, "Last update timestamp."),
            ],
            indexes=["customer_id, created_at DESC", "restaurant_id, status, created_at DESC"],
            embedding_strategy="Embed a bounded immutable line-item and delivery-address snapshot; reference user and restaurant documents.",
        ),
    ]

    relationships = [
        DatabaseRelationship(from_collection="restaurants", to_collection="users", cardinality="many-to-one", description="Each restaurant has one owner; an owner may manage multiple restaurants."),
        DatabaseRelationship(from_collection="menu_items", to_collection="restaurants", cardinality="many-to-one", description="Each menu item belongs to one restaurant."),
        DatabaseRelationship(from_collection="orders", to_collection="users", cardinality="many-to-one", description="Each order belongs to one customer."),
        DatabaseRelationship(from_collection="orders", to_collection="restaurants", cardinality="many-to-one", description="Each order is placed with one restaurant."),
    ]

    def add_collection(collection: CollectionDesign, relations: list[DatabaseRelationship] | None = None) -> None:
        if collection.name not in {item.name for item in collections}:
            collections.append(collection)
            if relations:
                relationships.extend(relations)

    if any(term in text or term in architecture_modules for term in ("cart", "shopping cart")):
        add_collection(
            CollectionDesign(
                name="carts",
                purpose="Active customer carts before checkout.",
                foreign_keys=[
                    _foreign_key("customer_id", "users", "Customer who owns the active cart."),
                    _foreign_key("items.menu_item_id", "menu_items", "Menu item referenced by each cart line."),
                ],
                fields=[
                    _field("_id", "ObjectId", True, "MongoDB document identifier."),
                    _field("customer_id", "ObjectId", True, "Reference to users._id."),
                    _field("items", "array<object>", True, "Menu item references and current quantities."),
                    _field("updated_at", "date", True, "Last cart update timestamp."),
                    _field("expires_at", "date", True, "Expiry time for abandoned-cart cleanup."),
                ],
                indexes=["unique: customer_id", "TTL: expires_at"],
                embedding_strategy="Embed the small bounded set of active cart lines; revalidate menu availability and prices at checkout.",
            ),
        )


    def _design_software_engineering_schema(project_name: str) -> MongoDatabaseDesign:
        definitions = [
            (
                "users",
                "Developer, team lead, and administrator accounts.",
                [],
                [
                    ("name", "string", True, "Display name."),
                    ("email", "string", True, "Normalized unique sign-in address."),
                    ("password_hash", "string", True, "Password hash; never store a raw password."),
                    ("role", "string", True, "Global account role."),
                ],
                ["unique: email", "role"],
                "Keep identity and authentication attributes on the user document.",
            ),
            (
                "workspaces",
                "Shared team spaces containing memberships and software projects.",
                [("owner_id", "users", "Workspace owner.")],
                [
                    ("owner_id", "ObjectId", True, "Reference to users._id."),
                    ("name", "string", True, "Workspace name."),
                    ("settings", "object", False, "Workspace-level configuration."),
                ],
                ["owner_id", "created_at DESC"],
                "Keep workspace settings bounded; represent membership as separate documents.",
            ),
            (
                "workspace_memberships",
                "User membership, invitation state, and role within a workspace.",
                [("workspace_id", "workspaces", "Workspace joined by this user."), ("user_id", "users", "Member account.")],
                [
                    ("workspace_id", "ObjectId", True, "Reference to workspaces._id."),
                    ("user_id", "ObjectId", True, "Reference to users._id."),
                    ("role", "string", True, "Workspace role such as developer, team lead, or administrator."),
                    ("status", "string", True, "Membership or invitation status."),
                ],
                ["unique: workspace_id, user_id", "user_id, status"],
                "Keep memberships separately to support efficient member and workspace lookups.",
            ),
            (
                "projects",
                "Software projects, instructions, and repository-independent configuration.",
                [("workspace_id", "workspaces", "Workspace containing the project."), ("owner_id", "users", "Project creator.")],
                [
                    ("workspace_id", "ObjectId", True, "Reference to workspaces._id."),
                    ("owner_id", "ObjectId", True, "Reference to users._id."),
                    ("name", "string", True, "Project name."),
                    ("description", "string", False, "Project purpose and scope."),
                    ("instructions", "string", False, "Project-specific engineering instructions."),
                    ("status", "string", True, "Project lifecycle status."),
                ],
                ["workspace_id, updated_at DESC", "owner_id"],
                "Keep repository connections and task history in separate collections.",
            ),
            (
                "tasks",
                "Coding tasks and their lifecycle, priority, assignment, and project context.",
                [("project_id", "projects", "Project containing the task."), ("assignee_id", "users", "Assigned developer.")],
                [
                    ("project_id", "ObjectId", True, "Reference to projects._id."),
                    ("assignee_id", "ObjectId", False, "Reference to users._id."),
                    ("title", "string", True, "Task title."),
                    ("description", "string", True, "Requested software change."),
                    ("priority", "string", True, "Task priority."),
                    ("status", "string", True, "Draft, ready, running, review required, completed, or failed."),
                ],
                ["project_id, status, updated_at DESC", "assignee_id, status"],
                "Keep task execution attempts in agent_runs and code proposals in proposed_changes.",
            ),
            (
                "repository_connections",
                "Connected Git repositories and secured provider references.",
                [("project_id", "projects", "Project associated with this repository.")],
                [
                    ("project_id", "ObjectId", True, "Reference to projects._id."),
                    ("provider", "string", True, "Git hosting provider."),
                    ("repository_url", "string", True, "Repository clone or web URL."),
                    ("default_branch", "string", True, "Configured base branch."),
                    ("credential_secret_ref", "string", False, "Reference to an external secret store; never store credentials in plaintext."),
                ],
                ["unique: project_id, repository_url"],
                "Store only a secret-manager reference, never repository credentials or access tokens.",
            ),
            (
                "agent_runs",
                "AI engineering executions, output summaries, status, timing, and errors.",
                [("task_id", "tasks", "Task executed by the agent."), ("project_id", "projects", "Project scope for the run.")],
                [
                    ("task_id", "ObjectId", True, "Reference to tasks._id."),
                    ("project_id", "ObjectId", True, "Reference to projects._id."),
                    ("status", "string", True, "Queued, running, succeeded, or failed."),
                    ("summary", "string", False, "Validated execution summary."),
                    ("started_at", "date", False, "Execution start time."),
                    ("completed_at", "date", False, "Execution completion time."),
                    ("error", "object", False, "Sanitized execution failure details."),
                ],
                ["project_id, created_at DESC", "task_id, created_at DESC", "status"],
                "Append a document per run to preserve execution history and failure diagnostics.",
            ),
            (
                "proposed_changes",
                "Reviewable code diffs produced by an agent run.",
                [("task_id", "tasks", "Task associated with the proposal."), ("agent_run_id", "agent_runs", "Agent run that produced the proposal.")],
                [
                    ("task_id", "ObjectId", True, "Reference to tasks._id."),
                    ("agent_run_id", "ObjectId", True, "Reference to agent_runs._id."),
                    ("diff", "string", True, "Proposed patch; apply only after authorization and approval."),
                    ("status", "string", True, "Pending review, accepted, or rejected."),
                    ("created_at", "date", True, "Proposal creation time."),
                ],
                ["task_id, created_at DESC", "agent_run_id"],
                "Keep each proposal immutable and separate from the repository until approved.",
            ),
            (
                "reviews",
                "Reviewer decisions and approval history for proposed changes.",
                [("proposed_change_id", "proposed_changes", "Proposal under review."), ("reviewer_id", "users", "User making the decision.")],
                [
                    ("proposed_change_id", "ObjectId", True, "Reference to proposed_changes._id."),
                    ("reviewer_id", "ObjectId", True, "Reference to users._id."),
                    ("decision", "string", True, "Approved or rejected."),
                    ("summary", "string", False, "Review summary."),
                    ("created_at", "date", True, "Decision timestamp."),
                ],
                ["proposed_change_id, created_at DESC", "reviewer_id, created_at DESC"],
                "Append review decisions to retain an auditable approval history.",
            ),
            (
                "review_comments",
                "Discussion comments attached to a proposed change.",
                [("proposed_change_id", "proposed_changes", "Proposal being discussed."), ("author_id", "users", "Comment author.")],
                [
                    ("proposed_change_id", "ObjectId", True, "Reference to proposed_changes._id."),
                    ("author_id", "ObjectId", True, "Reference to users._id."),
                    ("body", "string", True, "Review comment."),
                    ("file_path", "string", False, "Optional file path in the proposal."),
                    ("line_number", "int", False, "Optional line reference."),
                ],
                ["proposed_change_id, created_at ASC"],
                "Keep comments separate to support threaded discussion and pagination.",
            ),
            (
                "notifications",
                "In-app notifications for run completion and review decisions.",
                [("recipient_id", "users", "Notification recipient.")],
                [
                    ("recipient_id", "ObjectId", True, "Reference to users._id."),
                    ("event_type", "string", True, "Run or review event."),
                    ("resource_id", "ObjectId", False, "Related task, run, or proposal identifier."),
                    ("read_at", "date", False, "Time the notification was read."),
                ],
                ["recipient_id, read_at, created_at DESC"],
                "Store notifications separately to support unread counts and pagination.",
            ),
        ]

        collections = []
        relationships = []
        for name, purpose, references, fields, indexes, embedding in definitions:
            foreign_keys = [
                _foreign_key(field_name, target, description)
                for field_name, target, description in references
            ]
            collection_fields = [_field("_id", "ObjectId", True, "MongoDB document primary key.")]
            for field_name, bson_type, required, description in fields:
                collection_fields.append(_field(field_name, bson_type, required, description))
            existing_fields = {field.name for field in collection_fields}
            if "created_at" not in existing_fields:
                collection_fields.append(_field("created_at", "date", True, "Creation timestamp."))
            if "updated_at" not in existing_fields:
                collection_fields.append(_field("updated_at", "date", True, "Last update timestamp."))
            collections.append(
                CollectionDesign(
                    name=name,
                    purpose=purpose,
                    primary_key="_id",
                    foreign_keys=foreign_keys,
                    fields=collection_fields,
                    indexes=indexes,
                    embedding_strategy=embedding,
                )
            )
            for field_name, target, description in references:
                relationships.append(
                    DatabaseRelationship(
                        from_collection=name,
                        to_collection=target,
                        cardinality="many-to-one",
                        description=f"Each {name.replace('_', ' ')} references one {target.replace('_', ' ')} through {field_name}.",
                    )
                )

        return MongoDatabaseDesign(
            project_summary=f"MongoDB document model for {project_name}, covering workspaces, coding tasks, agent runs, and reviewable changes.",
            database_name="softarchitect_ai",
            collections=collections,
            relationships=relationships,
            design_decisions=[
                "Declare _id as the primary key and ObjectId references as logical foreign keys; validate referenced IDs and workspace membership in application services.",
                "Keep agent runs, proposed changes, and review decisions as separate appendable records to preserve history.",
                "Store repository credentials only in a managed secret store and persist a secret reference, never plaintext credentials.",
                "Do not apply generated code to a repository until an authorized reviewer approves the proposal.",
                "Create compound indexes for workspace, project, task status, reviewer, and chronological access patterns.",
            ],
            mermaid_diagram=build_entity_relationship_diagram(collections, relationships),
        )

    if re.search(
        r"\b(repositor(?:y|ies)|agent runs?|proposed (?:code )?changes?|coding tasks?|workspace memberships?|AI software engineer(?:ing)?)\b",
        text,
    ):
        return _design_software_engineering_schema(project_name)
    if any(term in text or term in architecture_modules for term in ("cart", "shopping cart")):
        relationships.append(DatabaseRelationship(from_collection="carts", to_collection="users", cardinality="one-to-one", description="Each active cart belongs to one customer."))

    if any(term in text or term in architecture_modules for term in ("payment", "checkout", "billing", "invoice")):
        add_collection(
            CollectionDesign(
                name="payments",
                purpose="Payment provider references and payment lifecycle; never store card numbers or security codes.",
                foreign_keys=[
                    _foreign_key("order_id", "orders", "Order this payment attempt belongs to."),
                ],
                fields=[
                    _field("_id", "ObjectId", True, "MongoDB document identifier."),
                    _field("order_id", "ObjectId", True, "Reference to orders._id."),
                    _field("provider", "string", True, "Payment provider identifier."),
                    _field("provider_payment_id", "string", False, "Opaque reference returned by the provider."),
                    _field("amount", "decimal", True, "Payment amount as Decimal128."),
                    _field("currency", "string", True, "ISO 4217 currency code."),
                    _field("status", "string", True, "Payment state updated from verified provider responses."),
                    _field("created_at", "date", True, "Creation timestamp."),
                    _field("updated_at", "date", True, "Last update timestamp."),
                ],
                indexes=["order_id", "provider_payment_id", "status, created_at DESC"],
                embedding_strategy="Keep payment lifecycle isolated from order documents; only persist minimal non-sensitive provider references.",
            ),
            [DatabaseRelationship(from_collection="payments", to_collection="orders", cardinality="many-to-one", description="An order can have multiple payment attempts or adjustments.")],
        )

    if any(term in text or term in architecture_modules for term in ("delivery", "driver", "tracking")):
        add_collection(
            CollectionDesign(
                name="deliveries",
                purpose="Driver assignment and delivery status timeline.",
                foreign_keys=[
                    _foreign_key("order_id", "orders", "Order being delivered."),
                    _foreign_key("driver_id", "users", "Assigned driver account, when assigned."),
                ],
                fields=[
                    _field("_id", "ObjectId", True, "MongoDB document identifier."),
                    _field("order_id", "ObjectId", True, "Reference to orders._id."),
                    _field("driver_id", "ObjectId", False, "Reference to users._id for the assigned driver."),
                    _field("status", "string", True, "Validated delivery-state value."),
                    _field("status_history", "array<object>", True, "Bounded status changes with actor and timestamp."),
                    _field("created_at", "date", True, "Creation timestamp."),
                    _field("updated_at", "date", True, "Last update timestamp."),
                ],
                indexes=["order_id", "driver_id, status", "updated_at DESC"],
                embedding_strategy="Embed a bounded status timeline in the delivery; consider a separate event collection if history volume becomes unbounded.",
            ),
            [
                DatabaseRelationship(from_collection="deliveries", to_collection="orders", cardinality="one-to-one", description="A delivery record tracks one order."),
                DatabaseRelationship(from_collection="deliveries", to_collection="users", cardinality="many-to-one", description="A driver can be assigned multiple deliveries."),
            ],
        )

    if any(term in text or term in architecture_modules for term in ("notification", "email", "sms", "alert")):
        add_collection(
            CollectionDesign(
                name="notifications",
                purpose="Queued and delivered customer or operator notifications.",
                foreign_keys=[
                    _foreign_key("recipient_id", "users", "Notification recipient account."),
                ],
                fields=[
                    _field("_id", "ObjectId", True, "MongoDB document identifier."),
                    _field("recipient_id", "ObjectId", True, "Reference to users._id."),
                    _field("event_type", "string", True, "Business event that caused the notification."),
                    _field("channel", "string", True, "Delivery channel such as email or SMS."),
                    _field("status", "string", True, "queued, sent, retrying, or failed."),
                    _field("attempt_count", "int", True, "Number of delivery attempts."),
                    _field("created_at", "date", True, "Creation timestamp."),
                    _field("updated_at", "date", True, "Last update timestamp."),
                ],
                indexes=["recipient_id, created_at DESC", "status, updated_at"],
                embedding_strategy="Store notifications separately for retry processing and recipient history; avoid storing unnecessary message secrets.",
            ),
            [DatabaseRelationship(from_collection="notifications", to_collection="users", cardinality="many-to-one", description="A user may receive multiple notifications.")],
        )

    if any(term in text for term in ("report", "analytics", "audit", "administrator", "admin")):
        add_collection(
            CollectionDesign(
                name="audit_logs",
                purpose="Security-relevant actor and resource changes for audit and troubleshooting.",
                foreign_keys=[
                    _foreign_key("actor_id", "users", "Actor account when the action was performed by a user."),
                ],
                fields=[
                    _field("_id", "ObjectId", True, "MongoDB document identifier."),
                    _field("actor_id", "ObjectId", False, "Authenticated user who performed the action, when applicable."),
                    _field("action", "string", True, "Stable action code."),
                    _field("resource_type", "string", True, "Resource category."),
                    _field("resource_id", "ObjectId", False, "Affected resource identifier."),
                    _field("occurred_at", "date", True, "Event timestamp."),
                    _field("metadata", "object", False, "Allow-listed non-sensitive context; never copy passwords, tokens, or payment data."),
                ],
                indexes=["actor_id, occurred_at DESC", "resource_type, resource_id, occurred_at DESC"],
                embedding_strategy="Use append-only records with retention controls; keep sensitive payloads out of audit metadata.",
            ),
        )

    return MongoDatabaseDesign(
        project_summary=f"MongoDB document model for {project_name}, derived from its functional workflows and generated architecture.",
        database_name="softarchitect_ai",
        collections=collections,
        relationships=relationships,
        design_decisions=[
            "Declare _id as each collection's primary key and use ObjectId fields as logical foreign-key references.",
            "MongoDB does not enforce relational foreign keys automatically; validate referenced IDs and ownership in application services.",
            "Embed bounded value objects and immutable order line-item snapshots; avoid unbounded arrays in long-lived documents.",
            "Store monetary values as Decimal128 with an explicit ISO currency code; never use floating-point arithmetic for money.",
            "Normalize emails and enforce a unique users.email index; create query indexes that align with owner, status, and chronological access patterns.",
            "Never store plaintext passwords, raw payment card data, authentication tokens, or unnecessary personal information.",
            "Apply schema validation, retention policies, and reviewed state transitions before production writes.",
        ],
        mermaid_diagram=build_entity_relationship_diagram(collections, relationships),
    )
