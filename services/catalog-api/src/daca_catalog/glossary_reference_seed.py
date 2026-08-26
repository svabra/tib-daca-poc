from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .domain_glossary_seed import (
    ARMOURED_VEHICLE_PROPOSAL_ID,
    ORIGIN_CATALOG_ID,
    POC_NAMESPACE,
    canonical_hash,
)
from .models import (
    AuditEvent,
    DataProduct,
    DataProductGlossaryTerm,
    Domain,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermProposal,
    GlossaryTermProposalReview,
    GlossaryTermRelation,
    SeedMarker,
    WorkflowTask,
    utc_now,
)

GLOSSARY_REFERENCE_SEED_NAME = "domain-glossary-reference-v4"
PREVIOUS_GLOSSARY_REFERENCE_SEED_NAME = "domain-glossary-reference-v2"
INTERMEDIATE_GLOSSARY_REFERENCE_SEED_NAME = "domain-glossary-reference-v3"


@dataclass(frozen=True)
class LocalizationSpec:
    language: str
    preferred_label: str
    alternative_labels: tuple[str, ...]
    definition: str


@dataclass(frozen=True)
class ReferenceTermSpec:
    slug: str
    domain_slugs: tuple[str, ...]
    localizations: tuple[LocalizationSpec, ...]
    relations: tuple[tuple[str, str], ...] = ()
    source_urls: tuple[str, ...] = ()


def _loc(
    language: str,
    preferred_label: str,
    definition: str,
    *alternative_labels: str,
) -> LocalizationSpec:
    return LocalizationSpec(language, preferred_label, alternative_labels, definition)


ESTV_VAT_URL = "https://www.estv.admin.ch/de/mehrwertsteuer"
ESTV_VAT_EN_URL = "https://www.estv.admin.ch/en/value-added-tax"
ESTV_VAT_PRINCIPLES_URL = (
    "https://www.estv.admin.ch/dam/estv/de/dokumente/estv/steuersystem/"
    "dossier-steuerinformationen/d/d-grundsaetze-der-mehrwertsteuer.pdf.download.pdf/"
    "d-grundsaetze-der-mehrwertsteuer.pdf"
)
ESTV_ACQUISITION_TAX_URL = "https://www.estv.admin.ch/de/steuerpflicht-bezugsteuer-mwst"
ESTV_FLAT_RATES_URL = "https://www.estv.admin.ch/de/mwst-saldosteuersaetze-pauschalsteuersaetze"
ESTV_UID_URL = "https://www.estv.admin.ch/de/unternehmens-identifikationsnummer-uid"
ESTV_DIRECT_TAX_URL = "https://www.estv.admin.ch/de/direkte-bundessteuer"
ESTV_SOURCE_TAX_URL = "https://www.estv.admin.ch/de/quellensteuer"
ESTV_WITHHOLDING_TAX_URL = "https://www.estv.admin.ch/de/verrechnungssteuer"
VBS_GROUND_FORCES_URL = (
    "https://www.vtg.admin.ch/dam/de/sd-web/dVxswQ0daFuH/81_239_d_Zukunft-der_Bodentruppen.pdf"
)
VBS_ARMOURED_FLEET_URL = "https://www.vtg.admin.ch/de/newnsb/XCu589fKRx85Epe9CsV-K"
VBS_RADSPZ_URL = (
    "https://www.vtg.admin.ch/dam/de/sd-web/k11Rq7tJvelk/80_244_stratos_Sonderausgabe-24.pdf"
)
VBS_RADSPZ_PROCUREMENT_URL = "https://www.newsd.admin.ch/newsd/message/attachments/19745.pdf"
VBS_FORCE_DESIGN_URL = (
    "https://www.vtg.admin.ch/dam/de/sd-web/xNhWConnUpOb/81_325_e_Konzeption_Zukunft_der_Armee.pdf"
)
VBS_IFV_2000_URL = "https://www.vtg.admin.ch/en/newnsb/NaRBQLIFNVg_Qa2RoBd4A"
VBS_ARMAMENT_2025_URL = "https://www.vtg.admin.ch/de/ruestungsprogramm-2025"
VBS_PROCUREMENT_URL = "https://www.vtg.admin.ch/de/wie-werden-neue-systeme-fuer-die-armee-beschafft"
ARMASUISSE_ENGINEER_TANK_URL = "https://www.ar.admin.ch/de/beschaffung-pionierpanzer"
ARMASUISSE_TASYS_URL = (
    "https://www.ar.admin.ch/dam/en/sd-web/7IJ1AjNIkIcn/armafolio_2019-01_barrierefrei.pdf"
)
ARMASUISSE_IPLIS_URL = "https://www.ar.admin.ch/en/iplis-funkintegrationstest-en"
NATO_C2_URL = (
    "https://www.nato.int/en/what-we-do/deterrence-and-defence/multinational-capability-cooperation"
)
NATO_AAP06_EXPORT_URL = "https://oos-data.army.cz/aap6/AAP-06_260114_AF.pdf"
NATO_AAP15_URL = (
    "https://archives.nato.int/nato-glossary-of-abbreviations-used-in-nato-documents-and-publications"
    "?sf_culture=en"
)
VBS_GBAD_URL = "https://www.vtg.admin.ch/en/nsb?id=105630"
NATO_GBAD_URL = (
    "https://www.nato.int/nato_static_fl2014/assets/pdf/2021/2/pdf/2102-factsheet-m-gbad.pdf"
)
VBS_GBAD_MR_URL = "https://www.vtg.admin.ch/en/newnsb/ZjsNYPpgoETj"
NATO_IAMD_URL = (
    "https://www.nato.int/en/what-we-do/deterrence-and-defence/"
    "nato-integrated-air-and-missile-defence"
)
NATO_IAMD_POLICY_URL = (
    "https://www.nato.int/en/about-us/official-texts-and-resources/official-texts/"
    "2025/02/13/nato-integrated-air-and-missile-defence-policy"
)
ARMASUISSE_ADS15_URL = "https://www.ar.admin.ch/en/systems-engineering"
ITU_VHF_URL = (
    "https://www.itu.int/net/ITU-R/asp/terminology-definition.asp?lang=en&rlink="
    "%7BF41BA235-2F36-40B7-A5C0-C53623263CBF%7D"
)


# Definitions are concise, source-faithful paraphrases. Source URLs deliberately remain part of
# the curated seed specification even though v0.1 stores concept provenance in documentation,
# not in the public glossary schema.
REFERENCE_TERM_SPECS: tuple[ReferenceTermSpec, ...] = (
    ReferenceTermSpec(
        "mehrwertsteuer",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Mehrwertsteuer",
                "Allgemeine Verbrauchs- und Konsumsteuer des Bundes, die bei Unternehmen erhoben und auf Konsumierende überwälzt wird.",
                "MWST",
            ),
            _loc(
                "en",
                "Value Added Tax",
                "Federal tax on general consumption, collected from businesses and passed on to consumers.",
                "VAT",
            ),
        ),
        source_urls=(ESTV_VAT_URL, ESTV_VAT_EN_URL),
    ),
    ReferenceTermSpec(
        "inlandsteuer",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Inlandsteuer",
                "Teil der Mehrwertsteuer auf Leistungen, die steuerpflichtige Personen im Inland gegen Entgelt erbringen.",
            ),
            _loc(
                "en",
                "Domestic tax",
                "Part of Swiss VAT charged on supplies made for consideration by taxable persons in Switzerland.",
            ),
        ),
        relations=(("broader", "mehrwertsteuer"),),
        source_urls=(ESTV_VAT_PRINCIPLES_URL,),
    ),
    ReferenceTermSpec(
        "bezugsteuer",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Bezugsteuer",
                "Mehrwertsteuer, die Empfänger im Inland für bestimmte Leistungen ausländischer Unternehmen und bestimmte Rechte selbst deklarieren müssen.",
            ),
            _loc(
                "en",
                "Acquisition tax",
                "VAT that Swiss recipients must self-declare for specified supplies by foreign businesses and for specified rights.",
            ),
        ),
        relations=(("broader", "mehrwertsteuer"),),
        source_urls=(ESTV_ACQUISITION_TAX_URL,),
    ),
    ReferenceTermSpec(
        "einfuhrsteuer",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Einfuhrsteuer",
                "Teil der Mehrwertsteuer, der auf der Einfuhr von Gegenständen erhoben wird.",
            ),
            _loc(
                "en",
                "Import tax",
                "Part of Swiss VAT levied when goods are imported.",
            ),
        ),
        relations=(("broader", "mehrwertsteuer"),),
        source_urls=(ESTV_VAT_PRINCIPLES_URL,),
    ),
    ReferenceTermSpec(
        "vorsteuer",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Vorsteuer",
                "Mehrwertsteuer, die einem steuerpflichtigen Unternehmen auf bezogenen Leistungen belastet wird oder als Bezugs- beziehungsweise Einfuhrsteuer anfällt.",
            ),
            _loc(
                "en",
                "Input tax",
                "VAT charged to a taxable business on acquired supplies or incurred as acquisition or import tax.",
            ),
        ),
        relations=(("related", "mehrwertsteuer"), ("related", "vorsteuerabzug")),
        source_urls=(ESTV_VAT_PRINCIPLES_URL,),
    ),
    ReferenceTermSpec(
        "vorsteuerabzug",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Vorsteuerabzug",
                "Mechanismus, mit dem eine steuerpflichtige Person anrechenbare Vorsteuer von ihrer Steuerforderung abziehen kann.",
                "Abzug der Vorsteuer",
            ),
            _loc(
                "en",
                "Input tax deduction",
                "Mechanism allowing a taxable person to deduct eligible input tax from the tax amount due.",
            ),
        ),
        relations=(("related", "effektive-abrechnungsmethode"),),
        source_urls=(ESTV_VAT_PRINCIPLES_URL,),
    ),
    ReferenceTermSpec(
        "effektive-abrechnungsmethode",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Effektive Abrechnungsmethode",
                "Reguläre Mehrwertsteuer-Methode, bei der sich die Steuerforderung aus den geschuldeten Steuerarten abzüglich des Vorsteuerguthabens ergibt.",
                "Effektive Methode",
            ),
            _loc(
                "en",
                "Effective reporting method",
                "Standard VAT method in which eligible input tax is deducted from the taxes due.",
            ),
        ),
        relations=(
            ("related", "saldosteuersatzmethode"),
            ("related", "pauschalsteuersatzmethode"),
        ),
        source_urls=(ESTV_VAT_PRINCIPLES_URL,),
    ),
    ReferenceTermSpec(
        "saldosteuersatz",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Saldosteuersatz",
                "Von der ESTV bewilligter Branchensatz, der die branchenübliche Vorsteuer berücksichtigt und mit dem Bruttoumsatz multipliziert wird.",
                "Saldosteuersätze",
                "SSS",
            ),
            _loc(
                "en",
                "Net tax rate",
                "Sector rate approved by the FTA that accounts for customary input tax and is applied to gross turnover.",
                "NTR",
            ),
        ),
        relations=(("related", "saldosteuersatzmethode"),),
        source_urls=(ESTV_FLAT_RATES_URL,),
    ),
    ReferenceTermSpec(
        "saldosteuersatzmethode",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Saldosteuersatzmethode",
                "Vereinfachte Mehrwertsteuer-Abrechnung für berechtigte steuerpflichtige Personen anhand bewilligter Saldosteuersätze, ohne separate Ermittlung der Vorsteuer.",
                "SSS-Methode",
            ),
            _loc(
                "en",
                "Net tax rate method",
                "Simplified VAT reporting method using approved net tax rates without separately calculating input tax.",
            ),
        ),
        source_urls=(ESTV_FLAT_RATES_URL,),
    ),
    ReferenceTermSpec(
        "pauschalsteuersatz",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Pauschalsteuersatz",
                "Branchensatz, der die Vorsteuer pauschal berücksichtigt und auf den Bruttoumsatz angewendet wird.",
                "Pauschalsteuersätze",
                "PSS",
            ),
            _loc(
                "en",
                "Flat tax rate",
                "Sector rate that accounts for input tax on a flat-rate basis and is applied to gross turnover.",
            ),
        ),
        relations=(("related", "pauschalsteuersatzmethode"),),
        source_urls=(ESTV_FLAT_RATES_URL,),
    ),
    ReferenceTermSpec(
        "pauschalsteuersatzmethode",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Pauschalsteuersatzmethode",
                "Vereinfachte Mehrwertsteuer-Abrechnung insbesondere für Gemeinwesen, verwandte Einrichtungen, Vereine und Stiftungen.",
                "PSS-Methode",
            ),
            _loc(
                "en",
                "Flat tax rate method",
                "Simplified VAT reporting method intended especially for public bodies, related institutions, associations and foundations.",
            ),
        ),
        source_urls=(ESTV_FLAT_RATES_URL,),
    ),
    ReferenceTermSpec(
        "steuerperiode",
        ("mehrwertsteuer", "direkte-bundessteuer"),
        (
            _loc(
                "de",
                "Steuerperiode",
                "Zeitraum, über den die Steuer erhoben wird; bei der Mehrwertsteuer grundsätzlich das Kalenderjahr.",
            ),
            _loc(
                "en",
                "Tax period",
                "Period for which tax is levied; for VAT this is generally the calendar year.",
            ),
        ),
        relations=(("related", "abrechnungsperiode"),),
        source_urls=(ESTV_VAT_PRINCIPLES_URL,),
    ),
    ReferenceTermSpec(
        "abrechnungsperiode",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Abrechnungsperiode",
                "Zeitraum, für den eine steuerpflichtige Person mit der ESTV über die Mehrwertsteuer abrechnet; seine Dauer hängt von der Abrechnungsmethode ab.",
                "Abrechnungszeitraum",
            ),
            _loc(
                "en",
                "Reporting period",
                "Period for which a taxable person reports VAT to the FTA; its duration depends on the reporting method.",
            ),
        ),
        source_urls=(ESTV_VAT_PRINCIPLES_URL,),
    ),
    ReferenceTermSpec(
        "unternehmens-identifikationsnummer",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "Unternehmens-Identifikationsnummer",
                "Eindeutige Identifikationsnummer eines Schweizer Unternehmens mit dem Präfix CHE.",
                "Unternehmens-ID",
                "UID",
            ),
            _loc(
                "en",
                "Enterprise Identification Number",
                "Unique identification number for a Swiss enterprise, prefixed with CHE.",
                "UID",
            ),
        ),
        relations=(("related", "mwst-nummer"),),
        source_urls=(ESTV_UID_URL,),
    ),
    ReferenceTermSpec(
        "mwst-nummer",
        ("mehrwertsteuer",),
        (
            _loc(
                "de",
                "MWST-Nummer",
                "Unternehmens-Identifikationsnummer mit dem Zusatz MWST, beispielsweise CHE-123.456.789 MWST.",
                "Mehrwertsteuernummer",
                "MWST-Nr.",
            ),
            _loc(
                "en",
                "VAT number",
                "Enterprise Identification Number supplemented by VAT, for example CHE-123.456.789 VAT.",
            ),
        ),
        source_urls=(ESTV_UID_URL,),
    ),
    ReferenceTermSpec(
        "direkte-bundessteuer",
        ("direkte-bundessteuer",),
        (
            _loc(
                "de",
                "Direkte Bundessteuer",
                "Steuer des Bundes auf dem Einkommen natürlicher Personen und dem Gewinn juristischer Personen; Veranlagung und Bezug erfolgen durch die Kantone unter Bundesaufsicht.",
                "DBST",
                "dBSt",
            ),
            _loc(
                "en",
                "Direct Federal Tax",
                "Federal tax on the income of individuals and profit of legal entities, assessed and collected by the cantons under federal supervision.",
                "DFT",
            ),
        ),
        relations=(("related", "quellensteuer"), ("related", "verrechnungssteuer")),
        source_urls=(ESTV_DIRECT_TAX_URL,),
    ),
    ReferenceTermSpec(
        "quellensteuer",
        ("quellensteuer",),
        (
            _loc(
                "de",
                "Quellensteuer",
                "Direkt vom Einkommen bestimmter Arbeitnehmender abgezogene Steuer, die der Arbeitgeber an die kantonale Steuerverwaltung überweist.",
                "QST",
            ),
            _loc(
                "en",
                "Tax at source",
                "Tax deducted directly from the income of specified employees and remitted by the employer to the cantonal tax authority.",
            ),
        ),
        source_urls=(ESTV_SOURCE_TAX_URL,),
    ),
    ReferenceTermSpec(
        "verrechnungssteuer",
        ("verrechnungssteuer",),
        (
            _loc(
                "de",
                "Verrechnungssteuer",
                "Sicherungssteuer des Bundes insbesondere auf Erträgen beweglichen Kapitalvermögens, Geldspielgewinnen und bestimmten Versicherungsleistungen; sie ist unter Voraussetzungen rückerstattbar.",
                "VST",
                "VSt",
            ),
            _loc(
                "en",
                "Anticipatory Tax",
                "Refundable federal safeguarding tax levied especially on income from movable capital, gambling winnings and specified insurance benefits.",
                "Swiss Withholding Tax",
                "AT",
            ),
        ),
        source_urls=(ESTV_WITHHOLDING_TAX_URL,),
    ),
    ReferenceTermSpec(
        "gepanzertes-fahrzeug",
        ("verteidigung", "mobilitaet-logistik"),
        (
            _loc(
                "de",
                "Gepanzertes Fahrzeug",
                "Militärisches Fahrzeug, dessen Besatzung oder Nutzlast durch Panzerung geschützt wird und das geschützte Mobilität bereitstellt.",
                "GepFz",
                "Panzerfahrzeug",
            ),
            _loc(
                "en",
                "Armoured vehicle",
                "Military vehicle whose crew or payload is protected by armour and that provides protected mobility.",
                "Armored vehicle",
            ),
        ),
        source_urls=(VBS_GROUND_FORCES_URL,),
    ),
    ReferenceTermSpec(
        "geschuetztes-mannschaftstransportfahrzeug",
        ("verteidigung", "mobilitaet-logistik"),
        (
            _loc(
                "de",
                "Geschütztes Mannschaftstransportfahrzeug",
                "Geschütztes DURO-IIIP-6×6-Fahrzeug der Schweizer Armee für Mannschaftstransporte; es stellt Schutz, Mobilität und Führungsfähigkeit bereit.",
                "GMTF",
            ),
            _loc(
                "en",
                "Protected personnel transport vehicle",
                "Swiss DURO IIIP 6×6 protected personnel transport vehicle providing protected transport, mobility and command capability.",
            ),
        ),
        relations=(("broader", "gepanzertes-fahrzeug"),),
        source_urls=(VBS_GROUND_FORCES_URL, VBS_ARMOURED_FLEET_URL),
    ),
    ReferenceTermSpec(
        "radschuetzenpanzer-93",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Radschützenpanzer 93",
                "Radgestützter gepanzerter Mannschaftstransporter PIRANHA II 8×8 der Schweizer Armee, bezeichnet als Radschützenpanzer 93.",
                "Rad Spz 93",
                "Radspz 93",
                "PIRANHA II 8×8",
            ),
            _loc(
                "en",
                "Piranha armoured personnel carrier 93",
                "Swiss PIRANHA II 8×8 armoured personnel carrier, designated Piranha armoured personnel carrier 93 by the Swiss Armed Forces.",
                "Piranha APC 93",
                "APC 93",
                "PIRANHA II 8×8",
            ),
        ),
        relations=(
            ("broader", "gepanzertes-fahrzeug"),
            ("related", "geschuetztes-mannschaftstransportfahrzeug"),
        ),
        source_urls=(
            VBS_GROUND_FORCES_URL,
            VBS_RADSPZ_URL,
            VBS_RADSPZ_PROCUREMENT_URL,
            VBS_FORCE_DESIGN_URL,
        ),
    ),
    ReferenceTermSpec(
        "schuetzenpanzer",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Schützenpanzer",
                "Gepanzertes Kampffahrzeug, dessen Hauptaufgabe darin besteht, Infanterie zu transportieren und sie im Kampf zu unterstützen.",
                "Spz",
            ),
            _loc(
                "en",
                "Infantry fighting vehicle",
                "Armoured fighting vehicle whose main role is to transport infantry and support it in battle.",
                "IFV",
                "AIFV",
            ),
        ),
        relations=(("broader", "gepanzertes-fahrzeug"),),
        source_urls=(VBS_GROUND_FORCES_URL, NATO_AAP15_URL),
    ),
    ReferenceTermSpec(
        "schuetzenpanzer-2000",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Schützenpanzer 2000",
                "Schweizer CV90 mit 30-mm-Kanone für Transport und Unterstützung der Panzergrenadiere im abgesessenen Kampf.",
                "Spz 2000",
                "CV90",
            ),
            _loc(
                "en",
                "Armoured combat vehicle 2000 (CV 9030)",
                "Swiss CV 9030 armoured combat vehicle, fitted with a 30 mm cannon to transport and support mechanised infantry in dismounted combat.",
                "IFV 2000",
            ),
        ),
        relations=(("broader", "schuetzenpanzer"),),
        source_urls=(VBS_IFV_2000_URL, VBS_GROUND_FORCES_URL),
    ),
    ReferenceTermSpec(
        "kampfpanzer",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Kampfpanzer",
                "Schweres gepanzertes Kampffahrzeug der mechanisierten Kräfte, das direkte Feuerwirkung, Schutz und Geländemobilität verbindet.",
                "KPz",
            ),
            _loc(
                "en",
                "Main battle tank",
                "Heavy armoured combat vehicle of mechanised forces combining direct-fire capability, protection and cross-country mobility.",
                "MBT",
            ),
        ),
        relations=(("broader", "gepanzertes-fahrzeug"),),
        source_urls=(VBS_GROUND_FORCES_URL, NATO_AAP15_URL),
    ),
    ReferenceTermSpec(
        "panzer-87-leopard-2-we",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Panzer 87 Leopard 2 WE",
                "Schweizer Leopard-2-A4-Kampfpanzer, 1987 eingeführt und im Rahmen des Rüstungsprogramms 2006 werterhalten.",
                "Pz Leo 2 WE",
                "Leopard 2 A4 WE",
            ),
            _loc(
                "en",
                "87 Leopard 2 A4 WE tank",
                "Swiss Leopard 2 A4 main battle tank introduced in 1987 and modernised under the 2006 Armament Programme.",
                "Leopard 2 A4 WE",
            ),
        ),
        relations=(("broader", "kampfpanzer"), ("related", "bergepanzer-01")),
        source_urls=(VBS_PROCUREMENT_URL, VBS_ARMAMENT_2025_URL),
    ),
    ReferenceTermSpec(
        "bergepanzer",
        ("verteidigung", "mobilitaet-logistik"),
        (
            _loc(
                "de",
                "Bergepanzer",
                "Gepanzertes Unterstützungsfahrzeug zum Bergen und Abschleppen ausgefallener Kampfpanzer und Unterstützungsfahrzeuge unter Schutz.",
            ),
            _loc(
                "en",
                "Armoured recovery vehicle",
                "Armoured support vehicle used to recover and tow disabled main battle tanks and support vehicles while keeping the recovery crew protected.",
                "ARV",
            ),
        ),
        relations=(("broader", "gepanzertes-fahrzeug"),),
        source_urls=(VBS_ARMAMENT_2025_URL, NATO_AAP15_URL),
    ),
    ReferenceTermSpec(
        "bergepanzer-01",
        ("verteidigung", "mobilitaet-logistik"),
        (
            _loc(
                "de",
                "Bergepanzer 01",
                "Seit 2006 eingesetzter Bergepanzer der Schweizer Armee, mit dem Bergungsmannschaften Fahrzeuge unter Schutz abschleppen können.",
                "Bgep 01",
            ),
            _loc(
                "en",
                "Armoured recovery vehicle 01",
                "Swiss armoured recovery vehicle in service since 2006, enabling recovery crews to tow vehicles while remaining protected.",
            ),
        ),
        relations=(("broader", "bergepanzer"),),
        source_urls=(VBS_ARMAMENT_2025_URL,),
    ),
    ReferenceTermSpec(
        "panzerhaubitze",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Panzerhaubitze",
                "Gepanzertes, selbstfahrendes Rohrartilleriesystem für indirektes Feuer.",
            ),
            _loc(
                "en",
                "Self-propelled howitzer",
                "Armoured self-propelled tube-artillery system for indirect fire.",
            ),
        ),
        relations=(("related", "tasys"),),
        source_urls=(VBS_ARMAMENT_2025_URL,),
    ),
    ReferenceTermSpec(
        "panzerhaubitze-m109-kawest",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Panzerhaubitze M 109 KAWEST",
                "Seit mehr als fünfzig Jahren eingesetztes 15,5-cm-Hauptsystem der Schweizer Artillerie zur indirekten Feuerunterstützung.",
                "M109 KAWEST",
                "M-109",
            ),
            _loc(
                "en",
                "M109 KAWEST self-propelled howitzer",
                "Swiss artillery’s 15.5 cm principal system for indirect fire support, in service for more than fifty years.",
                "M109 KAWEST",
            ),
        ),
        relations=(("broader", "panzerhaubitze"), ("related", "iplis")),
        source_urls=(VBS_ARMAMENT_2025_URL, VBS_PROCUREMENT_URL),
    ),
    ReferenceTermSpec(
        "pionierpanzer-21",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Pionierpanzer 21",
                "PIRANHA-IV-basiertes System für Panzersappeurformationen mit Mini-Drohne, Bewaffnung sowie Greifarm, Minenräumschild und Räumschild.",
                "Pi Pz 21",
            ),
            _loc(
                "en",
                "Military engineering vehicle 21",
                "PIRANHA IV-based military engineering vehicle for armoured engineer formations, with a mini-drone, armament, grab arm, mine-clearing blade and dozer blade.",
            ),
        ),
        relations=(("broader", "gepanzertes-fahrzeug"),),
        source_urls=(ARMASUISSE_ENGINEER_TANK_URL,),
    ),
    ReferenceTermSpec(
        "tasys",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Taktisches Aufklärungssystem",
                "Taktisches Aufklärungssystem der Schweizer Armee, das Gelände- und Zielinformationen erfasst und der Truppe rasch bereitstellt.",
                "TASYS",
                "Tasys",
            ),
            _loc(
                "en",
                "Tactical Reconnaissance System",
                "Swiss Tactical Reconnaissance System that collects terrain and target information and rapidly provides it to troops.",
                "TASYS",
            ),
        ),
        relations=(("related", "iplis"), ("related", "ads-15")),
        source_urls=(ARMASUISSE_TASYS_URL,),
    ),
    ReferenceTermSpec(
        "iplis",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Integriertes Planungs- und Lageverfolgungs-Informationssystem",
                "Übergeordnetes System, das bestehende Führungs- und Informationssysteme integriert und Planung, Lageverfolgung sowie Führung über Wirkungsräume, Fachdomänen und Führungsstufen digital unterstützt und vereinfacht.",
                "IPLIS",
            ),
            _loc(
                "en",
                "Integrated Planning and Situation Monitoring Information System",
                "Overarching system integrating existing command-and-control systems to digitally support and simplify planning, situation monitoring and command across operational domains and command levels.",
                "IPLIS",
            ),
        ),
        relations=(("broader", "command-and-control"), ("related", "vhf")),
        source_urls=(ARMASUISSE_IPLIS_URL,),
    ),
    ReferenceTermSpec(
        "command-and-control",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Führung und Kontrolle",
                "Befugnis, Verantwortlichkeiten und Tätigkeiten, mit denen militärische Kommandanten Streitkräfte führen und koordinieren sowie Befehle zur Durchführung von Operationen umsetzen.",
                "C2",
            ),
            _loc(
                "en",
                "Command and control",
                "Authority, responsibilities and activities through which military commanders direct and coordinate military forces and implement orders for the execution of operations.",
                "C2",
            ),
        ),
        source_urls=(NATO_AAP06_EXPORT_URL, NATO_C2_URL),
    ),
    ReferenceTermSpec(
        "bodluv",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Bodengestützte Luftverteidigung",
                "Bodengebundene Luftverteidigungsfähigkeit zur Bekämpfung von Luftbedrohungen; in einem mehrschichtigen Verbund ergänzen sich Systeme unterschiedlicher Reichweiten und Höhenabdeckungen.",
                "Bodluv",
                "BODLUV",
            ),
            _loc(
                "en",
                "Ground-based air defence",
                "Ground-based air-defence capability for countering air threats; in a layered architecture, systems with complementary ranges and altitude coverage work together.",
                "GBAD",
            ),
        ),
        relations=(("related", "nato-iamd"),),
        source_urls=(VBS_GBAD_URL, NATO_GBAD_URL),
    ),
    ReferenceTermSpec(
        "bodluv-mr",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Bodengestützte Luftverteidigung mittlerer Reichweite",
                "Schweizer, auf IRIS-T SLM basierende bodengestützte Luftverteidigungsfähigkeit mittlerer Reichweite. Als Teil der integrierten Luftverteidigung bekämpft sie insbesondere Kampfflugzeuge, Drohnen und Marschflugkörper auf unterschiedlichen Distanzen und Flughöhen.",
                "Bodluv MR",
                "BODLUV MR",
            ),
            _loc(
                "en",
                "Medium-range ground-based air defence",
                "Swiss IRIS-T SLM-based medium-range ground-based air-defence capability. As part of integrated air defence, it counters in particular combat aircraft, drones and cruise missiles at different ranges and altitudes.",
                "GBAD MR",
            ),
        ),
        relations=(("broader", "bodluv"),),
        source_urls=(VBS_GBAD_MR_URL,),
    ),
    ReferenceTermSpec(
        "nato-iamd",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Integrierte Luft- und Raketenabwehr der NATO",
                "Fortlaufende NATO-Mission in Frieden, Krise und Konflikt, die Bündnisgebiet, Bevölkerung und Streitkräfte mit einem 360-Grad-Ansatz vor Luft- und Flugkörperbedrohungen oder -angriffen schützt.",
                "NATO IAMD",
                "IAMD",
            ),
            _loc(
                "en",
                "NATO Integrated Air and Missile Defence",
                "Continuous NATO mission in peace, crisis and conflict that uses a 360-degree approach to protect Alliance territory, populations and forces from air and missile threats or attacks.",
                "NATO IAMD",
                "IAMD",
            ),
        ),
        source_urls=(NATO_IAMD_URL, NATO_IAMD_POLICY_URL, VBS_GROUND_FORCES_URL),
    ),
    ReferenceTermSpec(
        "ads-15",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Aufklärungsdrohnensystem 15",
                "Unbemanntes und unbewaffnetes Aufklärungssystem für Lage- und Zielaufklärung; es überwacht grosse Räume, sucht und verfolgt Ziele und trägt bei Tag und Nacht zum Lagebild bei.",
                "ADS 15",
            ),
            _loc(
                "en",
                "Reconnaissance drone system 15",
                "Uncrewed and unarmed reconnaissance system for situation and target reconnaissance; it monitors large areas, searches for and tracks targets and contributes to situational awareness by day and night.",
                "ADS 15",
            ),
        ),
        relations=(("related", "command-and-control"),),
        source_urls=(ARMASUISSE_ADS15_URL,),
    ),
    ReferenceTermSpec(
        "vhf",
        ("verteidigung",),
        (
            _loc(
                "de",
                "Ultrakurzwelle",
                "Frequenzband 8 von 30 bis 300 MHz; die Schweizer Armee nutzt VHF-Funkgeräte insbesondere für Kommunikation über kurze Distanzen.",
                "VHF",
            ),
            _loc(
                "en",
                "Very High Frequency",
                "Frequency band 8 from 30 to 300 MHz; the Swiss Armed Forces use VHF transceivers particularly for short-range communication.",
                "VHF",
            ),
        ),
        source_urls=(ITU_VHF_URL, ARMASUISSE_IPLIS_URL, NATO_AAP15_URL),
    ),
)

# Immutable v3 shape of the one concept corrected in v4. Keeping the previous
# payload explicit lets the additive seed authenticate an untouched deployed
# term before applying the current NATO-agreed AAP-06 wording.
_V3_COMMAND_AND_CONTROL_SPEC = ReferenceTermSpec(
    "command-and-control",
    ("verteidigung",),
    (
        _loc(
            "de",
            "Führung und Kontrolle",
            "Führung und Weisung, die einer militärischen Organisation erteilt werden, damit sie ihren Auftrag erfüllt.",
            "C2",
        ),
        _loc(
            "en",
            "Command and control",
            "Leadership and direction given to a military organisation in order to accomplish its mission.",
            "C2",
        ),
    ),
    source_urls=(NATO_C2_URL,),
)


def reference_term_id(slug: str) -> uuid.UUID:
    return uuid.uuid5(POC_NAMESPACE, f"glossary-term:reference:{slug}")


def _domain_id(slug: str) -> uuid.UUID:
    return uuid.uuid5(POC_NAMESPACE, f"domain:{slug}")


def _normalized_label(label: str) -> str:
    return " ".join(label.casefold().split())


# Immutable fingerprints written by ``domain-glossary-reference-v2``.  That
# release hashed the raw payload, including array order, while the persisted
# rows do not retain an order for domains or relations.  Keep the deployed
# fingerprints explicit: deriving them from the current specifications would
# make a later specification change look like a governed edit.
_PREVIOUS_REFERENCE_CONTENT_HASHES: dict[str, str] = {
    "mehrwertsteuer": "418c1e7cd804f30347e82c6905b4804eec577ce4310352915f5b8963ab813660",
    "inlandsteuer": "708701f68446700f2f88e95ccb86dc483c4b23aad56541df8a5d563683894de3",
    "bezugsteuer": "c6e702bef3f540d1949530a757e35465b4c499e1cc284136b436c3c70211ac61",
    "einfuhrsteuer": "950579abfff877eee1127de9ccada64c6df340312a11f8af83cebe7e211fb5a0",
    "vorsteuer": "ce9bb159748b094c9cfd92741180fffab2e9d3dfab15f286d5adf9ffc8861b94",
    "vorsteuerabzug": "b855a6236ea3ca22ea83d494ebb4d966f07b70977eb2705ab39863af928e7f27",
    "effektive-abrechnungsmethode": (
        "8736474a28edd1b6db447097dffe8a4715dda4885c5a8e1410b6b2843b01ca5f"
    ),
    "saldosteuersatz": "15d465b3efb93dcab22413c19239381fe66ce653b4d034f8b305eda6ab2b0362",
    "saldosteuersatzmethode": ("bc8f2d653801349eaca4050de8af46c628d31f729dc24a752cf0f5ff092ca50b"),
    "pauschalsteuersatz": "7b8626954cf04278772eea179a029a87ec3be99bdf8b6bcf2b97ad1ba72fbd18",
    "pauschalsteuersatzmethode": (
        "5467ac0b372c37bfb93e5e470669bb99de44fe7b4260b7c5c64d8468b4cc177f"
    ),
    "steuerperiode": "532871290277e23a0993da41ec60d5c41a721221699004564c5d46f978bdb24e",
    "abrechnungsperiode": "5a6b82d518f7fd72b7189ae16e8ca7eb55fd0be4dc63c15703c7af74bdda785e",
    "unternehmens-identifikationsnummer": (
        "95fb7601ae53de161354b31bab4d24edc88038bf086aa85c86259aee9163e7b6"
    ),
    "mwst-nummer": "a1a50644d0c77c8e225f5c1e9f859285eaf2c7e1268d836b4c175174779ab044",
    "direkte-bundessteuer": ("87e20d533b5ca4798069fff309da3cfa266cb26fc9d1e51b9f082e7f7c337589"),
    "quellensteuer": "a750af954a89f01c40ec83dcdf6dfef212ced2265f6705575d8532c3f150a79b",
    "verrechnungssteuer": ("3d73e6bd8bb9c0a9303364d416b22f725392fbb860b25c50e3613e6cb5efb203"),
    "gepanzertes-fahrzeug": ("e13530ed57adffbe8f3daccb12f5efd50318f83736f822841ae1771f2f255b7c"),
    "geschuetztes-mannschaftstransportfahrzeug": (
        "c0d54a00c95648ca4ae3953ed05246510dea7f6ad39de371ccd103ac3b4290d6"
    ),
    "radschuetzenpanzer-93": ("ea2a8365fbfc6b617d722c939b4112960158e7166721baf5bfe2ce65c24904e9"),
    "schuetzenpanzer": "6528e03e2320468a5881b19a9b9b557789e2aa49ea18b37e7bf28cf264a84745",
    "schuetzenpanzer-2000": ("70ee9297160bd0e01e56fa85b62399592e7ec333b4c304cd7a3776e87ff2b24a"),
    "kampfpanzer": "94b5bbd3c70f743e247fd1700220dd74480fb31e7f9a564cda7d6391b38ce344",
    "panzer-87-leopard-2-we": ("51941eae89394fe0ddedca4d0e334521baac0553222ce66a0c1c1447ed0415d4"),
    "bergepanzer": "b0bce6f3b9f37598d1203684e8042dacb5ef7f8fd304edfb079b574222e23414",
    "bergepanzer-01": "6481b6acc58e8e721649716e468b5b9b74c42f9d03ec39bd3d429997d8a0fcd0",
    "panzerhaubitze": "24cf6d9b510a29fb98289a61bc9b77a8992a3963474912f5ab73e265c4038e58",
    "panzerhaubitze-m109-kawest": (
        "773fc8a2708bd0c1bf41b1dd3d2dfe5f4f2399161dbfd7e0d66dc8f275f56215"
    ),
    "pionierpanzer-21": ("1a620de6c79ddf0ae09b86164887dc9126e774aac3d39ed7700381041c1c59a1"),
    "tasys": "e7b3cac1f380378aa5f88aeec511f273ac3f90fef511bd873f79b2419d9cfade",
    "iplis": "c8f252b5c620dc676e06522998d7e993c0472649ce7db92699071a0a9e55e13e",
    "command-and-control": ("9319a4a1d2412034ce40347cf0b3ef2ae2287e48e81adee8d3e7159cc75806e7"),
    "bodluv": "d3dcbc5d06a51192cdc0e0a19e7ce3bc5da95346b5b955c7606efafd3e83233e",
    "bodluv-mr": "52549f1da00ea4271bfdcf1384ead3a6d78439ef0cf8a3cf9fb460422a6b6854",
    "nato-iamd": "7d8eaa1c95883873f33f9129a4a9615ec98fb9f99c114da03fab9cc46bbcad42",
    "ads-15": "2a1b88ca7c94a8df30f72e8d151faa49e30bf2949c0ef3ea0a628f7ed24c29d6",
    "vhf": "bb7007fbafc8fcb9edd0c9d34a46cf939134931f3b1bd71a30d5e270a46a6f1d",
}


def _armoured_vehicle_spec() -> ReferenceTermSpec:
    return next(spec for spec in REFERENCE_TERM_SPECS if spec.slug == "gepanzertes-fahrzeug")


def _legacy_armoured_vehicle_payload() -> dict[str, object]:
    return {
        "domainIds": [
            str(_domain_id("verteidigung")),
            str(_domain_id("mobilitaet-logistik")),
        ],
        "localizations": [
            {
                "language": "de",
                "preferredLabel": "Gepanzertes Fahrzeug",
                "alternativeLabels": ["Panzerfahrzeug"],
                "definition": "Fahrzeug mit konstruktivem Schutz gegen äussere Einwirkungen.",
            },
            {
                "language": "en",
                "preferredLabel": "Armored Vehicle",
                "alternativeLabels": ["Armoured Vehicle"],
                "definition": (
                    "A vehicle designed with structural protection against external threats."
                ),
            },
        ],
        "relations": [],
    }


def _previous_armoured_vehicle_reference_payload(
    resolved_term_ids: dict[str, uuid.UUID] | None = None,
) -> dict[str, object]:
    """Return the immutable v2 proposal payload for the armoured-vehicle concept."""

    term_ids = resolved_term_ids or {
        item.slug: reference_term_id(item.slug) for item in REFERENCE_TERM_SPECS
    }
    narrower_slugs = (
        "bergepanzer",
        "geschuetztes-mannschaftstransportfahrzeug",
        "kampfpanzer",
        "pionierpanzer-21",
        "radschuetzenpanzer-93",
        "schuetzenpanzer",
    )
    return {
        "domainIds": [
            str(_domain_id("verteidigung")),
            str(_domain_id("mobilitaet-logistik")),
        ],
        "localizations": [
            {
                "language": "de",
                "preferredLabel": "Gepanzertes Fahrzeug",
                "alternativeLabels": ["GepFz", "Panzerfahrzeug"],
                "definition": (
                    "Militärfahrzeug mit konstruktivem Schutz oder Schutzsystemen, das "
                    "geschützte Mobilität ermöglicht."
                ),
            },
            {
                "language": "en",
                "preferredLabel": "Armoured vehicle",
                "alternativeLabels": ["Armored vehicle"],
                "definition": (
                    "Military vehicle fitted with structural protection or protection "
                    "systems to provide protected mobility."
                ),
            },
        ],
        "relations": [
            {
                "relation": "narrower",
                "targetTermId": str(term_ids[target_slug]),
            }
            for target_slug in narrower_slugs
        ],
    }


def _payload(
    spec: ReferenceTermSpec,
    resolved_term_ids: dict[str, uuid.UUID] | None = None,
) -> dict[str, object]:
    term_ids = resolved_term_ids or {
        item.slug: reference_term_id(item.slug) for item in REFERENCE_TERM_SPECS
    }
    return {
        "domainIds": [str(_domain_id(slug)) for slug in spec.domain_slugs],
        "localizations": [
            {
                "language": item.language,
                "preferredLabel": item.preferred_label,
                "alternativeLabels": list(item.alternative_labels),
                "definition": item.definition,
            }
            for item in spec.localizations
        ],
        "relations": [
            {
                "relation": relation,
                "targetTermId": str(term_ids[target_slug]),
            }
            for source_slug, relation, target_slug in sorted(_relation_specs())
            if source_slug == spec.slug
        ],
    }


def _relation_specs() -> set[tuple[str, str, str]]:
    inverse = {
        "exactMatch": "exactMatch",
        "closeMatch": "closeMatch",
        "broader": "narrower",
        "narrower": "broader",
        "related": "related",
    }
    result: set[tuple[str, str, str]] = set()
    for spec in REFERENCE_TERM_SPECS:
        for relation, target_slug in spec.relations:
            result.add((spec.slug, relation, target_slug))
            result.add((target_slug, inverse[relation], spec.slug))
    return result


def _payload_signature(payload: dict[str, object]) -> dict[str, object]:
    localizations = sorted(
        (
            {
                "language": str(item["language"]),
                "preferredLabel": str(item["preferredLabel"]),
                "alternativeLabels": list(item.get("alternativeLabels", [])),
                "definition": str(item["definition"]),
            }
            for item in payload.get("localizations", [])
        ),
        key=lambda item: item["language"].casefold(),
    )
    relations = sorted(
        (
            {
                "relation": str(item["relation"]),
                **(
                    {"targetTermId": str(item["targetTermId"])}
                    if item.get("targetTermId")
                    else {"targetUri": str(item["targetUri"])}
                ),
            }
            for item in payload.get("relations", [])
        ),
        key=lambda item: (
            item["relation"],
            item.get("targetTermId", ""),
            item.get("targetUri", ""),
        ),
    )
    return {
        "domainIds": sorted(str(value) for value in payload.get("domainIds", [])),
        "localizations": localizations,
        "relations": relations,
    }


def _stored_term_payload(session: Session, term: GlossaryTerm) -> dict[str, object]:
    localizations = list(
        session.scalars(
            select(GlossaryTermLocalization)
            .where(GlossaryTermLocalization.term_id == term.id)
            .order_by(GlossaryTermLocalization.language)
        )
    )
    relations = list(
        session.scalars(
            select(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id == term.id)
        )
    )
    return _payload_signature(
        {
            "domainIds": list(
                session.scalars(
                    select(GlossaryTermDomain.domain_id).where(
                        GlossaryTermDomain.term_id == term.id
                    )
                )
            ),
            "localizations": [
                {
                    "language": item.language,
                    "preferredLabel": item.preferred_label,
                    "alternativeLabels": list(item.alternative_labels),
                    "definition": item.definition,
                }
                for item in localizations
            ],
            "relations": [
                {
                    "relation": item.relation,
                    **(
                        {"targetTermId": str(item.target_term_id)}
                        if item.target_term_id
                        else {"targetUri": item.target_uri}
                    ),
                }
                for item in relations
            ],
        }
    )


def _stored_term_payload_in_v2_order(
    session: Session,
    term: GlossaryTerm,
    spec: ReferenceTermSpec,
) -> dict[str, object] | None:
    """Reconstruct the raw array ordering used by the deployed v2 seed.

    Association tables intentionally have no business ordering.  V2 nevertheless
    included array order in ``content_hash``.  Reconstructing that known order lets
    the upgrade authenticate both the immutable v2 fingerprint and every stored
    localization/domain/relation before changing an existing concept.
    """

    expected_domain_ids = [_domain_id(slug) for slug in spec.domain_slugs]
    stored_domain_ids = set(
        session.scalars(
            select(GlossaryTermDomain.domain_id).where(GlossaryTermDomain.term_id == term.id)
        )
    )
    if stored_domain_ids != set(expected_domain_ids):
        return None

    localizations = list(
        session.scalars(
            select(GlossaryTermLocalization)
            .where(GlossaryTermLocalization.term_id == term.id)
            .order_by(GlossaryTermLocalization.language)
        )
    )
    # Every v2 reference specification used DE followed by EN.  Reject extra or
    # missing languages instead of guessing an order for potentially governed data.
    if [item.language for item in localizations] != ["de", "en"]:
        return None

    slug_by_term_id = {reference_term_id(item.slug): item.slug for item in REFERENCE_TERM_SPECS}
    relations = list(
        session.scalars(
            select(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id == term.id)
        )
    )
    if any(
        item.target_term_id is None or item.target_term_id not in slug_by_term_id
        for item in relations
    ):
        return None
    relations.sort(
        key=lambda item: (
            item.relation,
            slug_by_term_id[item.target_term_id],
        )
    )
    return {
        "domainIds": [str(domain_id) for domain_id in expected_domain_ids],
        "localizations": [
            {
                "language": item.language,
                "preferredLabel": item.preferred_label,
                "alternativeLabels": list(item.alternative_labels),
                "definition": item.definition,
            }
            for item in localizations
        ],
        "relations": [
            {
                "relation": item.relation,
                "targetTermId": str(item.target_term_id),
            }
            for item in relations
        ],
    }


def _is_pristine_v2_reference_term(
    session: Session,
    term: GlossaryTerm,
    spec: ReferenceTermSpec,
) -> bool:
    expected_hash = _PREVIOUS_REFERENCE_CONTENT_HASHES.get(spec.slug)
    if (
        expected_hash is None
        or term.id != reference_term_id(spec.slug)
        or term.origin_catalog_id != ORIGIN_CATALOG_ID
        or term.revision != 1
        or term.lifecycle != "active"
        or term.content_hash != expected_hash
    ):
        return False
    raw_payload = _stored_term_payload_in_v2_order(session, term, spec)
    return bool(
        raw_payload is not None
        and canonical_hash({"urn": term.urn, "lifecycle": "active", "payload": raw_payload})
        == expected_hash
    )


def _is_pristine_v3_command_and_control(session: Session, term: GlossaryTerm) -> bool:
    payload = _payload_signature(_payload(_V3_COMMAND_AND_CONTROL_SPEC))
    expected_hash = canonical_hash({"urn": term.urn, "lifecycle": "active", "payload": payload})
    return bool(
        term.id == reference_term_id(_V3_COMMAND_AND_CONTROL_SPEC.slug)
        and term.origin_catalog_id == ORIGIN_CATALOG_ID
        and term.revision in {1, 2}
        and term.lifecycle == "active"
        and term.content_hash == expected_hash
        and _stored_term_payload(session, term) == payload
    )


def _is_pristine_reference_term(
    session: Session,
    term: GlossaryTerm,
    spec: ReferenceTermSpec,
) -> bool:
    payload = _payload_signature(_payload(spec))
    return bool(
        term.id == reference_term_id(spec.slug)
        and term.origin_catalog_id == ORIGIN_CATALOG_ID
        and term.revision == 1
        and term.lifecycle == "active"
        and term.content_hash
        == canonical_hash({"urn": term.urn, "lifecycle": "active", "payload": payload})
        and _stored_term_payload(session, term) == payload
    )


def _is_pristine_seed_reference_term(
    session: Session,
    term: GlossaryTerm,
    spec: ReferenceTermSpec,
) -> bool:
    return _is_pristine_reference_term(session, term, spec) or _is_pristine_v2_reference_term(
        session, term, spec
    )


def _has_active_exact_german_label(session: Session, term: GlossaryTerm | None) -> bool:
    if term is None or term.lifecycle != "active":
        return False
    return bool(
        session.scalar(
            select(GlossaryTermLocalization.term_id).where(
                GlossaryTermLocalization.term_id == term.id,
                GlossaryTermLocalization.language == "de",
                GlossaryTermLocalization.normalized_label == "gepanzertes fahrzeug",
            )
        )
    )


def _resolve_armoured_vehicle_term(session: Session) -> GlossaryTerm | None:
    deterministic_id = reference_term_id("gepanzertes-fahrzeug")
    deterministic = session.get(GlossaryTerm, deterministic_id)
    if deterministic is not None and deterministic.origin_catalog_id != ORIGIN_CATALOG_ID:
        raise RuntimeError("Reference glossary identifier is owned by another origin catalog")
    proposal = session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID)
    if proposal and proposal.status == "accepted" and proposal.target_term_id:
        accepted = session.get(GlossaryTerm, proposal.target_term_id)
        if (
            accepted is not None
            and accepted.origin_catalog_id == ORIGIN_CATALOG_ID
            and _has_active_exact_german_label(session, accepted)
        ):
            if (
                deterministic is None
                or deterministic.id == accepted.id
                or deterministic.lifecycle != "active"
                or _is_pristine_seed_reference_term(
                    session, deterministic, _armoured_vehicle_spec()
                )
            ):
                return accepted
            # Both concepts contain governed active content. Keep the deterministic reference
            # term canonical for this seed and leave the accepted Journey term untouched; a
            # Domain Owner must resolve the duplicate explicitly.
            return deterministic

    candidates = list(
        session.scalars(
            select(GlossaryTerm)
            .join(
                GlossaryTermLocalization,
                GlossaryTermLocalization.term_id == GlossaryTerm.id,
            )
            .where(
                GlossaryTerm.id != deterministic_id,
                GlossaryTerm.lifecycle == "active",
                GlossaryTerm.origin_catalog_id == ORIGIN_CATALOG_ID,
                GlossaryTermLocalization.language == "de",
                GlossaryTermLocalization.normalized_label == "gepanzertes fahrzeug",
            )
            .distinct()
        )
    )
    if len(candidates) == 1:
        candidate = candidates[0]
        if (
            deterministic is None
            or deterministic.lifecycle != "active"
            or _is_pristine_seed_reference_term(session, deterministic, _armoured_vehicle_spec())
        ):
            return candidate
    return deterministic


def _is_pristine_accepted_journey_term(
    session: Session,
    proposal: GlossaryTermProposal | None,
    term: GlossaryTerm,
) -> bool:
    legacy_payload = _legacy_armoured_vehicle_payload()
    return bool(
        proposal
        and proposal.status == "accepted"
        and proposal.operation == "create"
        and proposal.revision == 1
        and proposal.target_term_id == term.id
        and term.origin_catalog_id == ORIGIN_CATALOG_ID
        and _payload_signature(proposal.requested_payload) == _payload_signature(legacy_payload)
        and _payload_signature(proposal.review_payload) == _payload_signature(legacy_payload)
        and term.revision == 1
        and term.lifecycle == "active"
        and term.content_hash
        == canonical_hash({"urn": term.urn, "lifecycle": "active", "payload": legacy_payload})
        and _stored_term_payload(session, term) == _payload_signature(legacy_payload)
    )


def _replace_pristine_term_content(
    session: Session,
    term: GlossaryTerm,
    spec: ReferenceTermSpec,
) -> None:
    session.execute(
        delete(GlossaryTermLocalization).where(GlossaryTermLocalization.term_id == term.id)
    )
    session.execute(delete(GlossaryTermDomain).where(GlossaryTermDomain.term_id == term.id))
    for item in spec.localizations:
        session.add(
            GlossaryTermLocalization(
                term_id=term.id,
                language=item.language,
                preferred_label=item.preferred_label,
                alternative_labels=list(item.alternative_labels),
                definition=item.definition,
                normalized_label=_normalized_label(item.preferred_label),
            )
        )
    for domain_slug in spec.domain_slugs:
        session.add(GlossaryTermDomain(term_id=term.id, domain_id=_domain_id(domain_slug)))


def _proposal_reviews(session: Session, proposal_id: uuid.UUID) -> list[GlossaryTermProposalReview]:
    return list(
        session.scalars(
            select(GlossaryTermProposalReview).where(
                GlossaryTermProposalReview.proposal_id == proposal_id
            )
        )
    )


def _all_pristine_pending_reviews(reviews: list[GlossaryTermProposalReview], revision: int) -> bool:
    expected_domain_ids = {
        _domain_id("verteidigung"),
        _domain_id("mobilitaet-logistik"),
    }
    return {item.domain_id for item in reviews} == expected_domain_ids and all(
        item.status == "pending"
        and item.proposal_revision == revision
        and item.decision_comment is None
        and item.decided_at is None
        for item in reviews
    )


def _align_armoured_vehicle_journey(
    session: Session,
    canonical_term_id: uuid.UUID,
    resolved_term_ids: dict[str, uuid.UUID],
    migration_at: datetime,
) -> int | None:
    proposal = session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID)
    if proposal is None:
        return None
    reviews = _proposal_reviews(session, proposal.id)
    legacy_payload = _legacy_armoured_vehicle_payload()
    previous_curated_payload = _previous_armoured_vehicle_reference_payload(resolved_term_ids)
    curated_payload = _payload(_armoured_vehicle_spec(), resolved_term_ids)
    pristine_v1 = bool(
        proposal.status == "submitted"
        and proposal.operation == "create"
        and proposal.target_term_id is None
        and proposal.revision == 1
        and _payload_signature(proposal.requested_payload) == _payload_signature(legacy_payload)
        and _payload_signature(proposal.review_payload) == _payload_signature(legacy_payload)
        and _all_pristine_pending_reviews(reviews, 1)
    )
    allowed_update_targets = {
        canonical_term_id,
        reference_term_id("gepanzertes-fahrzeug"),
    }
    pristine_v2 = bool(
        proposal.status == "submitted"
        and proposal.operation == "update"
        and proposal.target_term_id in allowed_update_targets
        and proposal.revision == 1
        and _payload_signature(proposal.requested_payload)
        == _payload_signature(previous_curated_payload)
        and _payload_signature(proposal.review_payload)
        == _payload_signature(previous_curated_payload)
        and _all_pristine_pending_reviews(reviews, 1)
    )
    pristine_current = bool(
        proposal.status == "submitted"
        and proposal.operation == "update"
        and proposal.target_term_id in allowed_update_targets
        and proposal.revision == 1
        and _payload_signature(proposal.requested_payload) == _payload_signature(curated_payload)
        and _payload_signature(proposal.review_payload) == _payload_signature(curated_payload)
        and _all_pristine_pending_reviews(reviews, 1)
    )
    if not pristine_v1 and not pristine_v2 and not pristine_current:
        return None

    previous_revision = proposal.revision
    proposal.operation = "update"
    proposal.target_term_id = canonical_term_id
    proposal.requested_payload = (
        legacy_payload
        if pristine_v1
        else previous_curated_payload
        if pristine_v2
        else curated_payload
    )
    proposal.review_payload = curated_payload
    proposal.revision += 1
    proposal.status = "in_review"
    proposal.updated_at = migration_at
    for review in reviews:
        review.proposal_revision = proposal.revision
        review.status = "pending"
        review.decision_comment = None
        review.decided_at = None
        review.updated_at = migration_at
    for task in session.scalars(
        select(WorkflowTask).where(
            WorkflowTask.glossary_term_proposal_id == proposal.id,
            WorkflowTask.status != "completed",
        )
    ):
        task.detail = (
            f"Der kuratierte Referenzterm wird in Vorschlagsrevision {proposal.revision} "
            "geprüft; frühere Freigaben sind zurückgesetzt."
        )
        task.updated_at = migration_at
    return previous_revision


def _seed_reference_terms(
    session: Session,
    resolved_term_ids: dict[str, uuid.UUID],
    created_at: datetime,
) -> set[uuid.UUID]:
    created_ids: set[uuid.UUID] = set()
    known_slugs = {spec.slug for spec in REFERENCE_TERM_SPECS}
    for spec in REFERENCE_TERM_SPECS:
        missing_targets = {target for _, target in spec.relations} - known_slugs
        if missing_targets:
            raise RuntimeError(f"Unknown glossary relation targets: {sorted(missing_targets)}")
        for domain_slug in spec.domain_slugs:
            if session.get(Domain, _domain_id(domain_slug)) is None:
                raise RuntimeError(f"Reference glossary domain is missing: {domain_slug}")
        term_id = resolved_term_ids[spec.slug]
        existing = session.get(GlossaryTerm, term_id)
        if existing is not None and existing.origin_catalog_id != ORIGIN_CATALOG_ID:
            raise RuntimeError("Reference glossary identifier is owned by another origin catalog")
        if existing is not None:
            continue
        payload = _payload_signature(_payload(spec, resolved_term_ids))
        urn = f"urn:daca:glossary-term:{term_id}"
        term = GlossaryTerm(
            id=term_id,
            urn=urn,
            origin_catalog_id=ORIGIN_CATALOG_ID,
            revision=1,
            content_hash=canonical_hash({"urn": urn, "lifecycle": "active", "payload": payload}),
            lifecycle="active",
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(term)
        session.flush()
        created_ids.add(term.id)
        for item in spec.localizations:
            session.add(
                GlossaryTermLocalization(
                    term_id=term.id,
                    language=item.language,
                    preferred_label=item.preferred_label,
                    alternative_labels=list(item.alternative_labels),
                    definition=item.definition,
                    normalized_label=_normalized_label(item.preferred_label),
                )
            )
        for domain_slug in spec.domain_slugs:
            session.add(GlossaryTermDomain(term_id=term.id, domain_id=_domain_id(domain_slug)))
    session.flush()
    return created_ids


def _equivalent_relation(
    session: Session,
    source_term_id: uuid.UUID,
    target_term_id: uuid.UUID,
    relation: str,
    excluded_id: uuid.UUID | None = None,
) -> GlossaryTermRelation | None:
    statement = select(GlossaryTermRelation).where(
        GlossaryTermRelation.source_term_id == source_term_id,
        GlossaryTermRelation.target_term_id == target_term_id,
        GlossaryTermRelation.relation == relation,
    )
    if excluded_id:
        statement = statement.where(GlossaryTermRelation.id != excluded_id)
    return session.scalar(statement.limit(1))


def _seed_reference_relations(
    session: Session,
    resolved_term_ids: dict[str, uuid.UUID],
    created_term_ids: set[uuid.UUID],
    mutable_source_ids: set[uuid.UUID],
    created_at: datetime,
) -> set[uuid.UUID]:
    changed_sources: set[uuid.UUID] = set()
    for source_slug, relation, target_slug in sorted(_relation_specs()):
        relation_id = uuid.uuid5(
            POC_NAMESPACE, f"glossary-relation:{source_slug}:{relation}:{target_slug}"
        )
        source_term_id = resolved_term_ids[source_slug]
        target_term_id = resolved_term_ids[target_slug]
        if source_term_id not in mutable_source_ids:
            continue
        source_term = session.get(GlossaryTerm, source_term_id)
        target_term = session.get(GlossaryTerm, target_term_id)
        if (
            source_term is None
            or target_term is None
            or source_term.lifecycle != "active"
            or target_term.lifecycle != "active"
        ):
            continue
        if (
            source_term.origin_catalog_id != ORIGIN_CATALOG_ID
            or target_term.origin_catalog_id != ORIGIN_CATALOG_ID
        ):
            raise RuntimeError("Reference glossary relations cannot mutate a foreign origin")
        row = session.get(GlossaryTermRelation, relation_id)
        if row is not None and row.source_term_id not in mutable_source_ids:
            # The deterministic relation identifier was subsequently reused by a
            # governed source.  It is not seed-owned anymore.
            continue
        if row is not None and (
            row.source_term_id != source_term_id
            or row.target_term_id != target_term_id
            or row.relation != relation
        ):
            duplicate = _equivalent_relation(
                session,
                source_term_id,
                target_term_id,
                relation,
                excluded_id=row.id,
            )
            old_source_id = row.source_term_id
            if duplicate is not None:
                session.delete(row)
                session.flush()
            else:
                row.source_term_id = source_term_id
                row.target_term_id = target_term_id
                row.target_uri = None
                row.relation = relation
            changed_sources.update({old_source_id, source_term_id})
        elif row is None:
            duplicate = _equivalent_relation(session, source_term_id, target_term_id, relation)
            if duplicate is None:
                session.add(
                    GlossaryTermRelation(
                        id=relation_id,
                        source_term_id=source_term_id,
                        target_term_id=target_term_id,
                        relation=relation,
                        created_at=created_at,
                    )
                )
                if source_term_id not in created_term_ids:
                    changed_sources.add(source_term_id)
    session.flush()
    return changed_sources


def _clear_pristine_v2_relations(
    session: Session,
    pristine_v2_term_ids: set[uuid.UUID],
) -> None:
    if not pristine_v2_term_ids:
        return
    session.execute(
        delete(GlossaryTermRelation).where(
            GlossaryTermRelation.source_term_id.in_(pristine_v2_term_ids)
        )
    )
    session.flush()


def _assert_reference_identifiers_owned_locally(session: Session) -> None:
    for spec in REFERENCE_TERM_SPECS:
        term = session.get(GlossaryTerm, reference_term_id(spec.slug))
        if term is not None and term.origin_catalog_id != ORIGIN_CATALOG_ID:
            raise RuntimeError("Reference glossary identifier is owned by another origin catalog")


def _migrate_product_assignments(
    session: Session,
    duplicate_term_id: uuid.UUID,
    canonical_term_id: uuid.UUID,
) -> set[uuid.UUID]:
    canonical = session.get(GlossaryTerm, canonical_term_id)
    if canonical is None or canonical.lifecycle != "active":
        raise RuntimeError("Reference glossary assignments require an active canonical term")
    duplicate = session.get(GlossaryTerm, duplicate_term_id)
    if (
        canonical.origin_catalog_id != ORIGIN_CATALOG_ID
        or duplicate is None
        or duplicate.origin_catalog_id != ORIGIN_CATALOG_ID
    ):
        raise RuntimeError("Reference glossary reconciliation cannot mutate a foreign origin")
    changed_product_ids: set[uuid.UUID] = set()
    assignments = list(
        session.scalars(
            select(DataProductGlossaryTerm).where(
                DataProductGlossaryTerm.glossary_term_id == duplicate_term_id
            )
        )
    )
    for assignment in assignments:
        identity = {
            "data_product_id": assignment.data_product_id,
            "glossary_term_id": canonical_term_id,
        }
        if session.get(DataProductGlossaryTerm, identity) is None:
            session.add(
                DataProductGlossaryTerm(
                    data_product_id=assignment.data_product_id,
                    glossary_term_id=canonical_term_id,
                    assigned_by_user_id=assignment.assigned_by_user_id,
                    assigned_at=assignment.assigned_at,
                )
            )
        session.delete(assignment)
        product = session.get(DataProduct, assignment.data_product_id)
        if product is not None:
            product.revision += 1
            changed_product_ids.add(product.id)
    session.flush()
    return changed_product_ids


def _add_seed_audit(
    session: Session,
    *,
    key: str,
    resource_type: str,
    resource_id: uuid.UUID,
    action: str,
    revision: int,
    details: dict[str, object],
    occurred_at: datetime,
) -> None:
    audit_id = uuid.uuid5(POC_NAMESPACE, f"audit:{GLOSSARY_REFERENCE_SEED_NAME}:{key}")
    if session.get(AuditEvent, audit_id) is not None:
        return
    session.add(
        AuditEvent(
            id=audit_id,
            resource_type=resource_type,
            resource_id=str(resource_id),
            action=action,
            actor="daca-bootstrap",
            revision=revision,
            details=details,
            occurred_at=occurred_at,
        )
    )


def _rehash_changed_terms(
    session: Session,
    changed_term_ids: set[uuid.UUID],
    created_term_ids: set[uuid.UUID],
    migration_at: datetime,
) -> None:
    session.flush()
    for term_id in changed_term_ids - created_term_ids:
        term = session.get(GlossaryTerm, term_id)
        if term is None:
            continue
        if term.origin_catalog_id != ORIGIN_CATALOG_ID:
            raise RuntimeError("Reference glossary rehash cannot mutate a foreign origin")
        previous_revision = term.revision
        previous_content_hash = term.content_hash
        term.revision += 1
        term.updated_at = migration_at
        term.content_hash = canonical_hash(
            {
                "urn": term.urn,
                "lifecycle": term.lifecycle,
                "payload": _stored_term_payload(session, term),
            }
        )
        _add_seed_audit(
            session,
            key=f"reconcile-term:{term.id}:{previous_revision}",
            resource_type="glossary-term",
            resource_id=term.id,
            action="reference-seed-reconciled",
            revision=term.revision,
            details={
                "previousRevision": previous_revision,
                "previousContentHash": previous_content_hash,
                "contentHash": term.content_hash,
                "seed": GLOSSARY_REFERENCE_SEED_NAME,
            },
            occurred_at=migration_at,
        )


def seed_glossary_reference_terms(session: Session) -> bool:
    """Add curated accepted glossary concepts without overwriting governed later changes."""

    if session.get(SeedMarker, GLOSSARY_REFERENCE_SEED_NAME) is not None:
        return False
    created_at = datetime(2026, 8, 26, 9, 0, tzinfo=UTC)
    migration_at = utc_now()
    _assert_reference_identifiers_owned_locally(session)
    existing_reference_terms = {
        spec.slug: session.get(GlossaryTerm, reference_term_id(spec.slug))
        for spec in REFERENCE_TERM_SPECS
    }
    pristine_v2_term_ids = {
        term.id
        for spec in REFERENCE_TERM_SPECS
        if (term := existing_reference_terms[spec.slug]) is not None
        and _is_pristine_v2_reference_term(session, term, spec)
    }
    pristine_v3_term_ids = {
        term.id
        for spec in REFERENCE_TERM_SPECS
        if spec.slug == _V3_COMMAND_AND_CONTROL_SPEC.slug
        and (term := existing_reference_terms[spec.slug]) is not None
        and _is_pristine_v3_command_and_control(session, term)
    }
    pristine_current_term_ids = {
        term.id
        for spec in REFERENCE_TERM_SPECS
        if (term := existing_reference_terms[spec.slug]) is not None
        and _is_pristine_reference_term(session, term, spec)
    }
    deterministic_armoured_id = reference_term_id("gepanzertes-fahrzeug")
    canonical_armoured = _resolve_armoured_vehicle_term(session)
    canonical_armoured_id = (
        canonical_armoured.id if canonical_armoured is not None else deterministic_armoured_id
    )
    deterministic_before_seed = session.get(GlossaryTerm, deterministic_armoured_id)
    deterministic_duplicate_was_pristine = bool(
        deterministic_before_seed is not None
        and deterministic_before_seed.id != canonical_armoured_id
        and deterministic_before_seed.id in pristine_v2_term_ids | pristine_current_term_ids
    )
    resolved_term_ids = {spec.slug: reference_term_id(spec.slug) for spec in REFERENCE_TERM_SPECS}
    resolved_term_ids["gepanzertes-fahrzeug"] = canonical_armoured_id
    created_term_ids = _seed_reference_terms(session, resolved_term_ids, created_at)

    changed_term_ids: set[uuid.UUID] = set()
    _clear_pristine_v2_relations(session, pristine_v2_term_ids)
    for spec in REFERENCE_TERM_SPECS:
        deterministic_term_id = reference_term_id(spec.slug)
        if deterministic_term_id not in pristine_v2_term_ids | pristine_v3_term_ids:
            continue
        term = session.get(GlossaryTerm, deterministic_term_id)
        if term is None:
            raise RuntimeError("Pristine reference term disappeared during seed upgrade")
        _replace_pristine_term_content(session, term, spec)
        changed_term_ids.add(term.id)
    session.flush()

    mutable_source_ids = (
        pristine_v2_term_ids | pristine_v3_term_ids | pristine_current_term_ids | created_term_ids
    )
    proposal = session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID)
    canonical_armoured = session.get(GlossaryTerm, canonical_armoured_id)
    if canonical_armoured and _is_pristine_accepted_journey_term(
        session, proposal, canonical_armoured
    ):
        _replace_pristine_term_content(session, canonical_armoured, _armoured_vehicle_spec())
        changed_term_ids.add(canonical_armoured.id)
        mutable_source_ids.add(canonical_armoured.id)
        session.flush()

    changed_term_ids.update(
        _seed_reference_relations(
            session,
            resolved_term_ids,
            created_term_ids,
            mutable_source_ids,
            created_at,
        )
    )

    migrated_product_ids: set[uuid.UUID] = set()
    deterministic_duplicate = session.get(GlossaryTerm, deterministic_armoured_id)
    if (
        deterministic_duplicate is not None
        and deterministic_duplicate.id != canonical_armoured_id
        and deterministic_duplicate_was_pristine
    ):
        migrated_product_ids = _migrate_product_assignments(
            session,
            deterministic_duplicate.id,
            canonical_armoured_id,
        )
        if deterministic_duplicate.lifecycle == "active":
            deterministic_duplicate.lifecycle = "retired"
            deterministic_duplicate.retired_at = migration_at
            changed_term_ids.add(deterministic_duplicate.id)

    proposal_previous_revision = _align_armoured_vehicle_journey(
        session,
        canonical_armoured_id,
        resolved_term_ids,
        migration_at,
    )
    if proposal_previous_revision is not None and proposal is not None:
        _add_seed_audit(
            session,
            key=f"align-proposal:{proposal.id}:{proposal_previous_revision}",
            resource_type="glossary-term-proposal",
            resource_id=proposal.id,
            action="reference-seed-aligned",
            revision=proposal.revision,
            details={
                "previousRevision": proposal_previous_revision,
                "canonicalTermId": str(canonical_armoured_id),
                "seed": GLOSSARY_REFERENCE_SEED_NAME,
            },
            occurred_at=migration_at,
        )
    _rehash_changed_terms(session, changed_term_ids, created_term_ids, migration_at)
    if (
        deterministic_duplicate is not None
        and deterministic_duplicate.id != canonical_armoured_id
        and deterministic_duplicate_was_pristine
        and deterministic_duplicate.lifecycle == "retired"
    ):
        _add_seed_audit(
            session,
            key=f"retire-duplicate:{deterministic_duplicate.id}",
            resource_type="glossary-term",
            resource_id=deterministic_duplicate.id,
            action="retired",
            revision=deterministic_duplicate.revision,
            details={"canonicalTermId": str(canonical_armoured_id), "reason": "seed-duplicate"},
            occurred_at=migration_at,
        )
    for product_id in migrated_product_ids:
        product = session.get(DataProduct, product_id)
        if product is not None:
            _add_seed_audit(
                session,
                key=f"reconcile-product:{product.id}:{deterministic_armoured_id}",
                resource_type="data-product",
                resource_id=product.id,
                action="glossary-term-reconciled",
                revision=product.revision,
                details={
                    "canonicalTermId": str(canonical_armoured_id),
                    "retiredDuplicateTermId": str(deterministic_armoured_id),
                },
                occurred_at=migration_at,
            )
    session.add(SeedMarker(name=GLOSSARY_REFERENCE_SEED_NAME, applied_at=migration_at))
    session.commit()
    return True
