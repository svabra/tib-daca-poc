# Design-QA – Datenmodellierung

## Referenzen und Prüfumgebung

- Referenzen: `docs/mockups/logical-model-mapping-{split,graph,matrix}.png`
- Implementierung: `/models`, `/models/:id`, `/models/:id/mappings`, `/models/:id/drift`, `/physical-models`
- Browser: Microsoft Edge 152.0.4191.66, nativ über das DevTools-Protokoll gesteuert
- Viewports: 1774×887, 1440×900 und 390×844
- Daten: frische, isolierte SQLite-Datenbank mit Fixture-Adapter; zweimal idempotent geseedet

## Visueller Abgleich

- Die Graphansicht übernimmt die beidseitigen logischen und physischen Knoten, Verbindungslinien, Statuslegende, Auswahlzustand und den Feld-/Mapping-Inspector. Nach dem ersten Vergleich wurde das SVG-Koordinatensystem korrigiert; Verbindungen enden nun sichtbar an den tatsächlichen Quell- und Zielpunkten.
- Die Matrix bildet denselben Signal-basierten Mappingzustand vollständig als semantische Tabelle ab. Multi-Source- und Multi-Target-Zuordnungen bleiben in Graph und Tabelle erhalten.
- Desktop zeigt Graph beziehungsweise Matrix und Inspector nebeneinander. Die fokussierten Aufnahmen belegen den vollständigen Arbeitsbereich, während die gleichnamigen Seitenaufnahmen zusätzlich Navigation, Modellkontext, Snapshotauswahl und Driftbanner zeigen.
- Bei 390×844 ist die Matrix die Standardansicht. Nur `.matrix-region` scrollt horizontal; die Seite selbst überläuft nicht. Sichtbare Bedienelemente sind mindestens 40 px hoch, der Inspector folgt unterhalb der Matrix.
- Status und Drift werden mit Text, Farbe und Linienmuster vermittelt. Die SVG-Verbindungen sind `aria-hidden`; die vollständige tastaturbedienbare Alternative ist der native Mappingdialog.

## Edge-E2E-Evidenz

Der Befehl `npm run test:e2e:modeling:edge -- --base-url http://127.0.0.1:4211 --screenshot-dir docs/mockups/edge-qa` bestand:

1. logical-first: Entwurf, Reload, Review, blockierte Steward-Publikation und finale Owner-Publikation ohne Distribution oder Physik,
2. physical-first: Fixture-Import, nativer zweistufiger Ableitungsdialog, expliziter Concept-Entscheid und Mapping-Entwürfe,
3. existing-to-existing: M:N-Zuordnung, Validierung, Driftbruch, Keyboard-only-Auflösung und unveränderliche Nachfolgeversion.

Erfasste Seitenzustände:

| Zustand | Aufnahme |
|---|---|
| Graph, vollständige Seite | `docs/mockups/edge-qa/mappings-1774x887.png` |
| Graph und Inspector fokussiert | `docs/mockups/edge-qa/mappings-workspace-1774x887.png` |
| Matrix, vollständige Seite | `docs/mockups/edge-qa/mappings-1440x900.png` |
| Matrix und Inspector fokussiert | `docs/mockups/edge-qa/mappings-workspace-1440x900.png` |
| Mobile, vollständige Seite | `docs/mockups/edge-qa/mappings-390x844.png` |
| Mobile Matrix fokussiert | `docs/mockups/edge-qa/mappings-workspace-390x844.png` |
| Modellübersicht | `docs/mockups/edge-qa/models-1774x887.png` |

## Automatisierte Evidenz

- Catalog-UI: 63 Spec-Dateien, 281 Tests bestanden.
- Control-Plane-UI: 2 Spec-Dateien, 5 Tests bestanden.
- Angular Development-Build, Web-Lint und Produktionsbuild: bestanden.
- Responsiver Edge-Vertrag: `viewportWidth=390`, `pageWidth=375`, `workspaceClientWidth=305`, `workspaceScrollWidth=1050`, `minimumTargetHeight=40`.

## Ergebnis

**PASS** – Die drei Kernabläufe, Graph-/Matrix-Parität, Tastaturpfad und responsiven Zustände sind in Microsoft Edge funktional und visuell geprüft.
