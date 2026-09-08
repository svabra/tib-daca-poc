from __future__ import annotations

import httpx
from daca_catalog.federal_organization_import import DEFAULT_SNAPSHOT, load_and_validate_snapshot
from daca_catalog.modeling_assistance_api import normalize_termdat_entry
from pydantic import SecretStr


def test_checked_staatskalender_snapshot_contains_official_armasuisse_chain() -> None:
    payload, digest = load_and_validate_snapshot(DEFAULT_SNAPSHOT)
    parents = {node["id"]: node.get("parentId") for node in payload["nodes"]}
    assert parents["vbs-armasuisse"] == "vbs"
    assert parents["vbs-armasuisse-immobilien"] == "vbs-armasuisse"
    assert len(digest) == 64


def test_termdat_normalization_preserves_multilingual_source_evidence() -> None:
    entry = normalize_termdat_entry(
        {
            "id": 42,
            "modifiedAt": "2026-09-01T10:00:00Z",
            "languageDetails": [
                {
                    "languageIsoCode": "de",
                    "sequence": 1,
                    "terminus": "Immobilienobjekt",
                    "definition": "Ein Objekt.",
                    "definitionSource": "BK",
                },
                {
                    "languageIsoCode": "fr",
                    "sequence": 1,
                    "terminus": "Objet immobilier",
                    "definition": "Un objet.",
                },
            ],
        }
    )
    assert entry["uri"] == "https://register.ld.admin.ch/termdat/42"
    assert entry["languages"]["fr"]["term"] == "Objet immobilier"
    assert entry["sourceModifiedAt"] == "2026-09-01T10:00:00Z"
    assert len(entry["payloadHash"]) == 64


def test_termdat_normalization_uses_note_then_context_as_description_fallback() -> None:
    entry = normalize_termdat_entry(
        {
            "id": 194470,
            "languageDetails": [
                {
                    "languageIsoCode": "de",
                    "sequence": 1,
                    "terminus": "gepanzertes Raupenfahrzeug",
                    "note": "DOM: Verkehr und Transport",
                    "noteSource": "V über den militärischen Strassenverkehr",
                }
            ],
        }
    )
    assert entry["definition"] == "DOM: Verkehr und Transport"
    assert entry["descriptionType"] == "note"
    assert entry["source"] == "V über den militärischen Strassenverkehr"


def test_termdat_search_uses_summary_then_fetches_each_output_language(client) -> None:
    seen_entry_languages: set[str] = set()
    terms = {"fr": "char", "it": "carro armato", "en": "tank", "rm": "char armà"}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(("/Collection", "/Classification")):
            return httpx.Response(200, json=[{"id": 18}])
        if request.url.path.endswith("/Search"):
            assert request.url.params.get("ReturnType") == "Summary"
            assert "OutLanguageCode" not in request.url.params
            assert request.url.params.get("SearchTerm") == "*panzer*"
            assert request.url.params.get("Field.Definition") == "false"
            assert request.url.params.get("Field.Abbreviation") == "true"
            assert request.url.params.get("Field.Phraseology") == "true"
            return httpx.Response(200, json=[{"id": 24890, "hits": ["Panzer"]}])
        if request.url.path.endswith("/Entry"):
            output_language = request.url.params["OutLanguageCode"]
            seen_entry_languages.add(output_language)
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 24890,
                        "status": {"text": "in Bearbeitung"},
                        "languageDetails": [
                            {"id": 1, "languageIsoCode": "de", "sequence": 1, "name": "Panzer"},
                            {
                                "id": 2 + len(seen_entry_languages),
                                "languageIsoCode": output_language,
                                "sequence": 1,
                                "name": terms[output_language],
                            },
                        ],
                    }
                ],
            )
        raise AssertionError(f"Unexpected TERMDAT request: {request.url}")

    client.app.state.settings.daca_termdat_api_url = "https://termdat-search.test/v2"
    client.app.state.assistance_transport = httpx.MockTransport(handler)
    response = client.get(
        "/api/v1/termdat/search?q=panzer&language=de&limit=10",
        headers={"X-DaCa-User": "daca-test-editor"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["preferredTerm"] == "Panzer"
    assert body["items"][0]["languages"]["fr"]["term"] == "char"
    assert body["items"][0]["languages"]["rm"]["term"] == "char armà"
    assert seen_entry_languages == {"fr", "it", "en", "rm"}


def test_termdat_search_reports_no_public_results_without_detail_requests(client) -> None:
    entry_requested = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal entry_requested
        if request.url.path.endswith(("/Collection", "/Classification")):
            return httpx.Response(200, json=[{"id": 18}])
        if request.url.path.endswith("/Search"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/Entry"):
            entry_requested = True
        raise AssertionError(f"Unexpected TERMDAT request: {request.url}")

    client.app.state.settings.daca_termdat_api_url = "https://termdat-empty.test/v2"
    client.app.state.assistance_transport = httpx.MockTransport(handler)
    response = client.get(
        "/api/v1/termdat/search?q=panzer&language=de&limit=10",
        headers={"X-DaCa-User": "daca-test-editor"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["items"] == []
    assert entry_requested is False


def test_deepl_is_server_side_unclassified_only_and_returns_provenance(client) -> None:
    seen_authorization: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_authorization.append(request.headers.get("authorization", ""))
        target = request.content.decode().split("target_lang=")[-1]
        return httpx.Response(200, json={"translations": [{"text": f"translated-{target}"}]})

    client.app.state.settings.daca_deepl_api_key = SecretStr("top-secret-test-key")
    client.app.state.assistance_transport = httpx.MockTransport(handler)
    headers = {"X-DaCa-User": "daca-test-editor"}

    blocked = client.post(
        "/api/v1/assistance/translations",
        headers=headers,
        json={
            "sourceText": "Geheim",
            "classification": "confidential",
        },
    )
    assert blocked.status_code == 422
    assert "top-secret-test-key" not in blocked.text

    response = client.post(
        "/api/v1/assistance/translations",
        headers=headers,
        json={
            "sourceText": "Immobilienportfolio",
            "classification": "unclassified",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body["translations"]) == {"fr", "it", "en"}
    assert len(body["sourceTextHash"]) == len(body["payloadHash"]) == 64
    assert all(value == "DeepL-Auth-Key top-secret-test-key" for value in seen_authorization)
    assert "top-secret-test-key" not in response.text
