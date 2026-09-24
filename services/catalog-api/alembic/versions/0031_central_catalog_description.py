"""Publish corrected central-catalog description for the original PoC seed.

Revision ID: 0031_central_catalog_description
Revises: 0030_site_glossary
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "0031_central_catalog_description"
down_revision: str | None = "0030_site_glossary"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Exact content hash of the original, unmodified PoC catalog seed.
_LEGACY_HASH = "1157ed4aa2abbb46b019daacc9d2515977d2fa18937ca1065eaf9edf1e7d80e8"
_NEW_DESCRIPTION = {
    "de": "Zentraler Datenkatalog der Data Platform BIT im DaCa PoC.",
    "en": "Central data catalog of the BIT data platform in the DaCa proof of concept.",
}


def upgrade() -> None:
    connection = op.get_bind()
    row = connection.execute(sa.text("""
        SELECT c.id, c.revision, v.title, v.description, v.publisher, v.languages,
               v.homepage, v.content_hash
        FROM dcat_catalogs AS c
        JOIN dcat_catalog_versions AS v ON v.catalog_id = c.id AND v.revision = c.revision
        WHERE c.urn = 'urn:daca:catalog:bit-poc'
        FOR UPDATE OF c
    """)).mappings().first()
    if row is None or row["revision"] != 1 or row["content_hash"] != _LEGACY_HASH:
        return

    payload = {
        "title": row["title"], "description": _NEW_DESCRIPTION,
        "publisher": row["publisher"], "languages": row["languages"],
    }
    digest = hashlib.sha256(json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str,
    ).encode("utf-8")).hexdigest()
    now = datetime.now(UTC)
    version_id = uuid.uuid5(uuid.NAMESPACE_URL, "urn:daca:modeling:dcat-catalog-version:bit-poc:2")
    connection.execute(sa.text("""
        UPDATE dcat_catalog_versions SET status = 'superseded'
        WHERE catalog_id = :catalog_id AND revision = 1
    """), {"catalog_id": row["id"]})
    connection.execute(sa.text("""
        INSERT INTO dcat_catalog_versions
          (id, catalog_id, revision, status, title, description, publisher, homepage,
           languages, content_hash, created_at, published_at)
        SELECT :version_id, id, 2, 'published', CAST(:title AS JSON),
               CAST(:description AS JSON), CAST(:publisher AS JSON), :homepage,
               CAST(:languages AS JSON), :digest, :now, :now
        FROM dcat_catalogs WHERE id = :catalog_id
    """), {
        "version_id": version_id, "catalog_id": row["id"],
        "title": json.dumps(row["title"], ensure_ascii=False),
        "description": json.dumps(_NEW_DESCRIPTION, ensure_ascii=False),
        "publisher": json.dumps(row["publisher"], ensure_ascii=False),
        "homepage": row["homepage"],
        "languages": json.dumps(row["languages"], ensure_ascii=False),
        "digest": digest, "now": now,
    })
    connection.execute(sa.text("""
        UPDATE dcat_catalogs
        SET revision = 2, content_hash = :digest, updated_at = :now
        WHERE id = :catalog_id
    """), {"catalog_id": row["id"], "digest": digest, "now": now})


def downgrade() -> None:
    # Retain the corrected metadata version: catalog versions are historical evidence.
    pass
