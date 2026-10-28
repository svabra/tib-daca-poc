"""Accept the fourth object role in scoped modeling assignments."""

from alembic import op

revision = "0043_deputy_steward_role"
down_revision = "0042_object_governance"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_data_model_role", "data_model_role_assignments")
    op.create_check_constraint("ck_data_model_role", "data_model_role_assignments",
                               "role IN ('data_owner','deputy_data_owner','data_steward','deputy_data_steward')")


def downgrade():
    # Existing deputy assignments require an explicit migration decision; never
    # silently promote, delete or rewrite a person's current responsibility.
    op.drop_constraint("ck_data_model_role", "data_model_role_assignments")
    op.create_check_constraint("ck_data_model_role", "data_model_role_assignments",
                               "role IN ('data_owner','deputy_data_owner','data_steward')")
