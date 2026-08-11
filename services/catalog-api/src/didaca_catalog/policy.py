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

GENERATED_REGO = """package didaca.authz

import rego.v1

default decision := {"allow": false, "reason": "default_deny"}

matches(policy) if {
    resource := data.didaca.resourcesById[input.resource.id]
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
    some policy in data.didaca.policies
    policy.effect == "deny"
    matches(policy)
}

permitted if {
    some policy in data.didaca.policies
    policy.effect == "allow"
    matches(policy)
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
    return {
        "effect": definition["effect"],
        "subjects": {"userIds": subjects.get("userIds", subjects.get("user_ids", []))},
        "resources": {
            "productUrns": resources.get("productUrns", resources.get("product_urns", [])),
            "owners": resources.get("owners", []),
        },
        "actions": definition["actions"],
        "protocols": definition["protocols"],
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
    return {"didaca": {"policies": policies, "resources": resources, "resourcesById": resources_by_id}}


def build_opa_bundle(active_policies: list[ActivePolicy], revision: int | str) -> bytes:
    """Create a deterministic gzip-compressed OPA bundle."""
    files = {
        ".manifest": json.dumps(
            {"revision": str(revision), "roots": ["didaca"]},
            sort_keys=True,
            separators=(",", ":"),
        ).encode(),
        "data.json": json.dumps(bundle_data(active_policies), sort_keys=True, separators=(",", ":")).encode(),
        "didaca/authz/policy.rego": GENERATED_REGO.encode(),
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

    entitlements: list[dict[str, str]] = []
    if definition is not None:
        normalized = definition_as_camel(definition)
        if normalized["effect"] == "allow":
            projected_protocols = [
                "http-rest" if protocol == "http" else "postgresql"
                for protocol in normalized["protocols"]
            ]
            entitlements = [
                {"subjectId": subject, "action": action, "protocol": protocol}
                for subject in normalized["subjects"]["userIds"]
                for action in normalized["actions"]
                for protocol in projected_protocols
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
