"""Add append-only PoC simulation events and durable provenance URNs.

Revision ID: 0004_poc_simulation_events
Revises: 0003_daaif_workflow
Create Date: 2026-08-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_poc_simulation_events"
down_revision: str | None = "0003_daaif_workflow"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def upgrade() -> None:
    op.add_column("provenance_events", sa.Column("product_urn", sa.String(255)))
    op.execute(
        "UPDATE provenance_events SET product_urn = "
        "(SELECT urn FROM data_products WHERE data_products.id = provenance_events.data_product_id)"
    )
    with op.batch_alter_table(
        "provenance_events",
        recreate="always",
        naming_convention=NAMING_CONVENTION,
    ) as batch:
        batch.alter_column("product_urn", existing_type=sa.String(255), nullable=False)
        batch.alter_column("data_product_id", existing_type=sa.Uuid(), nullable=True)
        batch.drop_constraint(
            "fk_provenance_events_data_product_id_data_products",
            type_="foreignkey",
        )
        batch.create_foreign_key(
            "fk_provenance_events_data_product_id_data_products",
            "data_products",
            ["data_product_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "poc_simulation_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("operation", sa.String(32), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("product_urn", sa.String(255), nullable=False),
        sa.Column("fixture_id", sa.String(200)),
        sa.Column("actor_user_id", sa.String(200), nullable=False),
        sa.Column("trigger_event_id", sa.Uuid()),
        sa.Column("confirmation_name", sa.String(255)),
        sa.Column("before_state", sa.JSON(), nullable=False),
        sa.Column("after_state", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "event_type IN ('product_submitted', 'quality_below_threshold', "
            "'not_discoverable', 'isbo_restricted')",
            name="ck_poc_simulation_event_type",
        ),
        sa.CheckConstraint(
            "operation IN ('trigger', 'reset', 'product_reset')",
            name="ck_poc_simulation_operation",
        ),
        sa.ForeignKeyConstraint(
            ["trigger_event_id"],
            ["poc_simulation_events.id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("trigger_event_id", "operation", name="uq_poc_simulation_reset"),
    )
    op.create_index(
        "ix_poc_simulation_product",
        "poc_simulation_events",
        ["product_id", "created_at"],
    )
    op.create_index(
        "ix_poc_simulation_actor",
        "poc_simulation_events",
        ["actor_user_id", "created_at"],
    )
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.add_column(sa.Column("simulation_event_id", sa.Uuid()))
        batch.create_foreign_key(
            "fk_workflow_task_simulation_event",
            "poc_simulation_events",
            ["simulation_event_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.drop_constraint("fk_workflow_task_simulation_event", type_="foreignkey")
        batch.drop_column("simulation_event_id")
    op.drop_index("ix_poc_simulation_actor", table_name="poc_simulation_events")
    op.drop_index("ix_poc_simulation_product", table_name="poc_simulation_events")
    op.drop_table("poc_simulation_events")
    with op.batch_alter_table(
        "provenance_events",
        recreate="always",
        naming_convention=NAMING_CONVENTION,
    ) as batch:
        batch.drop_constraint(
            "fk_provenance_events_data_product_id_data_products",
            type_="foreignkey",
        )
        batch.create_foreign_key(
            "fk_provenance_events_data_product_id_data_products",
            "data_products",
            ["data_product_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.alter_column("data_product_id", existing_type=sa.Uuid(), nullable=False)
        batch.drop_column("product_urn")
