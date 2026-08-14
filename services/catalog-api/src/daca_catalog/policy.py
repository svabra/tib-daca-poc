from __future__ import annotations

import io
import json
import tarfile
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx

from .models import DataProduct, PolicyRevision
from .settings import Settings

GENERATED_REGO = """package daca.authz

import rego.v1

default decision := {"allow": false, "reason": "default_deny"}

request_timestamp_ns := time.parse_rfc3339_ns(timestamp) if {
    timestamp := object.get(object.get(input, "context", {}), "requestTimestamp", "")
}

valid_grant_time(grant) if {
    not grant.weeklyAvailability
    parts := time.date(request_timestamp_ns)
    request_date := sprintf("%04d-%02d-%02d", parts)
    request_date >= grant.validFrom
    request_date <= grant.validUntil
}

valid_grant_time(grant) if {
    schedule := grant.weeklyAvailability
    parts := time.date([request_timestamp_ns, schedule.timeZone])
    request_date := sprintf("%04d-%02d-%02d", parts)
    request_date >= grant.validFrom
    request_date <= grant.validUntil
    weekday := lower(time.weekday([request_timestamp_ns, schedule.timeZone]))
    weekday in schedule.weekdays
    clock := time.clock([request_timestamp_ns, schedule.timeZone])
    now_seconds := (clock[0] * 3600) + (clock[1] * 60) + clock[2]
    start_parts := split(schedule.startTime, ":")
    start_seconds := (to_number(start_parts[0]) * 3600) + (to_number(start_parts[1]) * 60)
    end_parts := split(schedule.endTime, ":")
    end_seconds := (to_number(end_parts[0]) * 3600) + (to_number(end_parts[1]) * 60)
    now_seconds >= start_seconds
    now_seconds < end_seconds
}

matches_grant(policy, grant) if {
    resource := data.daca.resourcesById[input.resource.id]
    policy.productId == input.resource.id
    grant.subject.id == input.subject.id
    grant.subject.type == object.get(input.subject, "type", "person")
    input.action in grant.actions
    resource.urn in policy.resources.productUrns
    resource.owner in policy.resources.owners
    request_protocol in grant.protocols
    valid_grant_time(grant)
}

matches_group_grant(policy, grant) if {
    resource := data.daca.resourcesById[input.resource.id]
    policy.productId == input.resource.id
    grant.subject.type == "group"
    input.subject.type == "person"
    input.subject.id in grant.groupSnapshot.memberIds
    input.action in grant.actions
    resource.urn in policy.resources.productUrns
    resource.owner in policy.resources.owners
    request_protocol in grant.protocols
    valid_grant_time(grant)
}

matches_legacy(policy) if {
    request_timestamp_ns
    count(object.get(policy, "grants", [])) == 0
    resource := data.daca.resourcesById[input.resource.id]
    policy.productId == input.resource.id
    input.subject.id in policy.subjects.userIds
    input.action in policy.actions
    resource.urn in policy.resources.productUrns
    resource.owner in policy.resources.owners
    request_protocol in policy.protocols
}

request_protocol := "http" if {
    input.endpoint.protocol == "http-rest"
}

request_protocol := "postgresql" if {
    input.endpoint.protocol == "postgresql"
}

explicitly_denied if {
    some policy in data.daca.policies
    policy.effect == "deny"
    some grant in policy.grants
    matches_grant(policy, grant)
}

explicitly_denied if {
    some policy in data.daca.policies
    policy.effect == "deny"
    some grant in policy.grants
    matches_group_grant(policy, grant)
}

explicitly_denied if {
    some policy in data.daca.policies
    policy.effect == "deny"
    matches_legacy(policy)
}

permitted if {
    some policy in data.daca.policies
    policy.effect == "allow"
    some grant in policy.grants
    matches_grant(policy, grant)
}

permitted if {
    some policy in data.daca.policies
    policy.effect == "allow"
    some grant in policy.grants
    matches_group_grant(policy, grant)
}

permitted if {
    some policy in data.daca.policies
    policy.effect == "allow"
    matches_legacy(policy)
}

decision := {"allow": false, "reason": "explicit_deny"} if {
    explicitly_denied
}

decision := {"allow": true, "reason": "policy_allow"} if {
    permitted
    not explicitly_denied
}
"""


def generate_rego() -> str:
    """Return the reviewed compiler output; users never supply arbitrary Rego."""
    return GENERATED_REGO


def definition_as_camel(definition: dict[str, Any]) -> dict[str, Any]:
    """Normalize definitions persisted by older/local callers to the public wire shape."""
    subjects = definition.get("subjects", {})
    resources = definition.get("resources", {})
    user_ids = subjects.get("userIds", subjects.get("user_ids", []))
    machine_ids = subjects.get("machineIds", subjects.get("machine_ids", []))
    group_ids = subjects.get("groupIds", subjects.get("group_ids", []))
    actions = definition.get("actions", ["data.read"])
    protocols = definition.get("protocols", ["http"])
    raw_grants = definition.get("grants", [])
    grants = []
    for grant in raw_grants:
        subject = grant.get("subject", {})
        normalized_grant = {
                "subject": {"type": subject.get("type", "person"), "id": subject.get("id", "")},
                "actions": grant.get("actions", ["data.read"]),
                "protocols": grant.get("protocols", ["http"]),
                "validFrom": grant.get("validFrom", grant.get("valid_from", "0001-01-01")),
                "validUntil": grant.get("validUntil", grant.get("valid_until", "9999-12-31")),
                "dataVariant": grant.get("dataVariant", grant.get("data_variant", "original")),
                "metadataChannels": grant.get(
                    "metadataChannels",
                    grant.get("metadata_channels", {"kobyMcp": False, "i14y": False}),
                ),
            }
        group_snapshot = grant.get("groupSnapshot", grant.get("group_snapshot"))
        if group_snapshot is not None:
            normalized_grant["groupSnapshot"] = group_snapshot
        weekly_availability = grant.get(
            "weeklyAvailability", grant.get("weekly_availability")
        )
        if weekly_availability is not None:
            normalized_grant["weeklyAvailability"] = weekly_availability
        grants.append(normalized_grant)
    if not grants:
        for subject_type, identifiers in (("person", user_ids), ("machine", machine_ids)):
            grants.extend(
                {
                    "subject": {"type": subject_type, "id": identifier},
                    "actions": actions,
                    "protocols": protocols,
                    "validFrom": "0001-01-01",
                    "validUntil": "9999-12-31",
                    "dataVariant": "original",
                }
                for identifier in identifiers
            )
    return {
        "defaultEffect": definition.get("defaultEffect", definition.get("default_effect", "deny")),
        "effect": definition["effect"],
        "subjects": {"userIds": user_ids, "machineIds": machine_ids, "groupIds": group_ids},
        "resources": {
            "productUrns": resources.get("productUrns", resources.get("product_urns", [])),
            "owners": resources.get("owners", []),
        },
        "actions": actions,
        "protocols": protocols,
        "grants": grants,
    }


@dataclass(frozen=True)
class ActivePolicy:
    policy: PolicyRevision
    product: DataProduct


def bundle_data(active_policies: Iterable[ActivePolicy]) -> dict[str, Any]:
    policies: list[dict[str, Any]] = []
    resources: dict[str, dict[str, Any]] = {}
    resources_by_id: dict[str, dict[str, Any]] = {}
    for active in active_policies:
        definition = definition_as_camel(active.policy.definition)
        policies.append({**definition, "revision": active.policy.revision, "productId": str(active.product.id)})
        resources[active.product.urn] = {
            "id": str(active.product.id),
            "urn": active.product.urn,
            "owner": active.product.owner,
            "classification": active.product.classification,
            "originCatalog": active.product.origin_catalog,
        }
        resources_by_id[str(active.product.id)] = resources[active.product.urn]
    return {"daca": {"policies": policies, "resources": resources, "resourcesById": resources_by_id}}


def build_opa_bundle(active_policies: list[ActivePolicy], revision: int | str) -> bytes:
    """Create a deterministic gzip-compressed OPA bundle."""
    files = {
        ".manifest": json.dumps(
            {"revision": str(revision), "roots": ["daca"]},
            sort_keys=True,
            separators=(",", ":"),
        ).encode(),
        "data.json": json.dumps(bundle_data(active_policies), sort_keys=True, separators=(",", ":")).encode(),
        "daca/authz/policy.rego": GENERATED_REGO.encode(),
    }
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz", compresslevel=9) as archive:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            info.mtime = 0
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(content))
    return output.getvalue()


@dataclass(frozen=True)
class ProjectionResult:
    state: str
    observed_revision: int | None = None
    error: str | None = None


def project_to_postgresql(
    settings: Settings,
    product_id: uuid.UUID,
    revision: int,
    definition: dict[str, Any] | None,
) -> ProjectionResult:
    """Push the supported PBAC subset to the sample product's RLS entitlement projection."""
    if not settings.sample_policy_projection_url:
        return ProjectionResult("pending", error="policy projection URL is not configured")

    entitlements: list[dict[str, Any]] = []
    if definition is not None:
        explicit_grants = bool(definition.get("grants"))
        normalized = definition_as_camel(definition)
        if normalized["effect"] == "allow":
            if explicit_grants:
                for grant in normalized["grants"]:
                    subjects = (
                        [
                            ("person", member_id)
                            for member_id in grant.get("groupSnapshot", {}).get(
                                "memberIds", []
                            )
                        ]
                        if grant["subject"]["type"] == "group"
                        else [(grant["subject"]["type"], grant["subject"]["id"])]
                    )
                    for subject_type, subject_id in subjects:
                        for action in grant["actions"]:
                            for protocol in grant["protocols"]:
                                entitlements.append(
                                    {
                                        "subjectId": subject_id,
                                        "subjectType": subject_type,
                                        "action": action,
                                        "protocol": (
                                            "http-rest"
                                            if protocol == "http"
                                            else "postgresql"
                                        ),
                                        "validFrom": grant["validFrom"],
                                        "validUntil": grant["validUntil"],
                                        "dataVariant": grant["dataVariant"],
                                        **(
                                            {"weeklyAvailability": grant["weeklyAvailability"]}
                                            if grant.get("weeklyAvailability")
                                            else {}
                                        ),
                                    }
                                )
            else:
                entitlements = [
                    {
                        "subjectId": grant["subject"]["id"],
                        "action": action,
                        "protocol": "http-rest" if protocol == "http" else "postgresql",
                    }
                    for grant in normalized["grants"]
                    for action in grant["actions"]
                    for protocol in grant["protocols"]
                ]

    base_url = settings.sample_policy_projection_url.rstrip("/")
    url = base_url.format(product_id=product_id) if "{product_id}" in base_url else f"{base_url}/{product_id}"
    headers = {}
    if settings.sample_policy_projection_token:
        headers["Authorization"] = f"Bearer {settings.sample_policy_projection_token}"
    try:
        response = httpx.put(
            url,
            json={"revision": revision, "entitlements": entitlements},
            headers=headers,
            timeout=settings.projection_timeout_seconds,
        )
        response.raise_for_status()
        acknowledgement = response.json()
        if (
            not isinstance(acknowledgement, dict)
            or acknowledgement.get("productId") != str(product_id)
            or acknowledgement.get("revision") != revision
            or acknowledgement.get("status") not in {"deployed", "already-current"}
        ):
            raise ValueError("policy projection returned a mismatched acknowledgement")
    except (httpx.HTTPError, TypeError, ValueError) as exc:
        return ProjectionResult("failed", error=str(exc)[:1000])
    return ProjectionResult("deployed", observed_revision=revision)
