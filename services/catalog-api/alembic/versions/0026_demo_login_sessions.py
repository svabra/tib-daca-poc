"""Store revocable local preview sessions without tenant scope.

Revision ID: 0026_demo_sessions
Revises: 0025_user_preferences
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026_demo_sessions"
down_revision: str | None = "0025_user_preferences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "demo_login_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(200), sa.ForeignKey("demo_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_demo_login_sessions_user_id", "demo_login_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_demo_login_sessions_user_id", table_name="demo_login_sessions")
    op.drop_table("demo_login_sessions")
