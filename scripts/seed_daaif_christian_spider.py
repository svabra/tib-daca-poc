"""Idempotently add the DaCa modelling persona Christian Spider to a DAAIF checkout.

DAAIF is intentionally not modelled as part of DaCa.  This helper updates the four
allow-lists used by the neighbouring PoC and refuses to write when their expected
structure is not present.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

USER_ID = "christian.spider"


@dataclass(frozen=True, slots=True)
class TextPatch:
    relative_path: str
    marker: str
    insertion: str

    def apply(self, text: str) -> tuple[str, bool]:
        if USER_ID in text:
            return text, False
        if text.count(self.marker) != 1:
            raise ValueError(
                f"Expected exactly one marker in {self.relative_path!r}: {self.marker!r}"
            )
        return text.replace(self.marker, self.marker + self.insertion, 1), True


PATCHES = (
    TextPatch(
        "bdw/bit_data_workbench/static/js/demo-identity.js",
        "export const DAAIF_DEMO_USERS = Object.freeze([\n",
        """  Object.freeze({
    id: "christian.spider",
    displayName: "Christian Spider",
    organization: "VBS / Verteidigung",
    email: "christian.spider@vtg.admin.ch",
    role: "Data Owner",
    avatarUrl: "",
  }),
""",
    ),
    TextPatch(
        "bdw/bit_data_workbench/backend/source_sourcing.py",
        "DEMO_USER_IDS = frozenset(\n    {\n",
        '        "christian.spider",\n',
    ),
    TextPatch(
        "bdw/bit_data_workbench/backend/data_products/publication.py",
        "DEMO_USER_ALIASES = {\n",
        """    "christian spider": "christian.spider",
    "christian.spider": "christian.spider",
    "christian.spider@vtg.admin.ch": "christian.spider",
""",
    ),
    TextPatch(
        "bdw/bit_data_workbench/static/js/data-products-controller.js",
        "  const demoUsers = {\n",
        """    "christian.spider": {
      displayName: "Christian Spider",
      email: "christian.spider@vtg.admin.ch",
    },
""",
    ),
)


def planned_changes(repo: Path) -> list[tuple[Path, str, bool]]:
    if not repo.is_dir():
        raise ValueError(f"DAAIF repository does not exist: {repo}")
    changes: list[tuple[Path, str, bool]] = []
    for patch in PATCHES:
        path = repo / Path(patch.relative_path)
        if not path.is_file():
            raise ValueError(f"Expected DAAIF file is missing: {path}")
        original = path.read_text(encoding="utf-8")
        updated, changed = patch.apply(original)
        changes.append((path, updated, changed))
    return changes


def run(repo: Path, *, apply: bool) -> int:
    changes = planned_changes(repo.resolve())
    pending = [path for path, _text, changed in changes if changed]
    if not pending:
        print("Christian Spider is already configured in all DAAIF allow-lists.")
        return 0
    if not apply:
        for path in pending:
            print(f"needs update: {path}")
        return 1

    for path, updated, changed in changes:
        if not changed:
            continue
        backup = path.with_suffix(path.suffix + ".daca-seed.bak")
        if not backup.exists():
            shutil.copy2(path, backup)
        path.write_text(updated, encoding="utf-8", newline="\n")
        print(f"updated: {path} (backup: {backup.name})")
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True, help="Path to the DAAIF checkout")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Report whether updates are required")
    mode.add_argument("--apply", action="store_true", help="Apply updates and create backups")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        return run(args.repo, apply=args.apply)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
