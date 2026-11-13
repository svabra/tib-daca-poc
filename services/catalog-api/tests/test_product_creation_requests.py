import copy
import uuid

import pytest
from daca_catalog.models import DataProduct, Endpoint, MetadataPublication
from sqlalchemy import select

SOURCE = "11111111-1111-4111-8111-111111111111"
BASE = "/api/v1/product-creation-requests"
JAN = {"X-DaCa-User": "jan.waser"}
OWNER = {"X-DaCa-User": "kassandra.valdata"}
OTHER = {"X-DaCa-User": "beat.stalder"}


def submit_general(client, **changes):
    return client.post(
        BASE,
        headers=JAN,
        json={
            "sourceProductIds": [SOURCE],
            "proposedTitle": "Jahresübersicht für die Finanzplanung",
            "purpose": "Analyse der historischen Datengrundlage für die Finanzplanung.",
            "basisFrom": "2016-01-01",
            "basisUntil": "2025-12-31",
            "legalBasis": "Gesetzlicher Statistikauftrag, Art. 10.",
            "formats": ["parquet", "http-rest"],
            "updateFrequency": "once",
            **changes,
        },
    )


def test_general_requirements_are_persisted_without_mwst_defaults(client):
    response = submit_general(client)
    assert response.status_code == 201, response.text
    row = response.json()
    assert row["taxYear"] is None and row["cantonCode"] is None
    assert row["basisFrom"] == "2016-01-01" and row["basisUntil"] == "2025-12-31"
    assert row["legalBasis"] == "Gesetzlicher Statistikauftrag, Art. 10."
    assert row["formats"] == ["parquet", "http-rest"] and row["updateFrequency"] == "once"
    assert client.get(BASE + "/" + row["id"], headers=OWNER).json() == row
    assert client.get(BASE + "/" + row["id"], headers=OTHER).status_code == 403
    tasks = client.get("/api/v1/tasks/mine", headers=OWNER).json()
    task = next(task for task in tasks if task["productCreationRequestId"] == row["id"])
    assert "Firmenzeilen" not in task["detail"]


def test_rolling_requirements_survive_owner_context_and_reject_mixed_or_invalid_windows(client):
    rolling = {"basisWindowType": "rolling", "basisFrom": None, "basisUntil": None,
               "rollingWindowSize": 12, "rollingWindowUnit": "months", "updateFrequency": "daily"}
    response = submit_general(client, **rolling)
    assert response.status_code == 201, response.text
    row = response.json()
    assert {key: row[key] for key in rolling} == rolling
    assert client.get(BASE + "/" + row["id"], headers=OWNER).json() == row
    assert client.get(BASE + "/" + row["id"], headers=OTHER).status_code == 403
    for invalid in ({"basisFrom": "2026-01-01"}, {"basisUntil": "2026-11-12"},
                    {"rollingWindowSize": None}, {"rollingWindowSize": 0},
                    {"rollingWindowSize": -1}, {"rollingWindowSize": 1.5},
                    {"rollingWindowSize": True}, {"rollingWindowSize": 10001},
                    {"rollingWindowUnit": None}, {"rollingWindowUnit": "quarters"},
                    {"basisWindowType": "fixed"}, {"basisWindowType": "other"},
                    {"taxYear": 2026, "cantonCode": "SG"}):
        assert submit_general(client, **{**rolling, **invalid}).status_code == 422, invalid
    assert submit_general(client, rollingWindowSize=12, rollingWindowUnit="months").status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"basisUntil": "2015-12-31"},
        {"basisFrom": "not-a-date"},
        {"legalBasis": None},
        {"legalBasis": "   "},
        {"updateFrequency": "monthly"},
        {"updateFrequency": None},
        {"formats": []},
        {"formats": ["csv", "csv"]},
        {"cantonCode": "SG", "taxYear": 2026},
    ],
)
def test_general_request_validation_rejects_incomplete_or_ambiguous_requirements(client, changes):
    assert submit_general(client, **changes).status_code == 422


def test_omitting_requirements_never_invents_canton_year_or_formats(client):
    assert (
        client.post(
            BASE,
            headers=JAN,
            json={
                "sourceProductIds": [SOURCE],
                "proposedTitle": "Finanzplanung",
                "purpose": "Gesetzliche Finanzplanung der Verwaltung",
            },
        ).status_code
        == 422
    )
    payload = submit_general(client).json()
    assert payload["cantonCode"] is None
    body = {
        key: payload[key]
        for key in (
            "sourceProductIds",
            "proposedTitle",
            "purpose",
            "basisFrom",
            "basisUntil",
            "legalBasis",
            "updateFrequency",
        )
    }
    assert client.post(BASE, headers=JAN, json=body).status_code == 422


def submit(client, **changes):
    return client.post(
        BASE,
        headers=JAN,
        json={
            "sourceProductIds": [SOURCE],
            "proposedTitle": "MWST Firmen SG 2026",
            "purpose": "Analyse der synthetischen SG-Firmen für den Kanton St. Gallen.",
            "taxYear": 2026,
            "cantonCode": "SG",
            "formats": ["xlsx", "parquet", "csv"],
            **changes,
        },
    )


def test_request_is_persisted_owner_is_trusted_and_task_has_context(client):
    assert submit(client, ownerUserId="beat.stalder").status_code == 422
    response = submit(client)
    assert response.status_code == 201, response.text
    row = response.json()
    assert row["ownerUserId"] == "kassandra.valdata"
    assert row["requesterUserId"] == "jan.waser"
    assert row["status"] == "submitted" and row["revision"] == 1
    assert client.get(BASE + "/" + row["id"], headers=JAN).json()["purpose"] == row["purpose"]
    assert any(
        task["productCreationRequestId"] == row["id"]
        for task in client.get("/api/v1/tasks/mine", headers=OWNER).json()
    )
    assert client.get(BASE, headers=OTHER).json() == []
    assert client.get(BASE + "/" + row["id"], headers=OTHER).status_code == 403


def test_only_owner_can_decide_and_revision_prevents_replay(client):
    row = submit(client).json()
    path = BASE + "/" + row["id"] + "/decision"
    assert (
        client.post(
            path, headers={**JAN, "If-Match": '"1"'}, json={"decision": "accept"}
        ).status_code
        == 403
    )
    assert client.post(path, headers=OWNER, json={"decision": "accept"}).status_code == 428
    accepted = client.post(path, headers={**OWNER, "If-Match": '"1"'}, json={"decision": "accept"})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "in_progress"
    assert (
        client.post(
            path, headers={**OWNER, "If-Match": '"1"'}, json={"decision": "accept"}
        ).status_code
        == 412
    )
    assert (
        client.post(
            path, headers={**OWNER, "If-Match": '"2"'}, json={"decision": "accept"}
        ).status_code
        == 409
    )


def test_rejection_needs_reason_and_notifies_requester(client):
    row = submit(client).json()
    path = BASE + "/" + row["id"] + "/decision"
    headers = {**OWNER, "If-Match": '"1"'}
    assert client.post(path, headers=headers, json={"decision": "reject"}).status_code == 422
    response = client.post(
        path,
        headers=headers,
        json={"decision": "reject", "comment": "Der fachliche Zweck muss zuerst geklärt werden."},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"
    tasks = client.get("/api/v1/tasks/mine", headers=JAN).json()
    assert any(
        task["taskType"] == "product_creation_result"
        and task["productCreationRequestId"] == row["id"]
        for task in tasks
    )


def test_fulfillment_requires_accepted_request_and_published_result(client):
    row = submit(client).json()
    path = BASE + "/" + row["id"]
    assert (
        client.post(
            path + "/fulfillment",
            headers={**OWNER, "If-Match": '"1"'},
            json={"resultProductId": SOURCE},
        ).status_code
        == 409
    )
    client.post(
        path + "/decision", headers={**OWNER, "If-Match": '"1"'}, json={"decision": "accept"}
    )
    result = client.post(
        path + "/fulfillment",
        headers={**OWNER, "If-Match": '"2"'},
        json={"resultProductId": SOURCE},
    )
    assert result.status_code == 409


@pytest.mark.parametrize("window_type", ["fixed", "rolling"])
def test_general_fulfillment_checks_published_period_and_requested_deliveries(
    client, session_factory, window_type
):
    window = {} if window_type == "fixed" else {"basisWindowType": "rolling", "basisFrom": None,
        "basisUntil": None, "rollingWindowSize": 12, "rollingWindowUnit": "months"}
    row = submit_general(client, formats=["csv", "http-rest"], **window).json()
    path = BASE + "/" + row["id"]
    assert (
        client.post(
            path + "/decision", headers={**OWNER, "If-Match": '"1"'}, json={"decision": "accept"}
        ).status_code
        == 200
    )
    with session_factory() as session:
        product = session.get(DataProduct, uuid.UUID(SOURCE))
        product.owner_user_id = "kassandra.valdata"
        product.discoverable = True
        product.lifecycle = "active"
        publication = MetadataPublication(
            id=uuid.uuid4(),
            source_system="test",
            source_product_id="derived-period-test",
            data_product_id=product.id,
            publication_mode="visible",
            payload_hash="test",
            state="published",
            normalized_payload={
                "businessMetadata": {
                    "graph": {
                        "daca:productScope": {
                            "creationRequestId": row["id"],
                            "basisFrom": "2010-01-01",
                            "basisUntil": row["basisUntil"],
                        },
                        "daca:downloadFormats": ["parquet"],
                    }
                }
            },
        )
        session.add(publication)
        session.commit()
        publication_id = publication.id

    def fulfill():
        return client.post(
            path + "/fulfillment",
            headers={**OWNER, "If-Match": '"2"'},
            json={"resultProductId": SOURCE},
        )

    assert fulfill().status_code == 422
    with session_factory() as session:
        publication = session.get(MetadataPublication, publication_id)
        payload = copy.deepcopy(publication.normalized_payload)
        payload["businessMetadata"]["graph"]["daca:productScope"] = {"creationRequestId":row["id"],
            **({"basisFrom":row["basisFrom"],"basisUntil":row["basisUntil"]} if window_type == "fixed"
               else {"basisWindowType":"rolling","rollingWindowSize":12,"rollingWindowUnit":"months"})}
        publication.normalized_payload = payload
        session.commit()
    assert fulfill().status_code == 422  # Missing CSV is not satisfied by a Parquet file.
    with session_factory() as session:
        publication = session.get(MetadataPublication, publication_id)
        payload = copy.deepcopy(publication.normalized_payload)
        payload["businessMetadata"]["graph"]["daca:downloadFormats"] = ["csv"]
        publication.normalized_payload = payload
        for endpoint in session.scalars(
            select(Endpoint).where(Endpoint.data_product_id == uuid.UUID(SOURCE))
        ):
            endpoint.protocol = "postgresql"
        session.commit()
    assert fulfill().status_code == 422  # REST is a delivery endpoint, not a file format.
    with session_factory() as session:
        endpoint = session.scalar(
            select(Endpoint).where(Endpoint.data_product_id == uuid.UUID(SOURCE)).limit(1)
        )
        endpoint.protocol = "http-rest"
        session.commit()
    result = fulfill()
    assert result.status_code == 409 and "SLA" in result.json()["detail"]


@pytest.mark.parametrize(
    "changes",
    [
        {"cantonCode": "XX"},
        {"taxYear": 2200},
        {"formats": ["exe"]},
        {"purpose": "short"},
        {"sourceProductIds": []},
    ],
)
def test_invalid_scope_is_rejected(client, changes):
    assert submit(client, **changes).status_code == 422
