# Berechtigungsprüfung vom 28. Oktober 2026

**Nachtrag:** Die anschliessende Domänenbearbeitung ergänzt mit Migration
`0044_office_alds_mandates` ausdrückliche LDSD-/ALDS-Mandate und benannte Stellvertretungen.
Owner/Stellvertretungen und zuständige ALDS/Stellvertretungen dürfen Domänen-Metadaten pflegen.
Die bestätigten Personen und der Operatorprozess stehen in der
[aktualisierten Rollenbeschreibung](object-governance-and-raci.md). Der unten genannte Befund
fehlender Mandatspersistenz ist damit für diesen Teil umgesetzt. Ernennungsdialoge, allgemeine
Amtskonfiguration und die offenen Modell-/Quellenrechte bleiben weitere Arbeit.

## Ergebnis und Massstab

Die Prüfung hat konkrete Rechtefehler gefunden und korrigiert. Das Projekt ist damit **noch
nicht durchgängig auf das neue Objektrollenmodell umgestellt**. Insbesondere ältere Modell-
und Quellenaktionen verwenden weiterhin Organisationsrechte. Dieser Bericht ist keine
Freigabe für einen produktiven Betrieb.

Massgeblich sind die vom Auftraggeber definierten Rollen in
[Objektverantwortung und organisatorische Mandate](object-governance-and-raci.md): Data Owner,
stellvertretender Data Owner, Data Steward und stellvertretender Data Steward am konkreten
Datenobjekt. Ein Profilname ersetzt keine Objektzuordnung. Domänen, Terme, logische Modelle,
physische Modelle und Produkte sind gleichermassen Datenobjekte. LDS und ALDS sind davon
getrennte organisatorische Mandate; eine Rolle SLDS gibt es nicht. Publikationsprüfung bleibt
eine unabhängige Workflowfunktion. Konsumentenrollen regeln die Produktnutzung.

## Umfang

Die statische Routeninventur umfasst die Catalog API (200 Routen, davon 93 schreibend),
Control Plane (22/9) und das Beispielprodukt (5/1). Untersucht wurden gemeinsame Guards,
Objektzuordnungen, Rollenwechsel, UI-Fähigkeiten, Entscheidungen, private Metadaten,
Quellenverzicht, Seeds und die Abgrenzung zur PBAC-Durchsetzung. Eine Routeninventur ist
kein dynamischer Berechtigungsnachweis für jede Kombination aus Route, Person und Objekt.

Die gezielten Regressionen verwenden synthetische Daten und eine isolierte PostgreSQL-
Testdatenbank. Die Tests für Control Plane und Produkt-PEP prüfen zusätzlich die bestehenden
Demo-/internen Authentifizierungsgrenzen und die HTTP-/PostgreSQL-Zugriffskontrolle.
Die fachliche RACI-Matrix wurde nicht in zusätzliche technische Rechte übersetzt.

## Korrigierte Befunde

| Befund | Korrektur und Nachweis |
|---|---|
| Öffentliche Produktmetadaten konnten bei älteren Produkten von einer fremden angemeldeten Person geändert werden. | PATCH verlangt jetzt eine aktive Zuordnung zum konkreten Produkt. Owner und Stellvertretung dürfen entscheiden; zugewiesene Stewards und deren Stellvertretungen dürfen die operativen Textmetadaten pflegen. Klassifikation, Verantwortlichkeiten und andere Governanceangaben bleiben Owner-Aufgaben. Produkte mit Vieraugenprüfung behalten ihren Freigabeweg. |
| Benannte oder explizit zugewiesene Produktstellvertretungen wurden an mehreren Stellen als unberechtigt behandelt. | Gemeinsame Prüfungen in `object_governance.py` werden für private Sichtbarkeit, paginierte Listen, Produktaktionen, SLA, Zugriffsanträge und Auditdetails verwendet. Inaktive Personen und inaktive Zuordnungen erteilen keine Objektrechte. |
| Ein früher bestimmter Publikationsprüfer konnte trotz Rollenverlust oder veränderter Zuordnung noch entscheiden. | Jede Entscheidung prüft aktuelle aktive Prüferrolle, aktuelle Kontrollperson und Unabhängigkeit von allen aktuellen Produkt-Ownern und Stellvertretungen erneut; auch wiederholte Aufrufe umgehen diese Prüfung nicht. |
| Eine organisationsweite Delegation konnte die Publikation eines anderen Modells desselben Owners erlauben. | Die publizierende Stellvertretung muss zusätzlich am konkreten Modell benannt sein. UI und Backend prüfen diese Bedingung. |
| Die stellvertretende Steward-Rolle fehlte in der Modellierungsrollentabelle und API. | Migration `0043_deputy_steward_role`, API-/Angular-Typen, Profilbeschreibung und operative Fähigkeiten unterstützen alle vier Rollen. Es werden keine neuen Personen automatisch berechtigt. |
| Modellprüfungen vertrauten der historischen Prüfer-ID und konnten aktuelle Stellvertretungen ausschliessen. | Entscheiden dürfen aktuelle aktive Owner oder Stellvertretungen der betroffenen aktiven Domäne, niemals die einreichende Person. Domäne und Review werden bei der Entscheidung gesperrt. Das Backend liefert `canDecide`; die Oberfläche übernimmt keine Berechtigung allein aus der historischen Prüfer-ID. |
| Bereits geladene Reviewdaten konnten bei einem Identitätswechsel stehen bleiben. | Ein neuer Ladevorgang leert den vorherigen Stand, bricht den vorherigen Read ab und verwirft verspätete Lese- oder Entscheidungsantworten der früheren Identität. |

Der persönliche Quellenverzicht bleibt vorrangig vor Organisations-/Gruppenrechten und der
Lesesonderregel für die Beispielquelle. Die zugehörigen Direktzugriffs-, Workflow- und
Seedtests bleiben Bestandteil der Regression. Externe Datenbankkonten und publizierte
Produktberechtigungen werden durch Objektverantwortung nicht automatisch geändert.

## Offene Inkonsistenzen

| Priorität | Fundstelle / Abweichung | Erforderliche Folgearbeit |
|---|---|---|
| Hoch | `modeling_api._require_version_scope` und mehrere Quellen-/Repräsentationsaktionen verwenden weiterhin breite `DataModelRoleAssignment`-Organisationsrechte. Eine Person mit passender Organisationsrolle kann damit teilweise fremde Objekte bearbeiten; eine reine Objektzuordnung genügt umgekehrt teilweise nicht. | Einheitliche Objektfähigkeiten für alle Modell-, Mapping-, Import-, Ableitungs- und Quellenaktionen einführen. Lesen, Metadatenpflege, fachliche Entscheidung und Organisationskonfiguration getrennt prüfen. Bestehende Zuständigkeiten vor einer Umstellung verbindlich erfassen. |
| Hoch | `_normalize_logical_write_scope` übernimmt Modell-Owner weiterhin aus der gewählten Domäne. Physische Quellen besitzen bisher keine durchgängige verbindliche Owner-/Stellvertretungszuordnung. | Modellverantwortung unabhängig von der fachlichen Domänenklassifikation erfassen. Für bestehende Quellen eine geprüfte Zuordnung und einen geregelten Zuweisungsprozess schaffen; Ersteller oder Beispielpersonen nicht stillschweigend zu Ownern erklären. |
| Mittel | Einzelne Modellentscheidungen, insbesondere Mapping-Inkonsistenzen und Publikation, kombinieren noch primäre Owner-IDs, Delegation und Organisationsrollen. Aktive explizite Objektstellvertretungen werden dadurch nicht überall gleich behandelt. | Entscheidungen an dieselbe aktuelle Objektzuordnung binden; Rollenverlust, Stellvertretung, Selbstfreigabe und konkurrierende Entscheidungen je Workflow nachweisen. |
| Hoch vor Einführung dieser Mandate | LDS-/ALDS-Ernennung und die Beschränkung der Amtskonfiguration auf das eigene Amt sind bislang fachlich dokumentiert, technisch aber nicht als Mandate implementiert. | Mandatsmodell, Ernennung/Entzug, Organisationshierarchie, Audit und Konfigurationsrechte implementieren. Bestehende Owner-/Steward-Organisationsrollen nicht als LDS-/ALDS-Mandate ausgeben. |

Die historische Control Plane besitzt eine eigene Demo-/interne Authentifizierungsgrenze,
kein Katalog-Objektrollenmodell. Ihre Fixtures sind keine Befugnis zur Änderung zentraler
Katalogobjekte. Eine spätere produktive Administration benötigt ein eigenes Mandatskonzept;
sie gehört weiterhin nicht in den Produktzugriffsentscheid.

## Reproduzierbare Prüfungen

- `test_role_consistency_audit.py`: fremde Produktänderung, konkrete Stellvertretungen,
  private Listen/Details, delegierte Modellpublikation, aktive Rollen und aktuelle Modellprüfer.
- `test_governance_submissions.py`: Rollenverlust, Kontrollpersonenwechsel und neu entstandene
  Owner-Zuordnung zwischen Einreichung und Entscheidung.
- `test_object_governance.py`, `test_physical_source_access.py`, `test_service_levels.py`,
  `test_policy_api.py`: Objektgrenzen, Quellenverzicht, SLA und bestehende PBAC-Projektionen.
- Angular: Identitäts-/Modellfähigkeiten, Reviewfähigkeiten und API-Normalisierung.
- Gesamte Tests der Control Plane und Autorisierungstests des Beispielprodukts.

Diese Prüfung nimmt keine neue Ernennung vor, löscht keine Verantwortlichkeiten und hebt
keinen persönlichen Zugriffsverzicht auf. Offene Befunde bleiben ausdrücklich offen.

### Verifizierter Stand

Nach Korrekturen und gezielten Wiederholungen bestehen 134 verschiedene aktuelle Katalogtests
aus den genannten Bereichen sowie Produkt-, Stellvertretungs-, Verlängerungs-, PoC- und
Nutzungsvertragstests. Zwei alte Produkttests wurden ausdrücklich an die neue Rollenregel
angepasst: Optimistische Metadatenänderungen verwenden den tatsächlichen Owner statt eines
fremden Editors; die benannte Stellvertretung erhält Objektrechte, ein fremder Owner nicht.
Die versehentliche Erweiterung allgemeiner Owner-Organisationsrechte auf alle Stellvertretungen
wurde nach den Mapping-Regressionen zurückgenommen; die drei betroffenen Fälle bestehen wieder.
Diese Auswahl ersetzt keinen vollständigen Lauf aller 467 derzeit vorhandenen Katalogtests.

Zusätzlich bestanden 46 Tests für Control Plane und Produkt-PEP, alle 483 Frontend-Tests,
18 OPA-Policytests, `build:web`, Python-Lint, Versionskonsistenz sowie Datenmodell- und
OpenAPI-Dokumentationsprüfung. Der Build behält seine bestehenden CSS-Budgetwarnungen.
Die gezielten `test:ui-regression`-Läufe `organization-term-network` und
`domain-relation-types` bestehen im separaten Browser ohne Katalogschreibzugriffe. Es wurde
kein Commit erstellt und kein vollständiger Commit-Gatelauf behauptet.

Die lokale Vorschau wurde ohne Seed auf `0043_deputy_steward_role` migriert und mit dem
aktuellen Backend gestartet. Ein zusätzlicher lesender Test über die UI-Proxyroute bestätigt
`200` für die benannte Produktstellvertretung und `403` für einen fremden Owner bei den
Metadatenlieferungen desselben Produkts. Die temporäre isolierte Testdatenbank wird nach der
Prüfung entfernt; die Vorschau bleibt verfügbar.
