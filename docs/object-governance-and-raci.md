# Objektverantwortung und organisatorische Mandate

## Neue Domänen freigeben

Neue Domänen werden vorläufig als persönliche Vorschlagskarten erfasst. Freigeben darf nur der
aktuell mandatierte ALDS des Amts des vorgeschlagenen Data Owners oder dessen mandatierte
Stellvertretung. Untergeordnete Einheiten sind eingeschlossen; der Antragsteller darf nicht selbst
entscheiden. Globale Profilrollen, eine fremde Amtszuständigkeit und das LDSD-Mandat genügen nicht.
Der ALDS erhält eine Aufgabe. Erst seine Freigabe erzeugt eine aktive Domäne; eine Ablehnung
erzeugt keine. Auch Data Owner können diese Freigabe nicht durch direkte Erstellung umgehen.
Bestehende Owner-/Stellvertretungsrechte für Änderungen und Stilllegung bleiben bestehen.

## Präzisierung und Umsetzung vom 28. Oktober 2026

**Local Data Steward Department (LDSD)** ist eine bestehende Rolle auf Departementsebene.
Diese Präzisierung ersetzt die frühere ungenaue Benennung als «LDS auf Departementsebene».
ALDS und stellvertretender ALDS sind davon getrennte Amtsmandate, keine Objektrollen.

| Person | Mandat / Verantwortung | Bereich |
|---|---|---|
| Sibilla Micheli | LDSD | Eidgenössisches Departement für Verteidigung, Bevölkerungsschutz und Sport |
| Christian Spider | ALDS | Bundesamt für Rüstung armasuisse, einschliesslich untergeordneter Einheiten |
| Christian Man | ALDS | Verteidigung |
| Thomas Kriegli | ALDS | Eidgenössische Steuerverwaltung |
| Joel Ruod | Stellvertretender ALDS | Eidgenössische Steuerverwaltung |
| Joel Ruod | Data Owner | Domäne «Data Analytics Rapid Prototyping» |
| Thomas Kriegli | Stellvertretender Data Owner | Domäne «Data Analytics Rapid Prototyping» |

Migration `0044_office_alds_mandates` speichert diese Organisationsmandate mit Revision,
Aktivstatus, benannter Stellvertretung, erfassender Stelle und Entscheidreferenz. Domänen-
Owner/Stellvertretungen sowie zuständige ALDS/Stellvertretungen können Domänennamen und
Beschreibungen direkt auf der Detailseite bearbeiten. Zust?ndige ALDS und LDSD d?rfen ?ber ?Dom?ne abtreten? neue Owner/Stellvertretungen bestimmen;
Begr?ndung, Best?tigung, Versionspr?fung und Audit sind erforderlich. Stilllegung und fachliche
Freigaben behalten ihre Objektpr?fungen. Das Mandat ersetzt keine Data-Owner-Objektzuordnung.

Die Ernennung wird derzeit durch den Betrieb anhand des zuständigen Ernennungsentscheids
erfasst. Der lokale, datenbankberechtigte Operator verwendet beispielsweise:

```powershell
uv run --all-packages python -m daca_catalog.office_governance_cli --organization efd-estv --type alds --user thomas.kriegli --deputy joel.ruod --expected-revision 0 --decision-reference "Referenz des Ernennungsentscheids"
```

`DATABASE_URL` bestimmt die Zielinstallation. Für Änderungen ist die aktuelle Mandatsrevision
anzugeben; `--revoke` entzieht das Mandat. Erfassung und Audit erfolgen gemeinsam. Es gibt
keinen öffentlichen Selbsternennungs-Endpunkt und noch keinen LDSD-Ernennungsdialog.
Die ausdrücklichen Demo-Zuordnungen werden einmalig initialisiert; Seeds überschreiben weder
geänderte noch entzogene Mandate. Die allgemeine Konfiguration sämtlicher Amtsfunktionen
bleibt weitere Umsetzung; die hier eingeführte Befugnis betrifft die Domänen-Metadatenpflege.

Die folgenden ursprünglichen Rollen-/RACI-Beschreibungen bleiben als Quelle erhalten;
die Benennung LDSD und der oben beschriebene technische Stand haben Vorrang.

Der [Berechtigungsprüfbericht vom 28. Oktober 2026](authorization-consistency-audit.md) hält
Korrekturen und verbleibende Abweichungen fest. Domänen/Term-Entscheide und Produktaktionen
verwenden konkrete Objektzuordnungen; ältere Modell-/Quellenaktionen sind noch nicht
durchgängig umgestellt. LDSD und ALDS besitzen nun ausdrückliche Mandatspersistenz für Domänenmetadaten;
Ernennungsdialog und allgemeine Amtskonfiguration bleiben weitere Umsetzung. SLDS ist keine Rolle.

Die im Gespräch bereitgestellte Aufgabenmatrix und die ergänzende fachliche Erklärung sind
die Quelle dieses Rollenmodells. Departementsspezifische Abkürzungen wurden entfernt.
Die statische Webseite `/documentation/static#rollen-zustaendigkeiten` stellt dieselbe
Information unter **Information: Rollen, Zuständigkeiten und Aufgabenmatrix** bereit.
Ihre Textsuche umfasst die Rollenbeschreibungen, die vollständige Aufgabenmatrix und die
übrigen statischen Artikel; Gross-/Kleinschreibung und diakritische Zeichen werden normalisiert.

## Datenobjekte

Domänen, Terme, logische Modelle, physische Modelle und Datenprodukte sind Datenobjekte.
Die fachliche Verantwortung wird dem konkreten Objekt zugeordnet:

| Objektrolle | Verantwortung |
|---|---|
| Data Owner | Trägt die fachliche Gesamtverantwortung und entscheidet über das zugewiesene Objekt. |
| Stellvertretender Data Owner | Vertritt den Data Owner innerhalb der ausdrücklichen Objektzuordnung. |
| Data Steward | Pflegt Metadaten und Terminologie, dokumentiert, prüft Datenqualität und setzt fachliche Vorgaben operativ um. |
| Stellvertretender Data Steward | Übernimmt die operativen Aufgaben für den zugewiesenen Objektbereich. |

Eine zusätzliche Registerverantwortung entfällt. Ein allgemeiner Profilname verleiht keine
Verfügungsgewalt über fremde Objekte. Verantwortlichkeit für Metadaten ersetzt keine
Freigabe geschützter Daten und verändert keine externen Datenbankkonten.

## Organisation

| Funktion | Mandat |
|---|---|
| Local Data Steward Department (LDSD) | Im Generalsekretariat jedes der sieben Departemente angesiedelt; koordiniert die Data Governance und bestimmt die Amt Local Data Stewards seines Departements. |
| Amt Local Data Steward (ALDS) | Wird durch den zuständigen LDSD bestimmt und verwaltet die Konfiguration für sein Amt; das Mandat erstreckt sich nicht auf fremde Ämter. |
| Data Custodian | Stellt insbesondere die technische Umsetzung sicher und wird gemäss Matrix für Architektur, Metadaten, Qualität und Stammdaten beigezogen. |

Die organisatorischen LDSD-/ALDS-Aufgaben sind fachliche Mandate; die technische Umsetzung ist oben beschrieben.
Dieser Änderungsschritt führt keinen neuen Ernennungsdialog für diese Mandate ein.
Objektentscheidungen verwenden die ausdrücklich zugewiesenen Data Owners und Stellvertretungen.

## RACI aus der bereitgestellten Vorlage

**A:** Gesamtverantwortung (Accountable). **R:** Ausführung (Responsible).
**C:** beizuziehen (Consulted). **I:** zu informieren (Informed).
**A/R:** verantwortet und führt aus. **–:** keine Zuordnung in der Vorlage.

Die Vorlage unterscheidet die Spalten «LDS» und «LDS Departement»; sie werden unverändert
getrennt geführt. «ADB» bleibt als unaufgelöste Bezeichnung der Vorlage erhalten. Die
IKT-Leitung ist eine beteiligte Governance-Funktion. RACI ist eine Aufgabenmatrix und
erteilt keine technischen Zugriffsrechte.

| Bereich und Tätigkeit | ADB (Vorlage) | Data Owner | ALDS | LDS (Vorlage) | Data Custodian | LDS Departement | IKT-Leitung Departement |
|---|---|---|---|---|---|---|---|
| Governance: Data Governance weiterentwickeln und überwachen | I | C | C | C | C | R | A |
| Governance: Datenspezifische Rollen kommunizieren | I | C | A/R | C | C | C | – |
| Governance: Umsetzung der Data Governance innerhalb der Verwaltungseinheit sicherstellen | I | C | R | C | C | A | – |
| Governance: Umsetzung der datenspezifischen Aufträge sicherstellen | I | C | R | C | C | A | – |
| Datenarchitektur: Datenprinzipien und Anforderungen anwenden | I | A | C | R | C | I | – |
| Datenarchitektur: Datendomänen definieren, dokumentieren und kommunizieren | I | A | R | C | I | C | – |
| Datenarchitektur: Verantwortlichkeiten je Datendomäne festlegen | I | A | C | R | I | I | – |
| Meta- und Datenmanagement: Metadaten-Attribute-Standard einhalten | I | A | C | R | C | C | – |
| Meta- und Datenmanagement: Metadaten erfassen, publizieren und aktuell halten | I | A | C | R | C | C | – |
| Meta- und Datenmanagement: Open Government Data identifizieren, publizieren und aktuell halten | I | A | C | R | C | C | – |
| Datenqualitätsmanagement: Anforderungen an Datenqualität festlegen | I | A | C | R | C | C | – |
| Datenqualitätsmanagement: Datenqualität überwachen und verbessern | I | A | C | R | C | I | – |
| Semantik und Standards: Datenspezifische Terminologien gemäss TERMDAT anwenden | I | A | C | R | I | I | – |
| Semantik und Standards: Verbindliche eCH-Standards berücksichtigen | I | A | C | R | C | C | – |
| Stammdatenmanagement: Stammdaten aus definierten Quellen beziehen | I | A | C | R | C | C | – |
| Stammdatenmanagement: Verwendung der Stammdaten dokumentieren und rapportieren | I | A | C | R | C | C | – |
| Datenlebenszyklusmanagement: Zweck und rechtliche Grundlagen der Datenbearbeitung festlegen | – | A | C | R | I | – | – |
| Datenlebenszyklusmanagement: Operative Umsetzung der Vorgaben sicherstellen | I | A | C | R | C | C | – |
| Datenlebenszyklusmanagement: Technische Umsetzung der Vorgaben sicherstellen | – | A | I | C | R | – | – |
