from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import build_engine, build_session_factory
from .models import (
    AdministrativeOrganization,
    AdministrativeOrganizationLabel,
    FederalOrganizationImportRun,
)
from .settings import get_settings

EXPECTED_ROOT_CHILDREN = {"BK", "EDA", "EDI", "EJPD", "VBS", "EFD", "WBF", "UVEK"}
DEFAULT_SNAPSHOT = Path(__file__).with_name("fixtures") / "federal_organizations.json"


def load_and_validate_snapshot(path: Path) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    payload = json.loads(raw)
    nodes = payload.get("nodes")
    root_id = payload.get("rootId")
    if not isinstance(nodes, list) or not nodes or not isinstance(root_id, str):
        raise ValueError("The federal organization snapshot needs nodes and one rootId")
    by_id = {str(node.get("id")): node for node in nodes}
    if len(by_id) != len(nodes) or root_id not in by_id:
        raise ValueError("Organization IDs must be unique and include the declared root")
    root_children = {
        str(node.get("departmentCode")) for node in nodes if node.get("parentId") == root_id
    }
    if root_children != EXPECTED_ROOT_CHILDREN:
        raise ValueError("Root must contain exactly BK and the seven federal departments")
    for node_id, node in by_id.items():
        parent_id = node.get("parentId")
        if node_id != root_id and parent_id not in by_id:
            raise ValueError(f"Organization {node_id} is orphaned")
        seen = {node_id}
        cursor = parent_id
        while cursor is not None:
            if cursor in seen:
                raise ValueError(f"Organization hierarchy contains a cycle at {node_id}")
            seen.add(cursor)
            cursor = by_id[cursor].get("parentId")
    chain = {"vbs-armasuisse": "vbs", "vbs-armasuisse-immobilien": "vbs-armasuisse"}
    if any(by_id.get(child, {}).get("parentId") != parent for child, parent in chain.items()):
        raise ValueError("The official VBS → armasuisse → armasuisse Immobilien chain is missing")
    return payload, hashlib.sha256(raw).hexdigest()


def apply_snapshot(session: Session, payload: dict[str, Any], digest: str) -> FederalOrganizationImportRun:
    retrieved_at = datetime.fromisoformat(str(payload["retrievedAt"]))
    run = FederalOrganizationImportRun(
        id=uuid.uuid4(), source_url=str(payload["sourceUrl"]), source_retrieved_at=retrieved_at,
        snapshot_hash=digest, node_count=len(payload["nodes"]), status="running", created_at=datetime.now(UTC),
    )
    session.add(run)
    # The rows reference this import run by ID. Flush it first because the
    # aggregate is deliberately relationship-free and SQLAlchemy cannot infer
    # insert ordering from an assigned scalar UUID alone.
    session.flush()
    snapshot_ids = {str(node["id"]) for node in payload["nodes"]}
    for row in session.scalars(select(AdministrativeOrganization).where(AdministrativeOrganization.source_id.is_not(None))):
        if row.id not in snapshot_ids:
            row.active = False
            row.retired_at = datetime.now(UTC)
    # Parents must exist before their children. The validated fixture is ordered that way.
    for node in payload["nodes"]:
        node_id = str(node["id"])
        labels = node["labels"]
        node_hash = hashlib.sha256(json.dumps(node, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        row = session.get(AdministrativeOrganization, node_id)
        if row is None:
            row = AdministrativeOrganization(
                id=node_id, department_code=node["departmentCode"], office_code=node.get("officeCode"),
                display_name=labels["de"], organization_type=node["type"], department_order=node["order"],
                office_order=node["order"], created_at=retrieved_at,
            )
            session.add(row)
        row.parent_id = node.get("parentId")
        row.source_id = str(node["sourceId"])
        row.source_uri = node["sourceUri"]
        row.display_name = labels["de"]
        row.organization_type = node["type"]
        row.department_code = node["departmentCode"]
        row.office_code = node.get("officeCode")
        row.active = True
        row.valid_from = date(2026, 1, 1)
        row.valid_to = None
        row.retired_at = None
        row.content_hash = node_hash
        row.import_run_id = run.id
        session.flush()
        for language, label in labels.items():
            localized = session.get(AdministrativeOrganizationLabel, (node_id, language))
            if localized is None:
                localized = AdministrativeOrganizationLabel(organization_id=node_id, language=language, label=label)
                session.add(localized)
            else:
                localized.label = label
    run.status = "succeeded"
    session.flush()
    return run


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate or apply the checked federal organization snapshot")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    args = parser.parse_args()
    payload, digest = load_and_validate_snapshot(args.snapshot)
    if args.check:
        print(f"valid federal organization snapshot: {len(payload['nodes'])} nodes, sha256={digest}")
        return
    engine = build_engine(get_settings().resolved_database_url)
    with build_session_factory(engine)() as session:
        run = apply_snapshot(session, payload, digest)
        session.commit()
    print(f"applied federal organization snapshot: run={run.id}, sha256={digest}")


if __name__ == "__main__":
    main()
