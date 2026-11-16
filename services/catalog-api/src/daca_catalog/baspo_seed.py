"""One-time, additive BASPO onboarding. No physical sources, data rows or grants."""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from .baspo_content import DOMAINS, MODELS, RELATIONS, TERMS
from .modeling_core import canonical_hash, stable_uuid
from .modeling_schemas import LogicalModelWrite
from .modeling_service import create_logical_model, record_audit
from .models import (
    AdministrativeOrganization,
    AdministrativeOrganizationLabel,
    CatalogObjectResponsibility,
    DataModelRoleAssignment,
    DemoUser,
    Domain,
    DomainLocalization,
    FederalPersonMembership,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermRelation,
    IdentityDirectoryEntry,
    SeedMarker,
    SemanticGraphState,
    TerminologyExternalReference,
    TerminologyTerm,
    TerminologyTermRelation,
    TerminologyTermResponsibility,
    TerminologyTermVersion,
    TerminologyTermVersionDomain,
    TerminologyTermVersionLabel,
    utc_now,
)

MARKER = "baspo-starter-catalog-v1"
ORG = "vbs-baspo"
CATALOG = "urn:daca:catalog:bit-poc"
ROLAND = "roland.maestro"
DAVIDE = "davide.partito"
SOURCE = Path(__file__).parent / "fixtures" / "baspo_termdat.json"


def identity(key: str):
    return stable_uuid(f"baspo:{key}")


def owners(domain_key: str) -> tuple[str, str]:
    return (ROLAND, DAVIDE) if domain_key in {row[0] for row in DOMAINS[:4]} else (DAVIDE, ROLAND)


def _responsibilities(session: Session, target: str, object_id, domain_key: str):
    owner, deputy = owners(domain_key)
    for user_id, role in ((owner, "data_owner"), (deputy, "deputy_data_owner")):
        session.add(CatalogObjectResponsibility(
            id=identity(f"responsibility:{target}:{object_id}:{user_id}"),
            user_id=user_id, role=role, organization_id=ORG,
            provenance="explicit", **{target: object_id},
        ))


def _seed_organization_and_people(session: Session, sources: dict) -> None:
    if session.get(AdministrativeOrganization, "vbs") is None:
        raise RuntimeError("Initialize the federal organization hierarchy before BASPO onboarding")
    org = session.get(AdministrativeOrganization, ORG)
    if org is None:
        org = AdministrativeOrganization(
            id=ORG, department_code="VBS", office_code="BASPO",
            display_name="Bundesamt für Sport BASPO", organization_type="office",
            department_order=5, office_order=30,
        )
        session.add(org)
    # Older installations already contain a flat BASPO office. Reuse that stable
    # identity and attach it to VBS, rather than create a duplicate office.
    org.parent_id = "vbs"
    org.active = True
    session.flush()
    for language, names in sources["3116"]["designations"].items():
        if session.get(AdministrativeOrganizationLabel, (ORG, language)) is None:
            session.add(AdministrativeOrganizationLabel(
                organization_id=ORG, language=language, label=names[0],
                short_label={"de": "BASPO", "fr": "OFSPO", "it": "UFSPO", "en": "FOSPO"}.get(language),
            ))
    for user_id, name in ((ROLAND, "Roland Maestro"), (DAVIDE, "Davide Partito")):
        if session.get(DemoUser, user_id) is None:
            session.add(DemoUser(
                id=user_id, display_name=name, organization="BASPO",
                email=f"{user_id}@example.invalid", roles=["data_owner"],
                active=True, selectable=True, preferences={},
            ))
            session.flush()
            session.add_all([
                IdentityDirectoryEntry(
                    id=user_id, display_name=name, organization="BASPO", organization_id=ORG,
                    email=f"{user_id}@example.invalid", source="federal",
                    source_system=MARKER, active=True,
                ),
                FederalPersonMembership(
                    id=identity(f"membership:{user_id}"), user_id=user_id,
                    organization_id=ORG, is_primary=True, valid_from=date(2026, 11, 16),
                ),
                DataModelRoleAssignment(
                    id=identity(f"role:{user_id}"), user_id=user_id, department_code="VBS",
                    organization_id=ORG, role="data_owner", active=True,
                ),
            ])
    session.flush()
    record_audit(session, "organization", ORG, "baspo-onboarded", "baspo-seed", None,
                 {"parentId": "vbs", "fixture": MARKER})


def _seed_domains(session: Session) -> None:
    for key, label, definition in DOMAINS:
        owner, deputy = owners(key)
        domain_id = identity(f"domain:{key}")
        session.add(Domain(
            id=domain_id, urn=f"urn:daca:domain:baspo:{key}", origin_catalog_id=CATALOG,
            revision=1, lifecycle="active", owner_user_id=owner, deputy_owner_user_id=deputy,
            content_hash=canonical_hash({"label": label, "definition": definition,
                                         "owner": owner, "deputy": deputy, "organizationId": ORG}),
        ))
        session.flush()
        session.add(DomainLocalization(
            domain_id=domain_id, language="de", preferred_label=label,
            definition=definition, normalized_label=label.casefold(),
        ))
        _responsibilities(session, "domain_id", domain_id, key)
        record_audit(session, "domain", domain_id, "created", "baspo-seed", 1, {"fixture": MARKER})
    session.flush()


def _seed_terms(session: Session, snapshot: dict) -> None:
    retrieved_at = datetime.fromisoformat(snapshot["retrievedAt"])
    for key, entry_id, definition, domains, business_object in TERMS:
        source = snapshot["entries"][str(entry_id)]
        labels = source["designations"]["de"]
        label = labels[0]
        alternatives = list(dict.fromkeys(labels[1:] + ([source["abbreviation"]] if source["abbreviation"] else [])))
        alternatives = [value for value in alternatives if value.casefold() != label.casefold()]
        term_id, version_id = identity(f"term:{key}"), identity(f"term-version:{key}:1")
        owner, _ = owners(domains[0])
        digest = canonical_hash({"label": label, "definition": definition, "domains": domains,
                                 "source": source, "relations": [row for row in RELATIONS if row[0] == key]})
        session.add_all([
            GlossaryTerm(id=term_id, urn=f"urn:daca:term:baspo:{key}", origin_catalog_id=CATALOG,
                         revision=1, lifecycle="active", content_hash=digest,
                         abbreviation=source["abbreviation"], is_termdat=True),
            TerminologyTerm(id=term_id, urn=f"urn:daca:terminology:baspo:{key}", origin_catalog_id=CATALOG,
                            revision=1, lifecycle="active", content_hash=digest, creator_user_id=owner),
        ])
        session.flush()
        session.add(TerminologyTermVersion(
            id=version_id, term_id=term_id, revision=1, lock_version=1,
            status="published", concept_kind="business_object" if business_object else "term",
            content_hash=digest, created_by_user_id=owner,
        ))
        session.flush()
        session.get(TerminologyTerm, term_id).latest_version_id = version_id
        session.add_all([
            GlossaryTermLocalization(term_id=term_id, language="de", preferred_label=label,
                                     alternative_labels=alternatives, definition=definition,
                                     short_description=definition, normalized_label=label.casefold(),
                                     detailed_description=f"{definition}\n\nBezeichnung: TERMDAT, Bundeskanzlei, Eintrag {entry_id} ({source['collectionCode']}). {source['sourceUri']}\nBeschreibung: redaktionelle BASPO-Einordnung in DaCa; keine übernommene TERMDAT-Definition."),
            TerminologyTermVersionLabel(term_version_id=version_id, language="de", preferred_label=label,
                                        alternative_labels=alternatives, definition=definition,
                                        translation_origin="edited"),
            TerminologyTermResponsibility(term_version_id=version_id, role="data_owner", user_id=owner),
            TerminologyExternalReference(
                id=identity(f"source:{key}"), term_version_id=version_id, source_type="termdat",
                source_identifier=str(entry_id), source_uri=source["sourceUri"],
                source_modified_at=datetime.fromisoformat(source["modified"]) if source["modified"] else None,
                retrieved_at=retrieved_at, payload_hash=canonical_hash(source),
                source_label=f"TERMDAT · {source['collectionCode']}", text_snapshot=source,
            ),
            GlossaryTermRelation(id=identity(f"source-link:{key}"), source_term_id=term_id,
                                 target_uri=source["sourceUri"], relation="exactMatch"),
        ])
        for domain in domains:
            session.add_all([
                GlossaryTermDomain(term_id=term_id, domain_id=identity(f"domain:{domain}")),
                TerminologyTermVersionDomain(term_version_id=version_id, domain_id=identity(f"domain:{domain}")),
            ])
        _responsibilities(session, "glossary_term_id", term_id, domains[0])
        record_audit(session, "glossary-term", term_id, "created", "baspo-seed", 1,
                     {"fixture": MARKER, "sourceUri": source["sourceUri"], "definitionOrigin": "editorial"})
    session.flush()
    for source, relation, target in RELATIONS:
        session.add_all([
            GlossaryTermRelation(id=identity(f"relation:{source}:{relation}:{target}"),
                                 source_term_id=identity(f"term:{source}"),
                                 target_term_id=identity(f"term:{target}"), relation=relation),
            TerminologyTermRelation(id=identity(f"version-relation:{source}:{relation}:{target}"),
                                    source_version_id=identity(f"term-version:{source}:1"),
                                    target_version_id=identity(f"term-version:{target}:1"), relation=relation),
        ])
    session.flush()


def _seed_logical_models(session: Session, sources: dict) -> None:
    term_labels = {row[0]: sources[str(row[1])]["designations"]["de"][0] for row in TERMS}
    for number, (key, title, domain, description, entities) in enumerate(MODELS, 1):
        owner, deputy = owners(domain)
        body = LogicalModelWrite.model_validate({
            "identifiers": [f"BASPO-{number:03d}"],
            "localizations": [{"language": "de", "title": title,
                               "description": f"BASPO-Arbeitsentwurf zur fachlichen Prüfung. {description}"}],
            "dataOwnerUserId": owner, "deputyOwnerUserId": deputy,
            "creator": {"type": "InternalOrganisation", "organizationId": ORG,
                        "englishName": "Federal Office of Sport"},
            "dataDomainId": identity(f"domain:{domain}"), "departmentCode": "VBS", "organizationId": ORG,
            "dataClassification": "confidential" if key in {"js-angebote", "qualifikationen", "leistungsfoerderung"} else "internal", "dateCreated": "2026-11-16",
            "contactPoints": [{"name": "BASPO Data Owner", "email": f"{owner}@example.invalid"}],
            "publisher": {"name": "Bundesamt für Sport BASPO", "identifier": ORG,
                          "uri": f"urn:daca:organization:{ORG}"},
            "accessRights": "urn:daca:access-rights:internal",
            "comment": "Fachlicher Vorschlag, kein offizielles BASPO-/NDS-Datenbankschema. Kardinalitäten und Referenzen sind in Entitäts- und Feldbeschreibungen dokumentiert. Physische Repräsentationen und Mappings ergänzt BASPO nach eigener Prüfung.",
            "entities": [{
                "name": name, "position": position, "comment": comment,
                "businessObject": term_labels[term] if term else None,
                "businessObjectVersionId": identity(f"term-version:{term}:1") if term else None,
                "fields": [{
                    "name": field, "dataType": datatype, "position": index,
                    "shortDescription": explanation, "nullable": name == "Anerkennung" and field in {"ausbildung_id", "gueltig_bis"},
                    "classification": "confidential" if field in {"athlet_referenz", "kaderperson_id", "teilnehmenden_referenz", "messwert"} else "internal",
                    "businessObject": term_labels[linked] if linked else None,
                    "businessObjectVersionId": identity(f"term-version:{linked}:1") if linked else None,
                    "conceptMatchExplicitlyNone": True,
                    **({"precision": 14, "decimalPlaces": 2} if datatype == "decimal" else {}),
                } for index, (field, datatype, explanation, linked) in enumerate(fields)],
            } for position, (name, term, comment, fields) in enumerate(entities)],
        })
        model, _ = create_logical_model(session, body, owner, model_id=identity(f"model:{key}"))
        _responsibilities(session, "logical_model_id", model.id, domain)


def seed_baspo_catalog(session: Session) -> bool:
    """Commit with the caller; replay never overwrites edits or resurrects removals."""
    if session.get(SeedMarker, MARKER) is not None:
        return False
    snapshot = json.loads(SOURCE.read_text(encoding="utf-8"))
    _seed_organization_and_people(session, snapshot["entries"])
    _seed_domains(session)
    _seed_terms(session, snapshot)
    _seed_logical_models(session, snapshot["entries"])
    # Invalidate existing semantic graph snapshots through their normal revision.
    for scope in ("domains", "glossary"):
        state = session.get(SemanticGraphState, scope)
        if state:
            state.revision += 1
    session.add(SeedMarker(name=MARKER, applied_at=utc_now()))
    session.flush()
    return True


def main() -> None:
    from .database import default_session_factory
    from .modeling_seed import seed_modeling_catalog
    from .settings import get_settings

    with default_session_factory(get_settings())() as session:
        seed_modeling_catalog(session)
        created = seed_baspo_catalog(session)
        session.commit()
    print("BASPO: 2 Data Owner, 8 domains, 30 TERMDAT terms and 5 logical drafts added." if created else "BASPO onboarding already applied; editorial changes preserved.")


if __name__ == "__main__":
    main()
