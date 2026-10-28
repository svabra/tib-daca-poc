"""Domain handover preserves office scope and replaces concrete owner assignments."""

import uuid

from sqlalchemy import select

from .models import (
    AdministrativeOrganization,
    CatalogObjectResponsibility,
    FederalPersonMembership,
    IdentityDirectoryEntry,
    utc_now,
)
from .object_governance import OWNER_ROLES


def domain_organization_ids(session, domain):
    explicit = set(session.scalars(select(CatalogObjectResponsibility.organization_id).where(
        CatalogObjectResponsibility.domain_id == domain.id,
        CatalogObjectResponsibility.active.is_(True),
        CatalogObjectResponsibility.organization_id.is_not(None),
    )))
    if explicit:
        return explicit
    if session.scalar(select(CatalogObjectResponsibility.id).where(
        CatalogObjectResponsibility.domain_id == domain.id,
        CatalogObjectResponsibility.active.is_(True),
        CatalogObjectResponsibility.provenance == "domain-handover",
    ).limit(1)):
        return set()
    today = utc_now().date()
    history = list(session.scalars(select(FederalPersonMembership).where(
        FederalPersonMembership.user_id == domain.owner_user_id,
        FederalPersonMembership.is_primary.is_(True),
    )))
    if history:
        return {row.organization_id for row in history if row.valid_from <= today and (row.valid_to is None or row.valid_to >= today)}
    directory = session.get(IdentityDirectoryEntry, domain.owner_user_id)
    if directory and directory.active and directory.source == "federal" and directory.organization_id:
        return {directory.organization_id}
    return set()


def replace_domain_owners(session, domain, organization_ids):
    """Revoke former owner rows; retain stewardship and the object's office binding."""
    for row in session.scalars(select(CatalogObjectResponsibility).where(
        CatalogObjectResponsibility.domain_id == domain.id,
        CatalogObjectResponsibility.role.in_(OWNER_ROLES),
        CatalogObjectResponsibility.active.is_(True),
    ).with_for_update()):
        row.active = False
    scopes = organization_ids or {None}
    for role, person in (("data_owner", domain.owner_user_id), ("deputy_data_owner", domain.deputy_owner_user_id)):
        for organization in scopes:
            session.add(CatalogObjectResponsibility(id=uuid.uuid4(), domain_id=domain.id,
                user_id=person, role=role, organization_id=organization,
                active=True, provenance="domain-handover"))


def active_scope_organizations(session, organization_ids):
    today = utc_now().date()
    return list(session.scalars(select(AdministrativeOrganization).where(
        AdministrativeOrganization.id.in_(organization_ids), AdministrativeOrganization.active.is_(True),
        (AdministrativeOrganization.valid_from.is_(None)) | (AdministrativeOrganization.valid_from <= today),
        (AdministrativeOrganization.valid_to.is_(None)) | (AdministrativeOrganization.valid_to >= today),
    )))


def reroute_domain_work(session, domain, actor):
    """Only domain-governed creation/model reviews follow a domain handover."""
    from .models import (
        AuditEvent,
        Domain,
        GlossaryTermProposal,
        GlossaryTermProposalReview,
        LogicalModelReview,
        WorkflowTask,
    )
    from .object_governance import active_actor

    reviews = list(session.scalars(select(GlossaryTermProposalReview).join(GlossaryTermProposal).where(
        GlossaryTermProposalReview.domain_id == domain.id,
        GlossaryTermProposalReview.status == "pending",
        GlossaryTermProposal.operation == "create",
        GlossaryTermProposal.status.in_(("submitted", "in_review")),
    )))
    for review in reviews:
        review.owner_user_id = domain.owner_user_id
        review.updated_at = utc_now()
        session.add(AuditEvent(id=uuid.uuid4(), resource_type="glossary-term-proposal",
            resource_id=str(review.proposal_id), action="review-owner-reassigned", actor=actor or "system",
            revision=review.proposal_revision, details={"domainId": str(domain.id), "ownerUserId": domain.owner_user_id}))
    for proposal_id in {review.proposal_id for review in reviews}:
        proposal = session.get(GlossaryTermProposal, proposal_id)
        desired = set()
        for review in session.scalars(select(GlossaryTermProposalReview).where(
            GlossaryTermProposalReview.proposal_id == proposal_id, GlossaryTermProposalReview.status == "pending",
        )):
            target = session.get(Domain, review.domain_id)
            if target and target.lifecycle == "active":
                desired.update((kind, person) for kind, person in (
                    ("glossary_term_review", target.owner_user_id),
                    ("glossary_term_collaboration", target.deputy_owner_user_id),
                ) if active_actor(session, person))
        kept = set()
        for task in session.scalars(select(WorkflowTask).where(
            WorkflowTask.glossary_term_proposal_id == proposal_id,
            WorkflowTask.task_type.in_(("glossary_term_review", "glossary_term_collaboration")),
            WorkflowTask.status != "completed",
        )):
            key = task.task_type, task.assignee_user_id
            if key in desired and key not in kept:
                kept.add(key)
            else:
                task.status, task.completed_at, task.updated_at = "completed", utc_now(), utc_now()
        for kind, person in desired - kept:
            session.add(WorkflowTask(id=uuid.uuid4(), task_type=kind, task_kind="action", status="open",
                assignee_user_id=person, glossary_term_proposal_id=proposal_id, data_product_id=proposal.source_product_id,
                title=f"Review glossary proposal {proposal.request_number}", detail="Current domain responsibility after handover."))

    for review in session.scalars(select(LogicalModelReview).where(
        LogicalModelReview.domain_id == domain.id, LogicalModelReview.status == "pending",
    )):
        assignee = domain.owner_user_id if domain.owner_user_id != review.submitter_user_id else domain.deputy_owner_user_id
        tasks = list(session.scalars(select(WorkflowTask).where(
            WorkflowTask.logical_model_review_id == review.id, WorkflowTask.task_type == "logical_model_review",
            WorkflowTask.status != "completed",
        )))
        for task in tasks:
            task.assignee_user_id, task.updated_at = assignee, utc_now()
