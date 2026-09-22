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
