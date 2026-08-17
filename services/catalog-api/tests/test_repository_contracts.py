from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-co", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [ROOT / item.decode() for item in result.stdout.split(b"\0") if item]


def test_legacy_product_identifier_is_absent_from_tracked_repository() -> None:
    legacy_identifier = "di" + "daca"
    violations: list[str] = []
    for path in tracked_files():
        relative = path.relative_to(ROOT).as_posix()
        if legacy_identifier in relative.lower():
            violations.append(relative)
            continue
        if path.suffix.lower() in {".avif", ".ico", ".png", ".webp"}:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if legacy_identifier in content.lower():
            violations.append(relative)
    assert violations == []


def test_production_manifests_use_existing_postgres_and_pgadmin() -> None:
    manifests = "\n".join(
        path.read_text(encoding="utf-8") for path in sorted((ROOT / "k8s").glob("*.yaml"))
    ).lower()
    assert "kind: statefulset" not in manifests
    assert "kind: persistentvolumeclaim" not in manifests
    assert "image: postgres" not in manifests
    assert "image: dpage/pgadmin" not in manifests
    assert "namespace: daai-brs-d" in manifests
    assert "http://daca-catalog-api:8001" in manifests


def test_local_compose_uses_postgres_18_and_local_pgadmin_only() -> None:
    compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")
    assert "image: postgres:18.4" in compose
    assert "image: dpage/pgadmin4:latest" in compose
    assert '"5051:80"' in compose
    assert "sqlite" not in compose.lower()
    assert "daca_catalog" in compose


def test_version_matches_openshift_image_pins() -> None:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    for name in (
        "tib-daca-catalog-ui",
        "tib-daca-catalog-api",
        "tib-daca-sample-data-product",
    ):
        expected = f"docker-hub.nexus.bit.admin.ch/svabra/{name}:{version}"
        manifests = "\n".join(
            path.read_text(encoding="utf-8") for path in sorted((ROOT / "k8s").glob("*.yaml"))
        )
        assert expected in manifests


def test_docker_publish_uses_one_component_tagged_docker_hub_repository() -> None:
    workflow = (ROOT / ".github/workflows/docker-publish.yml").read_text(encoding="utf-8")
    repository = "docker.io/svabra/tib-daca-poc"
    components = (
        "catalog-ui",
        "catalog-api",
        "control-plane-ui",
        "control-plane-api",
        "sample-data-product",
    )

    assert workflow.count(f"repository: {repository}") == len(components)
    assert "password: ${{ secrets.DOCKERHUB_TOKEN }}" in workflow
    assert "needs:\n      - test\n      - postgres-compatibility" in workflow
    for component in components:
        assert f"component: {component}" in workflow

    assert "type=sha,prefix=${{ matrix.image.component }}-sha-" in workflow
    assert (
        "type=raw,value=${{ matrix.image.component }}-"
        "${{ steps.version.outputs.value }},enable=${{ steps.release.outputs.publish }}"
    ) in workflow
    assert "docker.io/svabra/tib-daca-catalog-ui" not in workflow
    assert "docker.io/svabra/tib-daca-catalog-api" not in workflow
