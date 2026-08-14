from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import CatalogInstance, SyncConfiguration, TrustGrant, utcnow
from .problems import ApiProblem


def get_catalog(session: Session, identifier: str) -> CatalogInstance:
    catalog = session.get(CatalogInstance, identifier)
    if catalog is None:
        raise ApiProblem(
            404,
            "Catalog not found",
            f"No catalog instance exists with id '{identifier}'.",
            problem_type="urn:daca:problem:catalog-not-found",
        )
    return catalog


def get_trust_grant(session: Session, identifier: str) -> TrustGrant:
    grant = session.get(TrustGrant, identifier)
    if grant is None:
        raise ApiProblem(
            404,
            "Trust grant not found",
            f"No trust grant exists with id '{identifier}'.",
            problem_type="urn:daca:problem:trust-grant-not-found",
        )
    return grant


def get_sync_configuration(session: Session, identifier: str) -> SyncConfiguration:
    configuration = session.get(SyncConfiguration, identifier)
    if configuration is None:
        raise ApiProblem(
            404,
            "Sync configuration not found",
            f"No sync configuration exists with id '{identifier}'.",
            problem_type="urn:daca:problem:sync-configuration-not-found",
        )
    return configuration


def etag(revision: int) -> str:
    return f'"{revision}"'


def require_revision(if_match: str | None, actual: int) -> None:
    if if_match is None:
        raise ApiProblem(
            428,
            "Precondition required",
            "Supply the current resource ETag in the If-Match header.",
            problem_type="urn:daca:problem:precondition-required",
        )
    candidate = if_match.strip().removeprefix("W/")
    if candidate != etag(actual):
        raise ApiProblem(
            412,
            "Precondition failed",
            "The resource changed after it was read; reload it and retry the edit.",
            problem_type="urn:daca:problem:stale-revision",
        )


def validate_grant_window(valid_from: datetime | None, valid_until: datetime | None) -> None:
    if valid_from and valid_until and _as_utc(valid_until) <= _as_utc(valid_from):
        raise ApiProblem(
            422,
            "Invalid validity window",
            "validUntil must be after validFrom.",
            problem_type="urn:daca:problem:invalid-trust-window",
        )


def validate_enabled_sync(
    session: Session,
    configuration: SyncConfiguration,
    settings: Settings,
) -> TrustGrant:
    get_catalog(session, configuration.source_id)
    get_catalog(session, configuration.target_id)
    if configuration.trust_grant_id is None:
        raise _invalid_trust(
            "An enabled sync configuration must reference an approved directed trust grant."
        )

    grant = get_trust_grant(session, configuration.trust_grant_id)
    if grant.provider_id != configuration.source_id or grant.consumer_id != configuration.target_id:
        raise _invalid_trust(
            "The trust grant direction must run from the resource source to the consumer target."
        )
    if grant.state != "approved":
        raise _invalid_trust("The referenced trust grant is not approved.")

    now = utcnow()
    if grant.valid_from and _as_utc(grant.valid_from) > now:
        raise _invalid_trust("The referenced trust grant is not valid yet.")
    if grant.valid_until and _as_utc(grant.valid_until) <= now:
        raise _invalid_trust("The referenced trust grant has expired.")

    scopes = set(configuration.resource_scopes)
    allowed = set(grant.allowed_resource_types)
    if not scopes.issubset(allowed):
        raise _invalid_trust("The trust grant does not allow every requested resource scope.")
    if "policy" in scopes and not settings.policy_sync_enabled:
        raise ApiProblem(
            422,
            "Policy sync is disabled",
            "Policy sharing is opt-in and is disabled for this control-plane deployment.",
            problem_type="urn:daca:problem:policy-sync-disabled",
        )

    _validate_filter_scope("product", configuration.product_filters, grant.product_filters)
    _validate_filter_scope("owner", configuration.owner_filters, grant.owner_filters)
    _validate_filter_scope("domain", configuration.domain_filters, grant.domain_filters)
    return grant


def disable_invalid_syncs_for_grant(
    session: Session, grant: TrustGrant, settings: Settings
) -> list[str]:
    configurations = session.scalars(
        select(SyncConfiguration).where(
            SyncConfiguration.trust_grant_id == grant.id,
            SyncConfiguration.enabled.is_(True),
        )
    ).all()
    disabled: list[str] = []
    for configuration in configurations:
        try:
            validate_enabled_sync(session, configuration, settings)
        except ApiProblem:
            configuration.enabled = False
            configuration.revision += 1
            disabled.append(configuration.id)
    return disabled


def _validate_filter_scope(
    name: str, configured_values: list[str], grant_values: list[str]
) -> None:
    if not grant_values:
        return
    if not configured_values:
        raise _invalid_trust(
            f"The trust grant limits {name}s, so the sync configuration must do so too."
        )
    if not set(configured_values).issubset(set(grant_values)):
        raise _invalid_trust(
            f"The sync configuration contains {name} filters outside the trust grant."
        )


def _invalid_trust(detail: str) -> ApiProblem:
    return ApiProblem(
        422,
        "Sync is not trusted",
        detail,
        problem_type="urn:daca:problem:sync-not-trusted",
    )


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
