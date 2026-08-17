from __future__ import annotations

from pathlib import Path

from daca_catalog import get_runtime_version
from daca_catalog.main import create_app
from daca_catalog.settings import Settings
from fastapi.testclient import TestClient


def test_image_version_drives_openapi_and_health(monkeypatch, session_factory) -> None:
    monkeypatch.setenv("IMAGE_VERSION", "9.8.7-build.4")
    application = create_app(
        settings=Settings(
            database_url="sqlite+pysqlite://",
            seed_on_startup=False,
            cors_origins=["http://testserver"],
        ),
        session_factory=session_factory,
    )

    assert application.version == "9.8.7-build.4"
    assert application.openapi()["info"]["version"] == "9.8.7-build.4"
    with TestClient(application) as client:
        assert client.get("/health/live").json()["version"] == "9.8.7-build.4"


def test_repository_version_is_used_without_image_version(monkeypatch) -> None:
    monkeypatch.delenv("IMAGE_VERSION", raising=False)
    expected = (Path(__file__).resolve().parents[3] / "VERSION").read_text(encoding="utf-8").strip()

    assert get_runtime_version() == expected
