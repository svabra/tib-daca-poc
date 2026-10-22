"""Deterministic, synthetic personnel vocabulary; never overwrite governed edits."""
from .modeling_core import canonical_hash, stable_uuid
from .modeling_service import record_audit, utc_now
from .models import (
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermRelation,
    SeedMarker,
)

# These local demo concepts make no claim to be imported TERMDAT/I14Y terms.
CONCEPTS = (
    ("person", "Person", "Ein Mensch, der in einem Personal- oder Organisationsprozess beschrieben wird.", []),
    ("mitarbeitende", "Mitarbeitende", "Personen mit einer Anstellung bei einer Organisation.", ["Mitarbeiter", "Mitarbeiterin"]),
    ("personalnummer", "Personalnummer", "Ein innerhalb der personalführenden Organisation eindeutiger Identifikator einer mitarbeitenden Person.", ["Personal-ID"]),
    ("anstellung", "Anstellung", "Ein zeitlich bestimmtes Arbeitsverhältnis zwischen einer Person und einer Organisation.", ["Arbeitsverhältnis"]),
    ("organisationseinheit", "Organisationseinheit", "Ein abgegrenzter Teil einer Organisation mit definierten Aufgaben und Zuständigkeiten.", ["OE"]),
    ("stelle", "Stelle", "Eine organisatorisch definierte Position mit Aufgaben und einem vorgesehenen Beschäftigungsumfang.", ["Planstelle"]),
    ("funktion", "Funktion", "Die fachlichen Aufgaben und Verantwortlichkeiten einer Stelle oder Person.", []),
    ("beschaeftigungsgrad", "Beschäftigungsgrad", "Der vereinbarte Anteil einer Anstellung am Vollzeitpensum, ausgedrückt in Prozent.", ["Pensum"]),
    ("eintrittsdatum", "Eintrittsdatum", "Das Datum, an dem eine Anstellung beginnt.", []),
    ("austrittsdatum", "Austrittsdatum", "Das Datum, an dem eine Anstellung endet.", []),
)
RELATIONS = (
    ("mitarbeitende", "broader", "person"),
    ("personalnummer", "related", "mitarbeitende"),
    ("anstellung", "related", "mitarbeitende"),
    ("anstellung", "related", "organisationseinheit"),
    ("anstellung", "related", "stelle"),
    ("stelle", "related", "organisationseinheit"),
    ("funktion", "related", "stelle"),
    ("beschaeftigungsgrad", "related", "anstellung"),
    ("eintrittsdatum", "related", "anstellung"),
    ("austrittsdatum", "related", "anstellung"),
)


def seed_personnel_glossary(session, domain_id):
    marker = "personnel-glossary-demo-v1"
    if session.get(SeedMarker, marker) is not None:
        return
    now = utc_now()
    created = set()
    for key, label, definition, alternatives in CONCEPTS:
        identity = stable_uuid(f"personnel-glossary:{key}")
        if session.get(GlossaryTerm, identity) is not None:
            continue
        relations = [(kind, target) for source, kind, target in RELATIONS if source == key]
        session.add(GlossaryTerm(id=identity, urn=f"urn:daca:term:{identity}",
            origin_catalog_id="urn:daca:catalog:bit-poc", revision=1, lifecycle="active",
            content_hash=canonical_hash({"label": label, "definition": definition,
                "alternativeLabels": alternatives, "domainId": str(domain_id), "relations": relations}),
            created_at=now, updated_at=now))
        session.flush()
        session.add_all([
            GlossaryTermLocalization(term_id=identity, language="de", preferred_label=label,
                definition=definition, alternative_labels=alternatives, normalized_label=label.casefold()),
            GlossaryTermDomain(term_id=identity, domain_id=domain_id),
        ])
        record_audit(session, "glossary-term", identity, "created", "modeling-seed", 1,
                     {"fixture": marker, "domainId": str(domain_id)})
        created.add(key)
    session.flush()
    for source, relation, target in RELATIONS:
        if source in created:
            session.add(GlossaryTermRelation(id=stable_uuid(f"personnel-glossary:{source}:{relation}:{target}"),
                source_term_id=stable_uuid(f"personnel-glossary:{source}"),
                target_term_id=stable_uuid(f"personnel-glossary:{target}"), relation=relation, created_at=now))
    session.add(SeedMarker(name=marker, applied_at=now))
    session.flush()
