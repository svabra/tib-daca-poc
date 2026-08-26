from __future__ import annotations

import uuid

from daca_catalog.domain_glossary_seed import DEFENCE_DOMAIN_ID, MOBILITY_DOMAIN_ID
from rdflib import DCTERMS, Graph, URIRef

SANDRO = {"X-DaCa-User": "sandro.wenger"}
SIBILLA = {"X-DaCa-User": "sibilla.micheli"}
KASSANDRA = {"X-DaCa-User": "kassandra.valdata"}


def _domain_by_label(client, label: str) -> dict:
    response = client.get("/api/v1/domains")
    assert response.status_code == 200
    return next(item for item in response.json() if item["preferredLabel"] == label)


def _vehicle_product(client) -> dict:
    response = client.get("/api/v1/data-products", headers=SANDRO)
    assert response.status_code == 200
    return next(
        item
        for item in response.json()["items"]
        if item["title"] == "Flottenbestand gepanzerte Fahrzeuge"
    )


def _accepted_vehicle_term(client) -> tuple[dict, dict]:
    defence = _domain_by_label(client, "Verteidigung")
    logistics = _domain_by_label(client, "Mobilität & Logistik")
    product = _vehicle_product(client)
    patch = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={**SANDRO, "If-Match": f'"{product["revision"]}"'},
        json={"domainIds": [defence["id"], logistics["id"]]},
    )
    assert patch.status_code == 200
    proposal = client.post(
        "/api/v1/glossary/term-proposals",
        headers=SANDRO,
        json={
            "sourceProductId": product["id"],
            "autoAttach": True,
            "payload": {
                "domainIds": [defence["id"], logistics["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Gepanzertes Fahrzeug",
                        "definition": "Ein Fahrzeug mit strukturellem Schutz gegen äussere Bedrohungen.",
                    },
                    {
                        "language": "en",
                        "preferredLabel": "Armored Vehicle",
                        "alternativeLabels": ["Armoured Vehicle"],
                        "definition": "A vehicle with structural protection against external threats.",
                    },
                ],
            },
        },
    )
    assert proposal.status_code == 201
    proposal_data = proposal.json()
    for review in proposal_data["reviews"]:
        decision = client.post(
            f"/api/v1/glossary/term-proposals/{proposal_data['id']}"
            f"/reviews/{review['domainId']}/decision",
            headers={"X-DaCa-User": review["ownerUserId"], "If-Match": '"1"'},
            json={"decision": "approve", "comment": "Fachlich geprüft."},
        )
        assert decision.status_code == 200
    accepted = decision.json()
    assert accepted["status"] == "accepted"
    return accepted, product


def test_data_products_can_be_filtered_by_domain(client):
    product = _vehicle_product(client)
    defence = _domain_by_label(client, "Verteidigung")
    logistics = _domain_by_label(client, "Mobilität & Logistik")

    logistics_page = client.get(
        "/api/v1/data-products",
        headers=SANDRO,
        params={"domainId": logistics["id"], "limit": 100},
    )
    defence_page = client.get(
        "/api/v1/data-products",
        headers=SANDRO,
        params={"domainId": defence["id"], "limit": 100},
    )

    assert logistics_page.status_code == 200
    assert product["id"] in {item["id"] for item in logistics_page.json()["items"]}
    assert product["id"] not in {item["id"] for item in defence_page.json()["items"]}


def test_unanimous_glossary_review_auto_attaches_and_notifies(client):
    defence = _domain_by_label(client, "Verteidigung")
    logistics = _domain_by_label(client, "Mobilität & Logistik")
    product = _vehicle_product(client)
    patch = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={**SANDRO, "If-Match": f'"{product["revision"]}"'},
        json={"domainIds": [defence["id"], logistics["id"]]},
    )
    assert patch.status_code == 200
    proposal = client.post(
        "/api/v1/glossary/term-proposals",
        headers=SANDRO,
        json={
            "sourceProductId": product["id"],
            "autoAttach": True,
            "payload": {
                "domainIds": [defence["id"], logistics["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Gepanzertes Fahrzeug",
                        "definition": "Ein Fahrzeug mit strukturellem Schutz.",
                    },
                    {
                        "language": "en",
                        "preferredLabel": "Armored Vehicle",
                        "definition": "A vehicle with structural protection.",
                    },
                ],
            },
        },
    ).json()

    deputy_attempt = client.post(
        f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{defence['id']}/decision",
        headers={**SANDRO, "If-Match": '"1"'},
        json={"decision": "approve", "comment": "Als Stellvertretung."},
    )
    assert deputy_attempt.status_code == 403

    first = client.post(
        f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{defence['id']}/decision",
        headers={**SIBILLA, "If-Match": '"1"'},
        json={"decision": "approve", "comment": "Für Verteidigung freigegeben."},
    )
    assert first.status_code == 200
    assert first.json()["status"] == "in_review"
    assert not any(
        task["glossaryTermProposalId"] == proposal["id"]
        and task["taskType"] == "glossary_term_review"
        for task in client.get("/api/v1/tasks/mine", headers=SIBILLA).json()
    )
    final = client.post(
        f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{logistics['id']}/decision",
        headers={**KASSANDRA, "If-Match": '"1"'},
        json={"decision": "approve", "comment": "Für Logistik freigegeben."},
    )
    assert final.status_code == 200
    assert final.json()["status"] == "accepted"

    updated = client.get(f"/api/v1/data-products/{product['id']}", headers=SANDRO).json()
    assert updated["revision"] == patch.json()["revision"] + 1
    assert [item["preferredLabel"] for item in updated["glossaryTerms"]] == ["Gepanzertes Fahrzeug"]
    information = next(
        task
        for task in client.get("/api/v1/tasks/mine", headers=SANDRO).json()
        if task["glossaryTermProposalId"] == proposal["id"] and task["taskKind"] == "information"
    )
    acknowledged = client.post(f"/api/v1/tasks/{information['id']}/acknowledge", headers=SANDRO)
    assert acknowledged.status_code == 200
    assert acknowledged.json()["acknowledgedAt"] is not None


def test_update_proposal_cannot_drop_existing_domain_governance(client):
    accepted, _ = _accepted_vehicle_term(client)
    vat = _domain_by_label(client, "Mehrwertsteuer")
    proposal = client.post(
        "/api/v1/glossary/term-proposals",
        headers=SANDRO,
        json={
            "operation": "update",
            "targetTermId": accepted["targetTermId"],
            "payload": {
                "domainIds": [vat["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Gepanzertes Fahrzeug",
                        "definition": "Überarbeitete Definition.",
                    }
                ],
            },
        },
    )
    assert proposal.status_code == 201
    review_domain_ids = {item["domainId"] for item in proposal.json()["reviews"]}
    assert review_domain_ids == {
        vat["id"],
        _domain_by_label(client, "Verteidigung")["id"],
        _domain_by_label(client, "Mobilität & Logistik")["id"],
    }


def test_rejection_is_final_creates_no_term_and_notifies_requester(client):
    defence = _domain_by_label(client, "Verteidigung")
    product = _vehicle_product(client)
    product = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={**SANDRO, "If-Match": f'"{product["revision"]}"'},
        json={"domainIds": [defence["id"]]},
    ).json()
    proposal = client.post(
        "/api/v1/glossary/term-proposals",
        headers=SANDRO,
        json={
            "sourceProductId": product["id"],
            "autoAttach": True,
            "payload": {
                "domainIds": [defence["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Abgelehnter Begriff",
                        "definition": "Wird fachlich nicht übernommen.",
                    }
                ],
            },
        },
    ).json()
    rejected = client.post(
        f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{defence['id']}/decision",
        headers={**SIBILLA, "If-Match": '"1"'},
        json={"decision": "reject", "comment": "Bedeutung ist fachlich zu unscharf."},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert not any(
        item["preferredLabel"] == "Abgelehnter Begriff"
        for item in client.get("/api/v1/glossary/terms").json()
    )
    refreshed = client.get(f"/api/v1/data-products/{product['id']}", headers=SANDRO).json()
    assert refreshed["glossaryTerms"] == []
    assert any(
        item["glossaryTermProposalId"] == proposal["id"] and item["taskKind"] == "information"
        for item in client.get("/api/v1/tasks/mine", headers=SANDRO).json()
    )


def test_editing_review_draft_resets_all_domain_approvals(client):
    defence = _domain_by_label(client, "Verteidigung")
    logistics = _domain_by_label(client, "Mobilität & Logistik")
    proposal = client.post(
        "/api/v1/glossary/term-proposals",
        headers=SANDRO,
        json={
            "payload": {
                "domainIds": [defence["id"], logistics["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Reviewbegriff",
                        "definition": "Erste Definition.",
                    }
                ],
            }
        },
    ).json()
    approved = client.post(
        f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{defence['id']}/decision",
        headers={**SIBILLA, "If-Match": '"1"'},
        json={"decision": "approve", "comment": "Erste Revision genehmigt."},
    )
    assert approved.status_code == 200
    edited = client.patch(
        f"/api/v1/glossary/term-proposals/{proposal['id']}",
        headers={**SANDRO, "If-Match": '"1"'},
        json={
            "reviewPayload": {
                "domainIds": [defence["id"], logistics["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Reviewbegriff",
                        "definition": "Gemeinsam überarbeitete Definition.",
                    }
                ],
            }
        },
    )
    assert edited.status_code == 200
    assert edited.json()["revision"] == 2
    assert {item["status"] for item in edited.json()["reviews"]} == {"pending"}
    assert {item["proposalRevision"] for item in edited.json()["reviews"]} == {2}


def test_knowledge_graph_uses_domain_and_term_urns(client):
    accepted, product = _accepted_vehicle_term(client)
    response = client.get("/api/v1/knowledge-graph")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/ld+json")
    graph = Graph().parse(data=response.text, format="json-ld")
    product_uri = URIRef(product["urn"])
    term_uri = URIRef(
        client.get(f"/api/v1/glossary/terms/{accepted['targetTermId']}").json()["urn"]
    )
    assert (product_uri, DCTERMS.subject, term_uri) in graph


def test_product_patch_preserves_historical_retired_assignments(client, session_factory):
    product = _vehicle_product(client)
    with session_factory() as session:
        from daca_catalog.models import Domain

        assignment = product["domains"][0]
        domain = session.get(Domain, uuid.UUID(assignment["id"]))
        domain.lifecycle = "retired"
        domain.retired_at = domain.updated_at
        domain.revision += 1
        session.commit()
    response = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={**SANDRO, "If-Match": f'"{product["revision"]}"'},
        json={"description": "Eine weiterhin editierbare fachliche Beschreibung."},
    )
    assert response.status_code == 200
    assert response.json()["domains"][0]["lifecycle"] == "retired"


def test_legacy_unknown_domain_is_preserved_as_hint_without_register_mutation(client):
    product = _vehicle_product(client)
    response = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={**SANDRO, "If-Match": f'"{product["revision"]}"'},
        json={"domain": "Ungeprüfte Legacy-Domain"},
    )
    assert response.status_code == 200
    assert response.json()["domain"] == "Ungeprüfte Legacy-Domain"
    assert response.json()["domains"] == []
    assert not any(
        item["preferredLabel"] == "Ungeprüfte Legacy-Domain"
        for item in client.get("/api/v1/domains").json()
    )


def test_semantic_suggestion_query_override_is_deterministic_and_limited(client):
    product = _vehicle_product(client)
    first = client.get(
        f"/api/v1/data-products/{product['id']}/semantic-suggestions?threshold=0",
        headers=SANDRO,
    )
    second = client.get(
        f"/api/v1/data-products/{product['id']}/semantic-suggestions?threshold=0",
        headers=SANDRO,
    )
    assert first.status_code == 200
    assert first.json() == second.json()
    assert len(first.json()) <= 5
    assert all(item["source"] == "deterministic-fuzzy" for item in first.json())


def test_default_semantic_suggestions_cover_journey_08_domains(client):
    product = _vehicle_product(client)

    response = client.get(
        f"/api/v1/data-products/{product['id']}/semantic-suggestions",
        headers=SANDRO,
    )

    assert response.status_code == 200
    suggestions = response.json()
    domain_suggestions = {item["id"]: item for item in suggestions if item["kind"] == "domain"}
    assert not any(item["label"] in {"Bergepanzer", "Bergepanzer 01"} for item in suggestions)
    assert {str(DEFENCE_DOMAIN_ID), str(MOBILITY_DOMAIN_ID)} <= domain_suggestions.keys()
    assert all(
        item["score"] >= 70
        and len(item["matchedFields"]) == 1
        and "ähnelt dem Feld" in item["reason"]
        for item in (
            domain_suggestions[str(DEFENCE_DOMAIN_ID)],
            domain_suggestions[str(MOBILITY_DOMAIN_ID)],
        )
    )


def test_auto_attach_accepts_term_but_falls_back_when_product_domains_changed(client):
    defence = _domain_by_label(client, "Verteidigung")
    logistics = _domain_by_label(client, "Mobilität & Logistik")
    product = _vehicle_product(client)
    proposal = client.post(
        "/api/v1/glossary/term-proposals",
        headers=SANDRO,
        json={
            "sourceProductId": product["id"],
            "autoAttach": True,
            "payload": {
                "domainIds": [logistics["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Logistikfahrzeug",
                        "definition": "Ein Fahrzeug für logistische Aufgaben.",
                    }
                ],
            },
        },
    ).json()
    moved = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={**SANDRO, "If-Match": f'"{product["revision"]}"'},
        json={"domainIds": [defence["id"]]},
    )
    assert moved.status_code == 200
    accepted = client.post(
        f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{logistics['id']}/decision",
        headers={**KASSANDRA, "If-Match": '"1"'},
        json={"decision": "approve", "comment": "Term ist fachlich korrekt."},
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"
    refreshed = client.get(f"/api/v1/data-products/{product['id']}", headers=SANDRO).json()
    assert refreshed["revision"] == moved.json()["revision"]
    assert refreshed["glossaryTerms"] == []
    information = next(
        item
        for item in client.get("/api/v1/tasks/mine", headers=SANDRO).json()
        if item["glossaryTermProposalId"] == proposal["id"] and item["taskKind"] == "information"
    )
    assert "nicht automatisch" in information["detail"]
    assert "manuell" in information["detail"]


def test_final_approval_marks_proposal_stale_when_review_domain_was_retired(
    client, session_factory
):
    defence = _domain_by_label(client, "Verteidigung")
    logistics = _domain_by_label(client, "Mobilität & Logistik")
    product = _vehicle_product(client)
    assigned = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={**SANDRO, "If-Match": f'"{product["revision"]}"'},
        json={"domainIds": [defence["id"], logistics["id"]]},
    )
    assert assigned.status_code == 200
    assigned_revision = assigned.json()["revision"]

    proposal = client.post(
        "/api/v1/glossary/term-proposals",
        headers=SANDRO,
        json={
            "sourceProductId": product["id"],
            "autoAttach": True,
            "payload": {
                "domainIds": [defence["id"], logistics["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Veralteter Reviewbegriff",
                        "definition": "Darf nach der Domain-Stilllegung nicht angelegt werden.",
                    }
                ],
            },
        },
    ).json()
    first = client.post(
        f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{defence['id']}/decision",
        headers={**SIBILLA, "If-Match": '"1"'},
        json={"decision": "approve", "comment": "Für Verteidigung freigegeben."},
    )
    assert first.status_code == 200
    assert first.json()["status"] == "in_review"

    retired = client.post(
        f"/api/v1/domains/{logistics['id']}/retire",
        headers={**SIBILLA, "If-Match": f'"{logistics["revision"]}"'},
    )
    assert retired.status_code == 200

    final = client.post(
        f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{logistics['id']}/decision",
        headers={**KASSANDRA, "If-Match": '"1"'},
        json={"decision": "approve", "comment": "Für Logistik freigegeben."},
    )
    assert final.status_code == 200
    assert final.json()["status"] == "stale"
    assert final.json()["targetTermId"] is None
    assert "während des Reviews" in final.json()["decisionComment"]
    assert "stillgelegt" in final.json()["decisionComment"]
    assert {review["status"] for review in final.json()["reviews"]} == {"approved"}

    assert not any(
        item["preferredLabel"] == "Veralteter Reviewbegriff"
        for item in client.get("/api/v1/glossary/terms?includeRetired=true").json()
    )
    refreshed_product = client.get(f"/api/v1/data-products/{product['id']}", headers=SANDRO).json()
    assert refreshed_product["revision"] == assigned_revision
    assert refreshed_product["glossaryTerms"] == []

    information = next(
        item
        for item in client.get("/api/v1/tasks/mine", headers=SANDRO).json()
        if item["glossaryTermProposalId"] == proposal["id"] and item["taskKind"] == "information"
    )
    assert information["status"] == "open"
    assert "Nächster manueller Schritt" in information["detail"]
    assert not any(
        item["glossaryTermProposalId"] == proposal["id"]
        for headers in (SIBILLA, KASSANDRA)
        for item in client.get("/api/v1/tasks/mine", headers=headers).json()
    )

    from daca_catalog.models import AuditEvent
    from sqlalchemy import select

    with session_factory() as session:
        stale_event = session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_type == "glossary-term-proposal",
                AuditEvent.resource_id == proposal["id"],
                AuditEvent.action == "marked-stale",
            )
        )
        assert stale_event is not None
        assert stale_event.details == {
            "status": "stale",
            "inactiveDomainIds": [logistics["id"]],
        }


def test_domain_register_role_if_match_and_retirement_rules(client):
    draft = {
        "ownerUserId": "kassandra.valdata",
        "deputyOwnerUserId": "ariane.keller",
        "localizations": [
            {
                "language": "de",
                "preferredLabel": "Test-Fachdomäne",
                "definition": "Nur für den API-Governance-Test.",
            }
        ],
    }
    forbidden = client.post("/api/v1/domains", headers=KASSANDRA, json=draft)
    assert forbidden.status_code == 403
    invalid = client.post(
        "/api/v1/domains",
        headers=SIBILLA,
        json={**draft, "deputyOwnerUserId": "kassandra.valdata"},
    )
    assert invalid.status_code == 422
    created = client.post("/api/v1/domains", headers=SIBILLA, json=draft)
    assert created.status_code == 201
    no_precondition = client.patch(
        f"/api/v1/domains/{created.json()['id']}",
        headers=SIBILLA,
        json={"localizations": draft["localizations"]},
    )
    assert no_precondition.status_code == 428
    retired = client.post(
        f"/api/v1/domains/{created.json()['id']}/retire",
        headers={**SIBILLA, "If-Match": '"1"'},
    )
    assert retired.status_code == 200
    assert retired.json()["lifecycle"] == "retired"
    product = _vehicle_product(client)
    assignment = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={**SANDRO, "If-Match": f'"{product["revision"]}"'},
        json={"domainIds": [created.json()["id"]]},
    )
    assert assignment.status_code == 422


def test_domain_steward_change_reassigns_open_review_and_collaboration_tasks(client):
    defence = _domain_by_label(client, "Verteidigung")
    proposal = client.post(
        "/api/v1/glossary/term-proposals",
        headers=SANDRO,
        json={
            "payload": {
                "domainIds": [defence["id"]],
                "localizations": [
                    {
                        "language": "de",
                        "preferredLabel": "Offener Reviewbegriff",
                        "definition": "Prüft die Neuzuweisung der Governance-Aufgaben.",
                    }
                ],
            }
        },
    ).json()
    changed = client.patch(
        f"/api/v1/domains/{defence['id']}",
        headers={**SIBILLA, "If-Match": f'"{defence["revision"]}"'},
        json={
            "ownerUserId": "kassandra.valdata",
            "deputyOwnerUserId": "ariane.keller",
        },
    )
    assert changed.status_code == 200
    refreshed = client.get(f"/api/v1/glossary/term-proposals/{proposal['id']}", headers=KASSANDRA)
    assert refreshed.status_code == 200
    assert refreshed.json()["reviews"][0]["ownerUserId"] == "kassandra.valdata"
    assert any(
        task["glossaryTermProposalId"] == proposal["id"]
        and task["taskType"] == "glossary_term_review"
        for task in client.get("/api/v1/tasks/mine", headers=KASSANDRA).json()
    )
    assert any(
        task["glossaryTermProposalId"] == proposal["id"]
        and task["taskType"] == "glossary_term_collaboration"
        for task in client.get(
            "/api/v1/tasks/mine", headers={"X-DaCa-User": "ariane.keller"}
        ).json()
    )


def test_unrelated_actor_cannot_change_product_domains(client):
    product = _vehicle_product(client)
    defence = _domain_by_label(client, "Verteidigung")
    response = client.patch(
        f"/api/v1/data-products/{product['id']}",
        headers={"X-DaCa-User": "beat.stalder", "If-Match": f'"{product["revision"]}"'},
        json={"domainIds": [defence["id"]]},
    )
    assert response.status_code == 403


def test_active_term_is_not_selectable_when_all_owning_domains_are_retired(client):
    accepted, _ = _accepted_vehicle_term(client)
    term_id = accepted["targetTermId"]
    for label in ("Verteidigung", "Mobilität & Logistik"):
        domain = _domain_by_label(client, label)
        response = client.post(
            f"/api/v1/domains/{domain['id']}/retire",
            headers={**SIBILLA, "If-Match": f'"{domain["revision"]}"'},
        )
        assert response.status_code == 200
    assert term_id not in {item["id"] for item in client.get("/api/v1/glossary/terms").json()}
    assert term_id in {
        item["id"] for item in client.get("/api/v1/glossary/terms?includeRetired=true").json()
    }


def test_domain_glossary_fixture_prepare_and_reset_are_scoped_and_idempotent(client):
    defence_id = _domain_by_label(client, "Verteidigung")["id"]
    initial = client.get("/api/v1/poc/domain-glossary-fixture", headers=SANDRO)
    assert initial.status_code == 200
    prepared = client.post("/api/v1/poc/domain-glossary-fixture/prepare", headers=SANDRO)
    assert prepared.status_code == 200
    assert prepared.json()["state"] == "domainPending"
    assert prepared.json()["openDomainRequestCount"] == 1
    assert prepared.json()["openTermProposalCount"] == 0
    assert not any(
        item["preferredLabel"] == "Verteidigung" for item in client.get("/api/v1/domains").json()
    )
    revision = client.get(
        f"/api/v1/data-products/{prepared.json()['productId']}", headers=SANDRO
    ).json()["revision"]
    prepared_again = client.post("/api/v1/poc/domain-glossary-fixture/prepare", headers=SANDRO)
    assert prepared_again.status_code == 200
    assert (
        client.get(f"/api/v1/data-products/{prepared.json()['productId']}", headers=SANDRO).json()[
            "revision"
        ]
        == revision
    )
    request = next(
        item
        for item in client.get("/api/v1/domain-change-requests", headers=SANDRO).json()
        if item["status"] == "submitted"
    )
    decision = client.post(
        f"/api/v1/domain-change-requests/{request['id']}/decision",
        headers={**SIBILLA, "If-Match": f'"{request["revision"]}"'},
        json={"decision": "approve", "comment": "Fixture-Domain fachlich genehmigt."},
    )
    assert decision.status_code == 200
    active_defence = [
        item
        for item in client.get("/api/v1/domains").json()
        if item["preferredLabel"] == "Verteidigung"
    ]
    assert [item["id"] for item in active_defence] == [defence_id]
    history = client.get(f"/api/v1/domains/{defence_id}/audit-events")
    assert history.status_code == 200
    assert any(item["resourceType"] == "domain" for item in history.json())
    wrong = client.post(
        "/api/v1/poc/domain-glossary-fixture/reset",
        headers=SANDRO,
        json={"confirmationName": "wrong"},
    )
    assert wrong.status_code == 422
    reset = client.post(
        "/api/v1/poc/domain-glossary-fixture/reset",
        headers=SANDRO,
        json={"confirmationName": "DOMAIN-GLOSSARY"},
    )
    assert reset.status_code == 200
    assert reset.json()["state"] == "notPrepared"
