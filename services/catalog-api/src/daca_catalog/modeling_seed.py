from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .domain_glossary_seed import DEFENCE_DOMAIN_ID, MOBILITY_DOMAIN_ID
from .federal_organization_import import (
    DEFAULT_SNAPSHOT,
    apply_snapshot,
    load_and_validate_snapshot,
)
from .modeling_core import (
    FixturePhysicalMetadataAdapter,
    FixtureS3PhysicalMetadataAdapter,
    VibdbuPhysicalMetadataAdapter,
    canonical_hash,
    stable_uuid,
)
from .modeling_schemas import AssetMappingWrite, LogicalModelWrite
from .modeling_service import create_asset_mapping, create_logical_model, persist_physical_import
from .models import (
    AdministrativeOrganization,
    DataModelRoleAssignment,
    DemoUser,
    Domain,
    DomainLocalization,
    FederalPersonMembership,
    I14yCodeListEntry,
    I14yConcept,
    LogicalEntityVersion,
    LogicalFieldVersion,
    LogicalModel,
    PhysicalColumn,
    PhysicalDatabase,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
    SeedMarker,
    TerminologyTerm,
    TerminologyTermResponsibility,
    TerminologyTermVersion,
    TerminologyTermVersionDomain,
    TerminologyTermVersionLabel,
)

MODELING_SEED_NAME = "data-modeling-v1"
MODELING_ORGANIZATION_ID = "vbs-verteidigung"
PERSONNEL_DOMAIN_ID = stable_uuid("domain:personal")
PERSONNEL_MODEL_ID = stable_uuid("logical-model:personal")
VEHICLE_MODEL_ID = stable_uuid("logical-model:fahrzeugbestand")
ORGANIZATION_MODEL_ID = stable_uuid("logical-model:organisationseinheiten")
PHYSICAL_SOURCE_ID = stable_uuid("physical-source:vbs-postgresql-fixture")
S3_PHYSICAL_SOURCE_ID = stable_uuid("physical-source:daaif-s3-parquet")
VIBDBU_PHYSICAL_SOURCE_ID = stable_uuid("physical-source:vibdbu-postgresql")
GENDER_CONCEPT_ID = uuid.UUID("86365acd-3ad1-40a3-a76a-447653a4da6f")
VEHICLE_TYPE_CONCEPT_ID = uuid.UUID("08dad447-fdc0-073a-b3f5-b70f4b876faf")
LEGAL_FORM_CONCEPT_ID = uuid.UUID("89bc55cc-3858-4c13-a5c8-7dc935dff29b")
_NOW = datetime(2026, 9, 7, 8, 0, tzinfo=UTC)
REAL_ESTATE_ORGANIZATION_ID = "vbs-armasuisse-immobilien"
ARMASUISSE_ORGANIZATION_ID = "vbs-armasuisse"
REAL_ESTATE_DOMAIN_ID = stable_uuid("domain:immobilienmanagement-vbs")
_PEOPLE = (
    ("christian.spider", "Christian Spider", "christian.spider@vtg.admin.ch", ("data_consumer",)),
    ("sibilla.micheli", "Sibilla Micheli", "sibilla.micheli@vbs.admin.ch", ("data_consumer",)),
    ("cinthya.thor", "Cinthya Thor", "cinthya.thor@vtg.admin.ch", ("data_consumer",)),
    ("lawrence.hill", "Lawrence Hill", "lawrence.hill@vtg.admin.ch", ("data_consumer",)),
    ("hong.an.captain", "Hong An Captain", "hong-an.captain@vtg.admin.ch", ("data_consumer",)),
    ("christian.man", "Christian Man", "christian.man@vtg.admin.ch", ("data_consumer",)),
)


def _seed_federal_hierarchy(session: Session) -> None:
    if session.get(AdministrativeOrganization, "vbs-armasuisse-immobilien") is not None:
        return
    payload, digest = load_and_validate_snapshot(DEFAULT_SNAPSHOT)
    apply_snapshot(session, payload, digest)


def _seed_armasuisse_personas(session: Session) -> None:
    people = (
        ("giuseppe.starwars", "Giuseppe Starwars", "giuseppe.starwars@ar.admin.ch", "data_owner"),
        ("thomas.wikinger", "Thomas Wikinger", "thomas.wikinger@ar.admin.ch", "data_steward"),
    )
    for user_id, display_name, email, role in people:
        user = session.get(DemoUser, user_id)
        if user is None:
            session.add(DemoUser(
                id=user_id, display_name=display_name, organization="armasuisse",
                email=email, roles=["data_consumer"], selectable=True, active=True, created_at=_NOW,
            ))
        session.flush()
        membership_id = stable_uuid(f"federal-membership:{user_id}:{ARMASUISSE_ORGANIZATION_ID}")
        if session.get(FederalPersonMembership, membership_id) is None:
            session.add(FederalPersonMembership(
                id=membership_id, user_id=user_id, organization_id=ARMASUISSE_ORGANIZATION_ID,
                is_primary=True, valid_from=date(2026, 1, 1), created_at=_NOW,
            ))
        role_id = stable_uuid(f"role:{ARMASUISSE_ORGANIZATION_ID}:{user_id}:{role}")
        if session.get(DataModelRoleAssignment, role_id) is None:
            session.add(DataModelRoleAssignment(
                id=role_id, user_id=user_id, department_code="VBS",
                organization_id=ARMASUISSE_ORGANIZATION_ID, role=role,
                delegated_owner_user_id=None, active=True, created_at=_NOW,
            ))
    session.flush()


def _seed_real_estate_journey(session: Session) -> None:
    people = (
        ("mirjam.keller", "Mirjam Keller", "mirjam.keller@ar.admin.ch", "data_steward", None),
        ("daniel.wenger", "Daniel Wenger", "daniel.wenger@ar.admin.ch", "data_owner", None),
        ("eliane.rossi", "Eliane Rossi", "eliane.rossi@ar.admin.ch", "deputy_data_owner", "daniel.wenger"),
    )
    for user_id, display_name, email, role, delegated_owner in people:
        user = session.get(DemoUser, user_id)
        if user is None:
            session.add(DemoUser(
                id=user_id, display_name=display_name, organization="armasuisse Immobilien",
                email=email, roles=["data_consumer"], selectable=True, active=True, created_at=_NOW,
            ))
        session.flush()
        membership_id = stable_uuid(f"federal-membership:{user_id}:{REAL_ESTATE_ORGANIZATION_ID}")
        if session.get(FederalPersonMembership, membership_id) is None:
            session.add(FederalPersonMembership(
                id=membership_id, user_id=user_id, organization_id=REAL_ESTATE_ORGANIZATION_ID,
                is_primary=True, valid_from=date(2026, 1, 1), created_at=_NOW,
            ))
        role_id = stable_uuid(f"role:{REAL_ESTATE_ORGANIZATION_ID}:{user_id}:{role}")
        if session.get(DataModelRoleAssignment, role_id) is None:
            session.add(DataModelRoleAssignment(
                id=role_id, user_id=user_id, department_code="VBS",
                organization_id=REAL_ESTATE_ORGANIZATION_ID, role=role,
                delegated_owner_user_id=delegated_owner, active=True, created_at=_NOW,
            ))
    session.flush()
    if session.get(Domain, REAL_ESTATE_DOMAIN_ID) is None:
        session.add(Domain(
            id=REAL_ESTATE_DOMAIN_ID,
            urn=f"urn:daca:domain:{REAL_ESTATE_DOMAIN_ID}",
            origin_catalog_id="urn:daca:catalog:bit-poc", revision=1,
            content_hash=canonical_hash({"de": "Immobilienmanagement VBS"}), lifecycle="active",
            owner_user_id="daniel.wenger", deputy_owner_user_id="eliane.rossi",
            created_at=_NOW, updated_at=_NOW,
        ))
        session.add_all([
            DomainLocalization(
                domain_id=REAL_ESTATE_DOMAIN_ID, language="de",
                preferred_label="Immobilienmanagement VBS",
                definition="Planung, Steuerung und Bewirtschaftung des Immobilienportfolios des VBS.",
                normalized_label="immobilienmanagement vbs",
            ),
            DomainLocalization(
                domain_id=REAL_ESTATE_DOMAIN_ID, language="en",
                preferred_label="DDPS real estate management",
                definition="Planning, governance and operation of the DDPS real-estate portfolio.",
                normalized_label="ddps real estate management",
            ),
        ])
    session.flush()
    concepts = (
        ("immobilienobjekt", "Immobilienobjekt", "Ein Grundstück, Gebäude oder eine Anlage im Immobilienportfolio des VBS."),
        ("infrastrukturbedarf", "Infrastrukturbedarf", "Ein fachlich begründeter Bedarf an militärischer oder ziviler Infrastruktur."),
        ("bauprojekt", "Bauprojekt", "Ein Vorhaben zur Planung, Erstellung, Erneuerung oder Stilllegung einer Immobilie."),
    )
    for key, label, definition in concepts:
        term_id = stable_uuid(f"terminology:business-object:{key}")
        version_id = stable_uuid(f"terminology:business-object:{key}:1")
        if session.get(TerminologyTerm, term_id) is not None:
            continue
        digest = canonical_hash({"label": label, "definition": definition, "domain": str(REAL_ESTATE_DOMAIN_ID)})
        term = TerminologyTerm(
            id=term_id, urn=f"urn:daca:terminology:{term_id}",
            origin_catalog_id="urn:daca:catalog:bit-poc", revision=1,
            latest_version_id=None, content_hash=digest, lifecycle="active",
            creator_user_id="mirjam.keller", created_at=_NOW, updated_at=_NOW,
        )
        version = TerminologyTermVersion(
            id=version_id, term_id=term_id, revision=1, lock_version=1,
            status="published", concept_kind="business_object", content_hash=digest,
            created_by_user_id="mirjam.keller", created_at=_NOW,
        )
        session.add_all([term, version])
        session.flush()
        term.latest_version_id = version.id
        session.add_all([
            TerminologyTermVersionLabel(
                term_version_id=version.id, language="de", preferred_label=label,
                alternative_labels=[], definition=definition, translation_origin="manual",
            ),
            TerminologyTermVersionDomain(term_version_id=version.id, domain_id=REAL_ESTATE_DOMAIN_ID),
            TerminologyTermResponsibility(term_version_id=version.id, role="data_owner", user_id="daniel.wenger"),
            TerminologyTermResponsibility(term_version_id=version.id, role="data_steward", user_id="mirjam.keller"),
        ])
    session.flush()


def _seed_people_and_roles(session: Session) -> None:
    modeling_organization = session.get(AdministrativeOrganization, MODELING_ORGANIZATION_ID)
    if modeling_organization is None:
        session.add(
            AdministrativeOrganization(
                id=MODELING_ORGANIZATION_ID,
                parent_id="vbs",
                department_code="VBS",
                office_code="Verteidigung",
                display_name="Verteidigung",
                organization_type="office",
                department_order=5,
                office_order=11,
                active=True,
                created_at=_NOW,
            )
        )
    elif modeling_organization.parent_id is None:
        # The pre-0020 fixture was a flat organization. Keep its stable ID while
        # placing it below VBS in the hierarchy used by the cascading editor.
        modeling_organization.parent_id = "vbs"
    session.flush()
    for user_id, display_name, email, roles in _PEOPLE:
        user = session.get(DemoUser, user_id)
        if user is None:
            user = DemoUser(
                id=user_id,
                display_name=display_name,
                organization="Verteidigung",
                email=email,
                phone=None,
                avatar_url=None,
                roles=list(roles),
                selectable=True,
                active=True,
                created_at=_NOW,
            )
            session.add(user)
        else:
            # Legacy product/governance roles are owned by the canonical seed and
            # must not be repurposed as modeling authorization.
            user.selectable = True
            user.active = True
    session.flush()
    assignments = (
        ("christian.spider", "data_owner", None),
        ("sibilla.micheli", "deputy_data_owner", "christian.spider"),
        ("cinthya.thor", "data_steward", None),
        ("lawrence.hill", "data_owner", None),
        ("hong.an.captain", "deputy_data_owner", "lawrence.hill"),
        ("christian.man", "data_steward", None),
    )
    for user_id, role, delegated_owner in assignments:
        assignment_id = stable_uuid(f"role:{MODELING_ORGANIZATION_ID}:{user_id}:{role}")
        if session.get(DataModelRoleAssignment, assignment_id) is None:
            session.add(
                DataModelRoleAssignment(
                    id=assignment_id,
                    user_id=user_id,
                    department_code="VBS",
                    organization_id=MODELING_ORGANIZATION_ID,
                    role=role,
                    delegated_owner_user_id=delegated_owner,
                    active=True,
                    created_at=_NOW,
                )
            )
    session.flush()


def _seed_personnel_domain(session: Session) -> None:
    if session.get(Domain, PERSONNEL_DOMAIN_ID) is not None:
        return
    session.add(
        Domain(
            id=PERSONNEL_DOMAIN_ID,
            urn=f"urn:daca:domain:{PERSONNEL_DOMAIN_ID}",
            origin_catalog_id="urn:daca:catalog:bit-poc",
            revision=1,
            content_hash=canonical_hash({"de": "Personal", "en": "Personnel"}),
            lifecycle="active",
            owner_user_id="christian.spider",
            deputy_owner_user_id="sibilla.micheli",
            created_at=_NOW,
            updated_at=_NOW,
        )
    )
    session.add_all(
        [
            DomainLocalization(
                domain_id=PERSONNEL_DOMAIN_ID,
                language="de",
                preferred_label="Personal",
                definition="Fachliche Domäne für Personal- und Organisationsdaten.",
                normalized_label="personal",
            ),
            DomainLocalization(
                domain_id=PERSONNEL_DOMAIN_ID,
                language="en",
                preferred_label="Personnel",
                definition="Subject domain for personnel and organizational data.",
                normalized_label="personnel",
            ),
        ]
    )
    session.flush()


def _concept(
    session: Session,
    concept_id: uuid.UUID,
    identifier: str,
    name: str,
    concept_type: str,
    version: str = "1.0.0",
) -> I14yConcept:
    existing = session.get(I14yConcept, concept_id)
    if existing is not None:
        return existing
    source_url = f"https://api.i14y.admin.ch/api/public/v1/concepts/{concept_id}"
    raw = {
        "id": str(concept_id),
        "identifiers": [identifier],
        "conceptType": concept_type,
        "version": version,
        "sourceUrl": source_url,
    }
    concept = I14yConcept(
        id=concept_id,
        identifiers=[identifier],
        legacy_identifier=identifier,
        name={"de": name},
        description={"de": f"Synchronisierte I14Y-Referenz für {name}."},
        concept_type=concept_type,
        publisher={"name": "Bundesverwaltung"},
        publisher_identifier="ch.admin",
        version=version,
        publication_level="Public",
        registration_status="Standard",
        themes=[],
        conforms_to=[],
        constraints={},
        code_list={"hasEntries": concept_type == "CodeList"},
        source_system={"name": "I14Y"},
        register_uri=f"https://register.ld.admin.ch/i14y/concept/{identifier}/version/{version}",
        source_url=source_url,
        payload_hash=canonical_hash(raw),
        detail_loaded=True,
        raw_payload=raw,
        fetched_at=_NOW,
    )
    session.add(concept)
    session.flush()
    return concept


def _seed_i14y_cache(session: Session) -> None:
    gender = _concept(session, GENDER_CONCEPT_ID, "sex", "Geschlecht", "CodeList")
    _concept(session, VEHICLE_TYPE_CONCEPT_ID, "FAHRZEUGART", "Fahrzeugart", "CodeList")
    _concept(
        session,
        LEGAL_FORM_CONCEPT_ID,
        "legalForm",
        "Rechtsform",
        "CodeList",
        version="1.2.0",
    )
    for position, (code, name) in enumerate(
        (("1", "männlich"), ("2", "weiblich"), ("3", "divers")), start=1
    ):
        entry_id = stable_uuid(f"i14y-entry:{gender.id}:{code}")
        if session.get(I14yCodeListEntry, entry_id) is None:
            raw = {"code": code, "name": {"de": name}}
            session.add(
                I14yCodeListEntry(
                    id=entry_id,
                    concept_id=gender.id,
                    code=code,
                    name={"de": name},
                    description={},
                    annotations=[],
                    position=position,
                    payload_hash=canonical_hash(raw),
                    raw_payload=raw,
                    fetched_at=_NOW,
                )
            )
    session.flush()


def _logical_body(
    identifier: str,
    title: str,
    description: str,
    owner: str,
    deputy: str,
    domain_id: uuid.UUID,
    entity_name: str,
    fields: list[dict[str, object]],
    concept_ids: list[uuid.UUID] | None = None,
) -> LogicalModelWrite:
    return LogicalModelWrite.model_validate(
        {
            "identifiers": [identifier],
            "localizations": [{"language": "de", "title": title, "description": description}],
            "dataOwnerUserId": owner,
            "deputyOwnerUserId": deputy,
            "creator": {
                "type": "InternalOrganisation",
                "organizationId": MODELING_ORGANIZATION_ID,
                "englishName": "Defence",
            },
            "dataDomainId": domain_id,
            "departmentCode": "VBS",
            "organizationId": MODELING_ORGANIZATION_ID,
            "dataClassification": "internal",
            "dateCreated": date(2026, 9, 7),
            "contactPoints": [
                {"name": "Data Governance Verteidigung", "email": "data-governance@vtg.admin.ch"}
            ],
            "publisher": {
                "name": "Verteidigung",
                "identifier": MODELING_ORGANIZATION_ID,
                "uri": f"urn:daca:organization:{MODELING_ORGANIZATION_ID}",
            },
            "accessRights": "urn:daca:access-rights:internal",
            "themes": [],
            "conceptIds": concept_ids or [],
            "entities": [{"name": entity_name, "position": 0, "fields": fields}],
            "distributions": [],
            "dataServices": [],
        }
    )


def _physical_table(
    session: Session, snapshot_id: uuid.UUID, database: str, schema: str, table: str
) -> PhysicalTable:
    row = session.scalar(
        select(PhysicalTable)
        .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
        .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
        .where(
            PhysicalDatabase.snapshot_id == snapshot_id,
            PhysicalDatabase.name == database,
            PhysicalSchema.name == schema,
            PhysicalTable.name == table,
        )
    )
    if row is None:
        raise RuntimeError(f"Seed fixture is missing {database}.{schema}.{table}")
    return row


def _seed_scenarios(session: Session) -> None:
    if session.get(LogicalModel, PERSONNEL_MODEL_ID) is None:
        create_logical_model(
            session,
            _logical_body(
                "VBS-PERSONAL-001",
                "Mitarbeitende",
                "Logical-first Entwurf ohne physische Realisierung.",
                "christian.spider",
                "sibilla.micheli",
                PERSONNEL_DOMAIN_ID,
                "Person",
                [
                    {"name": "personalnummer", "dataType": "string", "length": 20, "nullable": False, "minCount": 1, "position": 0},
                    {
                        "name": "geschlecht_code",
                        "dataType": "string",
                        "length": 1,
                        "valueListConceptId": str(GENDER_CONCEPT_ID),
                        "conceptIds": [str(GENDER_CONCEPT_ID)],
                        "primaryConceptId": str(GENDER_CONCEPT_ID),
                        "position": 1,
                    },
                ],
                [GENDER_CONCEPT_ID],
            ),
            "cinthya.thor",
            model_id=PERSONNEL_MODEL_ID,
        )
    source = session.get(PhysicalSource, PHYSICAL_SOURCE_ID)
    if source is None:
        source_payload = {"name": "VBS PostgreSQL Metadaten (Fixture)", "scope": ["VBS", MODELING_ORGANIZATION_ID]}
        source = PhysicalSource(
            id=PHYSICAL_SOURCE_ID,
            urn=f"urn:daca:physical-source:{PHYSICAL_SOURCE_ID}",
            origin_catalog_id="urn:daca:catalog:bit-poc",
            name=source_payload["name"],
            description="Deterministischer Adapter mit ausschliesslich technischen Metadaten.",
            adapter_type="fixture",
            config_ref=None,
            department_code="VBS",
            organization_id=MODELING_ORGANIZATION_ID,
            revision=1,
            content_hash=canonical_hash(source_payload),
            lifecycle="active",
            created_by_user_id="christian.man",
            created_at=_NOW,
            updated_at=_NOW,
        )
        session.add(source)
        session.flush()
    snapshot = session.scalar(
        select(PhysicalSchemaSnapshot)
        .where(PhysicalSchemaSnapshot.source_id == source.id)
        .order_by(PhysicalSchemaSnapshot.sequence.desc())
        .limit(1)
    )
    if snapshot is None:
        snapshot, _report = persist_physical_import(
            session, source, FixturePhysicalMetadataAdapter(), "christian.man", variant="baseline"
        )
    s3_source = session.get(PhysicalSource, S3_PHYSICAL_SOURCE_ID)
    if s3_source is None:
        s3_payload = {
            "name": "DAAIF S3 Parquet",
            "adapterType": "s3",
            "configRef": "daaif.s3.shared-workspace",
            "scope": ["VBS", MODELING_ORGANIZATION_ID],
        }
        s3_source = PhysicalSource(
            id=S3_PHYSICAL_SOURCE_ID,
            urn=f"urn:daca:physical-source:{S3_PHYSICAL_SOURCE_ID}",
            origin_catalog_id="urn:daca:catalog:bit-poc",
            name=s3_payload["name"],
            description="Mappingfähige Parquet-Strukturen aus dem DAAIF-kompatiblen S3-Speicher.",
            adapter_type="s3",
            config_ref=s3_payload["configRef"],
            department_code="VBS",
            organization_id=MODELING_ORGANIZATION_ID,
            revision=1,
            content_hash=canonical_hash(s3_payload),
            lifecycle="active",
            created_by_user_id="christian.man",
            created_at=_NOW,
            updated_at=_NOW,
        )
        session.add(s3_source)
        session.flush()
    s3_snapshot = session.scalar(
        select(PhysicalSchemaSnapshot)
        .where(PhysicalSchemaSnapshot.source_id == s3_source.id)
        .order_by(PhysicalSchemaSnapshot.sequence.desc())
        .limit(1)
    )
    if s3_snapshot is None:
        persist_physical_import(
            session,
            s3_source,
            FixtureS3PhysicalMetadataAdapter(),
            "christian.man",
            variant="baseline",
        )
    vibdbu_source = session.get(PhysicalSource, VIBDBU_PHYSICAL_SOURCE_ID)
    if vibdbu_source is None:
        vibdbu_payload = {
            "name": "SAP VIBDBU Gebäudebestand",
            "adapterType": "postgresql",
            "configRef": "sample-data-product.vibdbu",
            "scope": ["VBS", REAL_ESTATE_ORGANIZATION_ID],
        }
        vibdbu_source = PhysicalSource(
            id=VIBDBU_PHYSICAL_SOURCE_ID,
            urn=f"urn:daca:physical-source:{VIBDBU_PHYSICAL_SOURCE_ID}",
            origin_catalog_id="urn:daca:catalog:bit-poc",
            name=vibdbu_payload["name"],
            description=(
                "Metadatenquelle für den synthetischen SAP-Gebäudebestand VIBDBU "
                "mit 1'000 plausiblen Datensätzen."
            ),
            adapter_type="postgresql",
            config_ref=vibdbu_payload["configRef"],
            department_code="VBS",
            organization_id=REAL_ESTATE_ORGANIZATION_ID,
            revision=1,
            content_hash=canonical_hash(vibdbu_payload),
            lifecycle="active",
            created_by_user_id="mirjam.keller",
            created_at=_NOW,
            updated_at=_NOW,
        )
        session.add(vibdbu_source)
        session.flush()
    elif vibdbu_source.lifecycle != "active":
        # This is the durable browser demo source. Re-enable it on every seed run so a prior
        # lifecycle test or an accidental retirement cannot hide the VIBDBU modelling journey.
        vibdbu_source.lifecycle = "active"
        vibdbu_source.retired_at = None
        vibdbu_source.revision += 1
        vibdbu_source.updated_at = _NOW

    vibdbu_snapshot = session.scalar(
        select(PhysicalSchemaSnapshot)
        .where(PhysicalSchemaSnapshot.source_id == vibdbu_source.id)
        .order_by(PhysicalSchemaSnapshot.sequence.desc())
        .limit(1)
    )
    if vibdbu_snapshot is None:
        # The matching sample-data-product migration owns the data rows. The catalog seed stores
        # only the immutable, credential-free structural snapshot so this demo source is
        # immediately browseable without granting the catalog service row access.
        persist_physical_import(
            session,
            vibdbu_source,
            VibdbuPhysicalMetadataAdapter(),
            "mirjam.keller",
            variant="baseline",
        )

    vehicle_table = _physical_table(
        session, snapshot.id, "logistics_db", "logistics", "vehicle_inventory"
    )
    vehicle_columns = list(
        session.scalars(
            select(PhysicalColumn)
            .where(PhysicalColumn.physical_table_id == vehicle_table.id)
            .order_by(PhysicalColumn.ordinal_position)
        )
    )
    if session.get(LogicalModel, VEHICLE_MODEL_ID) is None:
        _vehicle_model, vehicle_version = create_logical_model(
            session,
            _logical_body(
                "VBS-FAHRZEUGBESTAND-001",
                "Fahrzeugbestand",
                "Physical-first Entwurf aus logistics.vehicle_inventory.",
                "lawrence.hill",
                "hong.an.captain",
                MOBILITY_DOMAIN_ID,
                "vehicle_inventory",
                [
                    {
                        "name": column.name,
                        "dataType": column.normalized_data_type,
                        "length": column.character_length,
                        "precision": column.numeric_precision,
                        "decimalPlaces": column.numeric_scale,
                        "nullable": column.nullable,
                        "minCount": 0 if column.nullable else 1,
                        "maxCount": 1,
                        "sourceSystem": source.name,
                        "position": position,
                    }
                    for position, column in enumerate(vehicle_columns)
                ],
                [VEHICLE_TYPE_CONCEPT_ID],
            ),
            "christian.man",
            model_id=VEHICLE_MODEL_ID,
        )
        entity_version = session.scalar(
            select(LogicalEntityVersion).where(
                LogicalEntityVersion.logical_model_version_id == vehicle_version.id
            )
        )
        logical_fields = list(
            session.scalars(
                select(LogicalFieldVersion)
                .where(LogicalFieldVersion.logical_entity_version_id == entity_version.id)
                .order_by(LogicalFieldVersion.position)
            )
        )
        for logical_field, physical_column in zip(logical_fields, vehicle_columns, strict=True):
            create_asset_mapping(
                session,
                AssetMappingWrite(
                    logical_model_version_id=vehicle_version.id,
                    physical_snapshot_id=snapshot.id,
                    mapping_type="Direct",
                    classification="internal",
                    responsible_user_id="christian.man",
                    valid_from=date(2026, 9, 7),
                    logical_field_version_ids=[logical_field.id],
                    physical_column_ids=[physical_column.id],
                    comment="Automatisch vorgeschlagene Herkunftszuordnung; fachlich zu prüfen.",
                ),
                "christian.man",
            )
    if session.get(LogicalModel, ORGANIZATION_MODEL_ID) is None:
        _physical_table(session, snapshot.id, "hr_core", "public", "org_unit")
        create_logical_model(
            session,
            _logical_body(
                "VBS-ORG-EINHEITEN-001",
                "Organisationseinheiten",
                "Bestehendes logisches Modell, initial ohne Asset-Mapping.",
                "christian.spider",
                "sibilla.micheli",
                DEFENCE_DOMAIN_ID,
                "Organisationseinheit",
                [
                    {"name": "organisationseinheit_id", "dataType": "uuid", "nullable": False, "minCount": 1, "position": 0},
                    {"name": "code", "dataType": "string", "length": 32, "nullable": False, "minCount": 1, "position": 1},
                    {"name": "bezeichnung", "dataType": "string", "length": 255, "nullable": False, "minCount": 1, "position": 2},
                ],
            ),
            "cinthya.thor",
            model_id=ORGANIZATION_MODEL_ID,
        )

def _retire_duplicate_source_instances(session: Session) -> None:
    """Keep one active source per opaque connection configuration and organization scope.

    A config reference identifies a server-side connection, never a credential. Repeated fixture
    registrations of the same reference therefore represent one physical system, not many sources.
    Historical snapshots and mappings remain attached to their retired registrations.
    """
    groups: dict[tuple[str, str, str, str], list[PhysicalSource]] = {}
    for source in session.scalars(select(PhysicalSource).where(PhysicalSource.lifecycle == "active")):
        if not source.config_ref:
            continue
        key = (source.adapter_type, source.config_ref, source.department_code, source.organization_id)
        groups.setdefault(key, []).append(source)
    for sources in groups.values():
        if len(sources) < 2:
            continue
        keep = min(sources, key=lambda source: (source.created_at, str(source.id)))
        for source in sources:
            if source.id == keep.id:
                continue
            source.lifecycle = "retired"
            source.retired_at = _NOW
            source.revision += 1
            source.updated_at = _NOW


def seed_modeling_catalog(session: Session) -> None:
    """Seed six VBS personas, real I14Y references, and three modeling scenarios."""
    _seed_federal_hierarchy(session)
    _seed_people_and_roles(session)
    _seed_armasuisse_personas(session)
    _seed_real_estate_journey(session)
    _seed_personnel_domain(session)
    _seed_i14y_cache(session)
    # The marker lives in the foundational schema while the modeling tables are
    # introduced by later migrations.  A downgrade to 0015 therefore preserves
    # the marker but removes the scenarios.  Keep the individually guarded
    # scenario seed self-healing so downgrade/re-upgrade/seed remains idempotent.
    _seed_scenarios(session)
    _retire_duplicate_source_instances(session)
    if session.get(SeedMarker, MODELING_SEED_NAME) is None:
        session.add(SeedMarker(name=MODELING_SEED_NAME, applied_at=_NOW))
    session.commit()
