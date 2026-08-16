from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
VERSIONING_SPEC = importlib.util.spec_from_file_location(
    "daca_repository_versioning",
    ROOT / "scripts/versioning.py",
)
assert VERSIONING_SPEC is not None and VERSIONING_SPEC.loader is not None
versioning = importlib.util.module_from_spec(VERSIONING_SPEC)
sys.modules[VERSIONING_SPEC.name] = versioning
VERSIONING_SPEC.loader.exec_module(versioning)


def _write(repo: Path, relative_path: str | Path, content: str) -> None:
    path = repo / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _write_json(repo: Path, relative_path: str | Path, content: dict[str, object]) -> None:
    _write(repo, relative_path, f"{json.dumps(content, indent=2)}\n")


def _python_project(name: str, release_version: str) -> str:
    return (
        "[project]\n"
        f'name = "{name}"\n'
        f'version = "{release_version}"\n'
        "requires-python = \">=3.14\"\n\n"
        "[tool.fixture]\n"
        'domain-api-version = "v1"\n'
    )


def _uv_package(name: str, release_version: str, source: str) -> str:
    return (
        "[[package]]\n"
        f'name = "{name}"\n'
        f'version = "{release_version}"\n'
        f"source = {{ {source} }}\n\n"
    )


def _create_repository_fixture(repo: Path, release_version: str = "0.1.0") -> None:
    _write(repo, "VERSION", f"{release_version}\n")

    _write(
        repo,
        "packages/design-system/src/lib/version.ts",
        f"export const DACA_VERSION = '{release_version}' as const;\n",
    )
    _write(
        repo,
        "packages/design-system/src/lib/feature-list.ts",
        "import { DACA_VERSION } from './version';\n"
        "export const DACA_FEATURE_RELEASE = {\n"
        "  version: DACA_VERSION,\n"
        "};\n",
    )
    for relative_path in (
        "services/catalog-api/src/daca_catalog/__init__.py",
        "services/control-plane-api/src/daca_control_plane/__init__.py",
        "services/sample-data-product/app/__init__.py",
        "journeys/runner/src/daca_journeys/__init__.py",
    ):
        _write(repo, relative_path, f'__version__ = "{release_version}"\n')

    for relative_path in (
        "docs/openapi/daca-metadata-publication.openapi.yaml",
        "apps/catalog-ui/public/openapi/daca-metadata-publication.openapi.yaml",
    ):
        _write(
            repo,
            relative_path,
            "openapi: 3.1.0\n"
            "info:\n"
            "  title: Focused publication contract\n"
            f'  version: "{release_version}"\n'
            'x-domain-api-version: "v1"\n',
        )

    image_manifests = {
        "k8s/daca-catalog-ui.yaml": "tib-daca-catalog-ui",
        "k8s/daca-catalog-api.yaml": "tib-daca-catalog-api",
        "k8s/daca-sample-data-product.yaml": "tib-daca-sample-data-product",
    }
    for relative_path, image_name in image_manifests.items():
        _write(
            repo,
            relative_path,
            "apiVersion: apps/v1\n"
            "kind: Deployment\n"
            "spec:\n"
            "  template:\n"
            "    spec:\n"
            "      containers:\n"
            "        - name: fixture\n"
            f"          image: docker-hub.nexus.bit.admin.ch/svabra/{image_name}:{release_version}\n",
        )

    node_projects = {
        "package.json": "bit-daca",
        "apps/catalog-ui/package.json": "@daca/catalog-ui",
        "apps/control-plane-ui/package.json": "@daca/control-plane-ui",
        "packages/design-system/package.json": "@bit-daca/design-system",
    }
    for relative_path, name in node_projects.items():
        _write_json(
            repo,
            relative_path,
            {
                "name": name,
                "version": release_version,
                "private": True,
                "dependencies": {"external-fixture": "0.1.0"},
            },
        )

    lock_names = {
        "package-lock.json": (
            "bit-daca",
            "@daca/catalog-ui",
            "@daca/control-plane-ui",
            "@bit-daca/design-system",
        ),
        "apps/catalog-ui/package-lock.json": (
            "@daca/catalog-ui",
            "@bit-daca/design-system",
        ),
        "apps/control-plane-ui/package-lock.json": (
            "@daca/control-plane-ui",
            "@bit-daca/design-system",
        ),
    }
    for relative_path, names in lock_names.items():
        lock_packages: dict[str, object] = {
            f"first-party/{index}": {"name": name, "version": release_version}
            for index, name in enumerate(names)
        }
        lock_packages["node_modules/external-fixture"] = {
            "name": "external-fixture",
            "version": "0.1.0",
        }
        _write_json(
            repo,
            relative_path,
            {
                "name": names[0],
                "version": release_version,
                "lockfileVersion": 3,
                "packages": lock_packages,
            },
        )

    python_projects = {
        "pyproject.toml": "bit-daca-monorepo",
        "services/catalog-api/pyproject.toml": "daca-catalog-api",
        "services/control-plane-api/pyproject.toml": "daca-control-plane-api",
        "services/sample-data-product/pyproject.toml": "daca-sample-data-product",
        "journeys/runner/pyproject.toml": "daca-journey-runner",
    }
    for relative_path, name in python_projects.items():
        _write(repo, relative_path, _python_project(name, release_version))

    root_lock = "version = 1\nrevision = 3\n\n"
    root_lock += _uv_package("bit-daca-monorepo", release_version, 'virtual = "."')
    for name in (
        "daca-catalog-api",
        "daca-control-plane-api",
        "daca-sample-data-product",
        "daca-journey-runner",
    ):
        root_lock += _uv_package(name, release_version, f'editable = "packages/{name}"')
    root_lock += _uv_package("external-fixture", "0.1.0", 'registry = "https://pypi.org/simple"')
    _write(repo, "uv.lock", root_lock)

    service_locks = {
        "services/catalog-api/uv.lock": "daca-catalog-api",
        "services/control-plane-api/uv.lock": "daca-control-plane-api",
        "services/sample-data-product/uv.lock": "daca-sample-data-product",
    }
    for relative_path, name in service_locks.items():
        _write(
            repo,
            relative_path,
            "version = 1\nrevision = 3\n\n"
            + _uv_package(name, release_version, 'editable = "."')
            + _uv_package("external-fixture", "0.1.0", 'registry = "https://pypi.org/simple"'),
        )


def test_repository_release_surfaces_match_version() -> None:
    assert versioning.check_repository(ROOT) == []


def test_bump_synchronizes_every_release_surface_without_domain_version_rewrites(
    tmp_path: Path,
) -> None:
    _create_repository_fixture(tmp_path)

    changed = versioning.sync_release_surfaces("0.1.1", repo_root=tmp_path)

    assert changed
    assert versioning.canonical_version(tmp_path) == "0.1.1"
    assert versioning.check_repository(tmp_path) == []
    assert 'x-domain-api-version: "v1"' in (
        tmp_path / "docs/openapi/daca-metadata-publication.openapi.yaml"
    ).read_text(encoding="utf-8")
    assert 'domain-api-version = "v1"' in (tmp_path / "pyproject.toml").read_text(
        encoding="utf-8"
    )
    assert "apiVersion: apps/v1" in (tmp_path / "k8s/daca-catalog-ui.yaml").read_text(
        encoding="utf-8"
    )

    root_package = json.loads((tmp_path / "package.json").read_text(encoding="utf-8"))
    assert root_package["dependencies"]["external-fixture"] == "0.1.0"
    assert 'name = "external-fixture"\nversion = "0.1.0"' in (
        tmp_path / "uv.lock"
    ).read_text(encoding="utf-8")


def test_check_reports_a_drifted_first_party_lock_entry(tmp_path: Path) -> None:
    _create_repository_fixture(tmp_path)
    lock_path = tmp_path / "package-lock.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    lock["packages"]["first-party/1"]["version"] = "9.9.9"
    lock_path.write_text(f"{json.dumps(lock, indent=2)}\n", encoding="utf-8")

    errors = versioning.check_repository(tmp_path)

    assert any("package-lock.json" in error and "9.9.9" in error for error in errors)


def test_check_rejects_a_feature_list_detached_from_shared_version(tmp_path: Path) -> None:
    _create_repository_fixture(tmp_path)
    feature_path = tmp_path / "packages/design-system/src/lib/feature-list.ts"
    feature_path.write_text(
        "export const DACA_FEATURE_RELEASE = { version: '9.9.9' };\n",
        encoding="utf-8",
    )

    errors = versioning.check_repository(tmp_path)

    assert any("feature-list.ts" in error and "DACA_VERSION" in error for error in errors)


def test_bump_refuses_to_hide_existing_repository_drift(tmp_path: Path) -> None:
    _create_repository_fixture(tmp_path)
    package_path = tmp_path / "apps/catalog-ui/package.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    package["version"] = "9.9.9"
    package_path.write_text(f"{json.dumps(package, indent=2)}\n", encoding="utf-8")

    assert versioning.run_bump("0.1.1", repo_root=tmp_path) == 1
    assert versioning.canonical_version(tmp_path) == "0.1.0"


@pytest.mark.parametrize("invalid", ["v1.2.3", "1.2", "01.2.3", "1.2.3-rc.1", ""])
def test_semver_validation_is_strict(invalid: str) -> None:
    with pytest.raises(ValueError, match="Invalid semantic version"):
        versioning.validate_semver(invalid)


def test_update_plan_is_validated_before_any_file_is_written(tmp_path: Path) -> None:
    _create_repository_fixture(tmp_path)
    (tmp_path / "packages/design-system/src/lib/version.ts").unlink()

    with pytest.raises(OSError):
        versioning.sync_release_surfaces("0.1.1", repo_root=tmp_path)

    assert versioning.canonical_version(tmp_path) == "0.1.0"
