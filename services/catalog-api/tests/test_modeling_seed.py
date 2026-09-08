from __future__ import annotations

from daca_catalog import modeling_seed
from daca_catalog.modeling_seed import (
    LEGAL_FORM_CONCEPT_ID,
    MODELING_ORGANIZATION_ID,
    ORGANIZATION_MODEL_ID,
    PERSONNEL_MODEL_ID,
    VEHICLE_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import (
    AssetMapping,
    DataModelRoleAssignment,
    DcatDatasetVersionLocalization,
    DemoUser,
    I14yConcept,
    LogicalModel,
    LogicalModelVersion,
    PhysicalSchemaSnapshot,
)
from sqlalchemy import func, select


def _model_title(session, model_id) -> str:
    version = session.scalar(
        select(LogicalModelVersion)
        .where(LogicalModelVersion.logical_model_id == model_id)
        .order_by(LogicalModelVersion.revision.desc())
        .limit(1)
    )
    localization = session.scalar(
        select(DcatDatasetVersionLocalization).where(
            DcatDatasetVersionLocalization.dataset_version_id == version.dataset_version_id,
            DcatDatasetVersionLocalization.language == "de",
        )
    )
    return localization.title


def test_modeling_seed_is_idempotent_and_preserves_legacy_persona_roles(session_factory) -> None:
    with session_factory() as session:
        sibilla = session.get(DemoUser, "sibilla.micheli")
        assert sibilla is not None
        legacy_roles = list(sibilla.roles)

        seed_modeling_catalog(session)
        first_counts = (
            session.scalar(
                select(func.count())
                .select_from(DataModelRoleAssignment)
                .where(DataModelRoleAssignment.organization_id == MODELING_ORGANIZATION_ID)
            ),
            session.scalar(select(func.count()).select_from(I14yConcept)),
            session.scalar(
                select(func.count())
                .select_from(LogicalModel)
                .where(
                    LogicalModel.id.in_(
                        [PERSONNEL_MODEL_ID, VEHICLE_MODEL_ID, ORGANIZATION_MODEL_ID]
                    )
                )
            ),
            session.scalar(select(func.count()).select_from(PhysicalSchemaSnapshot)),
            session.scalar(
                select(func.count())
                .select_from(AssetMapping)
                .where(AssetMapping.logical_model_id == VEHICLE_MODEL_ID)
            ),
        )
        seed_modeling_catalog(session)
        second_counts = (
            session.scalar(
                select(func.count())
                .select_from(DataModelRoleAssignment)
                .where(DataModelRoleAssignment.organization_id == MODELING_ORGANIZATION_ID)
            ),
            session.scalar(select(func.count()).select_from(I14yConcept)),
            session.scalar(
                select(func.count())
                .select_from(LogicalModel)
                .where(
                    LogicalModel.id.in_(
                        [PERSONNEL_MODEL_ID, VEHICLE_MODEL_ID, ORGANIZATION_MODEL_ID]
                    )
                )
            ),
            session.scalar(select(func.count()).select_from(PhysicalSchemaSnapshot)),
            session.scalar(
                select(func.count())
                .select_from(AssetMapping)
                .where(AssetMapping.logical_model_id == VEHICLE_MODEL_ID)
            ),
        )

        assert first_counts == second_counts == (6, 3, 3, 2, 5)
        assert session.get(DemoUser, "sibilla.micheli").roles == legacy_roles
        assert _model_title(session, PERSONNEL_MODEL_ID) == "Mitarbeitende"
        assert _model_title(session, VEHICLE_MODEL_ID) == "Fahrzeugbestand"


def test_modeling_seed_checks_scenarios_when_the_foundational_marker_survives(
    session_factory, monkeypatch
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)

        checked_sessions = []
        monkeypatch.setattr(
            modeling_seed,
            "_seed_scenarios",
            lambda checked_session: checked_sessions.append(checked_session),
        )

        seed_modeling_catalog(session)

        assert checked_sessions == [session]


def test_modeling_seed_uses_the_required_offline_i14y_legal_form_reference(
    session_factory,
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        concept = session.get(I14yConcept, LEGAL_FORM_CONCEPT_ID)

        assert concept is not None
        assert concept.identifiers == ["legalForm"]
        assert concept.version == "1.2.0"
        assert concept.register_uri == (
            "https://register.ld.admin.ch/i14y/concept/legalForm/version/1.2.0"
        )
        assert concept.source_url == (
            "https://api.i14y.admin.ch/api/public/v1/concepts/"
            "89bc55cc-3858-4c13-a5c8-7dc935dff29b"
        )
        assert len(concept.payload_hash) == 64
        assert concept.raw_payload["id"] == str(LEGAL_FORM_CONCEPT_ID)
