"""Separate hidden and additional canvas references from governed assignments."""

import sqlalchemy as sa
from alembic import op

revision = "0041_semantic_graph_visibility"
down_revision = "0040_semantic_graph_states"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("hidden_node_ids", "additional_node_ids"):
        op.add_column("semantic_graph_states", sa.Column(name, sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
        op.alter_column("semantic_graph_states", name, server_default=None)


def downgrade():
    op.drop_column("semantic_graph_states", "additional_node_ids")
    op.drop_column("semantic_graph_states", "hidden_node_ids")
