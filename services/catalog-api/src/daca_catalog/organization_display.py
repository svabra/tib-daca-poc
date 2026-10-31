"""Human-readable federal paths; identifiers and authorization scopes stay unchanged."""

import re
from datetime import UTC, datetime

from sqlalchemy import select

from .models import AdministrativeOrganization, FederalPersonMembership, IdentityDirectoryEntry


class OrganizationDisplay:
    def __init__(self, session):
        self.organizations = {row.id: row for row in session.scalars(select(AdministrativeOrganization))}
        self.primary = {}
        self.membership_users = set()
        today = datetime.now(UTC).date()
        for row in session.scalars(select(FederalPersonMembership).where(FederalPersonMembership.is_primary.is_(True))):
            self.membership_users.add(row.user_id)
            if row.valid_from <= today and (row.valid_to is None or row.valid_to >= today):
                self.primary[row.user_id] = row.organization_id
        self.directory = {row.id: row.organization_id for row in session.scalars(select(IdentityDirectoryEntry).where(
            IdentityDirectoryEntry.source == "federal", IdentityDirectoryEntry.active.is_(True),
        ))}

    def label(self, organization_id, fallback=""):
        row = self.organizations.get(organization_id)
        if row is None:
            return fallback
        chain, seen = [], set()
        while row and row.id not in seen:
            seen.add(row.id)
            chain.append(row)
            row = self.organizations.get(row.parent_id)
        chain.reverse()
        parts = [chain[-1].department_code]
        previous_code = ""
        for row in chain:
            if row.organization_type not in {"office", "affiliated"}:
                continue
            code = {"vbs-verteidigung": "V", "vbs-gs": "GS"}.get(row.id, row.office_code or row.display_name)
            suffix = code
            if previous_code and code.casefold().startswith(previous_code.casefold() + "-"):
                suffix = code[len(previous_code) + 1:]
            previous_code = code
            words = {word.casefold(): word for word in row.display_name.split()}
            parts.extend(words.get(word.casefold(), word) if word.islower() else word
                         for word in re.split(r"\s*[-–·]\s*", suffix) if word)
        return " ".join(parts)

    def user(self, user):
        organization_id = self.primary.get(user.id)
        if user.id not in self.membership_users:
            organization_id = organization_id or self.directory.get(user.id)
        return self.label(organization_id, user.organization)


def organization_display(session):
    """Cache only within one database session/request, never across users or requests."""
    if "organization_display" not in session.info:
        session.info["organization_display"] = OrganizationDisplay(session)
    return session.info["organization_display"]
