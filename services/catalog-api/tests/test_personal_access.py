import copy
import uuid
from datetime import timedelta

import pytest
from daca_catalog.access_renewals import zurich_today
from daca_catalog.models import DataProduct, IdentityGroup, PolicyRevision
from sqlalchemy import select

PRODUCT = uuid.UUID("11111111-1111-4111-8111-111111111111")
URL = f"/api/v1/data-products/{PRODUCT}/effective-access"


@pytest.fixture
def prepared(session_factory):
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        product.discoverable = True
        product.lifecycle = "active"
        product.active_policy_revision = 1
        policy = session.scalar(
            select(PolicyRevision).where(
                PolicyRevision.data_product_id == PRODUCT, PolicyRevision.revision == 1
            )
        )
        session.add(
            IdentityGroup(
                id="personal-test-sg",
                label="Steueranalyse SG",
                description="Synthetische Testgruppe",
                source="cantonal",
                active=True,
            )
        )
        today = zurich_today()
        common = {
            "actions": ["data.read"],
            "protocols": ["http"],
            "validFrom": (today - timedelta(days=2)).isoformat(),
            "validUntil": "9999-12-31",
            "dataVariant": "original",
            "metadataChannels": {"kobyMcp": False, "i14y": False},
        }
        definition = copy.deepcopy(policy.definition)
        definition["grants"] = [
            {**common, "subject": {"type": "person", "id": "jan.waser"}},
            {
                **common,
                "subject": {"type": "group", "id": "personal-test-sg"},
                "protocols": ["postgresql"],
                "dataVariant": "modified",
                "groupSnapshot": {
                    "groupId": "personal-test-sg",
                    "membershipRevision": 1,
                    "memberIds": ["jan.waser", "beat.stalder"],
                },
            },
            {**common, "subject": {"type": "person", "id": "joel.ruod"}},
            {**common, "subject": {"type": "machine", "id": "private-machine"}},
            {
                **common,
                "subject": {"type": "person", "id": "jan.waser"},
                "validUntil": (today - timedelta(days=1)).isoformat(),
            },
            {
                **common,
                "subject": {"type": "person", "id": "jan.waser"},
                "validFrom": (today + timedelta(days=1)).isoformat(),
            },
        ]
        policy.definition = definition
        session.commit()


def get(client, actor="jan.waser"):
    return client.get(URL, headers={"X-DaCa-User": actor})


def test_personal_projection_names_direct_and_group_grants_without_other_identities(
    client, prepared
):
    response = get(client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["granted"] and body["policyRevision"] == 1
    assert len(body["grants"]) == 2
    direct, group = body["grants"]
    assert direct["subjectType"] == "person" and direct["subjectDisplayName"] == "Jan Waser"
    assert direct["subjectOrganization"] == "Kanton St. Gallen" and direct["groupId"] is None
    assert direct["protocols"] == ["http"] and direct["dataVariant"] == "original"
    assert group["subjectType"] == "group" and group["subjectDisplayName"] == "Steueranalyse SG"
    assert group["groupId"] == "personal-test-sg" and group["protocols"] == ["postgresql"]
    for private in ("beat.stalder", "joel.ruod", "private-machine", "memberIds", "groupSnapshot"):
        assert private not in response.text
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.headers["Vary"] == "X-DaCa-User"


def test_group_members_see_only_their_own_group_and_nonmembers_have_no_access(client, prepared):
    member = get(client, "beat.stalder").json()
    assert member["granted"] and len(member["grants"]) == 1
    assert member["grants"][0]["subjectType"] == "group"
    assert member["grants"][0]["groupId"] == "personal-test-sg"
    for actor in ("ariane.keller", "kassandra.valdata", "thomas.kriegli"):
        body = get(client, actor).json()
        assert body["granted"] is False and body["grants"] == []


@pytest.mark.parametrize("broken", ["missing", "invalid", "unpublished"])
def test_unknown_policy_never_looks_like_no_access(client, prepared, session_factory, broken):
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        policy = session.scalar(
            select(PolicyRevision).where(
                PolicyRevision.data_product_id == PRODUCT, PolicyRevision.revision == 1
            )
        )
        if broken == "missing":
            product.active_policy_revision = 999
        elif broken == "unpublished":
            policy.status = "draft"
        else:
            policy.definition = {"effect": "invalid"}
        session.commit()
    assert get(client).status_code == 503


def test_no_active_policy_and_explicit_deny_do_not_grant_access(client, prepared, session_factory):
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        product.active_policy_revision = None
        session.commit()
    assert get(client).json()["granted"] is False
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        product.active_policy_revision = 1
        policy = session.scalar(
            select(PolicyRevision).where(
                PolicyRevision.data_product_id == PRODUCT, PolicyRevision.revision == 1
            )
        )
        definition = copy.deepcopy(policy.definition)
        definition["effect"] = "deny"
        policy.definition = definition
        session.commit()
    assert get(client).json()["grants"] == []
