from __future__ import annotations

import uuid

import pytest
from daca_catalog.models import (
    Base,
    DataProduct,
    DataProductDomain,
    DataProductGlossaryTerm,
    DemoUser,
    Domain,
    DomainChangeRequest,
    DomainLocalization,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermProposal,
    GlossaryTermProposalReview,
    GlossaryTermRelation,
    WorkflowTask,
)
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


@pytest.fixture
def model_engine():
    engine = create_engine("sqlite+pysqlite://")
    event.listen(engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


def add_users_and_product(session: Session) -> tuple[DemoUser, DemoUser, DataProduct]:
    owner = DemoUser(
        id="domain-owner",
        display_name="Domain Owner",
        organization="VBS",
        email="owner@example.invalid",
        roles=["data_owner", "domain_register_owner"],
    )
    deputy = DemoUser(
        id="domain-deputy",
        display_name="Domain Deputy",
        organization="BAZG",
        email="deputy@example.invalid",
        roles=["data_owner"],
    )
    product = DataProduct(
        id=uuid.uuid4(),
        urn="urn:daca:product:test-vehicle",
        origin_catalog="urn:daca:catalog:test",
        revision=1,
        owner_user_id=owner.id,
        deputy_owner_user_id=deputy.id,
        title="Flottenbestand gepanzerte Fahrzeuge",
        description="Synthetischer Fahrzeugbestand.",
        owner="Domain Owner",
        domain="Verteidigung",
        lifecycle="draft",
        classification="internal",
        keywords=["Fahrzeug"],
        contact={},
        quality={},
    )
    session.add_all([owner, deputy])
    session.flush()
    session.add(product)
    session.flush()
    return owner, deputy, product


def test_domain_glossary_assignments_and_reviews_persist(model_engine) -> None:
    with Session(model_engine) as session:
        owner, deputy, product = add_users_and_product(session)
        domain = Domain(
            id=uuid.uuid4(),
            urn="urn:daca:domain:defence",
            origin_catalog_id="urn:daca:catalog:test",
            revision=1,
            content_hash="d" * 64,
            lifecycle="active",
            owner_user_id=owner.id,
            deputy_owner_user_id=deputy.id,
            localizations=[
                DomainLocalization(
                    language="de-CH",
                    preferred_label="Verteidigung",
                    definition="Fachdomäne, keine Organisation.",
                    normalized_label="verteidigung",
                )
            ],
        )
        term = GlossaryTerm(
            id=uuid.uuid4(),
            urn="urn:daca:glossary-term:armored-vehicle",
            origin_catalog_id="urn:daca:catalog:test",
            revision=1,
            content_hash="e" * 64,
            lifecycle="active",
            localizations=[
                GlossaryTermLocalization(
                    language="de-CH",
                    preferred_label="Gepanzertes Fahrzeug",
                    alternative_labels=["Panzerfahrzeug"],
                    definition="Ein gegen Beschuss geschütztes Fahrzeug.",
                    normalized_label="gepanzertes fahrzeug",
                ),
                GlossaryTermLocalization(
                    language="en",
                    preferred_label="Armored Vehicle",
                    alternative_labels=["Armoured Vehicle"],
                    definition="A vehicle protected against weapons.",
                    normalized_label="armored vehicle",
                ),
            ],
        )
        session.add_all([domain, term])
        session.flush()
        session.add_all(
            [
                DataProductDomain(
                    data_product_id=product.id,
                    domain_id=domain.id,
                    position=0,
                    assigned_by_user_id=owner.id,
                ),
                GlossaryTermDomain(term_id=term.id, domain_id=domain.id),
                DataProductGlossaryTerm(
                    data_product_id=product.id,
                    glossary_term_id=term.id,
                    assigned_by_user_id=owner.id,
                ),
                GlossaryTermRelation(
                    id=uuid.uuid4(),
                    source_term_id=term.id,
                    target_uri="https://example.invalid/vehicle",
                    relation="closeMatch",
                ),
            ]
        )

        domain_request = DomainChangeRequest(
            id=uuid.uuid4(),
            request_number="DOM-0001",
            operation="update",
            target_domain_id=domain.id,
            base_revision=1,
            requester_user_id=deputy.id,
            requested_payload={"labels": {"de-CH": "Verteidigung"}},
            review_payload={"labels": {"de-CH": "Verteidigung & Sicherheit"}},
        )
        approved_create_request = DomainChangeRequest(
            id=uuid.uuid4(),
            request_number="DOM-0002",
            operation="create",
            target_domain_id=domain.id,
            base_revision=None,
            requester_user_id=deputy.id,
            status="approved",
            requested_payload={"labels": {"de-CH": "Verteidigung"}},
            review_payload={"labels": {"de-CH": "Verteidigung"}},
            reviewer_user_id=owner.id,
        )
        proposal = GlossaryTermProposal(
            id=uuid.uuid4(),
            request_number="TERM-0001",
            operation="create",
            requester_user_id=owner.id,
            source_product_id=product.id,
            source_product_revision=1,
            auto_attach=True,
            status="in_review",
            requested_payload={"domainIds": [str(domain.id)]},
            review_payload={"labels": {"de-CH": "Gepanzertes Fahrzeug"}},
            revision=2,
            reviews=[
                GlossaryTermProposalReview(
                    domain_id=domain.id,
                    proposal_revision=2,
                    owner_user_id=owner.id,
                )
            ],
        )
        session.add_all([domain_request, approved_create_request, proposal])
        session.flush()
        session.add(
            WorkflowTask(
                id=uuid.uuid4(),
                task_type="glossary_term_review",
                task_kind="action",
                assignee_user_id=owner.id,
                data_product_id=product.id,
                glossary_term_proposal_id=proposal.id,
                title="Glossarterm prüfen",
                detail="Prüfung für die Domain Verteidigung.",
            )
        )
        session.commit()

        stored = session.scalar(select(Domain).where(Domain.id == domain.id))
        assert stored is not None
        assert stored.localizations[0].preferred_label == "Verteidigung"
        assert stored.product_assignments[0].data_product_id == product.id
        assert stored.term_assignments[0].term.localizations[1].preferred_label == "Armored Vehicle"
        assert proposal.reviews[0].proposal_revision == proposal.revision
        assert term.outgoing_relations[0].relation == "closeMatch"

        proposal.status = "accepted"
        proposal.target_term_id = term.id
        session.commit()
        assert proposal.target_term_id == term.id


def test_domain_owner_and_deputy_must_be_distinct(model_engine) -> None:
    with Session(model_engine) as session:
        owner, _, _ = add_users_and_product(session)
        session.add(
            Domain(
                id=uuid.uuid4(),
                urn="urn:daca:domain:invalid",
                origin_catalog_id="urn:daca:catalog:test",
                revision=1,
                content_hash="f" * 64,
                lifecycle="active",
                owner_user_id=owner.id,
                deputy_owner_user_id=owner.id,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_auto_attach_requires_a_source_product(model_engine) -> None:
    with Session(model_engine) as session:
        owner, _, _ = add_users_and_product(session)
        session.add(
            GlossaryTermProposal(
                id=uuid.uuid4(),
                request_number="TERM-INVALID",
                operation="create",
                requester_user_id=owner.id,
                auto_attach=True,
                requested_payload={},
                review_payload={},
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
