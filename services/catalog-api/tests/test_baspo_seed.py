import json

from daca_catalog import seed
from daca_catalog.baspo_content import DOMAINS, MODELS, RELATIONS, TERMS
from daca_catalog.baspo_seed import (
    DAVIDE,
    MARKER,
    ORG,
    ROLAND,
    SOURCE,
    identity,
    owners,
    seed_baspo_catalog,
)
from daca_catalog.domain_ownership import domain_organization_ids, person_organization_ids
from daca_catalog.modeling_core import canonical_hash
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import (
    AdministrativeOrganization,
    AssetMapping,
    CatalogObjectResponsibility,
    DataModelRoleAssignment,
    DataProduct,
    DcatDatasetVersion,
    DemoUser,
    Domain,
    DomainLocalization,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermRelation,
    LogicalEntityVersion,
    LogicalFieldVersion,
    LogicalModel,
    LogicalModelVersion,
    PhysicalSource,
    SeedMarker,
    TerminologyExternalReference,
    TerminologyTermVersion,
)
from sqlalchemy import func, select


def test_baspo_sources_and_graph_are_complete_and_have_no_hierarchy_cycle():
    snapshot = json.loads(SOURCE.read_text(encoding="utf-8"))
    assert len(DOMAINS) == 8 and len(TERMS) == 30 and len(MODELS) == 5
    keys = {row[0] for row in TERMS}
    assert len(keys) == len(TERMS)
    domain_keys = {row[0] for row in DOMAINS}
    assert {domain for row in TERMS for domain in row[3]} == domain_keys
    for _, entry, definition, domains, _ in TERMS:
        source = snapshot["entries"][str(entry)]
        assert source["sourceUri"] == f"https://www.termdat.bk.admin.ch/entry/{entry}"
        assert source["designations"]["de"] and source["collectionCode"]
        assert definition and set(domains) <= domain_keys
    reached = {"sportfoerderung"}
    for _ in keys:
        for source, relation, target in RELATIONS:
            assert source != target and {source, target} <= keys
            if reached.intersection({source, target}):
                reached.update((source, target))
    assert reached == keys
    broader = {source: target for source, relation, target in RELATIONS if relation == "broader"}
    for key in keys:
        seen = {key}
        while key in broader:
            key = broader[key]
            assert key not in seen
            seen.add(key)


def test_baspo_onboards_flat_existing_office_and_keeps_both_people_data_owners(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        session.get(AdministrativeOrganization, ORG).parent_id = None
        session.flush()
        assert seed_baspo_catalog(session)
        session.commit()
        assert session.get(AdministrativeOrganization, ORG).parent_id == "vbs"
        for user_id, name in ((ROLAND, "Roland Maestro"), (DAVIDE, "Davide Partito")):
            user = session.get(DemoUser, user_id)
            assert user.display_name == name and user.organization == "BASPO"
            assert user.roles == ["data_owner"] and user.active and user.selectable
            assert user.email.endswith("@example.invalid")
            assert person_organization_ids(session, user_id) == {ORG}
            roles = list(session.scalars(select(DataModelRoleAssignment).where(DataModelRoleAssignment.user_id == user_id)))
            assert [(r.organization_id, r.department_code, r.role) for r in roles] == [(ORG, "VBS", "data_owner")]
        for key, _, _ in DOMAINS:
            domain = session.get(Domain, identity(f"domain:{key}"))
            assert (domain.owner_user_id, domain.deputy_owner_user_id) == owners(key)
            assert domain_organization_ids(session, domain) == {ORG}


def test_baspo_terms_have_inspectable_sources_and_logical_models_have_no_physical_representations(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        before = {model: session.scalar(select(func.count()).select_from(model)) for model in (PhysicalSource, AssetMapping, DataProduct)}
        seed_baspo_catalog(session)
        session.commit()
        for key, entry_id, definition, domains, _ in TERMS:
            term_id = identity(f"term:{key}")
            term = session.get(GlossaryTerm, term_id)
            assert term.is_termdat
            label = session.get(GlossaryTermLocalization, (term_id, "de"))
            assert label.definition == definition and "redaktionelle" in label.detailed_description
            assigned = set(session.scalars(select(GlossaryTermDomain.domain_id).where(GlossaryTermDomain.term_id == term_id)))
            assert assigned == {identity(f"domain:{key}") for key in domains}
            reference = session.get(TerminologyExternalReference, identity(f"source:{key}"))
            assert reference.source_identifier == str(entry_id) and reference.source_type == "termdat"
            assert reference.payload_hash == canonical_hash(reference.text_snapshot)
            relation = session.get(GlossaryTermRelation, identity(f"source-link:{key}"))
            assert relation.target_uri == reference.source_uri and relation.relation == "exactMatch"
        assert len(list(session.scalars(select(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id.in_([identity(f"term:{row[0]}") for row in TERMS]))))) == len(TERMS) + len(RELATIONS)
        for key, _, domain, _, _ in MODELS:
            model = session.get(LogicalModel, identity(f"model:{key}"))
            assert model.published_revision is None
            version = session.scalar(select(LogicalModelVersion).where(LogicalModelVersion.logical_model_id == model.id))
            assert version.status == "draft"
            dataset = session.get(DcatDatasetVersion, version.dataset_version_id)
            assert dataset.data_domain_id == identity(f"domain:{domain}")
            assert dataset.organization_id == ORG and dataset.department_code == "VBS"
            assert (dataset.data_owner_user_id, dataset.deputy_owner_user_id) == owners(domain)
            entities = list(session.scalars(select(LogicalEntityVersion).where(LogicalEntityVersion.logical_model_version_id == version.id)))
            assert len(entities) == 3 and all(row.comment for row in entities)
            fields = list(session.scalars(select(LogicalFieldVersion).where(LogicalFieldVersion.logical_entity_version_id.in_([row.id for row in entities]))))
            assert len(fields) >= 14 and all(row.short_description for row in fields)
            for row in [*entities, *fields]:
                if row.business_object_version_id:
                    target = session.get(TerminologyTermVersion, row.business_object_version_id)
                    assert target.status == "published" and target.concept_kind == "business_object"
        assert {model: session.scalar(select(func.count()).select_from(model)) for model in before} == before


def test_seed_cli_adds_baspo_to_existing_catalog_without_rewriting_later_edits(session_factory, monkeypatch):
    monkeypatch.setenv("SEED_ON_STARTUP", "false")
    monkeypatch.setattr(seed, "default_session_factory", lambda settings: session_factory)
    with session_factory() as session:
        seed_modeling_catalog(session)
        assert session.get(SeedMarker, MARKER) is None
    seed.main()
    with session_factory() as session:
        assert session.get(SeedMarker, MARKER)
        term = session.get(GlossaryTerm, identity("term:sportfoerderung"))
        term.lifecycle = "retired"
        label = session.get(DomainLocalization, (identity("domain:sportpolitik"), "de"))
        label.preferred_label = "Vom BASPO überarbeitet"
        session.get(DemoUser, DAVIDE).active = False
        role = session.get(DataModelRoleAssignment, identity(f"role:{DAVIDE}"))
        role.active = False
        responsibility = session.get(CatalogObjectResponsibility,
            identity(f"responsibility:domain_id:{identity('domain:sportpolitik')}:{ROLAND}"))
        responsibility.active = False
        session.get(AdministrativeOrganization, ORG).parent_id = None
        session.commit()
    seed.main()
    with session_factory() as session:
        assert session.get(GlossaryTerm, identity("term:sportfoerderung")).lifecycle == "retired"
        assert session.get(DomainLocalization, (identity("domain:sportpolitik"), "de")).preferred_label == "Vom BASPO überarbeitet"
        assert not session.get(DemoUser, DAVIDE).active
        assert not session.get(DataModelRoleAssignment, identity(f"role:{DAVIDE}")).active
        assert not session.get(CatalogObjectResponsibility, responsibility.id).active
        assert session.get(AdministrativeOrganization, ORG).parent_id is None
        assert session.scalar(select(func.count()).select_from(DemoUser).where(DemoUser.id.in_([ROLAND, DAVIDE]))) == 2
