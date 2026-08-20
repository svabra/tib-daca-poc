from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
SEMVER_PATTERN = re.compile(r"^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$")
VERSION_TOKEN_PATTERN = r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
FEATURE_LIST_PATH = Path("packages/design-system/src/lib/feature-list.ts")
FEATURE_LIST_VERSION_IMPORT = "import { DACA_VERSION } from './version';"
FEATURE_LIST_VERSION_BINDING = "version: DACA_VERSION,"
SERVICE_WORKER_APP_DATA_SCHEMA_VERSION = 1
SERVICE_WORKER_CONFIG_EXPECTATIONS = {
    Path("apps/catalog-ui/ngsw-config.json"): "catalog-ui",
    Path("apps/control-plane-ui/ngsw-config.json"): "control-plane-ui",
}
SERVICE_WORKER_BUILD_PATHS = {
    Path("apps/catalog-ui/ngsw-config.json"): Path(
        "apps/catalog-ui/dist/catalog-ui/browser/ngsw.json"
    ),
    Path("apps/control-plane-ui/ngsw-config.json"): Path(
        "apps/control-plane-ui/dist/control-plane-ui/browser/ngsw.json"
    ),
}


@dataclass(frozen=True)
class TextVersionRule:
    relative_path: Path
    description: str
    pattern: re.Pattern[str]


def _rule(
    relative_path: str,
    description: str,
    prefix: str,
    suffix: str,
) -> TextVersionRule:
    return TextVersionRule(
        relative_path=Path(relative_path),
        description=description,
        pattern=re.compile(
            rf"(?m)^(?P<prefix>{prefix})(?P<version>{VERSION_TOKEN_PATTERN})(?P<suffix>{suffix})$"
        ),
    )


TEXT_VERSION_RULES = (
    _rule(
        "packages/design-system/src/lib/version.ts",
        "shared Angular DACA_VERSION constant",
        r"export const DACA_VERSION = '",
        r"' as const;",
    ),
    _rule(
        "services/catalog-api/src/daca_catalog/__init__.py",
        "catalog API __version__",
        r'__version__ = "',
        r'"',
    ),
    _rule(
        "services/control-plane-api/src/daca_control_plane/__init__.py",
        "control-plane API __version__",
        r'__version__ = "',
        r'"',
    ),
    _rule(
        "services/sample-data-product/app/__init__.py",
        "sample data product __version__",
        r'__version__ = "',
        r'"',
    ),
    _rule(
        "journeys/runner/src/daca_journeys/__init__.py",
        "journey runner __version__",
        r'__version__ = "',
        r'"',
    ),
    _rule(
        "docs/openapi/daca-metadata-publication.openapi.yaml",
        "focused metadata-publication OpenAPI info.version",
        r'  version: "',
        r'"',
    ),
    _rule(
        "apps/catalog-ui/public/openapi/daca-metadata-publication.openapi.yaml",
        "served focused metadata-publication OpenAPI info.version",
        r'  version: "',
        r'"',
    ),
    _rule(
        "k8s/daca-catalog-ui.yaml",
        "catalog UI OpenShift image pin",
        r"[ \t]*image:[ \t]+docker-hub\.nexus\.bit\.admin\.ch/svabra/tib-daca-catalog-ui:",
        r"[ \t]*",
    ),
    _rule(
        "k8s/daca-catalog-api.yaml",
        "catalog API OpenShift image pin",
        r"[ \t]*image:[ \t]+docker-hub\.nexus\.bit\.admin\.ch/svabra/tib-daca-catalog-api:",
        r"[ \t]*",
    ),
    _rule(
        "k8s/daca-sample-data-product.yaml",
        "sample data product OpenShift image pin",
        r"[ \t]*image:[ \t]+docker-hub\.nexus\.bit\.admin\.ch/svabra/tib-daca-sample-data-product:",
        r"[ \t]*",
    ),
)

PACKAGE_JSON_PATHS = (
    Path("package.json"),
    Path("apps/catalog-ui/package.json"),
    Path("apps/control-plane-ui/package.json"),
    Path("packages/design-system/package.json"),
)

PACKAGE_LOCK_EXPECTATIONS = {
    Path("package-lock.json"): frozenset(
        {
            "bit-daca",
            "@daca/catalog-ui",
            "@daca/control-plane-ui",
            "@bit-daca/design-system",
        }
    ),
    Path("apps/catalog-ui/package-lock.json"): frozenset(
        {"@daca/catalog-ui", "@bit-daca/design-system"}
    ),
    Path("apps/control-plane-ui/package-lock.json"): frozenset(
        {"@daca/control-plane-ui", "@bit-daca/design-system"}
    ),
}

PYPROJECT_PATHS = (
    Path("pyproject.toml"),
    Path("services/catalog-api/pyproject.toml"),
    Path("services/control-plane-api/pyproject.toml"),
    Path("services/sample-data-product/pyproject.toml"),
    Path("journeys/runner/pyproject.toml"),
)

UV_LOCK_EXPECTATIONS = {
    Path("uv.lock"): frozenset(
        {
            "bit-daca-monorepo",
            "daca-catalog-api",
            "daca-control-plane-api",
            "daca-sample-data-product",
            "daca-journey-runner",
        }
    ),
    Path("services/catalog-api/uv.lock"): frozenset({"daca-catalog-api"}),
    Path("services/control-plane-api/uv.lock"): frozenset({"daca-control-plane-api"}),
    Path("services/sample-data-product/uv.lock"): frozenset({"daca-sample-data-product"}),
}

PROJECT_VERSION_PATTERN = re.compile(
    rf"(?m)^(?P<prefix>version\s*=\s*\")(?P<version>{VERSION_TOKEN_PATTERN})(?P<suffix>\"\s*)$"
)
UV_PACKAGE_BLOCK_PATTERN = re.compile(
    r"(?ms)^\[\[package\]\]\r?\n.*?(?=^\[\[package\]\]\r?$|\Z)"
)
UV_NAME_PATTERN = re.compile(r'(?m)^name = "(?P<name>[^"]+)"\s*$')
UV_VERSION_PATTERN = re.compile(
    rf'(?m)^(?P<prefix>version = ")(?P<version>{VERSION_TOKEN_PATTERN})(?P<suffix>"\s*)$'
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def canonical_version(repo_root: Path = REPO_ROOT) -> str:
    return read_text(repo_root / "VERSION").strip()


def validate_semver(version: str) -> None:
    if not SEMVER_PATTERN.fullmatch(version):
        raise ValueError(f"Invalid semantic version {version!r}. Expected X.Y.Z without leading zeros.")


def _json_text(value: Any) -> str:
    return f"{json.dumps(value, indent=2, ensure_ascii=False)}\n"


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(read_text(path))
    if not isinstance(value, dict):
        raise TypeError(f"{path} must contain a JSON object.")
    return value


def _service_worker_config_update(
    path: Path,
    relative_path: Path,
    expected_app_id: str,
    version: str,
) -> str:
    data = _load_json(path)
    app_data = data.get("appData")
    if not isinstance(app_data, dict):
        raise TypeError(f"{relative_path.as_posix()} is missing its appData object.")
    schema_version = app_data.get("schemaVersion")
    if (
        type(schema_version) is not int
        or schema_version != SERVICE_WORKER_APP_DATA_SCHEMA_VERSION
    ):
        raise ValueError(
            f"{relative_path.as_posix()} appData.schemaVersion must be "
            f"{SERVICE_WORKER_APP_DATA_SCHEMA_VERSION}."
        )
    if app_data.get("appId") != expected_app_id:
        raise ValueError(
            f"{relative_path.as_posix()} appData.appId must be {expected_app_id!r}."
        )
    app_data["releaseVersion"] = version
    return _json_text(data)


def _text_rule_update(content: str, rule: TextVersionRule, version: str) -> str:
    matches = list(rule.pattern.finditer(content))
    if len(matches) != 1:
        raise ValueError(
            f"{rule.relative_path.as_posix()} must contain exactly one {rule.description}; "
            f"found {len(matches)}."
        )
    match = matches[0]
    replacement = f"{match.group('prefix')}{version}{match.group('suffix')}"
    return f"{content[:match.start()]}{replacement}{content[match.end():]}"


def _project_metadata(path: Path) -> tuple[str, str]:
    data = tomllib.loads(read_text(path))
    project = data.get("project")
    if not isinstance(project, dict):
        raise TypeError(f"{path} is missing a [project] table.")
    name = project.get("name")
    version = project.get("version")
    if not isinstance(name, str) or not isinstance(version, str):
        raise TypeError(f"{path} must declare string project.name and project.version values.")
    return name, version


def _project_version_update(content: str, relative_path: Path, version: str) -> str:
    project_match = re.search(r"(?m)^\[project\]\s*$", content)
    if project_match is None:
        raise ValueError(f"{relative_path.as_posix()} is missing a [project] table.")
    next_table = re.search(r"(?m)^\[(?!project\])[^\r\n]+\]\s*$", content[project_match.end() :])
    section_end = len(content) if next_table is None else project_match.end() + next_table.start()
    section = content[project_match.end() : section_end]
    matches = list(PROJECT_VERSION_PATTERN.finditer(section))
    if len(matches) != 1:
        raise ValueError(
            f"{relative_path.as_posix()} [project] must contain exactly one version; found {len(matches)}."
        )
    match = matches[0]
    start = project_match.end() + match.start()
    end = project_match.end() + match.end()
    replacement = f"{match.group('prefix')}{version}{match.group('suffix')}"
    return f"{content[:start]}{replacement}{content[end:]}"


def _local_uv_package_versions(content: str, relative_path: Path) -> dict[str, list[tuple[str, int, int]]]:
    packages: dict[str, list[tuple[str, int, int]]] = {}
    for block_match in UV_PACKAGE_BLOCK_PATTERN.finditer(content):
        block = block_match.group(0)
        try:
            parsed = tomllib.loads(block)["package"][0]
        except (KeyError, IndexError, TypeError, tomllib.TOMLDecodeError) as exc:
            raise ValueError(f"Could not parse a package block in {relative_path.as_posix()}: {exc}") from exc
        source = parsed.get("source", {})
        if not isinstance(source, dict) or not ({"editable", "virtual"} & source.keys()):
            continue
        name_match = UV_NAME_PATTERN.search(block)
        version_match = UV_VERSION_PATTERN.search(block)
        if name_match is None or version_match is None:
            raise ValueError(
                f"Local package block in {relative_path.as_posix()} is missing a supported name/version."
            )
        packages.setdefault(name_match.group("name"), []).append(
            (
                version_match.group("version"),
                block_match.start() + version_match.start("version"),
                block_match.start() + version_match.end("version"),
            )
        )
    return packages


def _uv_lock_update(
    content: str,
    relative_path: Path,
    expected_names: frozenset[str],
    version: str,
) -> str:
    packages = _local_uv_package_versions(content, relative_path)
    missing = sorted(expected_names - packages.keys())
    duplicates = sorted(name for name in expected_names if len(packages.get(name, [])) > 1)
    if missing or duplicates:
        details: list[str] = []
        if missing:
            details.append(f"missing {', '.join(missing)}")
        if duplicates:
            details.append(f"non-unique {', '.join(duplicates)}")
        raise ValueError(f"{relative_path.as_posix()} has invalid local package entries: {'; '.join(details)}.")

    replacements = [
        (entries[0][1], entries[0][2])
        for name, entries in packages.items()
        if name in expected_names
    ]
    for start, end in sorted(replacements, reverse=True):
        content = f"{content[:start]}{version}{content[end:]}"
    return content


def _planned_updates(version: str, repo_root: Path) -> dict[Path, str]:
    validate_semver(version)
    planned: dict[Path, str] = {repo_root / "VERSION": f"{version}\n"}

    for rule in TEXT_VERSION_RULES:
        path = repo_root / rule.relative_path
        planned[path] = _text_rule_update(read_text(path), rule, version)

    for relative_path, expected_app_id in SERVICE_WORKER_CONFIG_EXPECTATIONS.items():
        path = repo_root / relative_path
        planned[path] = _service_worker_config_update(
            path,
            relative_path,
            expected_app_id,
            version,
        )

    first_party_names: set[str] = set()
    for relative_path in PACKAGE_JSON_PATHS:
        path = repo_root / relative_path
        data = _load_json(path)
        name = data.get("name")
        if not isinstance(name, str):
            raise TypeError(f"{relative_path.as_posix()} is missing a string package name.")
        first_party_names.add(name)
        data["version"] = version
        planned[path] = _json_text(data)

    for relative_path, expected_names in PACKAGE_LOCK_EXPECTATIONS.items():
        path = repo_root / relative_path
        data = _load_json(path)
        packages = data.get("packages")
        if not isinstance(packages, dict):
            raise TypeError(f"{relative_path.as_posix()} is missing its packages object.")
        found_names: set[str] = set()
        for package in packages.values():
            if not isinstance(package, dict) or package.get("name") not in expected_names:
                continue
            package["version"] = version
            found_names.add(package["name"])
        if found_names != expected_names:
            missing = ", ".join(sorted(expected_names - found_names))
            raise ValueError(f"{relative_path.as_posix()} is missing first-party lock entries: {missing}.")
        if data.get("name") in first_party_names:
            data["version"] = version
        planned[path] = _json_text(data)

    python_names: set[str] = set()
    for relative_path in PYPROJECT_PATHS:
        path = repo_root / relative_path
        content = read_text(path)
        name, _ = _project_metadata(path)
        python_names.add(name)
        planned[path] = _project_version_update(content, relative_path, version)

    for relative_path, expected_names in UV_LOCK_EXPECTATIONS.items():
        unknown = expected_names - python_names
        if unknown:
            raise ValueError(
                f"{relative_path.as_posix()} expects unknown Python projects: {', '.join(sorted(unknown))}."
            )
        path = repo_root / relative_path
        planned[path] = _uv_lock_update(read_text(path), relative_path, expected_names, version)

    return planned


def sync_release_surfaces(version: str, *, repo_root: Path = REPO_ROOT) -> list[Path]:
    """Synchronize every managed release surface after validating the complete update plan."""

    planned = _planned_updates(version, repo_root)
    changed: list[Path] = []
    for path, content in planned.items():
        if read_text(path) == content:
            continue
        path.write_text(content, encoding="utf-8")
        changed.append(path)
    return changed


def _check_text_rules(version: str, repo_root: Path) -> list[str]:
    errors: list[str] = []
    for rule in TEXT_VERSION_RULES:
        path = repo_root / rule.relative_path
        try:
            content = read_text(path)
        except OSError as exc:
            errors.append(f"{rule.relative_path.as_posix()} cannot be read: {exc}.")
            continue
        matches = list(rule.pattern.finditer(content))
        if len(matches) != 1:
            errors.append(
                f"{rule.relative_path.as_posix()} must contain exactly one {rule.description}; "
                f"found {len(matches)}."
            )
            continue
        found = matches[0].group("version")
        if found != version:
            errors.append(
                f"{rule.relative_path.as_posix()} has {rule.description} at {found}, expected {version}."
            )
    return errors


def _check_feature_list_version_binding(repo_root: Path) -> list[str]:
    try:
        content = read_text(repo_root / FEATURE_LIST_PATH)
    except OSError as exc:
        return [f"{FEATURE_LIST_PATH.as_posix()} cannot be read: {exc}."]

    errors: list[str] = []
    if content.count(FEATURE_LIST_VERSION_IMPORT) != 1:
        errors.append(
            f"{FEATURE_LIST_PATH.as_posix()} must import the shared DACA_VERSION exactly once."
        )
    if content.count(FEATURE_LIST_VERSION_BINDING) != 1:
        errors.append(
            f"{FEATURE_LIST_PATH.as_posix()} must bind its release to DACA_VERSION exactly once."
        )
    return errors


def _check_service_worker_versions(version: str, repo_root: Path) -> list[str]:
    errors: list[str] = []
    for relative_path, expected_app_id in SERVICE_WORKER_CONFIG_EXPECTATIONS.items():
        try:
            data = _load_json(repo_root / relative_path)
            app_data = data.get("appData")
            if not isinstance(app_data, dict):
                raise TypeError("missing appData object")
            schema_version = app_data.get("schemaVersion")
            if (
                type(schema_version) is not int
                or schema_version != SERVICE_WORKER_APP_DATA_SCHEMA_VERSION
            ):
                errors.append(
                    f"{relative_path.as_posix()} has appData.schemaVersion "
                    f"{schema_version!r}, expected {SERVICE_WORKER_APP_DATA_SCHEMA_VERSION}."
                )
            app_id = app_data.get("appId")
            if app_id != expected_app_id:
                errors.append(
                    f"{relative_path.as_posix()} has appData.appId {app_id!r}, "
                    f"expected {expected_app_id!r}."
                )
            release_version = app_data.get("releaseVersion")
            if release_version != version:
                errors.append(
                    f"{relative_path.as_posix()} has appData.releaseVersion "
                    f"{release_version!r}, expected {version}."
                )
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"{relative_path.as_posix()} cannot be validated: {exc}.")
    return errors


def check_built_service_workers(repo_root: Path = REPO_ROOT) -> list[str]:
    try:
        version = canonical_version(repo_root)
        validate_semver(version)
    except (OSError, ValueError) as exc:
        return [str(exc)]

    errors: list[str] = []
    for config_path, expected_app_id in SERVICE_WORKER_CONFIG_EXPECTATIONS.items():
        relative_path = SERVICE_WORKER_BUILD_PATHS[config_path]
        expected_app_data = {
            "schemaVersion": SERVICE_WORKER_APP_DATA_SCHEMA_VERSION,
            "appId": expected_app_id,
            "releaseVersion": version,
        }
        try:
            data = _load_json(repo_root / relative_path)
            app_data = data.get("appData")
            schema_version = (
                app_data.get("schemaVersion") if isinstance(app_data, dict) else None
            )
            if (
                not isinstance(app_data, dict)
                or type(schema_version) is not int
                or app_data != expected_app_data
            ):
                errors.append(
                    f"{relative_path.as_posix()} has appData {app_data!r}, "
                    f"expected exactly {expected_app_data!r}."
                )
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"{relative_path.as_posix()} cannot be validated: {exc}.")
    return errors


def _check_node_versions(version: str, repo_root: Path) -> list[str]:
    errors: list[str] = []
    first_party_names: set[str] = set()
    for relative_path in PACKAGE_JSON_PATHS:
        try:
            data = _load_json(repo_root / relative_path)
            name = data.get("name")
            found = data.get("version")
            if not isinstance(name, str):
                raise TypeError("missing string name")
            first_party_names.add(name)
            if found != version:
                errors.append(f"{relative_path.as_posix()} has version {found!r}, expected {version}.")
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"{relative_path.as_posix()} cannot be validated: {exc}.")

    for relative_path, expected_names in PACKAGE_LOCK_EXPECTATIONS.items():
        try:
            data = _load_json(repo_root / relative_path)
            if data.get("name") in first_party_names and data.get("version") != version:
                errors.append(
                    f"{relative_path.as_posix()} top-level version is {data.get('version')!r}, "
                    f"expected {version}."
                )
            packages = data.get("packages")
            if not isinstance(packages, dict):
                raise TypeError("missing packages object")
            found_names: set[str] = set()
            for package_path, package in packages.items():
                if not isinstance(package, dict) or package.get("name") not in expected_names:
                    continue
                name = package["name"]
                found_names.add(name)
                if package.get("version") != version:
                    errors.append(
                        f"{relative_path.as_posix()} lock entry {package_path!r} ({name}) has version "
                        f"{package.get('version')!r}, expected {version}."
                    )
            for missing in sorted(expected_names - found_names):
                errors.append(f"{relative_path.as_posix()} is missing first-party lock entry {missing}.")
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"{relative_path.as_posix()} cannot be validated: {exc}.")
    return errors


def _check_python_versions(version: str, repo_root: Path) -> list[str]:
    errors: list[str] = []
    python_names: set[str] = set()
    for relative_path in PYPROJECT_PATHS:
        try:
            name, found = _project_metadata(repo_root / relative_path)
            python_names.add(name)
            if found != version:
                errors.append(f"{relative_path.as_posix()} has project.version {found}, expected {version}.")
        except (OSError, TypeError, ValueError, tomllib.TOMLDecodeError) as exc:
            errors.append(f"{relative_path.as_posix()} cannot be validated: {exc}.")

    for relative_path, expected_names in UV_LOCK_EXPECTATIONS.items():
        unknown = expected_names - python_names
        if unknown:
            errors.append(
                f"{relative_path.as_posix()} expects unknown Python projects: {', '.join(sorted(unknown))}."
            )
        try:
            content = read_text(repo_root / relative_path)
            tomllib.loads(content)
            packages = _local_uv_package_versions(content, relative_path)
            for name in sorted(expected_names):
                entries = packages.get(name, [])
                if len(entries) != 1:
                    errors.append(
                        f"{relative_path.as_posix()} must contain one local {name} package entry; "
                        f"found {len(entries)}."
                    )
                    continue
                found = entries[0][0]
                if found != version:
                    errors.append(
                        f"{relative_path.as_posix()} local package {name} has version {found}, expected {version}."
                    )
        except (OSError, ValueError, tomllib.TOMLDecodeError) as exc:
            errors.append(f"{relative_path.as_posix()} cannot be validated: {exc}.")
    return errors


def check_repository(repo_root: Path = REPO_ROOT) -> list[str]:
    try:
        version = canonical_version(repo_root)
        validate_semver(version)
    except (OSError, ValueError) as exc:
        return [str(exc)]

    return [
        *_check_text_rules(version, repo_root),
        *_check_feature_list_version_binding(repo_root),
        *_check_service_worker_versions(version, repo_root),
        *_check_node_versions(version, repo_root),
        *_check_python_versions(version, repo_root),
    ]


def _print_errors(errors: list[str]) -> None:
    for error in errors:
        print(error, file=sys.stderr)


def run_check(repo_root: Path = REPO_ROOT) -> int:
    errors = check_repository(repo_root)
    if errors:
        _print_errors(errors)
        return 1
    print(f"Version consistency check passed for {canonical_version(repo_root)}.")
    return 0


def run_build_check(repo_root: Path = REPO_ROOT) -> int:
    errors = check_built_service_workers(repo_root)
    if errors:
        _print_errors(errors)
        return 1
    print(
        f"Built service-worker metadata check passed for {canonical_version(repo_root)}."
    )
    return 0


def run_bump(version: str, repo_root: Path = REPO_ROOT) -> int:
    current_errors = check_repository(repo_root)
    if current_errors:
        print("Refusing to bump an inconsistent repository:", file=sys.stderr)
        _print_errors(current_errors)
        return 1
    try:
        changed = sync_release_surfaces(version, repo_root=repo_root)
    except (OSError, TypeError, ValueError, json.JSONDecodeError, tomllib.TOMLDecodeError) as exc:
        print(f"Version bump failed before writing files: {exc}", file=sys.stderr)
        return 1
    result = run_check(repo_root)
    if result == 0:
        print(f"Updated {len(changed)} tracked version surface(s).")
    return result


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate or synchronize all DaCa release-version surfaces from VERSION."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("check", help="Fail if a managed release surface differs from VERSION.")
    subparsers.add_parser(
        "check-build",
        help="Fail if generated Angular service-worker metadata differs from VERSION.",
    )
    bump_parser = subparsers.add_parser("bump", help="Set VERSION and every managed release surface.")
    bump_parser.add_argument("version", help="Semantic version in strict X.Y.Z form.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.command == "check":
        return run_check()
    if args.command == "check-build":
        return run_build_check()
    if args.command == "bump":
        return run_bump(args.version)
    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
