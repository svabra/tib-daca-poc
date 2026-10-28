"""Replace the global register role with explicit object ownership."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.orm import Session

revision = "0042_object_governance"
down_revision = "0041_semantic_graph_visibility"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "catalog_object_responsibilities", sa.Column("glossary_term_id", sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        "fk_catalog_object_responsibility_term",
        "catalog_object_responsibilities",
        "glossary_terms",
        ["glossary_term_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_catalog_object_responsibility_term",
        "catalog_object_responsibilities",
        ["glossary_term_id"],
    )
    op.drop_constraint("ck_catalog_object_responsibility_role", "catalog_object_responsibilities")
    op.create_check_constraint(
        "ck_catalog_object_responsibility_role",
        "catalog_object_responsibilities",
        "role IN ('data_owner','deputy_data_owner','data_steward','deputy_data_steward')",
    )
    op.drop_constraint("ck_catalog_object_responsibility_target", "catalog_object_responsibilities")
    op.create_check_constraint(
        "ck_catalog_object_responsibility_target",
        "catalog_object_responsibilities",
        "(CASE WHEN domain_id IS NULL THEN 0 ELSE 1 END + CASE WHEN glossary_term_id IS NULL THEN 0 ELSE 1 END + CASE WHEN logical_model_id IS NULL THEN 0 ELSE 1 END + CASE WHEN physical_source_id IS NULL THEN 0 ELSE 1 END + CASE WHEN data_product_id IS NULL THEN 0 ELSE 1 END) = 1",
    )
    from daca_catalog.role_change_sql import CAPTURE_FUNCTION_SQL

    op.execute(CAPTURE_FUNCTION_SQL)
    from daca_catalog.modeling_service import record_audit
    from daca_catalog.models import (
        DemoUser,
        Domain,
        DomainChangeRequest,
        GlossaryTerm,
        WorkflowTask,
    )
    from daca_catalog.object_governance import ensure_term_owners

    with Session(bind=op.get_bind()) as session:
        for user in session.scalars(sa.select(DemoUser)):
            if "domain_register_owner" in (user.roles or []):
                user.roles = [role for role in user.roles if role != "domain_register_owner"]
                record_audit(
                    session, "identity", user.id, "legacy-register-role-removed", "migration", None
                )
        for identity in session.scalars(sa.select(GlossaryTerm.id)):
            ensure_term_owners(session, identity)
        for change in session.scalars(
            sa.select(DomainChangeRequest).where(DomainChangeRequest.status == "submitted")
        ):
            domain = (
                session.get(Domain, change.target_domain_id) if change.target_domain_id else None
            )
            owner = domain.owner_user_id if domain else change.review_payload.get("ownerUserId")
            deputy = (
                domain.deputy_owner_user_id
                if domain
                else change.review_payload.get("deputyOwnerUserId")
            )
            eligible = [
                identity
                for identity in (owner, deputy)
                if identity
                and identity != change.requester_user_id
                and (session.get(DemoUser, identity) and session.get(DemoUser, identity).active)
            ]
            for task in session.scalars(
                sa.select(WorkflowTask).where(
                    WorkflowTask.domain_change_request_id == change.id,
                    WorkflowTask.task_type == "domain_change_review",
                    WorkflowTask.status != "completed",
                )
            ):
                if eligible:
                    task.assignee_user_id = eligible[0]
            record_audit(
                session,
                "domain-change-request",
                change.id,
                "review-routed-to-object-owners",
                "migration",
                change.revision,
                {"reviewers": eligible},
            )
        session.flush()


def downgrade():
    # Removing explicit term ownership would silently discard governance evidence.
    raise RuntimeError(
        "Object governance has no destructive automatic downgrade; restore a reviewed backup instead."
    )
