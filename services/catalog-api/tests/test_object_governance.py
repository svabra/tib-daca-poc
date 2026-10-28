import uuid

from daca_catalog.domain_glossary_seed import DEFENCE_DOMAIN_ID, MOBILITY_DOMAIN_ID
from daca_catalog.models import CatalogObjectResponsibility, DemoUser, Domain, GlossaryTermDomain
from daca_catalog.object_governance import term_owner_pair
from daca_catalog.seed import seed_catalog
from sqlalchemy import select


def h(actor, revision=None):
    return {"X-DaCa-User": actor, **({"If-Match": f'"{revision}"'} if revision else {})}


def test_no_global_register_role_and_domain_deputy_has_only_object_rights(client, session_factory):
    with session_factory() as session:
        session.add(
            DemoUser(
                id="legacy-register",
                display_name="Legacy",
                organization="Demo",
                email="legacy@example.test",
                roles=["domain_register_owner"],
                active=True,
            )
        )
        session.get(DemoUser, "sibilla.micheli").roles = ["data_consumer"]
        session.commit()
    path = f"/api/v1/domains/{DEFENCE_DOMAIN_ID}"
    body = {
        "localizations": [
            {
                "language": "de",
                "preferredLabel": "Eigene Domäne",
                "definition": "Synthetische Prüfung.",
            }
        ]
    }
    for actor in ("legacy-register", "kassandra.valdata"):
        assert client.patch(path, headers=h(actor, 1), json=body).status_code == 403
    updated = client.patch(path, headers=h("sandro.wenger", 1), json=body)
    assert updated.status_code == 200, updated.text
    assert (
        client.patch(
            f"/api/v1/domains/{MOBILITY_DOMAIN_ID}", headers=h("sandro.wenger", 1), json=body
        ).status_code
        == 403
    )


def test_domain_link_diff_checks_each_source_and_preserves_foreign_links(client):
    path = "/api/v1/semantic-graphs/domains"
    first = {
        "sourceId": str(DEFENCE_DOMAIN_ID),
        "targetId": str(MOBILITY_DOMAIN_ID),
        "relationType": "related",
    }
    saved = client.put(
        path,
        headers=h("sibilla.micheli"),
        json={"revision": 0, "positions": {}, "relations": [first]},
    )
    assert saved.status_code == 200, saved.text
    assert f"domain:{DEFENCE_DOMAIN_ID}" in saved.json()["relationSourceNodeIds"]
    assert f"domain:{MOBILITY_DOMAIN_ID}" not in saved.json()["relationSourceNodeIds"]
    assert (
        client.put(
            path,
            headers=h("kassandra.valdata"),
            json={"revision": 1, "positions": {}, "relations": []},
        ).status_code
        == 403
    )
    other = next(
        row["id"]
        for row in client.get("/api/v1/domains").json()
        if row["id"] not in {str(DEFENCE_DOMAIN_ID), str(MOBILITY_DOMAIN_ID)}
    )
    second = {"sourceId": str(MOBILITY_DOMAIN_ID), "targetId": other, "relationType": "related"}
    result = client.put(
        path,
        headers=h("kassandra.valdata"),
        json={"revision": 1, "positions": {}, "relations": [first, second]},
    )
    assert result.status_code == 200, result.text
    assert result.json()["relations"] == [first, second]


def test_term_ownership_is_independent_of_domain_membership_and_seed(client, session_factory):
    with session_factory() as session:
        term_id = next(
            identity
            for identity in session.scalars(
                select(GlossaryTermDomain.term_id).where(
                    GlossaryTermDomain.domain_id == DEFENCE_DOMAIN_ID
                )
            )
            if term_owner_pair(session, identity)[0] == "sibilla.micheli"
        )
        domain = session.get(Domain, DEFENCE_DOMAIN_ID)
        domain.owner_user_id = "noemie.rochat"
        domain.deputy_owner_user_id = "lucien.morel"
        session.add(
            CatalogObjectResponsibility(
                id=uuid.uuid4(),
                user_id="kassandra.valdata",
                role="deputy_data_steward",
                glossary_term_id=term_id,
            )
        )
        session.commit()
        seed_catalog(session)
        assert term_owner_pair(session, term_id) == ("sibilla.micheli", "sandro.wenger")
    path = f"/api/v1/glossary/terms/{term_id}/retire-direct"
    for actor in ("noemie.rochat", "kassandra.valdata"):
        assert client.post(path, headers=h(actor, 1), json={}).status_code == 403
    retired = client.post(path, headers=h("sandro.wenger", 1), json={})
    assert retired.status_code == 200, retired.text
    assert retired.json()["ownerUserId"] == "sibilla.micheli"
    with session_factory() as session:
        for row in session.scalars(
            select(CatalogObjectResponsibility).where(
                CatalogObjectResponsibility.glossary_term_id == term_id
            )
        ):
            row.active = False
        session.commit()
        seed_catalog(session)
        assert term_owner_pair(session, term_id) == (None, None)


def test_domain_request_routes_to_current_object_owners_not_requested_new_owner(client):
    response = client.post(
        "/api/v1/domain-change-requests",
        headers=h("kassandra.valdata"),
        json={
            "operation": "update",
            "targetDomainId": str(DEFENCE_DOMAIN_ID),
            "baseRevision": 1,
            "payload": {
                "ownerUserId": "noemie.rochat",
                "deputyOwnerUserId": "lucien.morel",
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Übergabe",
                        "definition": "Synthetische Übergabe.",
                    }
                ],
            },
        },
    )
    assert response.status_code == 201, response.text
    request = response.json()
    path = f"/api/v1/domain-change-requests/{request['id']}/decision"
    assert (
        client.post(
            path,
            headers=h("noemie.rochat", 1),
            json={"decision": "approve", "comment": "Unzuständig"},
        ).status_code
        == 403
    )
    inbox = client.get("/api/v1/domain-change-requests", headers=h("sandro.wenger")).json()
    assert next(item for item in inbox if item["id"] == request["id"])["canReview"]
    decided = client.post(
        path,
        headers=h("sandro.wenger", 1),
        json={"decision": "approve", "comment": "Als Objekt-Stellvertretung geprüft."},
    )
    assert decided.status_code == 200, decided.text
    domain = client.get(f"/api/v1/domains/{DEFENCE_DOMAIN_ID}").json()
    assert domain["ownerUserId"] == "noemie.rochat"
