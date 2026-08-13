from __future__ import annotations

from pathlib import Path

from daca_catalog.models import PolicyDeployment
from daca_catalog.policy import GENERATED_REGO, definition_as_camel, project_to_postgresql
from daca_catalog.seed import ESTV_PRODUCT_ID, seed_catalog
from daca_catalog.settings import Settings
from sqlalchemy import select


def test_seed_is_idempotent(session_factory):
    with session_factory() as session:
        assert seed_catalog(session) is False


def test_seeded_policy_deployments_wait_for_target_acknowledgements(session_factory):
    with session_factory() as session:
        deployments = list(session.scalars(select(PolicyDeployment)))

    assert {deployment.target for deployment in deployments} == {"opa", "postgresql"}
    assert all(deployment.state == "pending" for deployment in deployments)
    assert all(deployment.observed_revision is None for deployment in deployments)


def test_unconfigured_postgresql_projection_is_explicitly_pending():
    result = project_to_postgresql(
        Settings(database_url="sqlite+pysqlite://", sample_policy_projection_url=None),
        ESTV_PRODUCT_ID,
        2,
        {
            "effect": "allow",
            "subjects": {"userIds": ["kanton-st-gallen"]},
            "resources": {"productUrns": ["urn:test"], "owners": ["ESTV"]},
            "actions": ["data.read"],
            "protocols": ["postgresql"],
        },
    )
    assert result.state == "pending"
    assert "not configured" in result.error


def test_projection_maps_canonical_http_to_http_rest(monkeypatch):
    captured = {}

    class SuccessfulResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "productId": str(ESTV_PRODUCT_ID),
                "revision": 4,
                "status": "deployed",
            }

    def fake_put(url, *, json, headers, timeout):
        captured.update(url=url, json=json, headers=headers, timeout=timeout)
        return SuccessfulResponse()

    monkeypatch.setattr("daca_catalog.policy.httpx.put", fake_put)
    result = project_to_postgresql(
        Settings(
            database_url="sqlite+pysqlite://",
            sample_policy_projection_url="http://sample/internal/v1/policy-projections",
            sample_policy_projection_token="secret",
        ),
        ESTV_PRODUCT_ID,
        4,
        {
            "effect": "allow",
            "subjects": {"userIds": ["kanton-st-gallen"]},
            "resources": {"productUrns": ["urn:test"], "owners": ["ESTV"]},
            "actions": ["data.read"],
            "protocols": ["http", "postgresql"],
        },
    )
    assert result.state == "deployed"
    assert result.observed_revision == 4
    assert captured["url"].endswith(str(ESTV_PRODUCT_ID))
    assert captured["headers"] == {"Authorization": "Bearer secret"}
    assert captured["json"]["entitlements"] == [
        {"subjectId": "kanton-st-gallen", "action": "data.read", "protocol": "http-rest"},
        {"subjectId": "kanton-st-gallen", "action": "data.read", "protocol": "postgresql"},
    ]


def test_projection_rejects_mismatched_acknowledgement(monkeypatch):
    class MismatchedResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"productId": str(ESTV_PRODUCT_ID), "revision": 99, "status": "deployed"}

    monkeypatch.setattr("daca_catalog.policy.httpx.put", lambda *args, **kwargs: MismatchedResponse())
    result = project_to_postgresql(
        Settings(
            database_url="sqlite+pysqlite://",
            sample_policy_projection_url="http://sample/internal/v1/policy-projections",
        ),
        ESTV_PRODUCT_ID,
        4,
        None,
    )
    assert result.state == "failed"
    assert "mismatched acknowledgement" in result.error


def test_policy_normalizer_accepts_internal_snake_case():
    normalized = definition_as_camel(
        {
            "effect": "allow",
            "subjects": {"user_ids": ["kanton-st-gallen"]},
            "resources": {"product_urns": ["urn:test"], "owners": ["ESTV"]},
            "actions": ["data.read"],
            "protocols": ["http"],
        }
    )
    assert normalized["subjects"]["userIds"] == ["kanton-st-gallen"]
    assert normalized["resources"]["productUrns"] == ["urn:test"]


def test_reviewed_opa_fixture_matches_compiler_output():
    fixture = Path(__file__).parent / "opa" / "policy.rego"
    assert fixture.read_text(encoding="utf-8").rstrip() == GENERATED_REGO.rstrip()
