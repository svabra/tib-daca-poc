"""Operator-only provisioning of LDSD/ALDS appointments backed by an appointment decision."""

import argparse
import getpass

from fastapi import HTTPException

from .database import build_engine, build_session_factory
from .office_governance import provision_steward_mandate
from .settings import get_settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization", required=True)
    parser.add_argument("--type", choices=["ldsd", "alds"], required=True)
    parser.add_argument("--deputy")
    parser.add_argument("--user", required=True)
    parser.add_argument("--expected-revision", type=int, required=True, help="0 for the first appointment")
    parser.add_argument("--decision-reference", required=True, help="Evidence of the responsible LDS decision")
    parser.add_argument("--revoke", action="store_true")
    args = parser.parse_args()
    engine = build_engine(get_settings().resolved_database_url)
    try:
        with build_session_factory(engine)() as session:
            row = provision_steward_mandate(session, organization_id=args.organization, user_id=args.user, mandate_type=args.type, deputy_user_id=args.deputy,
                expected_revision=args.expected_revision, decision_reference=args.decision_reference,
                operator=f"local-operator:{getpass.getuser()}", active=not args.revoke)
            session.commit()
            print(f"{row.mandate_type} {row.organization_id}: {row.user_id}; active={row.active}; revision={row.revision}")
    except HTTPException as error:
        raise SystemExit(error.detail) from None
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
