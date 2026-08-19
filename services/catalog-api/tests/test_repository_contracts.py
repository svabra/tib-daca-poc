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


def test_openshift_presentation_profile_has_four_isolated_workloads() -> None:
    manifests_by_name = {
        path.name: path.read_text(encoding="utf-8")
        for path in sorted((ROOT / "k8s").glob("*.yaml"))
    }
    all_manifests = "\n".join(manifests_by_name.values())

    assert all_manifests.count("kind: Deployment") == 4
    assert "daca-control-plane" not in all_manifests
    assert "kind: PersistentVolumeClaim" not in all_manifests
    for name in (
        "daca-catalog-ui.yaml",
        "daca-catalog-api.yaml",
        "daca-sample-data-product.yaml",
        "daca-opa.yaml",
    ):
        manifest = manifests_by_name[name]
        assert "replicas: 1" in manifest
        assert "revisionHistoryLimit: 2" in manifest
        assert "type: Recreate" in manifest
        assert "imagePullPolicy: Always" in manifest
        assert "startupProbe:" in manifest
        assert "readinessProbe:" in manifest
        assert "livenessProbe:" in manifest


def test_openshift_apis_reference_shared_daaif_postgres_keys() -> None:
    for name in ("daca-catalog-api.yaml", "daca-sample-data-product.yaml"):
        manifest = (ROOT / "k8s" / name).read_text(encoding="utf-8")
        assert manifest.count("name: tib-daail-evo1-poc-query-engine-config") == 3
        assert manifest.count("name: tib-daail-evo1-poc-query-engine-secret") == 2
        for key in ("PG_HOST", "PG_PORT", "PG_OLTP_DATABASE", "PG_USER", "PG_PASSWORD"):
            assert f"key: {key}" in manifest

    secret_example = (ROOT / "k8s/daca-secret.example.yaml").read_text(encoding="utf-8")
    for forbidden in (
        "DATABASE_URL:",
        "ALEMBIC_DATABASE_URL:",
        "SAMPLE_DATABASE_URL:",
        "POLICY_PROJECTOR_DATABASE_URL:",
        "S3_ACCESS_KEY_ID:",
        "S3_SECRET_ACCESS_KEY:",
    ):
        assert forbidden not in secret_example

    config = (ROOT / "k8s/daca-configmap.yaml").read_text(encoding="utf-8")
    assert "DACA_CATALOG_SCHEMA: daca_catalog" in config
    assert "DACA_SAMPLE_SCHEMA: daca_sample" in config
    assert 'DACA_SHARED_POSTGRES: "true"' in config


def test_docker_publish_uses_separate_version_tagged_docker_hub_repositories() -> None:
    workflow = (ROOT / ".github/workflows/docker-publish.yml").read_text(encoding="utf-8")
    repositories = (
        "tib-daca-catalog-ui",
        "tib-daca-catalog-api",
        "tib-daca-control-plane-ui",
        "tib-daca-control-plane-api",
        "tib-daca-sample-data-product",
    )

    for repository in repositories:
        assert workflow.count(f"repository: docker.io/svabra/{repository}") == 1
    assert "password: ${{ secrets.DOCKERHUB_TOKEN }}" in workflow
    assert "username: ${{ vars.DOCKERHUB_USERNAME || 'svabra' }}" in workflow
    assert "needs:\n      - test\n      - postgres-compatibility" in workflow
    assert "docker.io/svabra/tib-daca-poc" not in workflow
    assert "type=sha,prefix=sha-" in workflow
    assert (
        "type=raw,value=${{ steps.version.outputs.value }},"
        "enable=${{ steps.release.outputs.publish }}"
    ) in workflow


def test_poc_guide_ships_twenty_optimized_webp_screenshots() -> None:
    image_dir = ROOT / "apps/catalog-ui/public/assets/poc-guide"
    images = sorted(image_dir.glob("*.webp"))
    expected_consumer_journey_images = {
        "journey-01-product-search.webp",
        "journey-01-data-dictionary.webp",
        "journey-01-endpoint-quickstart.webp",
    }

    assert expected_consumer_journey_images <= {path.name for path in images}
    assert len(images) == 20
    assert sum(path.stat().st_size for path in images) < 2_000_000
    for path in images:
        header = path.read_bytes()[:12]
        assert header[:4] == b"RIFF"
        assert header[8:12] == b"WEBP"


def test_openshift_config_exposes_only_the_public_daaif_ui_url() -> None:
    config = (ROOT / "k8s/daca-configmap.yaml").read_text(encoding="utf-8")

    assert (
        "DAAIF_UI_URL: "
        "https://evo1-bdw-daai-brs-d.apps.p-szb-ros-nopi-npr-01.cloud.admin.ch"
    ) in config


def test_catalog_service_worker_never_caches_identity_dependent_api_responses() -> None:
    config = (ROOT / "apps/catalog-ui/ngsw-config.json").read_text(encoding="utf-8")

    assert '"dataGroups"' not in config
    assert '"!/api/**"' in config
