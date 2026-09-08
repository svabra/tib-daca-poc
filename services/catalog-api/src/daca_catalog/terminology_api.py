from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .modeling_api import ActorDep, SessionDep, _require_etag
from .modeling_core import canonical_hash
from .modeling_service import record_audit, utc_now
from .models import (
    DemoUser,
    Domain,
    TerminologyExternalReference,
    TerminologyTerm,
    TerminologyTermRelation,
    TerminologyTermResponsibility,
    TerminologyTermVersion,
    TerminologyTermVersionDomain,
    TerminologyTermVersionLabel,
)
from .schemas import ApiModel, reject_unsafe_service_level_text


class TerminologyLabelWrite(ApiModel):
    language: Literal["de", "fr", "it", "en", "rm"]
    preferred_label: str = Field(min_length=1, max_length=500)
    alternative_labels: list[str] = Field(default_factory=list)
    definition: str = Field(min_length=1, max_length=8000)
    translation_origin: Literal["manual", "machine", "edited", "termdat"] = "manual"
    source_text_hash: str | None = Field(default=None, min_length=64, max_length=64)

    @model_validator(mode="after")
    def skos_labels_are_disjoint(self) -> TerminologyLabelWrite:
        self.preferred_label = reject_unsafe_service_level_text(self.preferred_label)
        self.definition = reject_unsafe_service_level_text(self.definition)
        alternatives = [reject_unsafe_service_level_text(value) for value in self.alternative_labels]
        folded = [value.casefold() for value in alternatives]
        if len(folded) != len(set(folded)) or self.preferred_label.casefold() in set(folded):
            raise ValueError("Preferred and alternative SKOS labels must be unique and disjoint")
        self.alternative_labels = alternatives
        return self


class TerminologyRelationWrite(ApiModel):
    target_version_id: uuid.UUID
    relation: Literal["broader", "related", "exactMatch", "closeMatch"]


class TerminologyExternalReferenceWrite(ApiModel):
    source_type: Literal["termdat", "i14y", "other"]
    source_identifier: str | None = None
    source_uri: str = Field(min_length=1, max_length=1000)
    source_version: str | None = None
    source_modified_at: str | None = None
    payload_hash: str = Field(min_length=64, max_length=64)
    source_label: str | None = None
    text_snapshot: dict[str, Any] = Field(default_factory=dict)


class TerminologyTermWrite(ApiModel):
    concept_kind: Literal["term", "business_object"] = "term"
    labels: list[TerminologyLabelWrite] = Field(min_length=1)
    domain_ids: list[uuid.UUID] = Field(min_length=1)
    data_owner_user_id: str | None = None
    data_steward_user_id: str | None = None
    relations: list[TerminologyRelationWrite] = Field(default_factory=list)
    external_references: list[TerminologyExternalReferenceWrite] = Field(default_factory=list)

    @field_validator("labels")
    @classmethod
    def one_label_per_language(cls, value: list[TerminologyLabelWrite]) -> list[TerminologyLabelWrite]:
        languages = [row.language for row in value]
        if "de" not in languages or len(languages) != len(set(languages)):
            raise ValueError("Exactly one German label and at most one label per language are required")
        return value


def _version_payload(session: Session, term: TerminologyTerm, version: TerminologyTermVersion) -> dict[str, Any]:
    labels = list(session.scalars(select(TerminologyTermVersionLabel).where(TerminologyTermVersionLabel.term_version_id == version.id)))
    responsibilities = list(session.scalars(select(TerminologyTermResponsibility).where(TerminologyTermResponsibility.term_version_id == version.id)))
    relations = list(session.scalars(select(TerminologyTermRelation).where(TerminologyTermRelation.source_version_id == version.id)))
    references = list(session.scalars(select(TerminologyExternalReference).where(TerminologyExternalReference.term_version_id == version.id)))
    domains = list(session.scalars(select(TerminologyTermVersionDomain.domain_id).where(TerminologyTermVersionDomain.term_version_id == version.id)))
    creator = session.get(DemoUser, term.creator_user_id)
    return {
        "id": str(term.id), "urn": term.urn, "revision": version.revision,
        "versionId": str(version.id), "predecessorVersionId": str(version.predecessor_version_id) if version.predecessor_version_id else None,
        "lockVersion": version.lock_version, "status": version.status, "conceptKind": version.concept_kind,
        "lifecycle": term.lifecycle, "contentHash": version.content_hash,
        "creatorUserId": term.creator_user_id, "creatorDisplayName": creator.display_name if creator else term.creator_user_id,
        "labels": [{"language": row.language, "preferredLabel": row.preferred_label, "alternativeLabels": row.alternative_labels, "definition": row.definition, "translationOrigin": row.translation_origin, "sourceTextHash": row.source_text_hash} for row in labels],
        "domainIds": [str(value) for value in domains],
        "dataOwnerUserId": next((row.user_id for row in responsibilities if row.role == "data_owner"), None),
        "dataStewardUserId": next((row.user_id for row in responsibilities if row.role == "data_steward"), None),
        "relations": [{"targetVersionId": str(row.target_version_id), "relation": row.relation} for row in relations],
        "derivedRelations": [{"targetVersionId": str(row.source_version_id), "relation": "narrower"} for row in session.scalars(select(TerminologyTermRelation).where(TerminologyTermRelation.target_version_id == version.id, TerminologyTermRelation.relation == "broader"))],
        "externalReferences": [{"sourceType": row.source_type, "sourceIdentifier": row.source_identifier, "sourceUri": row.source_uri, "sourceVersion": row.source_version, "sourceModifiedAt": row.source_modified_at, "retrievedAt": row.retrieved_at, "payloadHash": row.payload_hash, "sourceLabel": row.source_label, "textSnapshot": row.text_snapshot} for row in references],
        "createdAt": version.created_at,
    }


def _validate_relations(session: Session, source_version_id: uuid.UUID, relations: list[TerminologyRelationWrite]) -> None:
    targets = {row.target_version_id for row in relations}
    if source_version_id in targets or len(targets) != len(relations):
        raise HTTPException(422, "Terminology relations must be unique and cannot reference themselves")
    for target in targets:
        if session.get(TerminologyTermVersion, target) is None:
            raise HTTPException(422, f"Unknown terminology target version {target}")
    broader_target = {row.target_version_id for row in relations if row.relation == "broader"}
    related_target = {row.target_version_id for row in relations if row.relation == "related"}
    if broader_target & related_target:
        raise HTTPException(422, "SKOS related cannot coexist with a hierarchical relation")
    graph: dict[uuid.UUID, set[uuid.UUID]] = {}
    for row in session.scalars(select(TerminologyTermRelation).where(TerminologyTermRelation.relation == "broader")):
        graph.setdefault(row.source_version_id, set()).add(row.target_version_id)
    graph[source_version_id] = broader_target
    stack = list(broader_target)
    seen: set[uuid.UUID] = set()
    while stack:
        current = stack.pop()
        if current == source_version_id:
            raise HTTPException(422, "SKOS broader relation would introduce a hierarchy cycle")
        if current not in seen:
            seen.add(current)
            stack.extend(graph.get(current, set()))


def _persist_version(session: Session, term: TerminologyTerm, version: TerminologyTermVersion, body: TerminologyTermWrite) -> None:
    for domain_id in body.domain_ids:
        domain = session.get(Domain, domain_id)
        if domain is None or domain.lifecycle != "active":
            raise HTTPException(422, "domainIds must identify active DaCa domains")
        session.add(TerminologyTermVersionDomain(term_version_id=version.id, domain_id=domain_id))
    for role, user_id in (("data_owner", body.data_owner_user_id), ("data_steward", body.data_steward_user_id)):
        if user_id:
            if session.get(DemoUser, user_id) is None:
                raise HTTPException(422, f"Unknown {role} identity")
            session.add(TerminologyTermResponsibility(term_version_id=version.id, role=role, user_id=user_id))
    for row in body.labels:
        session.add(TerminologyTermVersionLabel(
            term_version_id=version.id, language=row.language, preferred_label=row.preferred_label,
            alternative_labels=row.alternative_labels, definition=row.definition,
            translation_origin=row.translation_origin, source_text_hash=row.source_text_hash,
        ))
    _validate_relations(session, version.id, body.relations)
    for row in body.relations:
        session.add(TerminologyTermRelation(id=uuid.uuid4(), source_version_id=version.id, target_version_id=row.target_version_id, relation=row.relation))
    for row in body.external_references:
        from datetime import datetime
        session.add(TerminologyExternalReference(
            id=uuid.uuid4(), term_version_id=version.id, source_type=row.source_type,
            source_identifier=row.source_identifier, source_uri=row.source_uri, source_version=row.source_version,
            source_modified_at=datetime.fromisoformat(row.source_modified_at) if row.source_modified_at else None,
            retrieved_at=utc_now(), payload_hash=row.payload_hash, source_label=row.source_label,
            text_snapshot=row.text_snapshot,
        ))


def create_terminology_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1/terminology", tags=["terminology"])

    @router.get("/terms")
    def list_terms(
        session: SessionDep, q: str | None = None,
        concept_kind: Annotated[Literal["term", "business_object"] | None, Query(alias="conceptKind")] = None,
        domain_id: Annotated[uuid.UUID | None, Query(alias="domainId")] = None,
    ) -> dict[str, Any]:
        statement = select(TerminologyTerm, TerminologyTermVersion).join(TerminologyTermVersion, TerminologyTerm.latest_version_id == TerminologyTermVersion.id).where(TerminologyTerm.lifecycle == "active")
        if concept_kind:
            statement = statement.where(TerminologyTermVersion.concept_kind == concept_kind)
        if domain_id:
            statement = statement.join(TerminologyTermVersionDomain, TerminologyTermVersionDomain.term_version_id == TerminologyTermVersion.id).where(TerminologyTermVersionDomain.domain_id == domain_id)
        rows = session.execute(statement.order_by(TerminologyTerm.updated_at.desc())).all()
        items = [_version_payload(session, term, version) for term, version in rows]
        if q:
            needle = q.casefold()
            items = [item for item in items if needle in " ".join(f"{label['preferredLabel']} {label['definition']}" for label in item["labels"]).casefold()]
        return {"items": items, "total": len(items)}

    @router.post("/terms", status_code=201)
    def create_term(body: TerminologyTermWrite, response: Response, session: SessionDep, actor: ActorDep) -> dict[str, Any]:
        term_id, version_id = uuid.uuid4(), uuid.uuid4()
        digest = canonical_hash(body.model_dump(mode="json", by_alias=True))
        term = TerminologyTerm(
            id=term_id, urn=f"urn:daca:terminology:{term_id}", origin_catalog_id="urn:daca:catalog:bit-poc",
            revision=1, latest_version_id=None, content_hash=digest, lifecycle="active",
            creator_user_id=actor, created_at=utc_now(), updated_at=utc_now(),
        )
        version = TerminologyTermVersion(
            id=version_id, term_id=term.id, revision=1, lock_version=1, status="draft",
            concept_kind=body.concept_kind, content_hash=digest, created_by_user_id=actor, created_at=utc_now(),
        )
        session.add_all([term, version]); session.flush(); term.latest_version_id = version.id
        _persist_version(session, term, version, body)
        record_audit(session, "terminology-term", term.id, "created", actor, 1, {"creatorUserId": actor})
        session.commit(); response.headers["ETag"] = '"1"'
        return _version_payload(session, term, version)

    @router.get("/terms/{term_id}")
    def read_term(term_id: uuid.UUID, response: Response, session: SessionDep) -> dict[str, Any]:
        term = session.get(TerminologyTerm, term_id)
        if term is None or term.latest_version_id is None:
            raise HTTPException(404, "Terminology term not found")
        version = session.get(TerminologyTermVersion, term.latest_version_id)
        response.headers["ETag"] = f'"{version.lock_version}"'
        return _version_payload(session, term, version)

    @router.get("/terms/{term_id}/versions")
    def list_versions(term_id: uuid.UUID, session: SessionDep) -> dict[str, Any]:
        term = session.get(TerminologyTerm, term_id)
        if term is None:
            raise HTTPException(404, "Terminology term not found")
        versions = list(session.scalars(select(TerminologyTermVersion).where(TerminologyTermVersion.term_id == term.id).order_by(TerminologyTermVersion.revision.desc())))
        return {"items": [_version_payload(session, term, version) for version in versions], "total": len(versions)}

    @router.put("/terms/{term_id}/versions/{version_id}")
    def revise_term(
        term_id: uuid.UUID, version_id: uuid.UUID, body: TerminologyTermWrite,
        response: Response, session: SessionDep, actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        term = session.scalar(select(TerminologyTerm).where(TerminologyTerm.id == term_id).with_for_update())
        source = session.scalar(select(TerminologyTermVersion).where(TerminologyTermVersion.id == version_id, TerminologyTermVersion.term_id == term_id).with_for_update())
        if term is None or source is None:
            raise HTTPException(404, "Terminology term version not found")
        _require_etag(if_match, source.lock_version)
        if term.latest_version_id != source.id or source.status not in {"draft", "changes_requested"}:
            raise HTTPException(409, "Only the latest editable terminology version can be revised")
        term.revision += 1; term.updated_at = utc_now()
        digest = canonical_hash(body.model_dump(mode="json", by_alias=True))
        successor = TerminologyTermVersion(
            id=uuid.uuid4(), term_id=term.id, predecessor_version_id=source.id,
            revision=term.revision, lock_version=1, status="draft", concept_kind=body.concept_kind,
            content_hash=digest, created_by_user_id=actor, created_at=utc_now(),
        )
        session.add(successor); session.flush(); term.latest_version_id = successor.id; term.content_hash = digest
        _persist_version(session, term, successor, body)
        record_audit(session, "terminology-term", term.id, "version-created", actor, term.revision)
        session.commit(); response.headers["ETag"] = '"1"'
        return _version_payload(session, term, successor)

    return router
