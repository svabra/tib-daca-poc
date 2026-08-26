from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .control_people import assign_default_control_person, is_active_publication_approver
from .deputy_owners import assign_default_deputy_owner, is_active_deputy
from .models import (
    AccessRequest,
    AdministrativeOrganization,
    CanonicalOntologyTerm,
    CanonicalOntologyVersion,
    DataProduct,
    DemoUser,
    IdentityDirectoryEntry,
    IdentityGroup,
    IdentityGroupMembership,
    PocProductFixture,
    SourceCatalogEntry,
    WorkflowTask,
)

POC_NAMESPACE = uuid.UUID("a5c07ada-69a1-4b34-a13d-ea738b5daca0")
ONTOLOGY_VERSION_ID = uuid.uuid5(POC_NAMESPACE, "ontology:tax:v1")
ONTOLOGY_URI = "urn:daca:ontology:tax:v1"


def stable_id(value: str) -> uuid.UUID:
    return uuid.uuid5(POC_NAMESPACE, value)


# Current federal structure used by the PoC identity directory. The ordering follows
# the seven departments and the Federal Chancellery on the federal administration portal.
FEDERAL_ORGANIZATIONS = (
    ("br", "BR", None, "Bundesrat", "federal_council", 0, 0),
    ("bk", "BK", None, "Bundeskanzlei", "chancellery", 1, 0),
    ("bk-edoeb", "BK", "EDÖB", "Eidgenössischer Datenschutz- und Öffentlichkeitsbeauftragter", "affiliated", 1, 1),
    ("eda", "EDA", None, "Eidgenössisches Departement für auswärtige Angelegenheiten", "department", 2, 0),
    ("eda-gs", "EDA", "GS-EDA", "Generalsekretariat", "office", 2, 1),
    ("eda-sts", "EDA", "STS", "Staatssekretariat", "office", 2, 2),
    ("eda-deza", "EDA", "DEZA", "Direktion für Entwicklung und Zusammenarbeit", "office", 2, 3),
    ("eda-dv", "EDA", "DV", "Direktion für Völkerrecht", "office", 2, 4),
    ("eda-kd", "EDA", "KD", "Konsularische Direktion", "office", 2, 5),
    ("eda-dr", "EDA", "DR", "Direktion für Ressourcen", "office", 2, 6),
    ("edi", "EDI", None, "Eidgenössisches Departement des Innern", "department", 3, 0),
    ("edi-gs", "EDI", "GS-EDI", "Generalsekretariat", "office", 3, 1),
    ("edi-bag", "EDI", "BAG", "Bundesamt für Gesundheit", "office", 3, 2),
    ("edi-bak", "EDI", "BAK", "Bundesamt für Kultur", "office", 3, 3),
    ("edi-blv", "EDI", "BLV", "Bundesamt für Lebensmittelsicherheit und Veterinärwesen", "office", 3, 4),
    ("edi-bsv", "EDI", "BSV", "Bundesamt für Sozialversicherungen", "office", 3, 5),
    ("edi-bfs", "EDI", "BFS", "Bundesamt für Statistik", "office", 3, 6),
    ("edi-meteoschweiz", "EDI", "MeteoSchweiz", "Bundesamt für Meteorologie und Klimatologie", "office", 3, 7),
    ("edi-ebg", "EDI", "EBG", "Eidgenössisches Büro für die Gleichstellung von Frau und Mann", "office", 3, 8),
    ("edi-bar", "EDI", "BAR", "Schweizerisches Bundesarchiv", "office", 3, 9),
    ("edi-prohelvetia", "EDI", "Pro Helvetia", "Schweizerische Kulturstiftung Pro Helvetia", "affiliated", 3, 10),
    ("edi-swissmedic", "EDI", "Swissmedic", "Schweizerisches Heilmittelinstitut", "affiliated", 3, 11),
    ("edi-snm", "EDI", "SNM", "Schweizerisches Nationalmuseum", "affiliated", 3, 12),
    ("ejpd", "EJPD", None, "Eidgenössisches Justiz- und Polizeidepartement", "department", 4, 0),
    ("ejpd-gs", "EJPD", "GS-EJPD", "Generalsekretariat", "office", 4, 1),
    ("ejpd-bj", "EJPD", "BJ", "Bundesamt für Justiz", "office", 4, 2),
    ("ejpd-fedpol", "EJPD", "fedpol", "Bundesamt für Polizei", "office", 4, 3),
    ("ejpd-sem", "EJPD", "SEM", "Staatssekretariat für Migration", "office", 4, 4),
    ("ejpd-uepf", "EJPD", "ÜPF", "Dienst Überwachung Post- und Fernmeldeverkehr", "office", 4, 5),
    ("ejpd-ekm", "EJPD", "EKM", "Eidgenössische Migrationskommission", "affiliated", 4, 6),
    ("ejpd-rab", "EJPD", "RAB", "Eidgenössische Revisionsaufsichtsbehörde", "affiliated", 4, 7),
    ("ejpd-eschk", "EJPD", "ESchK", "Eidgenössische Schiedskommission für Urheberrechte", "affiliated", 4, 8),
    ("ejpd-esbk", "EJPD", "ESBK", "Eidgenössische Spielbankenkommission", "affiliated", 4, 9),
    ("ejpd-ige", "EJPD", "IGE", "Eidgenössisches Institut für Geistiges Eigentum", "affiliated", 4, 10),
    ("ejpd-metas", "EJPD", "METAS", "Eidgenössisches Institut für Metrologie", "affiliated", 4, 11),
    ("ejpd-nkvf", "EJPD", "NKVF", "Nationale Kommission zur Verhütung von Folter", "affiliated", 4, 12),
    ("ejpd-sir", "EJPD", "SIR", "Schweizerisches Institut für Rechtsvergleichung", "affiliated", 4, 13),
    ("vbs", "VBS", None, "Eidgenössisches Departement für Verteidigung, Bevölkerungsschutz und Sport", "department", 5, 0),
    ("vbs-gs", "VBS", "GS-VBS", "Generalsekretariat", "office", 5, 1),
    ("vbs-babs", "VBS", "BABS", "Bundesamt für Bevölkerungsschutz", "office", 5, 2),
    ("vbs-bacs", "VBS", "BACS", "Bundesamt für Cybersicherheit", "office", 5, 3),
    ("vbs-swisstopo", "VBS", "swisstopo", "Bundesamt für Landestopografie", "office", 5, 4),
    ("vbs-armasuisse", "VBS", "armasuisse", "Bundesamt für Rüstung", "office", 5, 5),
    ("vbs-baspo", "VBS", "BASPO", "Bundesamt für Sport", "office", 5, 6),
    ("vbs-ndb", "VBS", "NDB", "Nachrichtendienst des Bundes", "office", 5, 7),
    ("vbs-oa", "VBS", "OA", "Oberauditorat", "office", 5, 8),
    ("vbs-armee", "VBS", "Armee", "Schweizer Armee", "office", 5, 9),
    ("vbs-sepos", "VBS", "SEPOS", "Staatssekretariat für Sicherheitspolitik", "office", 5, 10),
    ("efd", "EFD", None, "Eidgenössisches Finanzdepartement", "department", 6, 0),
    ("efd-gs", "EFD", "GS-EFD", "Generalsekretariat", "office", 6, 1),
    ("efd-sif", "EFD", "SIF", "Staatssekretariat für internationale Finanzfragen", "office", 6, 2),
    ("efd-efv", "EFD", "EFV", "Eidgenössische Finanzverwaltung", "office", 6, 3),
    ("efd-estv", "EFD", "ESTV", "Eidgenössische Steuerverwaltung", "office", 6, 4),
    ("efd-bazg", "EFD", "BAZG", "Bundesamt für Zoll und Grenzsicherheit", "office", 6, 5),
    ("efd-epa", "EFD", "EPA", "Eidgenössisches Personalamt", "office", 6, 6),
    ("efd-bit", "EFD", "BIT", "Bundesamt für Informatik und Telekommunikation", "office", 6, 7),
    ("efd-bbl", "EFD", "BBL", "Bundesamt für Bauten und Logistik", "office", 6, 8),
    ("efd-finma", "EFD", "FINMA", "Eidgenössische Finanzmarktaufsicht", "affiliated", 6, 9),
    ("efd-efk", "EFD", "EFK", "Eidgenössische Finanzkontrolle", "affiliated", 6, 10),
    ("efd-publica", "EFD", "PUBLICA", "Pensionskasse des Bundes", "affiliated", 6, 11),
    ("wbf", "WBF", None, "Eidgenössisches Departement für Wirtschaft, Bildung und Forschung", "department", 7, 0),
    ("wbf-gs", "WBF", "GS-WBF", "Generalsekretariat", "office", 7, 1),
    ("wbf-seco", "WBF", "SECO", "Staatssekretariat für Wirtschaft", "office", 7, 2),
    ("wbf-sbfi", "WBF", "SBFI", "Staatssekretariat für Bildung, Forschung und Innovation", "office", 7, 3),
    ("wbf-blw", "WBF", "BLW", "Bundesamt für Landwirtschaft", "office", 7, 4),
    ("wbf-bwl", "WBF", "BWL", "Bundesamt für wirtschaftliche Landesversorgung", "office", 7, 5),
    ("wbf-bwo", "WBF", "BWO", "Bundesamt für Wohnungswesen", "office", 7, 6),
    ("wbf-zivi", "WBF", "ZIVI", "Bundesamt für Zivildienst", "office", 7, 7),
    ("wbf-eth", "WBF", "ETH-Bereich", "Bereich der Eidgenössischen Technischen Hochschulen", "affiliated", 7, 8),
    ("wbf-ehb", "WBF", "EHB", "Eidgenössisches Hochschulinstitut für Berufsbildung", "affiliated", 7, 9),
    ("wbf-pue", "WBF", "PUE", "Preisüberwachung", "affiliated", 7, 10),
    ("wbf-innosuisse", "WBF", "Innosuisse", "Schweizerische Agentur für Innovationsförderung", "affiliated", 7, 11),
    ("wbf-weko", "WBF", "WEKO", "Wettbewerbskommission", "affiliated", 7, 12),
    ("uvek", "UVEK", None, "Eidgenössisches Departement für Umwelt, Verkehr, Energie und Kommunikation", "department", 8, 0),
    ("uvek-gs", "UVEK", "GS-UVEK", "Generalsekretariat", "office", 8, 1),
    ("uvek-bfe", "UVEK", "BFE", "Bundesamt für Energie", "office", 8, 2),
    ("uvek-bakom", "UVEK", "BAKOM", "Bundesamt für Kommunikation", "office", 8, 3),
    ("uvek-are", "UVEK", "ARE", "Bundesamt für Raumentwicklung", "office", 8, 4),
    ("uvek-astra", "UVEK", "ASTRA", "Bundesamt für Strassen", "office", 8, 5),
    ("uvek-bafu", "UVEK", "BAFU", "Bundesamt für Umwelt", "office", 8, 6),
    ("uvek-bav", "UVEK", "BAV", "Bundesamt für Verkehr", "office", 8, 7),
    ("uvek-bazl", "UVEK", "BAZL", "Bundesamt für Zivilluftfahrt", "office", 8, 8),
    ("uvek-elcom", "UVEK", "ElCom", "Eidgenössische Elektrizitätskommission", "affiliated", 8, 9),
    ("uvek-comcom", "UVEK", "ComCom", "Eidgenössische Kommunikationskommission", "affiliated", 8, 10),
    ("uvek-postcom", "UVEK", "PostCom", "Eidgenössische Postkommission", "affiliated", 8, 11),
    ("uvek-ensi", "UVEK", "ENSI", "Eidgenössisches Nuklearsicherheitsinspektorat", "affiliated", 8, 12),
    ("uvek-esti", "UVEK", "ESTI", "Eidgenössisches Starkstrominspektorat", "affiliated", 8, 13),
    ("uvek-railcom", "UVEK", "RailCom", "Kommission für den Eisenbahnverkehr", "affiliated", 8, 14),
    ("uvek-sust", "UVEK", "SUST", "Schweizerische Sicherheitsuntersuchungsstelle", "affiliated", 8, 15),
    ("uvek-ubi", "UVEK", "UBI", "Unabhängige Beschwerdeinstanz für Radio und Fernsehen", "affiliated", 8, 16),
)


DEMO_USERS = (
    {
        "id": "kassandra.valdata",
        "display_name": "Kassandra Valdata",
        "organization": "ESTV",
        "email": "kassandra.valdata@estv.admin.ch",
        "phone": "+41 58 000 00 11",
        "avatar_url": "/assets/kassandra-valdata.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "ariane.keller",
        "display_name": "Ariane Keller",
        "organization": "ESTV",
        "email": "ariane.keller@estv.admin.ch",
        "phone": "+41 58 000 00 12",
        "avatar_url": "/assets/data-owners/ariane-keller.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "noemie.rochat",
        "display_name": "Noémie Rochat",
        "organization": "Kanton Neuchâtel",
        "email": "noemie.rochat@ne.ch",
        "phone": "+41 58 000 00 42",
        "avatar_url": "/assets/data-owners/noemie-rochat.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "beat.stalder",
        "display_name": "Beat Stalder",
        "organization": "Kanton St. Gallen",
        "email": "beat.stalder@sg.ch",
        "phone": "+41 58 000 00 71",
        "avatar_url": "/assets/data-owners/beat-stalder.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "sarah.brunner",
        "display_name": "Sarah Brunner",
        "organization": "Kanton St. Gallen",
        "email": "sarah.brunner@sg.ch",
        "phone": "+41 58 000 00 72",
        "avatar_url": "/assets/data-owners/sarah-brunner.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "thomas.kriegli",
        "display_name": "Thomas Kriegli",
        "organization": "ESTV",
        "email": "thomas.kriegli@estv.admin.ch",
        "phone": "+41 58 000 00 83",
        "avatar_url": "/assets/data-owners/thomas-kriegli.webp",
        "roles": ["publication_approver", "data_consumer"],
        "supervisor_user_id": None,
        "selectable": True,
    },
    {
        "id": "joel.ruod",
        "display_name": "Joel Ruod",
        "organization": "ESTV",
        "email": "joel.ruod@estv.admin.ch",
        "phone": "+41 58 000 00 82",
        "avatar_url": "/assets/data-owners/joel-ruod.webp",
        "roles": ["data_analyst", "data_owner"],
        "supervisor_user_id": "thomas.kriegli",
        "selectable": True,
    },
    {
        "id": "sandro.wenger",
        "display_name": "Sandro Wenger",
        "organization": "BAZG",
        "email": "sandro.wenger@bazg.admin.ch",
        "phone": "+41 58 000 00 91",
        "avatar_url": "/assets/data-owners/sandro-wenger.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "sibilla.micheli",
        "display_name": "Sibilla Micheli",
        "organization": "VBS",
        "email": "sibilla.micheli@vbs.admin.ch",
        "phone": "+41 58 000 00 61",
        "avatar_url": None,
        "roles": ["data_owner", "domain_register_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "lucien.morel",
        "display_name": "Lucien Morel",
        "organization": "Kanton Neuchâtel",
        "email": "lucien.morel@ne.ch",
        "phone": "+41 58 000 00 43",
        "avatar_url": "/assets/data-owners/lucien-morel.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "daniel.aebischer",
        "display_name": "Daniel Aebischer",
        "organization": "EFV",
        "email": "daniel.aebischer@efv.admin.ch",
        "phone": "+41 58 000 00 51",
        "avatar_url": "/assets/data-owners/daniel-aebischer.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "simone.wyss",
        "display_name": "Simone Wyss",
        "organization": "EFV",
        "email": "simone.wyss@efv.admin.ch",
        "phone": "+41 58 000 00 52",
        "avatar_url": "/assets/data-owners/simone-wyss.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    {
        "id": "lea.hofmann",
        "display_name": "Lea Hofmann",
        "organization": "BAZG",
        "email": "lea.hofmann@bazg.admin.ch",
        "phone": "+41 58 000 00 92",
        "avatar_url": "/assets/data-owners/lea-hofmann.webp",
        "roles": ["data_owner", "data_consumer"],
        "selectable": True,
    },
    # Non-selectable identities preserve existing API contract tests and local scripts.
    {
        "id": "daca-test-editor",
        "display_name": "DaCa Test Editor",
        "organization": "BIT",
        "email": "test@localhost",
        "phone": None,
        "avatar_url": None,
        "roles": ["test"],
        "selectable": False,
    },
    {
        "id": "estv-owner",
        "display_name": "ESTV Test Owner",
        "organization": "ESTV",
        "email": "owner@localhost",
        "phone": None,
        "avatar_url": None,
        "roles": ["test"],
        "selectable": False,
    },
    {
        "id": "estv-editor",
        "display_name": "ESTV Test Editor",
        "organization": "ESTV",
        "email": "editor@localhost",
        "phone": None,
        "avatar_url": None,
        "roles": ["test"],
        "selectable": False,
    },
    {
        "id": "daca-demo-editor",
        "display_name": "DaCa Demo Editor",
        "organization": "BIT",
        "email": "demo@localhost",
        "phone": None,
        "avatar_url": None,
        "roles": ["test"],
        "selectable": False,
    },
)


DIRECTORY_ENTRIES = (
    ("kassandra.valdata", "Kassandra Valdata", "ESTV", "kassandra.valdata@estv.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("ariane.keller", "Ariane Keller", "ESTV", "ariane.keller@estv.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("daniel.aebischer", "Daniel Aebischer", "EFV", "daniel.aebischer@efv.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("simone.wyss", "Simone Wyss", "EFV", "simone.wyss@efv.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("joel.ruod", "Joel Ruod", "ESTV", "joel.ruod@estv.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("sandro.wenger", "Sandro Wenger", "BAZG", "sandro.wenger@bazg.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("sibilla.micheli", "Sibilla Micheli", "VBS", "sibilla.micheli@vbs.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("lea.hofmann", "Lea Hofmann", "BAZG", "lea.hofmann@bazg.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("thomas.kriegli", "Thomas Kriegli", "ESTV", "thomas.kriegli@estv.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("noemie.rochat", "Noémie Rochat", "Kanton Neuchâtel", "noemie.rochat@ne.ch", "cantonal", "Kantonales Personalverzeichnis"),
    ("lucien.morel", "Lucien Morel", "Kanton Neuchâtel", "lucien.morel@ne.ch", "cantonal", "Kantonales Personalverzeichnis"),
    ("beat.stalder", "Beat Stalder", "Kanton St. Gallen", "beat.stalder@sg.ch", "cantonal", "Kantonales Personalverzeichnis"),
    ("sarah.brunner", "Sarah Brunner", "Kanton St. Gallen", "sarah.brunner@sg.ch", "cantonal", "Kantonales Personalverzeichnis"),
    ("nadine.favre", "Nadine Favre", "Kanton Waadt", "nadine.favre@vd.ch", "cantonal", "Kantonales Personalverzeichnis"),
    ("lea.meier", "Lea Meier", "Kanton Bern", "lea.meier@be.ch", "cantonal", "Kantonales Personalverzeichnis"),
    ("marco.galli", "Marco Galli", "Kanton Tessin", "marco.galli@ti.ch", "cantonal", "Kantonales Personalverzeichnis"),
    ("ursula.mueller", "Ursula Müller", "Stadt Aarau", "ursula.mueller@aarau.ch", "municipal", "Gemeindepersonalverzeichnis"),
    ("jonas.perrin", "Jonas Perrin", "Ville de Neuchâtel", "jonas.perrin@neuchatelville.ch", "municipal", "Gemeindepersonalverzeichnis"),
    ("claudia.frei", "Claudia Frei", "SBB AG", "claudia.frei@sbb.ch", "federal_related", "Verzeichnis bundesnaher Betriebe"),
    ("martin.baumann", "Martin Baumann", "Die Schweizerische Post AG", "martin.baumann@post.ch", "federal_related", "Verzeichnis bundesnaher Betriebe"),
    ("sophie.brunner", "Sophie Brunner", "BFS", "sophie.brunner@bfs.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("marc.gisler", "Marc Gisler", "BIT", "marc.gisler@bit.admin.ch", "federal", "Bundespersonalverzeichnis"),
    ("nina.fankhauser", "Nina Fankhauser", "BK", "nina.fankhauser@bk.admin.ch", "federal", "Bundespersonalverzeichnis"),
)

DIRECTORY_ORGANIZATION_IDS = {
    "kassandra.valdata": "efd-estv",
    "ariane.keller": "efd-estv",
    "daniel.aebischer": "efd-efv",
    "simone.wyss": "efd-efv",
    "joel.ruod": "efd-estv",
    "sandro.wenger": "efd-bazg",
    "sibilla.micheli": "vbs",
    "lea.hofmann": "efd-bazg",
    "thomas.kriegli": "efd-estv",
    "sophie.brunner": "edi-bfs",
    "marc.gisler": "efd-bit",
    "nina.fankhauser": "bk",
}


DIRECTORY_GROUPS = (
    ("kanton-neuchatel", "Kanton Neuchâtel", "Mitarbeitende der kantonalen Verwaltung Neuchâtel", "cantonal", ("noemie.rochat", "lucien.morel")),
    ("kanton-st-gallen", "Kanton St. Gallen", "Mitarbeitende der kantonalen Verwaltung St. Gallen", "cantonal", ("beat.stalder", "sarah.brunner")),
    ("estv-data-stewards", "ESTV Data Stewards", "Verantwortliche für Metadatenqualität und Governance der ESTV", "federal", ("kassandra.valdata", "ariane.keller")),
    ("bund-forschung", "Forschung Bund", "Bundesmitarbeitende mit Aufgaben in Analyse und Forschung", "federal", ("daniel.aebischer", "kassandra.valdata")),
    ("efd-efv-bundestresorerie", "EFD – EFV / Bundestresorerie", "Systemverwaltete Empfängergruppe der Eidgenössischen Finanzverwaltung", "federal", ("daniel.aebischer",)),
    ("estv-business-intelligence", "ESTV Business Intelligence", "Vertrauenswürdige Analysegruppe der ESTV für föderierte Datenquellen", "federal", ("joel.ruod", "kassandra.valdata")),
    ("estv-advanced-analytics", "ESTV Advanced Analytics", "Data-Science- und Advanced-Analytics-Fachgruppe der ESTV", "federal", ("joel.ruod", "ariane.keller")),
    ("efd-data-community", "EFD Data Community", "Departementsweite Community für verantwortungsvolle Datennutzung", "federal", ("joel.ruod", "daniel.aebischer", "marc.gisler")),
)

DIRECTORY_GROUP_ORGANIZATION_IDS = {
    "efd-efv-bundestresorerie": "efd-efv",
    "estv-business-intelligence": "efd-estv",
    "estv-advanced-analytics": "efd-estv",
}


SOURCE_DISCOVERY_GROUPS = (
    "estv-business-intelligence",
    "estv-advanced-analytics",
    "efd-data-community",
)


def oracle_source_specs() -> tuple[dict[str, object], ...]:
    """Return 38 deterministic, metadata-only Oracle fixtures for the sourcing PoC."""

    organizations = (
        ("bazg", "BAZG", "Bundesamt für Zoll und Grenzsicherheit BAZG", 8),
        ("estv", "ESTV", "Eidgenössische Steuerverwaltung ESTV", 8),
        ("efv", "EFV", "Eidgenössische Finanzverwaltung EFV", 6),
        ("bit", "BIT", "Bundesamt für Informatik und Telekommunikation BIT", 6),
        ("bfs", "BFS", "Bundesamt für Statistik BFS", 5),
        ("seco", "SECO", "Staatssekretariat für Wirtschaft SECO", 5),
    )
    specs: list[dict[str, object]] = []
    sequence = 0
    for slug, code, organization, count in organizations:
        for index in range(1, count + 1):
            sequence += 1
            source_id = f"ora_{slug}_{index:02d}"
            database_name = f"{code}ORA{index:02d}"
            display_name = f"{code} Fachanwendung {index:02d}"
            sites = ["PRIMUS"] if index % 3 == 1 else ["CAMPUS"] if index % 3 == 2 else ["PRIMUS", "CAMPUS"]
            schema = code
            objects = [
                {"schema": schema, "name": "STAMMDATEN", "kind": "table"},
                {"schema": schema, "name": "BEWEGUNGSDATEN", "kind": "table"},
                {"schema": schema, "name": "AKTUELLE_UEBERSICHT_V", "kind": "view"},
            ]
            mock_profile: dict[str, object] = {"profile": "generic", "schema": schema}
            if sequence == 1:
                source_id = "ora_bazg_zoll"
                database_name = "BZGZOLL1"
                display_name = "BAZG Zentrale Zollabwicklung"
                sites = ["PRIMUS", "CAMPUS"]
                objects = [
                    {"schema": "ZOLL", "name": "ANMELDUNGEN", "kind": "table"},
                    {"schema": "ZOLL", "name": "WARENPOSITIONEN", "kind": "table"},
                    {"schema": "ZOLL", "name": "ABGABEN_UEBERSICHT_V", "kind": "view"},
                ]
                mock_profile = {"profile": "bazg-zoll", "schema": "ZOLL"}
            discoverability = (
                [SOURCE_DISCOVERY_GROUPS[(sequence - 1) % len(SOURCE_DISCOVERY_GROUPS)]]
                if sequence <= 30
                else ["oracle-source-administrators"]
            )
            specs.append(
                {
                    "id": source_id,
                    "source_type": "oracle",
                    "database_name": database_name,
                    "display_name": display_name,
                    "description": (
                        "Synthetische Oracle-Metadaten für die PoC-Erschliessung. "
                        "Enthält keine produktiven Verbindungsdaten oder Credentials."
                    ),
                    "organization": organization,
                    "owner_user_id": "sandro.wenger",
                    "sites": sites,
                    "search_objects": objects,
                    "discoverability_group_ids": discoverability,
                    "mock_profile": mock_profile,
                }
            )
    return tuple(specs)


ORACLE_SOURCE_SPECS = oracle_source_specs()


TERM_DEFINITIONS = (
    ("DirectFederalTaxAssessmentDataset", "class", "Direkte Bundessteuer – Veranlagungsdaten", "Aggregierte Veranlagungsdaten zur direkten Bundessteuer."),
    ("VatSectorIndicatorDataset", "class", "Mehrwertsteuer-Branchenindikatoren", "Aggregierte Indikatoren der Mehrwertsteuer nach Branche."),
    ("WithholdingTaxRefundDataset", "class", "Verrechnungssteuer-Rückerstattungen", "Status und Volumen von Rückerstattungen der Verrechnungssteuer."),
    ("NeuchatelWithholdingTaxDataset", "class", "Quellensteuer Neuchâtel", "Quellensteuerdaten des Kantons Neuchâtel."),
    ("NeuchatelCorporateTaxDataset", "class", "Unternehmenssteuer Neuchâtel", "Steuerfaktoren juristischer Personen im Kanton Neuchâtel."),
    ("NeuchatelPropertyGainsDataset", "class", "Grundstückgewinnsteuer Neuchâtel", "Aggregierte Kennzahlen zur Grundstückgewinnsteuer."),
    ("StGallenMunicipalTaxRateDataset", "class", "Gemeindesteuerfüsse St. Gallen", "Kommunale Steuerfüsse im Kanton St. Gallen."),
    ("StGallenMunicipalRevenueDataset", "class", "Steuererträge St. Galler Gemeinden", "Aggregierte Steuererträge der Gemeinden."),
    ("StGallenPropertyTransferDataset", "class", "Grundstück- und Handänderungssteuer St. Gallen", "Kennzahlen zu Grundstück- und Handänderungssteuern."),
    ("CorporateTaxForecastDataset", "class", "Kantonale Gewerbesteuer – Soll/Ist und Hochrechnung", "Synthetische kantonale Gewerbesteuerwerte mit Jahresplan, Ist und Hochrechnung."),
    ("CantonCode", "property", "Kantonscode", "Amtlicher Code eines Schweizer Kantons."),
    ("MunicipalityCode", "property", "Gemeindecode", "Amtlicher Identifikator einer politischen Gemeinde."),
    ("TaxYear", "property", "Steuerjahr", "Kalenderjahr, auf das sich eine Steuerkennzahl bezieht."),
    ("TaxableIncome", "property", "Steuerbares Einkommen", "Für die Besteuerung massgebendes aggregiertes Einkommen."),
    ("TaxpayerCount", "property", "Anzahl Steuerpflichtige", "Aggregierte Anzahl der Steuerpflichtigen."),
    ("SectorCode", "property", "Branchencode", "Klassifikation einer wirtschaftlichen Tätigkeit."),
    ("RefundAmount", "property", "Rückerstattungsbetrag", "Aggregierter Betrag einer Steuerrückerstattung."),
    ("TaxRate", "property", "Steuersatz", "Anwendbarer Steuersatz oder Steuerfuss."),
    ("LegalEntityCount", "property", "Anzahl juristische Personen", "Aggregierte Anzahl juristischer Personen."),
    ("PropertyValue", "property", "Grundstückwert", "Aggregierter steuerlich relevanter Grundstückwert."),
    ("PlannedAmount", "property", "Planbetrag", "Aggregierter synthetischer Planbetrag in CHF."),
    ("ActualAmount", "property", "Istbetrag", "Aggregierter synthetischer Istbetrag in CHF."),
    ("ForecastAmount", "property", "Hochrechnung", "Aggregierte synthetische Jahreshochrechnung in CHF."),
)


def term_uri(local_name: str) -> str:
    return f"urn:daca:ontology:tax:{local_name}"


def field(
    name: str,
    data_type: str,
    *,
    key: bool = False,
    description: str | None = None,
    term: str | None = None,
) -> dict:
    return {
        "name": name,
        "dataType": data_type,
        "nullable": False,
        "keyField": key,
        "businessDescription": description,
        "ontologyTermUri": term_uri(term) if term else None,
    }


def graph(source_id: str, title: str, owner: str, domain: str) -> dict:
    return {
        "nodes": [
            {"id": "daaif", "label": "DAAIF", "kind": "source"},
            {"id": source_id, "label": title, "kind": "product"},
            {"id": "owner", "label": owner, "kind": "owner"},
            {"id": "domain", "label": domain, "kind": "concept"},
            {"id": "rest", "label": "REST Data Service", "kind": "distribution"},
        ],
        "edges": [
            {"source": "daaif", "target": source_id, "label": "publiziert"},
            {"source": source_id, "target": "owner", "label": "verantwortet durch"},
            {"source": source_id, "target": "domain", "label": "fachlicher Kontext"},
            {"source": source_id, "target": "rest", "label": "bereitgestellt über"},
        ],
    }


def fixture_payload(
    *,
    owner_id: str,
    source_id: str,
    title: str,
    domain: str,
    maturity: str,
    class_term: str,
    schema_fields: list[dict],
) -> dict:
    owner = next(item for item in DEMO_USERS if item["id"] == owner_id)
    complete_business = maturity in {"silver", "gold"}
    graph_available = maturity in {"silver", "gold"}
    ontology_available = maturity == "gold"
    normalized_fields = []
    for item in schema_fields:
        current = dict(item)
        if not complete_business:
            current["businessDescription"] = None
        if not ontology_available:
            current["ontologyTermUri"] = None
        normalized_fields.append(current)
    return {
        "sourceSystem": "DAAIF",
        "sourceProductId": source_id,
        "ownerUserId": owner_id,
        "publicationMode": "governance_review",
        "discoverable": True,
        "technicalMetadata": {
            "serviceName": f"{source_id.replace('.', '-')}-api",
            "endpoint": {
                "baseUrl": "http://sample-data-product:8000",
                "path": f"/api/v1/daaif/{source_id}",
                "method": "GET",
            },
            "schemaFields": normalized_fields,
        },
        "businessMetadata": {
            "title": title,
            "description": (
                f"Aggregiertes synthetisches Datenprodukt zu {domain}. Es enthält keine Personendaten."
                if complete_business
                else None
            ),
            "domain": domain if complete_business else None,
            "classification": "internal" if complete_business else None,
            "keywords": [domain, "Steuern", "synthetisch"] if complete_business else [],
            "contactEmail": owner["email"] if complete_business else None,
            "updateFrequency": "quarterly" if complete_business else None,
            "productClassUri": term_uri(class_term) if ontology_available else None,
            "graph": graph(source_id, title, owner["organization"], domain) if graph_available else None,
            "dcatReviewed": complete_business,
        },
    }


FIXTURE_SPECS = (
    ("kassandra-bronze", "kassandra.valdata", "estv.direct-tax-assessments.v1", "Direkte Bundessteuer – Veranlagungsindikatoren nach Kanton und Gemeinde", "Direkte Bundessteuer", "bronze", "DirectFederalTaxAssessmentDataset", [field("cantonCode", "string", key=True, description="Kantonscode", term="CantonCode"), field("taxYear", "integer", key=True, description="Steuerjahr", term="TaxYear"), field("taxableIncome", "decimal", description="Steuerbares Einkommen", term="TaxableIncome")]),
    ("kassandra-silver", "kassandra.valdata", "estv.vat-sector-indicators.v1", "Mehrwertsteuer – Branchenindikatoren", "Mehrwertsteuer", "silver", "VatSectorIndicatorDataset", [field("sectorCode", "string", key=True, description="Branchencode", term="SectorCode"), field("taxYear", "integer", key=True, description="Steuerjahr", term="TaxYear")]),
    ("kassandra-gold", "kassandra.valdata", "estv.withholding-tax-refunds.v1", "Verrechnungssteuer – Rückerstattungsstatus nach Kanton", "Verrechnungssteuer", "gold", "WithholdingTaxRefundDataset", [field("cantonCode", "string", key=True, description="Kantonscode", term="CantonCode"), field("refundAmount", "decimal", key=True, description="Aggregierter Rückerstattungsbetrag", term="RefundAmount")]),
    ("noemie-bronze", "noemie.rochat", "ne.withholding-tax-tariffs.v1", "Quellensteuer Neuchâtel – Tarife und Gemeindecodes", "Quellensteuer", "bronze", "NeuchatelWithholdingTaxDataset", [field("municipalityCode", "string", key=True, description="Gemeindecode", term="MunicipalityCode"), field("taxRate", "decimal", key=True, description="Quellensteuersatz", term="TaxRate")]),
    ("noemie-silver", "noemie.rochat", "ne.corporate-tax-factors.v1", "Juristische Personen Neuchâtel – Steuerfaktoren", "Unternehmenssteuer", "silver", "NeuchatelCorporateTaxDataset", [field("municipalityCode", "string", key=True, description="Gemeindecode", term="MunicipalityCode"), field("legalEntityCount", "integer", description="Anzahl juristische Personen", term="LegalEntityCount")]),
    ("noemie-gold", "noemie.rochat", "ne.property-gains.v1", "Grundstückgewinnsteuer Neuchâtel – Kennzahlen", "Grundstückgewinnsteuer", "gold", "NeuchatelPropertyGainsDataset", [field("municipalityCode", "string", key=True, description="Gemeindecode", term="MunicipalityCode"), field("propertyValue", "decimal", key=True, description="Aggregierter Grundstückwert", term="PropertyValue")]),
    ("beat-bronze", "beat.stalder", "sg.municipal-tax-rates.v1", "Gemeindesteuerfüsse St. Gallen", "Gemeindesteuern", "bronze", "StGallenMunicipalTaxRateDataset", [field("municipalityCode", "string", key=True, description="Gemeindecode", term="MunicipalityCode"), field("taxRate", "decimal", key=True, description="Steuerfuss", term="TaxRate")]),
    ("beat-silver", "beat.stalder", "sg.municipal-tax-revenue.v1", "Steuererträge der St. Galler Gemeinden", "Gemeindesteuern", "silver", "StGallenMunicipalRevenueDataset", [field("municipalityCode", "string", key=True, description="Gemeindecode", term="MunicipalityCode"), field("taxYear", "integer", key=True, description="Steuerjahr", term="TaxYear")]),
    ("beat-gold", "beat.stalder", "sg.property-transfer-tax.v1", "Grundstück- und Handänderungssteuer St. Gallen", "Grundstücksteuer", "gold", "StGallenPropertyTransferDataset", [field("municipalityCode", "string", key=True, description="Gemeindecode", term="MunicipalityCode"), field("propertyValue", "decimal", key=True, description="Aggregierter Grundstückwert", term="PropertyValue")]),
)


def seed_workflow_reference_data(session: Session) -> bool:
    changed = False
    now = datetime(2026, 8, 11, 10, 0, tzinfo=UTC)
    for definition in DEMO_USERS:
        existing_user = session.get(DemoUser, definition["id"])
        if existing_user is None:
            session.add(DemoUser(**definition, active=True, created_at=now))
            changed = True
        else:
            canonical_values = {
                "display_name": definition["display_name"],
                "organization": definition["organization"],
                "email": definition["email"],
                "phone": definition["phone"],
                "avatar_url": definition["avatar_url"],
                "roles": definition["roles"],
                "supervisor_user_id": definition.get("supervisor_user_id"),
                "selectable": definition["selectable"],
            }
            for field_name, value in canonical_values.items():
                if getattr(existing_user, field_name) != value:
                    setattr(existing_user, field_name, value)
                    changed = True
    session.flush()

    for org_id, department_code, office_code, display_name, org_type, department_order, office_order in FEDERAL_ORGANIZATIONS:
        organization = session.get(AdministrativeOrganization, org_id)
        if organization is None:
            session.add(
                AdministrativeOrganization(
                    id=org_id,
                    department_code=department_code,
                    office_code=office_code,
                    display_name=display_name,
                    organization_type=org_type,
                    department_order=department_order,
                    office_order=office_order,
                    active=True,
                    created_at=now,
                )
            )
            changed = True
    session.flush()

    for identity_id, display_name, organization, email, source, source_system in DIRECTORY_ENTRIES:
        identity = session.get(IdentityDirectoryEntry, identity_id)
        if identity is None:
            session.add(
                IdentityDirectoryEntry(
                    id=identity_id,
                    display_name=display_name,
                    organization=organization,
                    organization_id=DIRECTORY_ORGANIZATION_IDS.get(identity_id),
                    email=email,
                    source=source,
                    source_system=source_system,
                    active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
            changed = True
        else:
            organization_id = DIRECTORY_ORGANIZATION_IDS.get(identity_id)
            if identity.organization != organization or identity.organization_id != organization_id:
                identity.organization = organization
                identity.organization_id = organization_id
                identity.updated_at = now
                changed = True
    session.flush()
    for group_id, label, description, source, members in DIRECTORY_GROUPS:
        organization_id = DIRECTORY_GROUP_ORGANIZATION_IDS.get(group_id)
        group = session.get(IdentityGroup, group_id)
        if group is None:
            session.add(
                IdentityGroup(
                    id=group_id,
                    label=label,
                    description=description,
                    source=source,
                    organization_id=organization_id,
                    owner_user_id=None,
                    system_managed=True,
                    membership_revision=1,
                    active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
            changed = True
        else:
            if (
                not group.system_managed
                or group.owner_user_id is not None
                or group.organization_id != organization_id
            ):
                group.system_managed = True
                group.owner_user_id = None
                group.organization_id = organization_id
                group.updated_at = now
                changed = True
        session.flush()
        for identity_id in members:
            membership = session.get(
                IdentityGroupMembership,
                {"group_id": group_id, "identity_id": identity_id},
            )
            if membership is None:
                session.add(
                    IdentityGroupMembership(
                        group_id=group_id,
                        identity_id=identity_id,
                        created_at=now,
                    )
                )
                changed = True

    for spec in ORACLE_SOURCE_SPECS:
        source_id = str(spec["id"])
        source = session.get(SourceCatalogEntry, source_id)
        values = {
            "source_type": str(spec["source_type"]),
            "database_name": str(spec["database_name"]),
            "display_name": str(spec["display_name"]),
            "description": str(spec["description"]),
            "organization": str(spec["organization"]),
            "owner_user_id": str(spec["owner_user_id"]),
            "sites": list(spec["sites"]),
            "search_objects": list(spec["search_objects"]),
            "discoverability_group_ids": list(spec["discoverability_group_ids"]),
            "mock_profile": dict(spec["mock_profile"]),
        }
        if source is None:
            session.add(
                SourceCatalogEntry(
                    id=source_id,
                    **values,
                    active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
            changed = True
        else:
            source_changed = False
            for attribute, value in values.items():
                if getattr(source, attribute) != value:
                    setattr(source, attribute, value)
                    source_changed = True
                    changed = True
            if not source.active:
                source.active = True
                source_changed = True
                changed = True
            if source_changed:
                source.updated_at = now

    version = session.get(CanonicalOntologyVersion, ONTOLOGY_VERSION_ID)
    if version is None:
        session.add(CanonicalOntologyVersion(id=ONTOLOGY_VERSION_ID, uri=ONTOLOGY_URI, version="1.0.0-poc", title="DaCa Canonical Tax Ontology · PoC", active=True, created_at=now))
        # No ORM relationship links these reference rows; make the parent
        # visible before the database checks the children's foreign keys.
        session.flush()
        changed = True

    # Reconcile terms independently from the version. New PoC concepts must be
    # backfilled into an existing persistent catalog just as reliably as they
    # are created in a fresh one.
    for local_name, kind, label, definition in TERM_DEFINITIONS:
        term_id = stable_id(f"term:{local_name}")
        term = session.get(CanonicalOntologyTerm, term_id)
        if term is None:
            term = session.scalar(
                select(CanonicalOntologyTerm).where(
                    CanonicalOntologyTerm.uri == term_uri(local_name)
                )
            )
        if term is None:
            session.add(
                CanonicalOntologyTerm(
                    id=term_id,
                    ontology_version_id=ONTOLOGY_VERSION_ID,
                    uri=term_uri(local_name),
                    kind=kind,
                    label=label,
                    definition=definition,
                )
            )
            changed = True
        elif (
            term.ontology_version_id != ONTOLOGY_VERSION_ID
            or term.kind != kind
            or term.label != label
            or term.definition != definition
        ):
            term.ontology_version_id = ONTOLOGY_VERSION_ID
            term.kind = kind
            term.label = label
            term.definition = definition
            changed = True

    for fixture_id, owner_id, source_id, title, domain, maturity, class_term, fields in FIXTURE_SPECS:
        if session.get(PocProductFixture, fixture_id) is None:
            session.add(PocProductFixture(id=fixture_id, owner_user_id=owner_id, source_product_id=source_id, title=title, maturity_level=maturity, payload=fixture_payload(owner_id=owner_id, source_id=source_id, title=title, domain=domain, maturity=maturity, class_term=class_term, schema_fields=fields), created_at=now))
            changed = True

    owner_mapping = {
        "11111111-1111-4111-8111-111111111111": "kassandra.valdata",
        "12222222-2222-4222-8222-222222222222": "kassandra.valdata",
        "13333333-3333-4333-8333-333333333333": "ariane.keller",
        "14444444-4444-4444-8444-444444444444": "noemie.rochat",
        "15555555-5555-4555-8555-555555555555": "daniel.aebischer",
        "16666666-6666-4666-8666-666666666666": "kassandra.valdata",
        "17777777-7777-4777-8777-777777777777": "noemie.rochat",
    }
    for product_id, owner_id in owner_mapping.items():
        product = session.get(DataProduct, uuid.UUID(product_id))
        if product is not None and product.owner_user_id != owner_id:
            product.owner_user_id = owner_id
            product.discoverable = True
            changed = True

    deputy_mapping = {
        "11111111-1111-4111-8111-111111111111": "joel.ruod",
        "12222222-2222-4222-8222-222222222222": "joel.ruod",
        "13333333-3333-4333-8333-333333333333": "kassandra.valdata",
        "14444444-4444-4444-8444-444444444444": "lucien.morel",
        "15555555-5555-4555-8555-555555555555": "simone.wyss",
        "16666666-6666-4666-8666-666666666666": "joel.ruod",
        "17777777-7777-4777-8777-777777777777": "lucien.morel",
    }
    for product_id, deputy_id in deputy_mapping.items():
        product = session.get(DataProduct, uuid.UUID(product_id))
        if product is not None and product.deputy_owner_user_id != deputy_id:
            product.deputy_owner_user_id = deputy_id
            changed = True

    # Repair missing or no-longer-eligible deputy assignments for imported
    # products without granting the deputy any reviewer permissions.
    for product in session.scalars(select(DataProduct).order_by(DataProduct.id)):
        owner = session.get(DemoUser, product.owner_user_id) if product.owner_user_id else None
        current_deputy = (
            session.get(DemoUser, product.deputy_owner_user_id)
            if product.deputy_owner_user_id
            else None
        )
        if not is_active_deputy(owner, current_deputy):
            previous = product.deputy_owner_user_id
            assign_default_deputy_owner(session, product)
            if product.deputy_owner_user_id != previous:
                changed = True

    # Every product has an explicit, eligible four-eyes control person. Preserve
    # an existing valid assignment; repair legacy/missing assignments
    # deterministically so repeated startup seeding remains idempotent.
    for product in session.scalars(select(DataProduct).order_by(DataProduct.id)):
        current = (
            session.get(DemoUser, product.control_person_user_id)
            if product.control_person_user_id
            else None
        )
        if (
            not is_active_publication_approver(current)
            or current is None
            or current.id == product.owner_user_id
        ):
            previous = product.control_person_user_id
            assign_default_control_person(session, product)
            if product.control_person_user_id != previous:
                changed = True

    beat_request = session.scalar(select(AccessRequest).where(AccessRequest.requester_id == "beat.stalder", AccessRequest.status == "submitted"))
    if beat_request is not None:
        task_id = stable_id(f"task:access-request:{beat_request.id}")
        if session.get(WorkflowTask, task_id) is None:
            session.add(WorkflowTask(id=task_id, task_type="access_request_review", status="open", assignee_user_id="kassandra.valdata", data_product_id=beat_request.data_product_id, access_request_id=beat_request.id, title="Zugriffsanfrage von Beat Stalder", detail="Persönlichen REST-Zugriff prüfen und eine PBAC-Policy vorbereiten.", created_at=beat_request.created_at, updated_at=beat_request.updated_at))
            changed = True

    if changed:
        session.commit()
    return changed
