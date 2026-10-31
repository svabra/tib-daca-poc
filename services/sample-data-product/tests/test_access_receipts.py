import httpx
import pytest
from app import main
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_report_retry_reuses_event_id_and_only_sends_whitelisted_metadata(monkeypatch):
    edge = "31111111-1111-4111-8111-222222222222"
    monkeypatch.setattr(main.settings, "catalog_access_events_url", "http://catalog/internal/v1/lineage")
    monkeypatch.setattr(main.settings, "catalog_access_event_routes", {"product:machine:service": edge})
    calls = []
    class Client:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *_):
            return None
        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            if len(calls) == 1:
                raise httpx.ConnectError("synthetic outage")
            return httpx.Response(201, request=httpx.Request("POST", url))
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **_: Client())
    await main.report_access("product", "service", "machine", "success")
    assert len(calls) == 2 and calls[0][1]["json"] == calls[1][1]["json"]
    assert calls[0][0].endswith(f"/{edge}/access-events")
    assert set(calls[0][1]["json"]) == {"id", "occurredAt", "subjectId", "subjectType", "protocol", "outcome"}
    await main.report_access("product", "unmapped", "person", "success")
    assert len(calls) == 2


@pytest.mark.parametrize("subject_type", ["person", "machine"])
def test_success_only_after_fetch_and_receipt_and_mixed_identity_denied(monkeypatch, subject_type):
    monkeypatch.setattr(main.settings, "daca_demo_auth", True)
    order = []
    async def opa(document):
        assert document["subject"]["type"] == subject_type
        return True, "synthetic allow", None
    def fetch(*args):
        order.append("fetch")
        return []
    async def receipt(product, subject, kind, outcome):
        order.append(outcome)
        assert kind == subject_type
    monkeypatch.setattr(main, "evaluate_opa", opa)
    monkeypatch.setattr(main, "fetch_statistics", fetch)
    monkeypatch.setattr(main, "report_access", receipt)
    header = "X-DaCa-Machine" if subject_type == "machine" else "X-DaCa-User"
    with TestClient(main.app) as client:
        response = client.get("/api/v1/estv/tax-statistics", headers={header: "reader", "X-Request-ID": "caller-value-never-used-as-event-id"})
        assert response.status_code == 200 and order == ["fetch", "success"]
        assert client.get("/api/v1/estv/tax-statistics", headers={"X-DaCa-User": "a", "X-DaCa-Machine": "b"}).status_code == 401


def test_no_success_receipt_on_denial_and_no_data_on_reporting_failure(monkeypatch):
    monkeypatch.setattr(main.settings, "daca_demo_auth", True)
    outcomes = []
    async def deny(_):
        return False, "denied", None
    async def receipt(*args):
        outcomes.append(args[-1])
    monkeypatch.setattr(main, "evaluate_opa", deny)
    monkeypatch.setattr(main, "report_access", receipt)
    with TestClient(main.app) as client:
        assert client.get("/api/v1/estv/tax-statistics", headers={"X-DaCa-User": "reader"}).status_code == 403
    assert outcomes == ["denied"]
    async def allow(_):
        return True, "allowed", None
    async def unavailable(*_):
        raise main.ProblemError(503, "Access log unavailable", "Synthetic failure", "access-log-unavailable")
    monkeypatch.setattr(main, "evaluate_opa", allow)
    monkeypatch.setattr(main, "report_access", unavailable)
    monkeypatch.setattr(main, "fetch_statistics", lambda *_: [{"protected": "must never be returned"}])
    with TestClient(main.app) as client:
        response = client.get("/api/v1/estv/tax-statistics", headers={"X-DaCa-User": "reader"})
        assert response.status_code == 503
        assert "protected" not in response.text
