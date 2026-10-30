# Design QA – Tabellenbasierte Modellierung und Inline-Feldbearbeitung

## Evidenz

- Source visual truth: die zwei annotierten Mapping-/Formular-Screenshots aus der aktuellen Anforderung (Originalgrössen 1774×1837 und 1645×1674; in der Unterhaltung auf 1545×1600 beziehungsweise 1568×1595 normalisiert).
- Gerenderte Implementierung: `http://localhost:8080/models/new` sowie der Mapping-Arbeitsplatz unter `/models/:modelId/mappings` in Microsoft Edge.
- Implementierungs-Screenshots: `docs/mockups/edge-qa/logical-model-field-table-1440x900.png`, `docs/mockups/edge-qa/physical-derived-form-1440x900.png`, `docs/mockups/edge-qa/mappings-workspace-1774x887.png` und `docs/mockups/edge-qa/mappings-workspace-390x844.png`.
- Viewports und Pixeldichte: 1440×900, 1774×887 und 390×844 CSS-Pixel bei Device Scale Factor 1.
- Zustände: Logical-first mit einem ausgewählten Feld; Physical-first mit fünf automatisch verbundenen Feldern; bestehendes Modell mit aktiver Repräsentation, Drift-Hinweis und selektierter Zuordnung.
- Primäre Interaktionen: Feld selektieren, Feldmerkmale unmittelbar bearbeiten, Datentyp/Kardinalität/Klassifizierung ändern, Feld hinzufügen, Feld entfernen, zwischen Tabelle und Relation wechseln, Mapping-Ansichten wechseln und Feldmerkmale als Entwurf speichern.
- Automatisierte Prüfung: Logical-first, Physical-first, bestehend-zu-bestehend, 390-px-Mobile und Journey 10 bestanden. Die kleinste mobile Trefferfläche beträgt 40 px; der abschliessende Edge-Check meldete keine Console-Warnung und keinen Console-Fehler.

## Full-view-Vergleich

Die Mapping-Fläche bleibt der visuelle und funktionale Schwerpunkt. Links befinden sich Graph beziehungsweise Zuordnungstabelle, rechts bleibt die vollständige Merkmalsbearbeitung der aktiven logischen Feldselektion sichtbar und unabhängig scrollbar. Es gibt keinen Sprung mehr in eine grosse, oberhalb des Mappings eingeblendete Formularfläche.

Der Logical-first-Editor verwendet dieselbe Arbeitsweise: Die Struktur erscheint zuerst als kompakte Tabelle; `Feld hinzufügen` ergänzt eine Zeile, `Entfernen` löscht sie, und rechts wird ausschliesslich das selektierte Feld bearbeitet. Die Modellmerkmale bleiben darunter als eigener Abschnitt erhalten.

## Focused-region-Vergleich

Der fokussierte Vergleich wurde für den Mapping-Body und die Logical-first-Struktur separat durchgeführt. Beide Ansichten verwenden dieselbe wiederverwendbare Angular-Komponente für Feldmerkmale. Dadurch stimmen Bezeichnungen, Reihenfolge, Pflichtfelder, I14Y-Entscheide, Datentypen, Kardinalität, Klassifizierung, System, Kurzbeschreibung und technische Herkunft überein.

Die Tabellen-/Relationsumschaltung bleibt links bei der Struktur. Die rechte Spalte zeigt den Feldnamen als Kontexttitel und alle editierbaren Merkmale. Beim Mapping folgt die Selektion dem angeklickten logischen Feld und der passenden Zuordnung; physische Bindung und Mapping-Details bleiben erhalten.

## Erforderliche Fidelity-Flächen

- Fonts und Typografie: bestehende DaCa-CI-Typografie, rote Eyebrows, kompakte Tabellenlabels und klare Abschnittshierarchie wurden beibehalten.
- Spacing und Layout: links flexible Arbeitsfläche, rechts 420 px Merkmalseditor; auf schmalen Viewports werden die Bereiche untereinander angeordnet.
- Farben und Tokens: DaCa-Rot für aktive/primäre Aktionen, Blau für Selektion und Bindung, neutrale Tabellenflächen und vorhandene Statusfarben.
- Bilder und Icons: keine neuen Raster- oder Platzhaltergrafiken; bestehende System- und Quellen-Icons bleiben unverändert.
- Copy und Inhalt: `Logische Entitäten und Felder`, `Tabelle`, `Relation`, `Feldmerkmale`, `Feld hinzufügen`, `Entfernen` und `Feldmerkmale speichern` entsprechen dem implementierten Arbeitsmodell.

## Findings und Vergleichshistorie

1. P1 behoben: Die vollständige Feldformularstrecke oberhalb des Mappings wurde entfernt; die Bearbeitung sitzt jetzt direkt rechts neben Graph oder Tabelle.
2. P1 behoben: Logical-first verwendet nicht mehr eine Folge grosser Feld-Fieldsets, sondern eine selektierbare Feldtabelle mit gemeinsamer Detailkomponente.
3. P2 behoben: Die Initialselektion von Feld und Mapping wurde synchronisiert, damit rechts nie Merkmale und Zuordnungsdetails verschiedener Felder erscheinen.
4. P2 behoben: Kleine I14Y-Reset-Aktionen besitzen nun eine 40-px-Trefferfläche, ohne visuell zu dominieren.
5. P3 akzeptiert: Der rechte Editor ist bei langen Merkmalslisten intern scrollbar. Das hält das Mapping im Blick und entspricht ausdrücklich dem gewünschten Fokusverhalten.

Keine offene P0-, P1- oder P2-Abweichung verbleibt.

final result: passed

---

# Design QA – Expertensuche mit Kontext-Navigator und Fokus-Suche (30.10.2026)

## Evidenz und Vergleich

- Gewähltes Ziel: `output/imagegen/expertensuche-2026-10-30/04-auswahl-mit-umschalter-und-vorschau.png` (1488 × 1058). Die Rückmeldung verlangt Kontext-Navigator als Standard, Fokus-Suche als Alternative, grosse Kacheln rechts neben dem Titel und Vorschau in beiden Arten.
- Implementierung: `/search?q=VIBDBU` mit echten, für Christian Man sichtbaren Katalogmetadaten. Desktop: 1440 × 1024 CSS-Pixel bei Device Scale Factor 1; mobile Prüfung bei 390 × 844 und 320 × 740.
- Gemeinsamer visueller Vergleichseingang: `output/ui-regression/expert-search/design-comparison.png`; Referenz auf 1440 × 1024 normalisiert, Implementierung mit derselben Inhaltsbreite und angehefteter Feldvorschau. Suchphrase, Trefferzahlen und Feldinhalte unterscheiden sich, da der Entwurf Beispieldaten verwendet.
- Fokussierter gemeinsamer Vergleich: `output/ui-regression/expert-search/design-focused-comparison.png` für die Auswahlkacheln und die Vorschau. Zusätzlich einzeln geprüft: `expert-context-desktop.png`, `expert-focus-desktop.png`, `expert-context-mobile.png` und `expert-focus-mobile.png` im selben Evidenzverzeichnis.

## Ergebnis

Die visuelle Hierarchie entspricht dem gewählten Konzept: Titel links, grosse Auswahlkacheln rechts, eine Suchzeile mit eingeklappten Filtern und darunter Navigation, Treffer und optionale Vorschau. Kontext gruppiert physische Felder unter ihrer Tabelle, Fokus zeigt dieselben Treffer als Liste. Die Vorschau übernimmt dieselbe Auswahl und Filter bei einem Wechsel.

Bestehende Bundes-CI, Noto-Sans-Typografie, Breadcrumb und rote Bereichsbezeichnung bleiben erhalten. Die Implementierung verwendet die vorhandenen DaCa-Farb- und Abstandsvariablen sowie lokal gespeicherte, unveränderte Tabler-Icons. Echte Metadaten ersetzen die erfundenen Beispieltexte. Zusätzliche Organisations-, Domänen- und Aktualisierungsangaben sind nur in der Vorschau sichtbar; technische Kennungen sind eingeklappt. Die Vorschau ist bei langen Inhalten scrollbar. Auf mobilen Geräten werden Objekttypen horizontal und die Vorschau als schliessbares Overlay dargestellt.

1. P1 behoben: Ein unbeabsichtigt mitbeobachteter API-Cache löste wiederholte Metadatenabfragen aus. Der Identitäts-Effekt beobachtet jetzt ausschliesslich die Identität; Unit- und Browser-Test sichern einmaliges Laden ab.
2. P2 behoben: Beim Schliessen der Vorschau konnte die Fokus-Rückgabe sie erneut öffnen. Escape und Schliessen geben den Fokus jetzt ohne erneutes Öffnen zurück.
3. P2 behoben: Modellkontexte verwenden aufgelöste Domänennamen und Organisationsbezeichnungen statt interner Referenzkennungen.
4. P3 akzeptiert: Die produktive Bundes-CI hat eine kompaktere Typografie als das generierte Bild. Die vorhandene Anwendung bleibt die verbindliche Grundlage für Schriftgrössen und Farben.

Validierung: 518 Web-Tests bestanden; nach der letzten Projektionsergänzung alle 20 Suchtests erneut bestanden. Produktionsbuild erfolgreich. `npm run test:ui-regression -- --flow expert-search --screenshot-dir output/ui-regression/expert-search` bestanden: Standardwahl, Kachelposition, URL-/Filtererhalt, Vorschau per Pointer und Tastatur, Pin/Escape, mobile Darstellung, keine wiederholten Modellabfragen und keine JavaScript-Ausnahmen. `npm run docs:data-model:check` bestanden. Der Build meldet für das neue Suchstylesheet 13,50 kB gegenüber dem 8-kB-Warnbudget; das 14-kB-Fehlerbudget wird eingehalten.

Keine offene P0-, P1- oder P2-Abweichung verbleibt.

final result: passed

---

# UX-Abnahme – Mapping-Einstieg und letzte Arbeiten (30.10.2026)

Die Anforderung ersetzt den automatischen Einstieg in das erste Modell durch eine bewusste
Auswahl. Der verifizierte Einstieg zeigt zwei kompakte Auswahlflächen und darunter letzte
Arbeiten. Modellsuche und physische Objektinspektion sind zunächst geschlossen. Beide
Auswahlreihenfolgen funktionieren; ein ausgewähltes logisches Modell kann auch ohne physische
Auswahl geöffnet werden. Es gibt eine zentrale Aktion **Mapping öffnen**, ohne automatische
Feldzuordnungen. Der bisherige Arbeitsplatz bietet **Andere Modelle auswählen**.

Geprüfte Browser-Evidenz unter `output/ui-regression/mapping-start/`:

- `mapping-start-desktop.png`: 1440 × 1000, geschlossener Einstieg.
- `mapping-start-selected.png`: beide Seiten ausgewählt, lange Objektnamen brechen innerhalb der Fläche um.
- `mapping-start-recent.png`: kompakte Liste mit Titel, physischem Kontext, Zeitpunkt und Fortsetzen.
- `mapping-start-mobile.png`: 390 × 844, Auswahlflächen untereinander; auch 320 px ohne Seitenüberlauf geprüft.

Schrift, Farben, Buttons, Flächen und Abstände verwenden die bestehenden Bundes-CI-Tokens.
Die Bedienelemente sind mindestens 40/44 px hoch, logisch beschriftet und per Tastatur erreichbar.
Das Schliessen der Auswahldialoge führt den Fokus zur auslösenden Aktion zurück. Die Liste zeigt
zunächst höchstens fünf Modelle; mehr Einträge werden nur auf Wunsch eingeblendet. Der aktuelle
Benutzer sieht ausschliesslich seine neu autorisierte Historie. Gespeichert wird Navigationskontext,
kein ungespeicherter Mappingentwurf.

Der Browser-Test bestätigt den Weg vom markierten Übersichtsbutton über physische Auswahl,
Modellauswahl, geöffnetes Mapping und gespeicherte Ansicht bis zur erneuten Fortsetzung nach
einem Seiten-Neuladen. Keine JavaScript-Ausnahmen; beide Mapping-Browserflüsse bestanden.
Keine offene P0-, P1- oder P2-Abweichung.

final result: passed

---

# UX-Abnahme – Speicherneutraler Suchkontext (30.10.2026)

**Data Structures** ersetzt **Tabellen** als Kategorie in Kontext-Navigator und Fokus-Suche.
Die Kategorien bleiben speicherneutral; Treffer und Vorschau verwenden konkrete Bezeichnungen
und Standardicons: Tabelle, View/materialisierte View oder S3-/Parquet-Objekt. Ein generisches
Kategorie-Icon ersetzt auch das frühere Tabellen-Icon bei **Alle Objekte**. Quellen zeigen je
nach Typ Datenbank-, Cloud- oder Inventar-Icons. Physische Feldtreffer behalten ihr Feld-Icon.

Die vorhandene `TooltipDirective` erklärt jeden Kontext per Mouse-over und Tastaturfokus im
bekannten dunklen Katalogstil. Es entstehen keine zusätzlichen dauerhaften Panels oder
verschachtelten Schaltflächen. Die Tooltiptexte erläutern insbesondere die Zusammenfassung
von Tabellen, Views und strukturierten S3-Objekten/Datasets sowie den Unterschied zwischen
fachlichen Begriffen, Datendomänen und physischen Strukturfeldern.

Browser-Evidenz: `output/ui-regression/expert-search/data-structures-context-tooltip.png` und
`data-structures-focus-tooltip.png`. Gemischte echte Tabellen-/S3-Treffer, alte und neue
Filterlinks, Icons und Beschriftungen sind im Browser geprüft. Alle 538 Web-Tests und der
erweiterte Expertensuch-Browserfluss bestanden; keine JavaScript-Ausnahme.

final result: passed

---

# UX-Abnahme – Modelle direkt öffnen und Ladezustand anzeigen (30.10.2026)

Diese Überarbeitung ersetzt den zuvor dokumentierten zweistufigen Auswahl-/Öffnen-Ablauf.
Ein Klick auf ein logisches Modell öffnet unmittelbar dessen Mapping. Ein Klick auf ein
physisches Objekt öffnet `/mappings/physical/:snapshotId/:tableId` direkt mit der gewählten
Repräsentation im echten Canvas. Das logische Gegenstück wird dort gewählt; nach erfolgreicher
Berechtigungsprüfung öffnet das Paar automatisch. Es gibt keine weitere Bestätigung über
**Mapping öffnen** und keinen automatisch erzeugten logischen Entwurf.

Der kleine blaue 20-px-Spinner folgt dem vorhandenen TERMDAT-Lademuster. Modell-, Verlauf-,
Quellen- und Strukturabrufe zeigen ihn unabhängig voneinander mit zugänglichem Statustext;
reduzierte Bewegung wird respektiert. Eine langsame Verlaufsliste blockiert die Modellauswahl
nicht, und der physische Einstieg bleibt während des Modellabrufs bedienbar.

Visuell geprüft unter `output/ui-regression/mapping-start/`:

- `mapping-start-loading.png`: 1440 × 1000; echter Modellabruf im Test angehalten, Spinner sichtbar, physischer Einstieg verfügbar.
- `mapping-physical-open.png`: gewählte Repräsentation im Canvas, logische Gegenseite mit Auswahlaktion.
- `mapping-physical-mobile.png`: 390 × 844; Gegenstück-Aktion in der Toolbar, physische Karte innerhalb des Viewports, lange Namen umbrechend.

Der physische Start zeigt nur verfügbare Inspektions- und Auswahlaktionen; Legende,
Speicherhinweis und Modellbearbeitungsaktionen erscheinen nach dem logischen Einstieg.
Der normale Repräsentations-Anfügedialog behält seine ausdrückliche Hinzufügen-Aktion;
die reine Einstiegsauswahl öffnet direkt beim Objektklick. Kein horizontaler Seitenüberlauf
bei 390/320 px. Alle 542 Web-Tests und der erweiterte `mapping-start`-Browserfluss bestanden.

final result: passed
