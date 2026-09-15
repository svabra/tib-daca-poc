"""BIT DaCa control-plane service."""

from __future__ import annotations

import os
from pathlib import Path

__version__ = "0.1.24"


def get_runtime_version() -> str:
    """Resolve the deployed build version while keeping source checkouts useful."""
    image_version = os.getenv("IMAGE_VERSION", "").strip()
    if image_version:
        return image_version

    for directory in Path(__file__).resolve().parents:
        version_file = directory / "VERSION"
        try:
            repository_version = version_file.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if repository_version:
            return repository_version
    return __version__
