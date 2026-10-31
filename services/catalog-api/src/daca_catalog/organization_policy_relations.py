"""Organizational policy context, never authorization or evidence of actual access."""

from collections.abc import Callable
from datetime import datetime
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .access_renewals import active_published_policy, matching_request_evidence
from .models import DataProduct, IdentityDirectoryEntry, IdentityGroup, IdentityGroupMembership
from .schemas import PolicyDefinition


def policy_recipient_organizations(
    session: Session, product: DataProduct, person_org: Callable[[str], str | None],
) -> set[str]:
    """Resolve only published, current allow statements through trusted directory IDs.

    Legacy organization principals (e.g. kanton-st-gallen) are recognized only
    as active, system-managed directory groups. This projection does not turn
    their members into policy principals or change any PDP decision.
    """
    policy = active_published_policy(session, product)
    if policy is None:
        return set()
    try:
        definition = PolicyDefinition.model_validate(policy.definition)
    except (ValidationError, TypeError, ValueError):
        return set()
    if (definition.effect != "allow" or product.urn not in definition.resources.product_urns
            or product.owner not in definition.resources.owners):
        return set()
    today = datetime.now(ZoneInfo("Europe/Zurich")).date()

    def group_orgs(identity, *, legacy=False, snapshot=None):
        group = session.get(IdentityGroup, identity)
        if group is None or not group.active or (legacy and not group.system_managed):
            return set()
        members = session.scalars(select(IdentityGroupMembership).join(
            IdentityDirectoryEntry, IdentityDirectoryEntry.id == IdentityGroupMembership.identity_id,
        ).where(IdentityGroupMembership.group_id == identity, IdentityDirectoryEntry.active.is_(True)))
        # Group snapshots restrict membership; current directory validity still
        # prevents expired or removed affiliations from reappearing in the graph.
        return {organization for member in members
                if (member.valid_from is None or member.valid_from <= today)
                and (member.valid_until is None or today <= member.valid_until)
                and (snapshot is None or member.identity_id in snapshot)
                if (organization := person_org(member.identity_id)) is not None}

    organizations = set()
    if not definition.grants and "data.read" in definition.actions and definition.protocols:
        for identity in definition.subjects.user_ids:
            organization = person_org(identity)
            if organization:
                organizations.add(organization)
            else:
                organizations.update(group_orgs(identity, legacy=True))
    for grant in definition.grants:
        if "data.read" not in grant.actions or not grant.valid_from <= today <= grant.valid_until:
            continue
        if grant.subject.type == "person":
            organization = person_org(grant.subject.id)
            if organization:
                organizations.add(organization)
        elif grant.subject.type == "group":
            snapshot = grant.group_snapshot
            if snapshot and snapshot.group_id == grant.subject.id:
                organizations.update(group_orgs(grant.subject.id, snapshot=set(snapshot.member_ids)))
        elif grant.subject.type == "machine":
            evidence = matching_request_evidence(session, product.id, policy, grant)
            if evidence and (organization := person_org(evidence.requester_id)):
                organizations.add(organization)
    return organizations
