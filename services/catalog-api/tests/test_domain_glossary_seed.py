from daca_catalog.domain_glossary_seed import (
    ARMOURED_VEHICLE_PROPOSAL_ID,
    DEFENCE_DOMAIN_ID,
    MOBILITY_DOMAIN_ID,
    VEHICLE_PRODUCT_ID,
    seed_domain_glossary_reference_data,
)
from daca_catalog.models import (
    DataProduct,
    DataProductDomain,
    DemoUser,
    Domain,
    DomainChangeRequest,
    GlossaryTermProposal,
    GlossaryTermProposalReview,
    WorkflowTask,
)
from sqlalchemy import select


def test_domain_glossary_reference_seed_is_graph_ready_and_idempotent(session_factory):
    with session_factory() as session:
        sibilla = session.get(DemoUser, "sibilla.micheli")
        assert sibilla is not None
        assert sibilla.organization == "VBS"
        assert {"data_owner", "domain_register_owner"}.issubset(sibilla.roles)

        defence = session.get(Domain, DEFENCE_DOMAIN_ID)
        mobility = session.get(Domain, MOBILITY_DOMAIN_ID)
        assert defence is not None and mobility is not None
        assert defence.owner_user_id == "sibilla.micheli"
        assert defence.deputy_owner_user_id == "sandro.wenger"
        assert defence.urn.startswith("urn:daca:domain:")
        assert len(defence.content_hash) == 64
        assert {label.language for label in defence.localizations} == {"de", "en"}

        product = session.get(DataProduct, VEHICLE_PRODUCT_ID)
        assert product is not None
        assert product.owner_user_id == "sandro.wenger"
        assert session.get(
            DataProductDomain,
            {"data_product_id": product.id, "domain_id": mobility.id},
        ) is not None
        assert session.get(
            DataProductDomain,
            {"data_product_id": product.id, "domain_id": defence.id},
        ) is None

        proposal = session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID)
        assert proposal is not None
        assert proposal.auto_attach is True
        assert proposal.source_product_id == product.id
        reviews = list(
            session.scalars(
                select(GlossaryTermProposalReview).where(
                    GlossaryTermProposalReview.proposal_id == proposal.id
                )
            )
        )
        assert {review.domain_id for review in reviews} == {defence.id, mobility.id}
        assert {review.owner_user_id for review in reviews} == {
            "sibilla.micheli",
            "kassandra.valdata",
        }
        assert session.scalar(
            select(WorkflowTask).where(
                WorkflowTask.glossary_term_proposal_id == proposal.id,
                WorkflowTask.task_type == "glossary_term_review",
                WorkflowTask.assignee_user_id == "sibilla.micheli",
            )
        ) is not None
        assert session.scalar(
            select(DomainChangeRequest).where(
                DomainChangeRequest.request_number == "DOM-2026-0001"
            )
        ) is not None

        assert seed_domain_glossary_reference_data(session) is False
