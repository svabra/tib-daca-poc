
import pytest
from daca_catalog.domain_glossary_seed import DEFENCE_DOMAIN_ID
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import AuditEvent, FederalPersonMembership, OrganizationStewardMandate
from daca_catalog.office_governance import (
    provision_steward_mandate,
    seed_rapid_prototyping_domain,
    seed_requested_steward_mandates,
)
from fastapi import HTTPException
from sqlalchemy import select


def h(actor, revision=None):
    return {"X-DaCa-User": actor, **({"If-Match": f'"{revision}"'} if revision else {})}


def install(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_requested_steward_mandates(session)
        session.commit()


def test_owner_deputy_and_office_alds_can_edit_but_foreign_office_and_profile_roles_cannot(client, session_factory):
    install(session_factory)
    path = f"/api/v1/domains/{DEFENCE_DOMAIN_ID}"
    body = {"localizations": [{"language": "de", "preferredLabel": "Verteidigung", "definition": "Aktualisierte Beschreibung."}]}
    for actor in ("sibilla.micheli", "sandro.wenger", "christian.man"):
        assert client.get(path, headers=h(actor)).json()["canEditMetadata"] is True
    for actor in ("christian.spider", "thomas.kriegli", "joel.ruod", "kassandra.valdata"):
        assert client.get(path, headers=h(actor)).json()["canEditMetadata"] is False
        assert client.patch(path, headers=h(actor, 1), json=body).status_code == 403
    saved = client.patch(path, headers=h("christian.man", 1), json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 2 and saved.json()["canEditMetadata"] is True
    assert client.patch(path, headers=h("christian.man", 1), json=body).status_code == 412
    assert client.patch(path, headers=h("christian.man", 2), json={"ownerUserId": "christian.man"}).status_code == 403
    assert client.post(path+"/retire", headers=h("christian.man", 2)).status_code == 403


def test_estv_alds_and_deputy_share_only_their_office_scope(client, session_factory):
    install(session_factory)
    domains = client.get("/api/v1/domains").json()
    target = next(row for row in domains if row["preferredLabel"] == "Mehrwertsteuer")
    for actor in ("thomas.kriegli", "joel.ruod"):
        assert client.get(f'/api/v1/domains/{target["id"]}', headers=h(actor)).json()["canEditMetadata"] is True
    with session_factory() as session:
        provision_steward_mandate(session, organization_id="efd-estv", user_id="thomas.kriegli",
            deputy_user_id="joel.ruod", mandate_type="alds", expected_revision=1,
            operator="test-operator", decision_reference="Withdrawal test", active=False)
        session.commit()
        seed_requested_steward_mandates(session)
        session.commit()
        assert session.get(OrganizationStewardMandate, "efd-estv").active is False
    for actor in ("thomas.kriegli", "joel.ruod"):
        assert client.get(f'/api/v1/domains/{target["id"]}', headers=h(actor)).json()["canEditMetadata"] is False


def test_directory_scope_fallback_does_not_resurrect_expired_primary_membership(client, session_factory):
    import uuid
    from datetime import date

    install(session_factory)
    target = next(row for row in client.get("/api/v1/domains").json() if row["preferredLabel"] == "Mehrwertsteuer")
    with session_factory() as session:
        session.add(FederalPersonMembership(id=uuid.uuid4(), user_id="ariane.keller",
            organization_id="efd-estv", is_primary=True, valid_from=date(2020, 1, 1), valid_to=date(2021, 1, 1)))
        session.commit()
    assert client.get(f'/api/v1/domains/{target["id"]}', headers=h("thomas.kriegli")).json()["canEditMetadata"] is False


def test_mandate_provisioning_checks_scope_revision_and_appends_evidence(session_factory):
    install(session_factory)
    with session_factory() as session:
        with pytest.raises(HTTPException) as stale:
            provision_steward_mandate(session, organization_id="vbs", user_id="sibilla.micheli", mandate_type="ldsd", expected_revision=0, operator="test-operator", decision_reference="Test decision")
        assert stale.value.status_code == 409
        with pytest.raises(HTTPException) as wrong_scope:
            provision_steward_mandate(session, organization_id="vbs", user_id="christian.man", mandate_type="alds", expected_revision=1, operator="test-operator", decision_reference="Test decision")
        assert wrong_scope.value.status_code == 422
        event = session.scalar(select(AuditEvent).where(AuditEvent.resource_type == "organization-steward-mandate", AuditEvent.resource_id == "efd-estv"))
        assert event.details["deputyUserId"] == "joel.ruod"
        assert event.details["mandateType"] == "alds"


def test_requested_rapid_domain_keeps_confirmed_responsibilities_and_later_changes(client, session_factory):
    install(session_factory)
    with session_factory() as session:
        domain = seed_rapid_prototyping_domain(session)
        identity = domain.id
        session.commit()
        assert domain.owner_user_id == "joel.ruod" and domain.deputy_owner_user_id == "thomas.kriegli"
    path = f"/api/v1/domains/{identity}"
    body = {"localizations": [{"language":"de","preferredLabel":"Data Analytics Rapid Prototyping","definition":"Neue Beschreibung"}]}
    result = client.patch(path, headers=h("thomas.kriegli", 1), json=body)
    assert result.status_code == 200, result.text
    with session_factory() as session:
        same = seed_rapid_prototyping_domain(session)
        assert same.id == identity and same.revision == 2
