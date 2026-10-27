"""Align assistance origin evidence with the public model-write contract."""

from alembic import op

revision = "0038_model_assistance_origins"
down_revision = "0037_physical_source_access"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(
        "ck_model_assistance_origin", "logical_model_assistance_provenance", type_="check"
    )
    op.create_check_constraint(
        "ck_model_assistance_origin",
        "logical_model_assistance_provenance",
        "origin IN ('machine', 'accepted', 'machine_translated', 'accepted_suggestion', 'edited', 'source_import')",
    )


def downgrade():
    # PostgreSQL validates the old constraint before committing the transaction.
    # Rollback is refused if modern evidence exists; never rewrite provenance.
    op.drop_constraint(
        "ck_model_assistance_origin", "logical_model_assistance_provenance", type_="check"
    )
    op.create_check_constraint(
        "ck_model_assistance_origin",
        "logical_model_assistance_provenance",
        "origin IN ('machine', 'edited', 'accepted')",
    )
