from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG_SRC = ROOT / "services" / "catalog-api" / "src"
OUTPUT = ROOT / "docs" / "openapi" / "daca-metadata-publication.openapi.yaml"
UI_OUTPUT = ROOT / "apps" / "catalog-ui" / "public" / "openapi" / "daca-metadata-publication.openapi.yaml"
if str(CATALOG_SRC) not in sys.path:
    sys.path.insert(0, str(CATALOG_SRC))

from didaca_catalog.main import app  # noqa: E402

FOCUSED_PATHS = (
    "/api/v1/metadata-publications",
    "/health/live",
    "/health/ready",
)
REF_PATTERN = re.compile(r"^#/components/schemas/(?P<name>[^/]+)$")


def referenced_schemas(value: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        ref = value.get("$ref")
        if isinstance(ref, str) and (match := REF_PATTERN.match(ref)):
            found.add(match.group("name"))
        for item in value.values():
            found.update(referenced_schemas(item))
    elif isinstance(value, list):
        for item in value:
            found.update(referenced_schemas(item))
    return found


def focused_spec() -> dict[str, Any]:
    source = app.openapi()
    paths = {path: source["paths"][path] for path in FOCUSED_PATHS}
    all_schemas = source.get("components", {}).get("schemas", {})
    needed = referenced_schemas(paths)
    pending = list(needed)
    while pending:
        name = pending.pop()
        for dependency in referenced_schemas(all_schemas[name]):
            if dependency not in needed:
                needed.add(dependency)
                pending.append(dependency)
    return {
        "openapi": source["openapi"],
        "info": {
            "title": "DaCa Metadata Publication API",
            "version": source["info"]["version"],
            "description": (
                "Focused integration contract for publishing REST metadata from DAAIF into DaCa. "
                "Set DIDACA_OPEN_METADATA_PUBLICATION=true on the Catalog API. The endpoint accepts "
                "metadata only, never credentials or product records, and does not grant access."
            ),
        },
        "servers": [{"url": "http://localhost:8080", "description": "Local DaCa PoC via Compose"}],
        "paths": paths,
        "components": {"schemas": {name: all_schemas[name] for name in sorted(needed)}},
    }


def yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(str(value), ensure_ascii=False)


def render_yaml(value: Any, indent: int = 0) -> list[str]:
    prefix = " " * indent
    if isinstance(value, dict):
        if not value:
            return [prefix + "{}"]
        lines: list[str] = []
        for key, item in value.items():
            rendered_key = str(key) if re.fullmatch(r"[A-Za-z0-9_.$/-]+", str(key)) else yaml_scalar(key)
            if isinstance(item, (dict, list)) and item:
                lines.append(f"{prefix}{rendered_key}:")
                lines.extend(render_yaml(item, indent + 2))
            elif isinstance(item, (dict, list)):
                lines.append(f"{prefix}{rendered_key}: {'{}' if isinstance(item, dict) else '[]'}")
            else:
                lines.append(f"{prefix}{rendered_key}: {yaml_scalar(item)}")
        return lines
    if isinstance(value, list):
        if not value:
            return [prefix + "[]"]
        lines = []
        for item in value:
            if isinstance(item, dict) and item:
                first_key, first_value = next(iter(item.items()))
                rendered_key = str(first_key) if re.fullmatch(r"[A-Za-z0-9_.$/-]+", str(first_key)) else yaml_scalar(first_key)
                if isinstance(first_value, (dict, list)) and first_value:
                    lines.append(f"{prefix}- {rendered_key}:")
                    lines.extend(render_yaml(first_value, indent + 4))
                else:
                    lines.append(f"{prefix}- {rendered_key}: {yaml_scalar(first_value)}")
                for key, child in list(item.items())[1:]:
                    rendered_child_key = str(key) if re.fullmatch(r"[A-Za-z0-9_.$/-]+", str(key)) else yaml_scalar(key)
                    if isinstance(child, (dict, list)) and child:
                        lines.append(f"{' ' * (indent + 2)}{rendered_child_key}:")
                        lines.extend(render_yaml(child, indent + 4))
                    elif isinstance(child, (dict, list)):
                        lines.append(f"{' ' * (indent + 2)}{rendered_child_key}: {'{}' if isinstance(child, dict) else '[]'}")
                    else:
                        lines.append(f"{' ' * (indent + 2)}{rendered_child_key}: {yaml_scalar(child)}")
            elif isinstance(item, list):
                lines.append(prefix + "-")
                lines.extend(render_yaml(item, indent + 2))
            else:
                lines.append(f"{prefix}- {yaml_scalar(item)}")
        return lines
    return [prefix + yaml_scalar(value)]


def expected_content() -> str:
    header = "# Generated by scripts/render_metadata_publication_openapi.py. Do not edit manually.\n"
    return header + "\n".join(render_yaml(focused_spec())) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = expected_content()
    if args.check:
        if (
            not OUTPUT.exists()
            or OUTPUT.read_text(encoding="utf-8") != expected
            or not UI_OUTPUT.exists()
            or UI_OUTPUT.read_text(encoding="utf-8") != expected
        ):
            print("OpenAPI documentation drift detected. Run npm run docs:openapi.", file=sys.stderr)
            return 1
        print(f"OpenAPI documentation is current: {OUTPUT.relative_to(ROOT)}")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(expected, encoding="utf-8", newline="\n")
    UI_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    UI_OUTPUT.write_text(expected, encoding="utf-8", newline="\n")
    print(f"Updated {OUTPUT.relative_to(ROOT)} and {UI_OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
