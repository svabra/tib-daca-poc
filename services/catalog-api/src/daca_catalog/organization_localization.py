"""Read-only organization names for the explorer; IDs/scopes are never translated."""

from collections import defaultdict

from sqlalchemy import select

from .models import AdministrativeOrganizationLabel

LANGUAGES = ("de", "fr", "it", "en", "rm")
DEPARTMENT_CODES = {
    "bk": ("BK", "ChF", "CaF", "FCh", "ChF"),
    "eda": ("EDA", "DFAE", "DFAE", "FDFA", "DFAE"),
    "edi": ("EDI", "DFI", "DFI", "FDHA", "DFI"),
    "ejpd": ("EJPD", "DFJP", "DFGP", "FDJP", "DFGP"),
    "vbs": ("VBS", "DDPS", "DDPS", "DDPS", "DDPS"),
    "efd": ("EFD", "DFF", "DFF", "FDF", "DFF"),
    "wbf": ("WBF", "DEFR", "DEFR", "EAER", "DEFR"),
    "uvek": ("UVEK", "DETEC", "DATEC", "DETEC", "DATEC"),
}
# Official office terminology, absent from the legacy PoC office rows. Imported
# labels/short labels always take precedence. Sources: astra.admin.ch/{fr,it,en}.
ASTRA_NAMES = (
    ("ASTRA", "Bundesamt für Strassen"),
    ("OFROU", "Office fédéral des routes"),
    ("USTRA", "Ufficio federale delle strade"),
    ("FEDRO", "Federal Roads Office"),
    ("UVIAS", "Uffizi federal da vias"),
)
CONTEXT_NAMES = {
    "context:cantons": ("Kantone", "Cantons", "Cantoni", "Cantons", "Chantuns"),
    "context:banks": ("Kantonalbanken", "Banques cantonales", "Banche cantonali", "Cantonal banks", "Bancas chantunalas"),
    "context:public": ("Weitere", "Autres organisations", "Altre organizzazioni", "Other organizations", "Autras organisaziuns"),
    "vbs-verteidigung": ("Verteidigung", "Défense", "Difesa", "Defence", "Defensiun"),
    "wbf-eth": ("ETH-Bereich", "Domaine des EPF", "Settore dei PF", "ETH Domain", "Sectur da las SPF"),
}


def localize_organization_nodes(session, nodes):
    labels = defaultdict(dict)
    for row in session.scalars(select(AdministrativeOrganizationLabel).where(
        AdministrativeOrganizationLabel.organization_id.in_(list(nodes)),
        AdministrativeOrganizationLabel.language.in_(LANGUAGES),
    )):
        labels[row.organization_id][row.language] = row
    for identity, node in nodes.items():
        localized = {}
        for index, language in enumerate(LANGUAGES):
            stored = labels[identity].get(language)
            code = DEPARTMENT_CODES.get(identity, (node["code"],) * len(LANGUAGES))[index]
            fallback_label = node["label"] if language == "de" else code
            if identity == "uvek-astra":
                code, fallback_label = ASTRA_NAMES[index]
            elif identity in CONTEXT_NAMES:
                code = fallback_label = CONTEXT_NAMES[identity][index]
            elif node["code"].startswith("GS-") and identity.split("-")[0] in DEPARTMENT_CODES:
                code = ("GS" if language in {"de", "en"} else "SG") + "-" + DEPARTMENT_CODES[identity.split("-")[0]][index]
                fallback_label = ("Generalsekretariat", "Secrétariat général", "Segreteria generale", "General Secretariat", "Secretariat general")[index]
            elif not node["registry"]:
                # Free directory names are proper names, not UI copy.
                fallback_label = node["label"]
                if node["kind"] == "cantonal":
                    name = ("St. Gallen", "Saint-Gall", "San Gallo", "St. Gallen", "Son Gagl")[index] if node["code"] == "St. Gallen" else node["code"]
                    code = name
                    fallback_label = ("Kanton", "Canton de", "Cantone di", "Canton of", "Chantun")[index] + " " + name
                elif node["code"] == "SBB":
                    code = ("SBB", "CFF", "FFS", "SBB", "VFF")[index]
                    fallback_label = code
                elif node["code"] == "Post":
                    code = ("Post", "La Poste", "La Posta", "Swiss Post", "La Posta")[index]
                    fallback_label = code
            label = stored.label if stored else fallback_label
            code = stored.short_label if stored and stored.short_label else code
            # No German descriptions are injected into another UI language when
            # the registry lacks a translation: use its short code instead.
            description = label
            if node["kind"] == "group":
                description = (
                    "Kontextgruppe; Einträge stammen aus dem Katalogverzeichnis. Keine Aussage über Beteiligungsquoten.",
                    "Groupe de contexte issu du répertoire du catalogue, sans indication des taux de participation.",
                    "Gruppo di contesto del catalogo, senza indicazione delle quote di partecipazione.",
                    "Context group from the catalog directory; no assertion about ownership percentages.",
                    "Gruppa da context dal register dal catalog; nagina indicaziun davart las quotas da participaziun.",
                )[index]
            localized[language] = {"label": label, "code": code, "description": description}
        node["localizations"] = localized
