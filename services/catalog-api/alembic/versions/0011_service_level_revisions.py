"""Add product control persons and versioned service-level agreements.

Revision ID: 0011_service_level_revisions
Revises: 0010_request_policy_binding
Create Date: 2026-08-19
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_service_level_revisions"
down_revision: str | None = "0010_request_policy_binding"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _roles(value: object) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return []
        if isinstance(decoded, list):
            return [item for item in decoded if isinstance(item, str)]
    return []


def _backfill_control_people() -> None:
    bind = op.get_bind()
    users = sa.table(
        "demo_users",
        sa.column("id", sa.String()),
        sa.column("roles", sa.JSON()),
        sa.column("supervisor_user_id", sa.String()),
        sa.column("active", sa.Boolean()),
    )
    products = sa.table(
        "data_products",
        sa.column("id", sa.Uuid()),
        sa.column("owner_user_id", sa.String()),
        sa.column("control_person_user_id", sa.String()),
    )

    rows = bind.execute(
        sa.select(
            users.c.id,
            users.c.roles,
            users.c.supervisor_user_id,
            users.c.active,
        ).order_by(users.c.id)
    ).mappings()
    user_by_id = {row["id"]: row for row in rows}
    active_approvers = sorted(
        user_id
        for user_id, row in user_by_id.items()
        if row["active"] and "publication_approver" in _roles(row["roles"])
    )
    thomas = user_by_id.get("thomas.kriegli")
    fallback = (
        "thomas.kriegli"
        if thomas is not None
        and thomas["active"]
        and "publication_approver" in _roles(thomas["roles"])
        else (active_approvers[0] if active_approvers else None)
    )

    for product in bind.execute(
        sa.select(products.c.id, products.c.owner_user_id)
    ).mappings():
        owner = user_by_id.get(product["owner_user_id"])
        supervisor_id = owner["supervisor_user_id"] if owner is not None else None
        supervisor = user_by_id.get(supervisor_id)
        control_person_id = (
            supervisor_id
            if supervisor_id
            and supervisor is not None
            and supervisor["active"]
            and "publication_approver" in _roles(supervisor["roles"])
            and supervisor_id != product["owner_user_id"]
            else fallback
        )
        if control_person_id is None or control_person_id == product["owner_user_id"]:
            control_person_id = next(
                (
                    candidate
                    for candidate in active_approvers
                    if candidate != product["owner_user_id"]
                ),
                None,
            )
        if control_person_id is not None:
            bind.execute(
                products.update()
                .where(products.c.id == product["id"])
                .values(control_person_user_id=control_person_id)
            )


def upgrade() -> None:
    with op.batch_alter_table("data_products") as batch:
        batch.add_column(sa.Column("control_person_user_id", sa.String(200)))
        batch.create_foreign_key(
            "fk_data_product_control_person",
            "demo_users",
            ["control_person_user_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "service_level_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("lock_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date()),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("created_by_owner_user_id", sa.String(200), nullable=False),
        sa.Column("updated_by_owner_user_id", sa.String(200), nullable=False),
        sa.Column("control_person_user_id", sa.String(200)),
        sa.Column("control_person_snapshot", sa.JSON(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.Column("product_revision_at_submission", sa.Integer()),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("decision", sa.String(16)),
        sa.Column("decided_by_user_id", sa.String(200)),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("rejection_reason", sa.Text()),
        sa.Column("supersedes_revision_id", sa.Uuid()),
        sa.Column("superseded_by_revision_id", sa.Uuid()),
        sa.Column("superseded_from", sa.Date()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'pending_approval', 'published', 'rejected', 'withdrawn')",
            name="ck_service_level_status",
        ),
        sa.CheckConstraint(
            "valid_until IS NULL OR valid_until >= valid_from",
            name="ck_service_level_validity",
        ),
        sa.CheckConstraint(
            "control_person_user_id IS NULL OR control_person_user_id <> created_by_owner_user_id",
            name="ck_service_level_four_eyes",
        ),
        sa.CheckConstraint(
            "decision IS NULL OR decision IN ('approve', 'reject')",
            name="ck_service_level_decision",
        ),
        sa.ForeignKeyConstraint(
            ["data_product_id"], ["data_products.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_owner_user_id"], ["demo_users.id"]
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_owner_user_id"], ["demo_users.id"]
        ),
        sa.ForeignKeyConstraint(
            ["control_person_user_id"], ["demo_users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["demo_users.id"]),
        sa.ForeignKeyConstraint(
            ["supersedes_revision_id"],
            ["service_level_revisions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["superseded_by_revision_id"],
            ["service_level_revisions.id"],
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "data_product_id", "revision", name="uq_service_level_product_revision"
        ),
    )
    op.create_index(
        "ix_service_level_product",
        "service_level_revisions",
        ["data_product_id", "revision"],
    )
    op.create_index(
        "uq_service_level_single_open_workflow",
        "service_level_revisions",
        ["data_product_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('draft', 'pending_approval')"),
        sqlite_where=sa.text("status IN ('draft', 'pending_approval')"),
    )
    op.create_index(
        "ix_service_level_controller",
        "service_level_revisions",
        ["control_person_user_id", "status"],
    )

    with op.batch_alter_table("workflow_tasks") as batch:
        batch.add_column(sa.Column("service_level_revision_id", sa.Uuid()))
        batch.create_foreign_key(
            "fk_workflow_task_service_level_revision",
            "service_level_revisions",
            ["service_level_revision_id"],
            ["id"],
            ondelete="CASCADE",
        )

    _backfill_control_people()


def downgrade() -> None:
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.drop_constraint(
            "fk_workflow_task_service_level_revision", type_="foreignkey"
        )
        batch.drop_column("service_level_revision_id")
    op.drop_index("ix_service_level_controller", table_name="service_level_revisions")
    op.drop_index(
        "uq_service_level_single_open_workflow",
        table_name="service_level_revisions",
    )
    op.drop_index("ix_service_level_product", table_name="service_level_revisions")
    op.drop_table("service_level_revisions")
    with op.batch_alter_table("data_products") as batch:
        batch.drop_constraint("fk_data_product_control_person", type_="foreignkey")
        batch.drop_column("control_person_user_id")
