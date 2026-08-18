from __future__ import annotations

import pytest
from daca_catalog.settings import Settings
from pydantic import ValidationError


def test_poc_guide_config_exposes_only_public_navigation_values(client) -> None:
    response = client.get("/api/v1/poc/guide-config")

    assert response.status_code == 200
    assert response.json() == {"daaifUiUrl": None, "environment": "local"}
    serialized = response.text.casefold()
    assert "password" not in serialized
    assert "token" not in serialized
    assert "postgres" not in serialized


@pytest.mark.parametrize(
    "value",
    (
        "ftp://daaif.example.test",
        "https://user:secret@daaif.example.test",
        "https://daaif.example.test?token=secret",
        "https://daaif.example.test/#fragment",
        "daaif.example.test",
    ),
)
def test_daaif_ui_url_rejects_unsafe_or_non_http_values(value: str) -> None:
    with pytest.raises(ValidationError):
        Settings(daaif_ui_url=value)


def test_daaif_ui_url_is_normalized_for_link_composition() -> None:
    settings = Settings(daaif_ui_url=" https://daaif.example.test/base/ ")

    assert settings.daaif_ui_url == "https://daaif.example.test/base"
