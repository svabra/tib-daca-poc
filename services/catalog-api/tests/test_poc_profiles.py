from pathlib import Path
from types import SimpleNamespace

from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import DemoUser, FederalPersonMembership
from daca_catalog.organization_display import OrganizationDisplay
from daca_catalog.poc_portraits import PORTRAIT_USER_IDS, seed_poc_portraits
from daca_catalog.rohs_cps_seed import seed_rohs_cps_catalog
from sqlalchemy import select


def test_federal_paths_keep_office_and_unit_without_repeating_parents():
    labels = OrganizationDisplay.__new__(OrganizationDisplay)
    labels.organizations = {}
    for identity, parent, department, code, name, kind in (
        ("efd", None, "EFD", None, "Finanzdepartement", "department"),
        ("bit", "efd", "EFD", "BIT", "Bundesamt für Informatik BIT", "office"),
        ("ps", "bit", "EFD", "BIT-PS", "Plattform Services", "affiliated"),
        ("cps", "ps", "EFD", "BIT-PS-CPS", "Container Platform Services", "affiliated"),
        ("estv", "efd", "EFD", "ESTV", "Steuerverwaltung", "office"),
        ("bi", "estv", "EFD", "Business Intelligence", "Business Intelligence", "affiliated"),
        ("vbs", None, "VBS", None, "VBS", "department"),
        ("vbs-verteidigung", "vbs", "VBS", "Verteidigung", "Verteidigung", "office"),
        ("cy", "vbs-verteidigung", "VBS", "Kdo Cy", "Kommando Cyber", "affiliated"),
    ):
        labels.organizations[identity] = SimpleNamespace(
            id=identity, parent_id=parent, department_code=department, office_code=code,
            display_name=name, organization_type=kind,
        )
    assert labels.label("cps") == "EFD BIT PS CPS"
    assert labels.label("bi") == "EFD ESTV Business Intelligence"
    assert labels.label("cy") == "VBS V Kdo Cy"
    assert labels.label(None, "Kanton Neuchâtel") == "Kanton Neuchâtel"
    labels.primary, labels.membership_users, labels.directory = {}, {"former"}, {"former": "bit"}
    assert labels.user(SimpleNamespace(id="former", organization="External")) == "External"


def test_all_selectable_poc_profiles_have_distinct_local_photos_and_canonical_labels(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_rohs_cps_catalog(session)
        # Existing installations used the FM initials placeholder for Fausto.
        session.get(DemoUser, "fausto.marzo").avatar_url = "/assets/data-owners/fausto-marzo.svg"
        before = [(m.user_id, m.organization_id) for m in session.scalars(select(FederalPersonMembership))]
        seed_poc_portraits(session)
        seed_poc_portraits(session)
        assert [(m.user_id, m.organization_id) for m in session.scalars(select(FederalPersonMembership))] == before
        session.commit()
    response = client.get("/api/v1/demo-users")
    assert response.status_code == 200
    users = {item["id"]: item for item in response.json()}
    assert len(users) == 26
    assert users["kassandra.valdata"]["organization"] == "EFD ESTV"
    assert users["christian.spider"]["organization"] == "VBS armasuisse"
    assert users["sibilla.micheli"]["organization"] == "VBS GS"
    assert users["sibilla.micheli"]["displayName"] == "Sibilla Di Ciesa"
    assert users["christian.spider"]["displayName"] == "Christiano Stadello"
    assert users["sibilla.micheli"]["office"] == "vbs-gs"
    assert users["christian.spider"]["office"] == "vbs-armasuisse"
    assert users["thomas.kriegli"]["organization"] == "EFD ESTV BI"
    assert users["joel.ruod"]["organization"] == "EFD ESTV BI"
    assert users["sibilla.micheli"]["organizationMandates"] == [{
        "organizationId": "vbs", "organizationName": "VBS", "mandateType": "ldsd", "isDeputy": False,
    }]
    assert users["christian.spider"]["organizationMandates"][0]["mandateType"] == "alds"
    assert users["daniel.wenger"]["organization"] == "VBS armasuisse Immobilien"
    assert users["marcello.hebeisa"]["organization"] == "EFD BIT PS CPS"
    assert users["noemie.rochat"]["organization"] == "Kanton Neuchâtel"
    assets = Path(__file__).resolve().parents[3] / "apps/catalog-ui/public"
    assert len({user["avatarUrl"] for user in users.values()}) == 26
    assert users["fausto.marzo"]["organization"] == "EFD BIT PS"
    assert users["fausto.marzo"]["roles"] == ["publication_approver"]
    assert users["fausto.marzo"]["avatarUrl"] == "/assets/data-owners/fausto-marzo.webp"
    for user in users.values():
        assert (assets / user["avatarUrl"].lstrip("/")).is_file()
    with session_factory() as session:
        user = session.get(DemoUser, "marcello.hebeisa")
        user.avatar_url = "/assets/custom.webp"
        session.flush()
        seed_poc_portraits(session)
        assert user.avatar_url == "/assets/custom.webp"
        # Display projection never rewrites legacy organization/policy attributes.
        assert session.get(DemoUser, "kassandra.valdata").organization == "ESTV"
    for identity in PORTRAIT_USER_IDS:
        assert users[identity]["avatarUrl"].endswith(identity.replace(".", "-") + ".webp")


def test_confirmed_persona_scopes_preserve_object_duties_and_later_edits(session_factory):
    from daca_catalog.domain_glossary_seed import DEFENCE_DOMAIN_ID, stable_id
    from daca_catalog.domain_ownership import domain_organization_ids
    from daca_catalog.models import (
        DataModelRoleAssignment,
        DataProduct,
        Domain,
        IdentityDirectoryEntry,
        SeedMarker,
    )
    from daca_catalog.office_governance import (
        can_transfer_domain,
        domain_creation_reviewers,
        seed_data_analytics_domain,
    )
    from daca_catalog.poc_identity_updates import (
        PERSONA_SCOPE_MARKER,
        seed_requested_persona_scopes,
    )

    with session_factory() as session:
        seed_modeling_catalog(session)
        products = [(p.id, p.owner_user_id, p.deputy_owner_user_id, p.control_person_user_id)
                    for p in session.scalars(select(DataProduct))]
        roles = [(r.id, r.user_id, r.organization_id, r.role, r.active)
                 for r in session.scalars(select(DataModelRoleAssignment))]
        person = session.get(DemoUser, "christian.spider")
        person.display_name, person.organization = "Legacy persona", "Verteidigung"
        person.active, person.avatar_url = False, "/assets/custom.webp"
        # An older installation may already be in the prepared (retired-domain)
        # fixture state when the personnel correction is applied.
        from daca_catalog.models import CatalogObjectResponsibility
        for scope in session.scalars(select(CatalogObjectResponsibility).where(
            CatalogObjectResponsibility.domain_id == DEFENCE_DOMAIN_ID,
            CatalogObjectResponsibility.provenance == "poc-persona-scope-correction",
        )):
            session.delete(scope)
        defence = session.get(Domain, DEFENCE_DOMAIN_ID)
        defence.lifecycle = "retired"
        membership = session.scalar(select(FederalPersonMembership).where(FederalPersonMembership.user_id == person.id))
        original_id, original_start = membership.id, membership.valid_from
        membership.organization_id = "vbs-verteidigung"
        session.delete(session.get(SeedMarker, PERSONA_SCOPE_MARKER))
        session.flush()
        seed_requested_persona_scopes(session)
        seed_requested_persona_scopes(session)
        assert person.display_name == "Christiano Stadello"
        assert person.active is False and person.avatar_url == "/assets/custom.webp"
        assert (membership.id, membership.valid_from) == (original_id, original_start)
        assert membership.organization_id == "vbs-armasuisse"
        assert session.get(IdentityDirectoryEntry, person.id).organization_id == "vbs-armasuisse"
        assert products == [(p.id, p.owner_user_id, p.deputy_owner_user_id, p.control_person_user_id)
                            for p in session.scalars(select(DataProduct))]
        assert roles == [(r.id, r.user_id, r.organization_id, r.role, r.active)
                         for r in session.scalars(select(DataModelRoleAssignment))]
        defence = session.get(Domain, DEFENCE_DOMAIN_ID)
        assert domain_organization_ids(session, defence) == {"vbs-verteidigung"}
        assert defence.lifecycle == "retired"
        defence.lifecycle = "active"
        session.flush()
        assert can_transfer_domain(session, "sibilla.micheli", defence)
        assert domain_creation_reviewers(session, "lawrence.hill", "sandro.wenger") == {"christian.man"}
        assert domain_creation_reviewers(session, "sibilla.micheli", "sandro.wenger") == set()
        analytics = session.get(Domain, stable_id("domain:data-analytics"))
        assert analytics.owner_user_id == "thomas.kriegli"
        assert analytics.deputy_owner_user_id == "joel.ruod"
        assert domain_organization_ids(session, analytics) == {"efd-estv-bi"}
        assert not can_transfer_domain(session, "sibilla.micheli", analytics)
        person.organization = "Later operator edit"
        analytics.lifecycle = "retired"
        session.flush()
        seed_requested_persona_scopes(session)
        seed_data_analytics_domain(session)
        assert person.organization == "Later operator edit"
        assert analytics.lifecycle == "retired"
