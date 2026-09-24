"""Reconcile logical fields with their physical counterparts and owner tasks."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    AssetMapping, AssetMappingLogicalField, AssetMappingVersion, DcatDatasetVersion,
    LogicalEntityVersion, LogicalFieldVersion, LogicalMappingInconsistency,
    LogicalModel, LogicalModelVersion, WorkflowTask,
)
from .modeling_service import (
    create_mapping_successor, mapping_payload, mapping_write_from_payload, utc_now,
)


def rebase_mapping_versions(session: Session, model: LogicalModel,
                            successor: LogicalModelVersion, actor: str) -> None:
    """Preserve surviving field connections across immutable model revisions."""
    current_fields = dict(session.execute(
        select(LogicalFieldVersion.logical_field_id, LogicalFieldVersion.id)
        .join(LogicalEntityVersion, LogicalEntityVersion.id == LogicalFieldVersion.logical_entity_version_id)
        .where(LogicalEntityVersion.logical_model_version_id == successor.id)
    ).all())
    for mapping in session.scalars(select(AssetMapping).where(
        AssetMapping.logical_model_id == model.id, AssetMapping.lifecycle == "active",
    )):
        version = session.scalar(select(AssetMappingVersion).where(
            AssetMappingVersion.asset_mapping_id == mapping.id,
            AssetMappingVersion.revision == mapping.revision,
        ))
        if version is None or version.status == "superseded":
            continue
        old_ids = list(session.scalars(select(AssetMappingLogicalField.logical_field_version_id).where(
            AssetMappingLogicalField.asset_mapping_version_id == version.id,
        ).order_by(AssetMappingLogicalField.position)))
        root_by_version = dict(session.execute(select(LogicalFieldVersion.id, LogicalFieldVersion.logical_field_id).where(
            LogicalFieldVersion.id.in_(old_ids)
        )).all())
        old_roots = [root_by_version[field_id] for field_id in old_ids if field_id in root_by_version]
        body = mapping_write_from_payload(mapping_payload(session, mapping, version))
        if len(old_roots) != len(old_ids) or any(root not in current_fields for root in old_roots):
            create_mapping_successor(session, mapping, version, body, actor,
                                     status="superseded", action="field-removed")
            continue
        body.logical_model_version_id = successor.id
        body.logical_field_version_ids = [current_fields[root] for root in old_roots]
        create_mapping_successor(session, mapping, version, body, actor,
                                 status="draft", action="model-version-rebased")


def _complete_tasks(session: Session, issue_id: uuid.UUID) -> None:
    for task in session.scalars(select(WorkflowTask).where(
        WorkflowTask.logical_mapping_issue_id == issue_id,
        WorkflowTask.status != "completed",
    )):
        task.status = "completed"
        task.completed_at = utc_now()
        task.updated_at = task.completed_at


def sync_mapping_inconsistencies(session: Session, model_id: uuid.UUID) -> None:
    """Keep decisions stable; only physical coverage or field removal resolves an issue.

    A model without any historical physical mapping is a valid abstract model.
    Once mapped, even retiring its last connection leaves the consistency check active.
    """
    model = session.get(LogicalModel, model_id)
    if model is None:
        return
    latest = session.scalar(select(LogicalModelVersion).where(
        LogicalModelVersion.logical_model_id == model_id,
        LogicalModelVersion.revision == model.revision,
    ))
    if latest is None:
        return
    dataset = session.get(DcatDatasetVersion, latest.dataset_version_id)
    if dataset is None:
        return
    fields = list(session.execute(
        select(LogicalFieldVersion.logical_field_id, LogicalFieldVersion.name)
        .join(LogicalEntityVersion, LogicalEntityVersion.id == LogicalFieldVersion.logical_entity_version_id)
        .where(LogicalEntityVersion.logical_model_version_id == latest.id)
    ))
    existing = {item.logical_field_id: item for item in session.scalars(
        select(LogicalMappingInconsistency).where(LogicalMappingInconsistency.logical_model_id == model_id)
    )}
    has_physical_history = session.scalar(select(AssetMapping.id).where(
        AssetMapping.logical_model_id == model_id).limit(1)) is not None
    mapped = set(session.scalars(
        select(LogicalFieldVersion.logical_field_id)
        .join(AssetMappingLogicalField, AssetMappingLogicalField.logical_field_version_id == LogicalFieldVersion.id)
        .join(AssetMappingVersion, AssetMappingVersion.id == AssetMappingLogicalField.asset_mapping_version_id)
        .join(AssetMapping, AssetMapping.id == AssetMappingVersion.asset_mapping_id)
        .where(AssetMapping.logical_model_id == model_id,
               AssetMapping.lifecycle == "active",
               AssetMappingVersion.revision == AssetMapping.revision,
               AssetMappingVersion.status != "superseded")
    ))
    uncovered = {field_id for field_id, _ in fields if has_physical_history and field_id not in mapped}
    names = dict(fields)
    for field_id, issue in existing.items():
        if field_id not in uncovered:
            if issue.status != "resolved":
                issue.status = "resolved"
                issue.resolved_at = utc_now()
                issue.updated_at = issue.resolved_at
                _complete_tasks(session, issue.id)
        elif issue.status == "resolved":
            issue.status = "open"
            issue.resolved_at = None
            issue.decision_comment = None
            issue.assigned_steward_user_id = None
            issue.owner_user_id = dataset.data_owner_user_id
            issue.updated_at = utc_now()
            _owner_task(session, issue, names[field_id])
        elif issue.owner_user_id != dataset.data_owner_user_id:
            if issue.status == "open":
                _complete_tasks(session, issue.id)
            issue.owner_user_id = dataset.data_owner_user_id
            issue.updated_at = utc_now()
            if issue.status == "open":
                _owner_task(session, issue, names[field_id])
    for field_id in uncovered - existing.keys():
        issue = LogicalMappingInconsistency(
            id=uuid.uuid4(), logical_model_id=model_id, logical_field_id=field_id,
            owner_user_id=dataset.data_owner_user_id, status="open",
            created_at=utc_now(), updated_at=utc_now(),
        )
        session.add(issue)
        _owner_task(session, issue, names[field_id])


def _owner_task(session: Session, issue: LogicalMappingInconsistency, name: str) -> None:
    session.add(WorkflowTask(
        id=uuid.uuid4(), task_type="logical_mapping_inconsistency", task_kind="action", status="open",
        assignee_user_id=issue.owner_user_id, logical_model_id=issue.logical_model_id,
        logical_mapping_issue_id=issue.id,
        title=f"Inkonsistenzfehler: {name}",
        detail="Ein logisches Feld hat in der verknüpften physischen Repräsentation keinen Counterpart. Bitte akzeptieren oder einem Data Steward zur Prüfung zuweisen.",
        created_at=utc_now(), updated_at=utc_now(),
    ))


def issue_payload(issue: LogicalMappingInconsistency, field_name: str) -> dict[str, object]:
    return {
        "id": issue.id, "logicalModelId": issue.logical_model_id,
        "logicalFieldId": issue.logical_field_id, "fieldName": field_name,
        "ownerUserId": issue.owner_user_id,
        "assignedStewardUserId": issue.assigned_steward_user_id,
        "status": issue.status, "decisionComment": issue.decision_comment,
        "createdAt": issue.created_at, "updatedAt": issue.updated_at,
        "resolvedAt": issue.resolved_at,
    }
