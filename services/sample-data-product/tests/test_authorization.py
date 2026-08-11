from __future__ import annotations

from types import SimpleNamespace

import pytest
from app import main as sample_main
from app.main import ProblemError, app, decision_input, evaluate_opa
from fastapi.testclient import TestClient

client = TestClient(app)


def test_decision_input_uses_trusted_resource_attributes() -> None:
    request = SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path="/api/v1/estv/tax-statistics"),
        state=SimpleNamespace(request_id="test-request"),
    )
    document = decision_input("kanton-st-gallen", request)
    assert document["subject"]["id"] == "kanton-st-gallen"
    assert document["resource"]["owner"] == "ESTV"
    assert document["endpoint"]["protocol"] == "http-rest"


@pytest.mark.asyncio
async def test_undefined_opa_decision_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return Response()

    monkeypatch.setattr("app.main.httpx.AsyncClient", lambda **_kwargs: Client())
    with pytest.raises(ProblemError) as error:
        await evaluate_opa({"subject": {"id": "kanton-st-gallen"}})
    assert error.value.status == 503


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [None, 42, "result", ["result"]])
async def test_non_object_opa_response_fails_closed_as_unavailable(
    monkeypatch: pytest.MonkeyPatch, body: object
) -> None:
    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> object:
            return body

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return Response()

    monkeypatch.setattr("app.main.httpx.AsyncClient", lambda **_kwargs: Client())

    with pytest.raises(ProblemError) as error:
        await evaluate_opa({"subject": {"id": "kanton-st-gallen"}})

    assert error.value.status == 503
    assert error.value.problem_type == "pdp-malformed"


@pytest.mark.parametrize(
    ("method", "path", "expected_status", "expected_type", "expected_title"),
    [
        ("GET", "/does-not-exist", 404, "not-found", "Not found"),
        (
            "GET",
            "/internal/v1/policy-projections/11111111-1111-4111-8111-111111111111",
            405,
            "method-not-allowed",
            "Method not allowed",
        ),
    ],
)
def test_framework_http_errors_use_problem_json(
    method: str,
    path: str,
    expected_status: int,
    expected_type: str,
    expected_title: str,
) -> None:
    response = client.request(method, path, headers={"X-Request-ID": "contract-test"})

    assert response.status_code == expected_status
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.headers["x-request-id"] == "contract-test"
    assert response.json() == {
        "type": f"https://didaca.bit.admin.ch/problems/{expected_type}",
        "title": expected_title,
        "status": expected_status,
        "detail": "Not Found" if expected_status == 404 else "Method Not Allowed",
        "instance": path,
        "requestId": "contract-test",
    }


def test_request_validation_errors_use_problem_json() -> None:
    path = "/internal/v1/policy-projections/11111111-1111-4111-8111-111111111111"
    response = client.put(
        path,
        headers={"X-Request-ID": "validation-test"},
        json={},
    )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["type"] == "https://didaca.bit.admin.ch/problems/validation"
    assert body["title"] == "Validation failed"
    assert body["instance"] == path
    assert body["requestId"] == "validation-test"
    assert {error["location"] for error in body["errors"]} == {
        "body.revision",
        "body.entitlements",
    }


def test_seed_projection_acknowledgement_is_authenticated_and_idempotent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "target": "postgresql",
                "desiredRevision": 1,
                "observedRevision": 1,
                "state": "deployed",
            }

    def fake_put(url: str, **kwargs: object) -> Response:
        calls.append({"url": url, **kwargs})
        return Response()

    monkeypatch.setattr(sample_main, "_seed_projection_acknowledged", False)
    monkeypatch.setattr(
        sample_main.settings,
        "catalog_deployment_ack_url",
        "http://catalog/internal/v1/policy-deployments/acknowledge",
    )
    monkeypatch.setattr(sample_main.settings, "catalog_internal_token", "test-token")
    monkeypatch.setattr(sample_main.httpx, "put", fake_put)

    assert sample_main.acknowledge_seed_projection() is True
    assert sample_main.acknowledge_seed_projection() is True
    assert len(calls) == 1
    assert calls[0]["headers"] == {"Authorization": "Bearer test-token"}
    assert calls[0]["json"] == {
        "policyRevisionId": "51111111-1111-4111-8111-111111111111",
        "target": "postgresql",
        "observedRevision": 1,
        "state": "deployed",
        "error": None,
    }


def test_seed_projection_acknowledgement_retries_after_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    attempts = 0

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "target": "postgresql",
                "desiredRevision": 1,
                "observedRevision": 1,
                "state": "deployed",
            }

    def fake_put(*_args: object, **_kwargs: object) -> Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise sample_main.httpx.ConnectError("catalog is starting")
        return Response()

    monkeypatch.setattr(sample_main, "_seed_projection_acknowledged", False)
    monkeypatch.setattr(
        sample_main.settings,
        "catalog_deployment_ack_url",
        "http://catalog/internal/v1/policy-deployments/acknowledge",
    )
    monkeypatch.setattr(sample_main.httpx, "put", fake_put)

    assert sample_main.acknowledge_seed_projection() is False
    assert sample_main.acknowledge_seed_projection() is True
    assert attempts == 2


def test_readiness_attempts_seed_projection_acknowledgement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def acknowledge() -> bool:
        nonlocal calls
        calls += 1
        return False

    monkeypatch.setattr(sample_main, "database_ready", lambda: True)
    monkeypatch.setattr(sample_main, "acknowledge_seed_projection", acknowledge)

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert calls == 1
