from __future__ import annotations

from app import get_runtime_version
from app.main import app


def test_image_version_has_priority(monkeypatch) -> None:
    monkeypatch.setenv("IMAGE_VERSION", "9.8.7-build.4")

    assert get_runtime_version() == "9.8.7-build.4"


def test_openapi_uses_resolved_runtime_version() -> None:
    assert app.openapi()["info"]["version"] == app.version
