"""Persist personal catalog language and appearance preferences.

Revision ID: 0025_user_preferences
Revises: 0024_model_identifier
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_user_preferences"
down_revision: str | None = "0024_model_identifier"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("demo_users") as batch:
        batch.add_column(sa.Column("preferences", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    with op.batch_alter_table("demo_users") as batch:
        batch.drop_column("preferences")
