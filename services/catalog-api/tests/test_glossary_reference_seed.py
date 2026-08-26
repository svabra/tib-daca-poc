import copy
import uuid
from datetime import UTC, datetime

import pytest
from daca_catalog.domain_glossary_seed import (
    ARMOURED_VEHICLE_PROPOSAL_ID,
    DEFENCE_DOMAIN_ID,
    MOBILITY_DOMAIN_ID,
    ORIGIN_CATALOG_ID,
    VEHICLE_PRODUCT_ID,
    canonical_hash,
)
from daca_catalog.glossary_reference_seed import (
    _PREVIOUS_REFERENCE_CONTENT_HASHES,
    GLOSSARY_REFERENCE_SEED_NAME,
    INTERMEDIATE_GLOSSARY_REFERENCE_SEED_NAME,
    PREVIOUS_GLOSSARY_REFERENCE_SEED_NAME,
    REFERENCE_TERM_SPECS,
    _is_pristine_v2_reference_term,
    _legacy_armoured_vehicle_payload,
    _payload,
    _payload_signature,
    _previous_armoured_vehicle_reference_payload,
    _stored_term_payload,
    reference_term_id,
    seed_glossary_reference_terms,
)
from daca_catalog.main import _remove_vehicle_term_proposals
from daca_catalog.models import (
    AuditEvent,
    DataProduct,
    DataProductGlossaryTerm,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermProposal,
    GlossaryTermProposalReview,
    GlossaryTermRelation,
    SeedMarker,
)
from rdflib import Graph, Literal, URIRef
from rdflib.namespace import SKOS
from sqlalchemy import delete, func, select


def test_reference_glossary_seed_is_curated_graph_ready_and_idempotent(session_factory):
    with session_factory() as session:
        assert session.get(SeedMarker, GLOSSARY_REFERENCE_SEED_NAME) is not None

        assert len(REFERENCE_TERM_SPECS) == 38
        assert sum("verteidigung" in spec.domain_slugs for spec in REFERENCE_TERM_SPECS) == 20
        assert (
            sum(
                len(localization.alternative_labels)
                for spec in REFERENCE_TERM_SPECS
                for localization in spec.localizations
            )
            >= 70
        )
        assert all(spec.source_urls for spec in REFERENCE_TERM_SPECS)
        assert all(
            source.startswith("https://")
            for spec in REFERENCE_TERM_SPECS
            for source in spec.source_urls
        )
        c2 = next(spec for spec in REFERENCE_TERM_SPECS if spec.slug == "command-and-control")
        iamd = next(spec for spec in REFERENCE_TERM_SPECS if spec.slug == "nato-iamd")
        assert any("AAP-06_260114_AF.pdf" in source for source in c2.source_urls)
        assert c2.localizations[1].definition == (
            "Authority, responsibilities and activities through which military commanders "
            "direct and coordinate military forces and implement orders for the execution "
            "of operations."
        )
        assert any("nato.int" in source for source in iamd.source_urls)
        assert "IAMD" in iamd.localizations[1].alternative_labels
        radspz = next(spec for spec in REFERENCE_TERM_SPECS if spec.slug == "radschuetzenpanzer-93")
        assert "PIRANHA II 8×8" in radspz.localizations[0].definition
        assert all("6×6" not in item.definition for item in radspz.localizations)
        assert radspz.localizations[1].preferred_label == "Piranha armoured personnel carrier 93"

        term_count = session.scalar(select(func.count()).select_from(GlossaryTerm))
        assert term_count is not None and term_count >= len(REFERENCE_TERM_SPECS)
        for spec in REFERENCE_TERM_SPECS:
            term = session.get(GlossaryTerm, reference_term_id(spec.slug))
            assert term is not None
            assert term.content_hash == canonical_hash(
                {
                    "urn": term.urn,
                    "lifecycle": term.lifecycle,
                    "payload": _stored_term_payload(session, term),
                }
            ), spec.slug

        armoured_id = reference_term_id("gepanzertes-fahrzeug")
        german = session.get(
            GlossaryTermLocalization,
            {"term_id": armoured_id, "language": "de"},
        )
        english = session.get(
            GlossaryTermLocalization,
            {"term_id": armoured_id, "language": "en"},
        )
        assert german is not None and english is not None
        assert german.preferred_label == "Gepanzertes Fahrzeug"
        assert "GepFz" in german.alternative_labels
        assert english.preferred_label == "Armoured vehicle"
        assert "Armored vehicle" in english.alternative_labels
        assert (
            session.scalar(
                select(func.count())
                .select_from(GlossaryTermDomain)
                .where(GlossaryTermDomain.term_id == armoured_id)
            )
            == 2
        )

        vat_label = session.get(
            GlossaryTermLocalization,
            {"term_id": reference_term_id("mehrwertsteuer"), "language": "de"},
        )
        assert vat_label is not None and "MWST" in vat_label.alternative_labels

        m109_relation = session.scalar(
            select(GlossaryTermRelation).where(
                GlossaryTermRelation.source_term_id
                == reference_term_id("panzerhaubitze-m109-kawest"),
                GlossaryTermRelation.target_term_id == reference_term_id("panzerhaubitze"),
                GlossaryTermRelation.relation == "broader",
            )
        )
        assert m109_relation is not None
        inverse = session.scalar(
            select(GlossaryTermRelation).where(
                GlossaryTermRelation.source_term_id == reference_term_id("panzerhaubitze"),
                GlossaryTermRelation.target_term_id
                == reference_term_id("panzerhaubitze-m109-kawest"),
                GlossaryTermRelation.relation == "narrower",
            )
        )
        assert inverse is not None

        proposal = session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID)
        assert proposal is not None
        assert proposal.operation == "update"
        assert proposal.target_term_id == armoured_id
        assert proposal.status == "in_review"
        assert proposal.revision == 2
        assert proposal.requested_payload == _legacy_armoured_vehicle_payload()
        assert "GepFz" in proposal.review_payload["localizations"][0]["alternativeLabels"]
        reviews = list(
            session.scalars(
                select(GlossaryTermProposalReview).where(
                    GlossaryTermProposalReview.proposal_id == proposal.id
                )
            )
        )
        assert reviews and all(
            review.status == "pending" and review.proposal_revision == 2 for review in reviews
        )
        proposal_audit = session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_type == "glossary-term-proposal",
                AuditEvent.resource_id == str(proposal.id),
                AuditEvent.action == "reference-seed-aligned",
            )
        )
        assert proposal_audit is not None
        assert proposal_audit.revision == proposal.revision
        assert proposal_audit.details["previousRevision"] == 1
        assert seed_glossary_reference_terms(session) is False


def test_v4_upgrades_an_untouched_v3_c2_definition(session_factory):
    with session_factory() as session:
        term_id = reference_term_id("command-and-control")
        term = session.get(GlossaryTerm, term_id)
        german = session.get(
            GlossaryTermLocalization,
            {"term_id": term_id, "language": "de"},
        )
        english = session.get(
            GlossaryTermLocalization,
            {"term_id": term_id, "language": "en"},
        )
        assert term is not None and german is not None and english is not None
        german.definition = (
            "Führung und Weisung, die einer militärischen Organisation erteilt werden, "
            "damit sie ihren Auftrag erfüllt."
        )
        english.definition = (
            "Leadership and direction given to a military organisation in order to "
            "accomplish its mission."
        )
        term.revision = 1
        session.flush()
        previous_hash = canonical_hash(
            {
                "urn": term.urn,
                "lifecycle": term.lifecycle,
                "payload": _stored_term_payload(session, term),
            }
        )
        term.content_hash = previous_hash
        session.execute(delete(SeedMarker).where(SeedMarker.name == GLOSSARY_REFERENCE_SEED_NAME))
        if session.get(SeedMarker, INTERMEDIATE_GLOSSARY_REFERENCE_SEED_NAME) is None:
            session.add(
                SeedMarker(
                    name=INTERMEDIATE_GLOSSARY_REFERENCE_SEED_NAME,
                    applied_at=datetime(2026, 8, 26, 9, 0, tzinfo=UTC),
                )
            )
        session.commit()

        assert seed_glossary_reference_terms(session) is True

        session.refresh(term)
        german = session.get(
            GlossaryTermLocalization,
            {"term_id": term_id, "language": "de"},
        )
        english = session.get(
            GlossaryTermLocalization,
            {"term_id": term_id, "language": "en"},
        )
        assert german is not None and english is not None
        assert term.revision == 2
        assert german.definition.startswith("Befugnis, Verantwortlichkeiten und Tätigkeiten")
        assert english.definition.startswith("Authority, responsibilities and activities")
        assert term.content_hash != previous_hash
        audit = session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_type == "glossary-term",
                AuditEvent.resource_id == str(term_id),
                AuditEvent.action == "reference-seed-reconciled",
                AuditEvent.revision == 2,
            )
        )
        assert audit is not None
        assert audit.details["previousContentHash"] == previous_hash
        assert audit.details["seed"] == GLOSSARY_REFERENCE_SEED_NAME


def _install_pristine_accepted_v1_term_on_v2_state(session) -> tuple[uuid.UUID, int]:
    legacy_payload = _legacy_armoured_vehicle_payload()
    legacy_id = uuid.uuid4()
    created_at = datetime(2026, 8, 25, 16, 0, tzinfo=UTC)
    legacy_urn = f"urn:daca:glossary-term:{legacy_id}"
    session.add(
        GlossaryTerm(
            id=legacy_id,
            urn=legacy_urn,
            origin_catalog_id=ORIGIN_CATALOG_ID,
            revision=1,
            content_hash=canonical_hash(
                {"urn": legacy_urn, "lifecycle": "active", "payload": legacy_payload}
            ),
            lifecycle="active",
            created_at=created_at,
            updated_at=created_at,
        )
    )
    session.flush()
    for item in legacy_payload["localizations"]:
        session.add(
            GlossaryTermLocalization(
                term_id=legacy_id,
                language=item["language"],
                preferred_label=item["preferredLabel"],
                alternative_labels=item["alternativeLabels"],
                definition=item["definition"],
                normalized_label=" ".join(item["preferredLabel"].casefold().split()),
            )
        )
    for domain_id in (DEFENCE_DOMAIN_ID, MOBILITY_DOMAIN_ID):
        session.add(GlossaryTermDomain(term_id=legacy_id, domain_id=domain_id))

    proposal = session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID)
    assert proposal is not None
    proposal.operation = "create"
    proposal.target_term_id = legacy_id
    proposal.status = "accepted"
    proposal.requested_payload = legacy_payload
    proposal.review_payload = legacy_payload
    proposal.revision = 1
    for review in session.scalars(
        select(GlossaryTermProposalReview).where(
            GlossaryTermProposalReview.proposal_id == proposal.id
        )
    ):
        review.proposal_revision = 1
        review.status = "approved"

    deterministic_id = reference_term_id("gepanzertes-fahrzeug")
    product = session.get(DataProduct, VEHICLE_PRODUCT_ID)
    assert product is not None
    baseline_revision = product.revision
    for term_id in (legacy_id, deterministic_id):
        session.add(
            DataProductGlossaryTerm(
                data_product_id=product.id,
                glossary_term_id=term_id,
                assigned_by_user_id="sandro.wenger",
                assigned_at=created_at,
            )
        )

    session.execute(delete(SeedMarker).where(SeedMarker.name == GLOSSARY_REFERENCE_SEED_NAME))
    if session.get(SeedMarker, PREVIOUS_GLOSSARY_REFERENCE_SEED_NAME) is None:
        session.add(SeedMarker(name=PREVIOUS_GLOSSARY_REFERENCE_SEED_NAME, applied_at=created_at))
    session.commit()
    return legacy_id, baseline_revision


def test_v4_reconciles_an_accepted_v1_journey_term_without_active_duplicates(
    session_factory,
):
    deterministic_id = reference_term_id("gepanzertes-fahrzeug")
    with session_factory() as session:
        legacy_id, product_revision = _install_pristine_accepted_v1_term_on_v2_state(session)

        assert seed_glossary_reference_terms(session) is True

        canonical = session.get(GlossaryTerm, legacy_id)
        duplicate = session.get(GlossaryTerm, deterministic_id)
        assert canonical is not None and duplicate is not None
        assert canonical.lifecycle == "active"
        assert canonical.revision == 2
        assert duplicate.lifecycle == "retired"
        assert duplicate.revision == 2
        assert duplicate.retired_at is not None
        german = session.get(
            GlossaryTermLocalization,
            {"term_id": legacy_id, "language": "de"},
        )
        assert german is not None and "GepFz" in german.alternative_labels

        active_exact_labels = session.scalar(
            select(func.count())
            .select_from(GlossaryTermLocalization)
            .join(GlossaryTerm, GlossaryTerm.id == GlossaryTermLocalization.term_id)
            .where(
                GlossaryTerm.lifecycle == "active",
                GlossaryTermLocalization.language == "de",
                GlossaryTermLocalization.normalized_label == "gepanzertes fahrzeug",
            )
        )
        assert active_exact_labels == 1
        assert (
            session.scalar(
                select(func.count())
                .select_from(GlossaryTermRelation)
                .where(
                    (GlossaryTermRelation.source_term_id == deterministic_id)
                    | (GlossaryTermRelation.target_term_id == deterministic_id)
                )
            )
            == 0
        )
        assert (
            session.scalar(
                select(GlossaryTermRelation).where(
                    GlossaryTermRelation.source_term_id == reference_term_id("schuetzenpanzer"),
                    GlossaryTermRelation.target_term_id == legacy_id,
                    GlossaryTermRelation.relation == "broader",
                )
            )
            is not None
        )

        assignments = set(
            session.scalars(
                select(DataProductGlossaryTerm.glossary_term_id).where(
                    DataProductGlossaryTerm.data_product_id == VEHICLE_PRODUCT_ID
                )
            )
        )
        assert legacy_id in assignments
        assert deterministic_id not in assignments
        product = session.get(DataProduct, VEHICLE_PRODUCT_ID)
        assert product is not None and product.revision == product_revision + 1
        assert session.get(SeedMarker, GLOSSARY_REFERENCE_SEED_NAME) is not None

        retirement_audit = session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_type == "glossary-term",
                AuditEvent.resource_id == str(deterministic_id),
                AuditEvent.action == "retired",
            )
        )
        assert retirement_audit is not None
        assert retirement_audit.revision == duplicate.revision
        assert retirement_audit.details["canonicalTermId"] == str(legacy_id)
        canonical_audit = session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_type == "glossary-term",
                AuditEvent.resource_id == str(legacy_id),
                AuditEvent.action == "reference-seed-reconciled",
            )
        )
        assert canonical_audit is not None
        assert canonical_audit.revision == canonical.revision
        assert canonical_audit.details["previousRevision"] == 1
        product_audit = session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_type == "data-product",
                AuditEvent.resource_id == str(VEHICLE_PRODUCT_ID),
                AuditEvent.action == "glossary-term-reconciled",
            )
        )
        assert product_audit is not None
        assert product_audit.revision == product.revision

        _remove_vehicle_term_proposals(session)
        session.commit()
        session.expire_all()
        assert session.get(GlossaryTerm, legacy_id).lifecycle == "active"


def test_v4_preserves_later_governed_content_on_the_reused_accepted_term(
    session_factory,
):
    with session_factory() as session:
        legacy_id, _ = _install_pristine_accepted_v1_term_on_v2_state(session)
        legacy = session.get(GlossaryTerm, legacy_id)
        german = session.get(
            GlossaryTermLocalization,
            {"term_id": legacy_id, "language": "de"},
        )
        assert legacy is not None and german is not None
        german.definition = "Durch den Domain Owner fachlich redigierte Definition."
        german.alternative_labels = ["Panzerfahrzeug", "Fachkürzel"]
        governed_payload = copy.deepcopy(_legacy_armoured_vehicle_payload())
        governed_payload["localizations"][0]["definition"] = german.definition
        governed_payload["localizations"][0]["alternativeLabels"] = german.alternative_labels
        legacy.revision = 2
        legacy.content_hash = canonical_hash(
            {
                "urn": legacy.urn,
                "lifecycle": legacy.lifecycle,
                "payload": governed_payload,
            }
        )
        session.commit()
        outgoing_before = list(
            session.scalars(
                select(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id == legacy_id)
            )
        )

        assert seed_glossary_reference_terms(session) is True

        session.refresh(legacy)
        session.refresh(german)
        assert legacy.revision == 2
        assert german.definition == "Durch den Domain Owner fachlich redigierte Definition."
        assert german.alternative_labels == ["Panzerfahrzeug", "Fachkürzel"]
        assert (
            list(
                session.scalars(
                    select(GlossaryTermRelation).where(
                        GlossaryTermRelation.source_term_id == legacy_id
                    )
                )
            )
            == outgoing_before
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(
                    AuditEvent.resource_type == "glossary-term",
                    AuditEvent.resource_id == str(legacy_id),
                    AuditEvent.action == "reference-seed-reconciled",
                )
            )
            == 0
        )
        assert (
            session.get(GlossaryTerm, reference_term_id("gepanzertes-fahrzeug")).lifecycle
            == "retired"
        )


def test_v4_does_not_overwrite_a_later_governed_open_proposal(session_factory):
    with session_factory() as session:
        session.execute(delete(SeedMarker).where(SeedMarker.name == GLOSSARY_REFERENCE_SEED_NAME))
        proposal = session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID)
        assert proposal is not None
        custom_payload = copy.deepcopy(proposal.review_payload)
        custom_payload["localizations"][0]["definition"] = "Fachlich redigierter Entwurf."
        proposal.status = "in_review"
        proposal.revision = 3
        proposal.review_payload = custom_payload
        reviews = list(
            session.scalars(
                select(GlossaryTermProposalReview).where(
                    GlossaryTermProposalReview.proposal_id == proposal.id
                )
            )
        )
        for index, review in enumerate(reviews):
            review.proposal_revision = 3
            review.status = "approved" if index == 0 else "pending"
        session.commit()

        assert seed_glossary_reference_terms(session) is True
        session.refresh(proposal)
        assert proposal.status == "in_review"
        assert proposal.revision == 3
        assert proposal.review_payload == custom_payload
        assert [review.status for review in reviews] == ["approved", "pending"]


def test_v4_revises_an_authentic_open_v2_proposal_to_the_corrected_payload(
    session_factory,
):
    with session_factory() as session:
        deterministic_id = reference_term_id("gepanzertes-fahrzeug")
        resolved_ids = {spec.slug: reference_term_id(spec.slug) for spec in REFERENCE_TERM_SPECS}
        previous_payload = _previous_armoured_vehicle_reference_payload(resolved_ids)
        current_payload = _payload(
            next(spec for spec in REFERENCE_TERM_SPECS if spec.slug == "gepanzertes-fahrzeug"),
            resolved_ids,
        )
        deterministic = session.get(GlossaryTerm, deterministic_id)
        assert deterministic is not None
        assert (
            canonical_hash(
                {
                    "urn": deterministic.urn,
                    "lifecycle": "active",
                    "payload": previous_payload,
                }
            )
            == _PREVIOUS_REFERENCE_CONTENT_HASHES["gepanzertes-fahrzeug"]
        )
        proposal = session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID)
        assert proposal is not None
        proposal.operation = "update"
        proposal.target_term_id = deterministic_id
        proposal.status = "submitted"
        proposal.revision = 1
        proposal.requested_payload = previous_payload
        proposal.review_payload = previous_payload
        proposal.decision_comment = None
        proposal.decided_at = None
        reviews = list(
            session.scalars(
                select(GlossaryTermProposalReview).where(
                    GlossaryTermProposalReview.proposal_id == proposal.id
                )
            )
        )
        for review in reviews:
            review.proposal_revision = 1
            review.status = "pending"
            review.decision_comment = None
            review.decided_at = None
        session.execute(delete(SeedMarker).where(SeedMarker.name == GLOSSARY_REFERENCE_SEED_NAME))
        session.execute(
            delete(AuditEvent).where(
                AuditEvent.resource_type == "glossary-term-proposal",
                AuditEvent.resource_id == str(proposal.id),
                AuditEvent.action == "reference-seed-aligned",
            )
        )
        session.commit()

        assert seed_glossary_reference_terms(session) is True

        session.refresh(proposal)
        assert proposal.operation == "update"
        assert proposal.target_term_id == deterministic_id
        assert proposal.status == "in_review"
        assert proposal.revision == 2
        assert proposal.requested_payload == previous_payload
        assert _payload_signature(proposal.review_payload) == _payload_signature(current_payload)
        assert all(
            review.proposal_revision == 2 and review.status == "pending" for review in reviews
        )
        audit = session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_type == "glossary-term-proposal",
                AuditEvent.resource_id == str(proposal.id),
                AuditEvent.action == "reference-seed-aligned",
            )
        )
        assert audit is not None
        assert audit.revision == 2
        assert audit.details["previousRevision"] == 1


def test_v4_preserves_both_terms_when_the_deterministic_duplicate_was_governed(
    session_factory,
):
    deterministic_id = reference_term_id("gepanzertes-fahrzeug")
    with session_factory() as session:
        legacy_id, _ = _install_pristine_accepted_v1_term_on_v2_state(session)
        deterministic = session.get(GlossaryTerm, deterministic_id)
        german = session.get(
            GlossaryTermLocalization,
            {"term_id": deterministic_id, "language": "de"},
        )
        assert deterministic is not None and german is not None
        german.definition = "Durch Governance redigierte Referenzdefinition."
        deterministic.revision = 2
        deterministic.content_hash = canonical_hash(
            {
                "urn": deterministic.urn,
                "lifecycle": deterministic.lifecycle,
                "payload": _stored_term_payload(session, deterministic),
            }
        )
        session.commit()

        assert seed_glossary_reference_terms(session) is True

        session.refresh(deterministic)
        legacy = session.get(GlossaryTerm, legacy_id)
        session.refresh(german)
        assert deterministic.lifecycle == "active"
        assert deterministic.revision == 2
        assert german.definition == "Durch Governance redigierte Referenzdefinition."
        assert legacy is not None and legacy.lifecycle == "active"
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(
                    AuditEvent.resource_type == "glossary-term",
                    AuditEvent.resource_id == str(deterministic_id),
                    AuditEvent.action == "retired",
                )
            )
            == 0
        )


def test_v4_never_uses_a_retired_accepted_target_as_the_canonical_term(session_factory):
    deterministic_id = reference_term_id("gepanzertes-fahrzeug")
    with session_factory() as session:
        legacy_id, _ = _install_pristine_accepted_v1_term_on_v2_state(session)
        legacy = session.get(GlossaryTerm, legacy_id)
        assert legacy is not None
        legacy.lifecycle = "retired"
        legacy.retired_at = datetime(2026, 8, 26, 8, 0, tzinfo=UTC)
        legacy.revision = 2
        legacy.content_hash = canonical_hash(
            {
                "urn": legacy.urn,
                "lifecycle": "retired",
                "payload": _stored_term_payload(session, legacy),
            }
        )
        session.commit()

        assert seed_glossary_reference_terms(session) is True

        deterministic = session.get(GlossaryTerm, deterministic_id)
        session.refresh(legacy)
        assert deterministic is not None and deterministic.lifecycle == "active"
        assert legacy.lifecycle == "retired"
        active_exact_labels = session.scalar(
            select(func.count())
            .select_from(GlossaryTermLocalization)
            .join(GlossaryTerm, GlossaryTerm.id == GlossaryTermLocalization.term_id)
            .where(
                GlossaryTerm.lifecycle == "active",
                GlossaryTermLocalization.language == "de",
                GlossaryTermLocalization.normalized_label == "gepanzertes fahrzeug",
            )
        )
        assert active_exact_labels == 1
        assignments = set(
            session.scalars(
                select(DataProductGlossaryTerm.glossary_term_id).where(
                    DataProductGlossaryTerm.data_product_id == VEHICLE_PRODUCT_ID
                )
            )
        )
        assert deterministic_id in assignments
        assert legacy_id in assignments


_V2_REGRESSION_SNAPSHOTS = {
    "radschuetzenpanzer-93": {
        "localizations": (
            (
                "de",
                "Radschützenpanzer 93",
                ["Radspz 93", "Piranha 6x6"],
                (
                    "Radgestütztes gepanzertes Infanteriefahrzeug der Schweizer Armee "
                    "auf Basis des Piranha 6×6."
                ),
            ),
            (
                "en",
                "Wheeled armoured vehicle 93",
                [],
                "Swiss wheeled armoured infantry vehicle based on the Piranha 6×6 platform.",
            ),
        ),
        "relations": (
            ("broader", "gepanzertes-fahrzeug"),
            ("related", "geschuetztes-mannschaftstransportfahrzeug"),
            ("related", "schuetzenpanzer"),
        ),
    },
    "schuetzenpanzer": {
        "localizations": (
            (
                "de",
                "Schützenpanzer",
                ["Spz"],
                (
                    "Gepanzertes Fahrzeug für den Transport und die Kampfunterstützung von "
                    "Infanterie."
                ),
            ),
            (
                "en",
                "Infantry fighting vehicle",
                ["IFV", "AIFV"],
                (
                    "Armoured combat vehicle designed to transport infantry and support it in "
                    "combat."
                ),
            ),
        ),
        "relations": (
            ("broader", "gepanzertes-fahrzeug"),
            ("narrower", "schuetzenpanzer-2000"),
            ("related", "radschuetzenpanzer-93"),
        ),
    },
    "command-and-control": {
        "localizations": (
            (
                "de",
                "Führung und Kontrolle",
                ["C2", "Command and Control"],
                (
                    "Führung und Weisung, die einer militärischen Organisation zur Erfüllung "
                    "ihres Auftrags gegeben werden."
                ),
            ),
            (
                "en",
                "Command and control",
                ["C2"],
                (
                    "Leadership and direction given to a military organisation in order to "
                    "accomplish its mission."
                ),
            ),
        ),
        "relations": (
            ("narrower", "iplis"),
            ("related", "ads-15"),
        ),
    },
    "vhf": {
        "localizations": (
            (
                "de",
                "Very High Frequency",
                ["VHF", "Ultrakurzwelle"],
                (
                    "Funkfrequenzbereich, der in den IPLIS-Integrationstests für militärische "
                    "Kommunikation über kurze Distanzen eingesetzt wird."
                ),
            ),
            (
                "en",
                "Very High Frequency",
                ["VHF"],
                (
                    "Radio-frequency range used in IPLIS integration tests for military "
                    "communications over short distances."
                ),
            ),
        ),
        "relations": (("related", "iplis"),),
    },
}


def _install_v2_reference_snapshot(session, slug: str) -> None:
    snapshot = _V2_REGRESSION_SNAPSHOTS[slug]
    term = session.get(GlossaryTerm, reference_term_id(slug))
    assert term is not None
    localizations = {
        item.language: item
        for item in session.scalars(
            select(GlossaryTermLocalization).where(GlossaryTermLocalization.term_id == term.id)
        )
    }
    assert set(localizations) == {"de", "en"}
    for language, preferred_label, alternative_labels, definition in snapshot["localizations"]:
        localization = localizations[language]
        localization.preferred_label = preferred_label
        localization.alternative_labels = alternative_labels
        localization.definition = definition
        localization.normalized_label = " ".join(preferred_label.casefold().split())

    session.execute(
        delete(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id == term.id)
    )
    for relation, target_slug in snapshot["relations"]:
        session.add(
            GlossaryTermRelation(
                id=uuid.uuid4(),
                source_term_id=term.id,
                target_term_id=reference_term_id(target_slug),
                relation=relation,
                created_at=datetime(2026, 8, 26, 9, 0, tzinfo=UTC),
            )
        )
    term.revision = 1
    term.lifecycle = "active"
    term.retired_at = None
    term.content_hash = _PREVIOUS_REFERENCE_CONTENT_HASHES[slug]
    session.flush()


def test_v4_upgrades_authentic_raw_v2_terms_and_removes_only_v2_relations(
    session_factory,
):
    upgraded_slugs = {
        "mehrwertsteuer",
        "radschuetzenpanzer-93",
        "schuetzenpanzer",
        "command-and-control",
        "vhf",
    }
    with session_factory() as session:
        # Mehrwertsteuer did not change semantically, but its deployed v2 hash still
        # proves that the legacy unsorted-payload fingerprint is accepted.
        vat = session.get(GlossaryTerm, reference_term_id("mehrwertsteuer"))
        assert vat is not None
        vat.content_hash = _PREVIOUS_REFERENCE_CONTENT_HASHES["mehrwertsteuer"]
        for slug in upgraded_slugs - {"mehrwertsteuer"}:
            _install_v2_reference_snapshot(session, slug)
        session.execute(delete(SeedMarker).where(SeedMarker.name == GLOSSARY_REFERENCE_SEED_NAME))
        if session.get(SeedMarker, PREVIOUS_GLOSSARY_REFERENCE_SEED_NAME) is None:
            session.add(
                SeedMarker(
                    name=PREVIOUS_GLOSSARY_REFERENCE_SEED_NAME,
                    applied_at=datetime(2026, 8, 26, 9, 0, tzinfo=UTC),
                )
            )
        session.commit()

        for slug in upgraded_slugs:
            spec = next(item for item in REFERENCE_TERM_SPECS if item.slug == slug)
            term = session.get(GlossaryTerm, reference_term_id(slug))
            assert term is not None
            assert _is_pristine_v2_reference_term(session, term, spec), slug

        assert seed_glossary_reference_terms(session) is True

        for slug in upgraded_slugs:
            spec = next(item for item in REFERENCE_TERM_SPECS if item.slug == slug)
            term = session.get(GlossaryTerm, reference_term_id(slug))
            assert term is not None and term.revision == 2
            assert _stored_term_payload(session, term) == _payload_signature(_payload(spec))
            assert term.content_hash == canonical_hash(
                {
                    "urn": term.urn,
                    "lifecycle": term.lifecycle,
                    "payload": _stored_term_payload(session, term),
                }
            )
            audit = session.scalar(
                select(AuditEvent).where(
                    AuditEvent.resource_type == "glossary-term",
                    AuditEvent.resource_id == str(term.id),
                    AuditEvent.action == "reference-seed-reconciled",
                )
            )
            assert audit is not None, slug
            assert audit.revision == 2
            assert (
                audit.details["previousContentHash"] == (_PREVIOUS_REFERENCE_CONTENT_HASHES[slug])
            )

        radspz = session.get(
            GlossaryTermLocalization,
            {"term_id": reference_term_id("radschuetzenpanzer-93"), "language": "en"},
        )
        vhf = session.get(
            GlossaryTermLocalization,
            {"term_id": reference_term_id("vhf"), "language": "de"},
        )
        c2 = session.get(
            GlossaryTermLocalization,
            {"term_id": reference_term_id("command-and-control"), "language": "de"},
        )
        assert radspz is not None
        assert radspz.preferred_label == "Piranha armoured personnel carrier 93"
        assert "8×8" in radspz.definition and "6×6" not in radspz.definition
        assert vhf is not None and vhf.preferred_label == "Ultrakurzwelle"
        assert "30 bis 300 MHz" in vhf.definition
        assert c2 is not None and c2.alternative_labels == ["C2"]
        assert (
            session.scalar(
                select(func.count())
                .select_from(GlossaryTermRelation)
                .where(
                    GlossaryTermRelation.source_term_id
                    == reference_term_id("radschuetzenpanzer-93"),
                    GlossaryTermRelation.target_term_id == reference_term_id("schuetzenpanzer"),
                    GlossaryTermRelation.relation == "related",
                )
            )
            == 0
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(GlossaryTermRelation)
                .where(
                    GlossaryTermRelation.source_term_id == reference_term_id("schuetzenpanzer"),
                    GlossaryTermRelation.target_term_id
                    == reference_term_id("radschuetzenpanzer-93"),
                    GlossaryTermRelation.relation == "related",
                )
            )
            == 0
        )


def test_v4_never_restores_a_governed_relation_change(session_factory):
    with session_factory() as session:
        source_id = reference_term_id("schuetzenpanzer")
        target_id = reference_term_id("gepanzertes-fahrzeug")
        source = session.get(GlossaryTerm, source_id)
        relation = session.scalar(
            select(GlossaryTermRelation).where(
                GlossaryTermRelation.source_term_id == source_id,
                GlossaryTermRelation.target_term_id == target_id,
                GlossaryTermRelation.relation == "broader",
            )
        )
        assert source is not None and relation is not None
        relation.relation = "closeMatch"
        source.revision = 2
        session.flush()
        source.content_hash = canonical_hash(
            {
                "urn": source.urn,
                "lifecycle": source.lifecycle,
                "payload": _stored_term_payload(session, source),
            }
        )
        governed_hash = source.content_hash
        session.execute(delete(SeedMarker).where(SeedMarker.name == GLOSSARY_REFERENCE_SEED_NAME))
        session.commit()

        assert seed_glossary_reference_terms(session) is True

        session.refresh(source)
        assert source.revision == 2
        assert source.content_hash == governed_hash
        assert session.get(GlossaryTermRelation, relation.id).relation == "closeMatch"
        assert (
            session.scalar(
                select(func.count())
                .select_from(GlossaryTermRelation)
                .where(
                    GlossaryTermRelation.source_term_id == source_id,
                    GlossaryTermRelation.target_term_id == target_id,
                    GlossaryTermRelation.relation == "broader",
                )
            )
            == 0
        )


def test_v4_aborts_before_mutating_a_foreign_reference_identifier(session_factory):
    with session_factory() as session:
        foreign_id = reference_term_id("vhf")
        foreign = session.get(GlossaryTerm, foreign_id)
        assert foreign is not None
        foreign.origin_catalog_id = "urn:daca:catalog:external"
        session.execute(delete(SeedMarker).where(SeedMarker.name == GLOSSARY_REFERENCE_SEED_NAME))
        session.commit()
        before = (
            foreign.revision,
            foreign.content_hash,
            _stored_term_payload(session, foreign),
        )

        with pytest.raises(
            RuntimeError,
            match="Reference glossary identifier is owned by another origin catalog",
        ):
            seed_glossary_reference_terms(session)

        session.expire_all()
        unchanged = session.get(GlossaryTerm, foreign_id)
        assert unchanged is not None
        assert unchanged.origin_catalog_id == "urn:daca:catalog:external"
        assert (
            unchanged.revision,
            unchanged.content_hash,
            _stored_term_payload(session, unchanged),
        ) == before
        assert session.get(SeedMarker, GLOSSARY_REFERENCE_SEED_NAME) is None


def test_reference_abbreviations_and_hierarchy_are_public_skos(client):
    response = client.get("/api/v1/knowledge-graph")
    assert response.status_code == 200
    graph = Graph().parse(data=response.text, format="json-ld")
    armoured = URIRef(f"urn:daca:glossary-term:{reference_term_id('gepanzertes-fahrzeug')}")
    ifv = URIRef(f"urn:daca:glossary-term:{reference_term_id('schuetzenpanzer')}")

    assert (armoured, SKOS.prefLabel, Literal("Gepanzertes Fahrzeug", lang="de")) in graph
    assert (armoured, SKOS.altLabel, Literal("GepFz", lang="de")) in graph
    assert (armoured, SKOS.prefLabel, Literal("Armoured vehicle", lang="en")) in graph
    assert (ifv, SKOS.broader, armoured) in graph

    ifv_response = client.get(f"/api/v1/glossary/terms/{reference_term_id('schuetzenpanzer')}")
    assert ifv_response.status_code == 200
    broader = next(
        relation
        for relation in ifv_response.json()["relations"]
        if relation["relation"] == "broader"
    )
    assert broader["targetLabel"] == "Gepanzertes Fahrzeug"


def test_every_reference_term_can_start_and_authorize_a_lossless_edit(client):
    terms_response = client.get("/api/v1/glossary/terms")
    assert terms_response.status_code == 200
    reference_ids = {str(reference_term_id(spec.slug)) for spec in REFERENCE_TERM_SPECS}
    terms = [item for item in terms_response.json() if item["id"] in reference_ids]
    assert {item["id"] for item in terms} == reference_ids

    for index, term in enumerate(terms):
        payload = {
            "domainIds": term["domainIds"],
            "localizations": [
                {
                    "language": item["language"],
                    "preferredLabel": item["preferredLabel"],
                    "alternativeLabels": item["alternativeLabels"],
                    "definition": item["definition"],
                }
                for item in term["localizations"]
            ],
            "relations": [
                {
                    "relation": item["relation"],
                    "targetTermId": item["targetTermId"],
                    "targetUri": item["targetUri"],
                }
                for item in term["relations"]
            ],
        }
        proposal_response = client.post(
            "/api/v1/glossary/term-proposals",
            headers={"X-DaCa-User": "daca-test-editor"},
            json={
                "operation": "update",
                "targetTermId": term["id"],
                "autoAttach": False,
                "payload": payload,
            },
        )
        assert proposal_response.status_code == 201, term["preferredLabel"]
        proposal = proposal_response.json()
        assert proposal["requestedPayload"] == payload

        if index == 0:
            forbidden = client.patch(
                f"/api/v1/glossary/term-proposals/{proposal['id']}",
                headers={"X-DaCa-User": "beat.stalder", "If-Match": '"1"'},
                json={"reviewPayload": payload},
            )
            assert forbidden.status_code == 403

        owner = proposal["reviews"][0]["ownerUserId"]
        edit_response = client.patch(
            f"/api/v1/glossary/term-proposals/{proposal['id']}",
            headers={"X-DaCa-User": owner, "If-Match": '"1"'},
            json={"reviewPayload": payload},
        )
        assert edit_response.status_code == 200, term["preferredLabel"]
        edited = edit_response.json()
        assert edited["revision"] == 2
        assert edited["reviewPayload"] == payload


def test_every_reference_alternative_label_is_searchable_and_exported(client):
    graph_response = client.get("/api/v1/knowledge-graph")
    assert graph_response.status_code == 200
    graph = Graph().parse(data=graph_response.text, format="json-ld")

    checked = 0
    for spec in REFERENCE_TERM_SPECS:
        term_id = reference_term_id(spec.slug)
        term_uri = URIRef(f"urn:daca:glossary-term:{term_id}")
        for localization in spec.localizations:
            for alternative_label in localization.alternative_labels:
                response = client.get("/api/v1/glossary/terms", params={"q": alternative_label})
                assert response.status_code == 200
                assert str(term_id) in {item["id"] for item in response.json()}
                assert (
                    term_uri,
                    SKOS.altLabel,
                    Literal(alternative_label, lang=localization.language),
                ) in graph
                checked += 1

    assert checked >= 20
