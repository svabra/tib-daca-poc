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


---

# Design QA - Data-highway Lichtband (selected displayed option 2, 2026-10-31)

- Source visual truth: `docs/mockups/data-highway/reference-option-2.png` (1322 x 1190 pixels).
- Browser implementation: localhost:8080, EFD data landscape; 1440 x 1100 CSS viewport, device scale factor 1.
- Canvas comparison capture: `output/ui-regression/organization-highway/highway-comparison-canvas.png` (981 x 664 pixels; SVG world coordinates 960 x 650).
- Combined full-view and focused comparison: `output/ui-regression/organization-highway/highway-design-comparison-initial.png`. Source and browser are shown in the same contact sheet, with labelled close-ups rather than an unqualified pixel-perfect claim.
- Scope: reproduce the selected relationship treatment in the existing product. The mockup enlarges cards and omits existing controls/focus heading; the app intentionally preserves compact cards, navigation, real API counts and existing saved anchors. A read-only four-card fixture makes the main relationships visible without modifying catalog data or the user's personal view.

## Comparison history

Initial comparison found two actionable P2 differences: the ribbon fill was too saturated/solid compared with the translucent source, and bright packet heads/short trailing streaks were insufficiently visible. Reduce band/edge opacity and strengthen the packet head; correct the SVG tail gradient coordinate space so horizontal tails paint reliably.

## Fidelity surfaces

- Typography: existing Noto Sans, navy organization stripe and compact German DP labels retained as requested; the task changes connection styling, not card typography.
- Spacing/layout: smooth bends attach at measured card perimeters; saved anchors stay fixed; intentionally keep the real department title and controls.
- Color/tokens: blue translucent ribbon, central blue spine and subtle glow match the selected direction, pending opacity refinement above.
- Asset quality: source mockup retained locally; live editable relationship geometry remains the existing SVG graph, not a flattened bitmap. Standard organization icons are reused.
- Copy/content: real catalog counts/directions are authoritative. In particular EFV supplies ESTV, and the real visible Neuchatel relationship currently contains one consumed product; the illustrative mock's invented direction/count is not written to the catalog.

Initial functional checks passed: exact 3000ms animation duration, wall-clock playback, curve-following motion, two separate ESTV-to-St-Gallen heads, counterflow lanes, shared keyboard/hover tooltip, fullscreen exit, stationary reduced-motion packets, dark mode and mobile page width. No browser runtime exceptions.

## Post-fix comparison and result

- The saturated band was softened to a 25% blue surface mix at 0.7 opacity, with a lighter edge and retained feathered glow.
- Packet heads now remain bright (0.9-1 opacity), use a 3.5-unit radius and retain a white outline. The fading tail uses `userSpaceOnUse` coordinates, correcting the zero-height line gradient issue.
- Fresh browser capture at the same viewport/state: `output/ui-regression/organization-highway-final/highway-comparison-canvas.png`.
- Final combined full-view/focused comparison: `docs/mockups/data-highway/comparison.png`; durable implementation capture: `docs/mockups/data-highway/implemented-canvas.png`. The contact sheet was opened and reviewed after the fixes. The two P2 differences above are resolved; no actionable P0/P1/P2 difference remains within the connection-treatment scope.
- Required fidelity surfaces were rechecked: existing Noto Sans/card labels preserved; smooth perimeter-to-perimeter layout; translucent blue band/centerline/glow; crisp native editable graph geometry and existing icon components; authoritative catalog counts/directions. Cards are intentionally denser than the illustrative mock, and no mock-only dashboard copy/legend was introduced.
- Final browser checks: `organization-highway` (including the live 3000ms clock check, curve tracking, two separate heads, hover/keyboard tooltip, fullscreen, reduced motion, dark mode and 390px local canvas scrolling), `protected-buildings` (real image-seeded counterflow between armasuisse and Verteidigung) and `organization-view-options` all passed without runtime exceptions.
- Focused tests: 34 passed across organization canvas, highway routing and flow timing. Production image build and version consistency check passed. No persistence changes, remote publication or PoC rollout were performed.

### Implementation checklist

- [x] Reproduce the selected translucent ribbon and fading packets.
- [x] Follow the curve in exactly three seconds; keep packet counts and counterflow lanes.
- [x] Preserve domain dashes, shared tooltip, personal anchors, fullscreen and reduced motion.
- [x] Re-capture and visually compare the revised implementation.

### Follow-up polish

No blocking visual gap remains. Existing overlapping user-saved card positions are intentionally retained; the existing automatic arrangement action can reset that personal layout. Very dense streams retain one head per product and can become visually crowded, as before.

final result: passed


---

# Design QA - Data-highway refinement (2026-10-31)

Source visual truth: `docs/mockups/data-highway/reference-option-2.png` (1322 x 1190 pixels), plus the user's annotated endpoint screenshot and explicit pale-blue area / hidden end caps / tails / blue-white gradient requirements. The existing compact cards, real data counts and saved layout remain the implementation context.

Browser capture: `docs/mockups/data-highway/implemented-canvas-v2.png`, captured from localhost:8080 in a 1440 x 1100 CSS-pixel viewport at device scale factor 1. The SVG stage uses a 960 x 650 coordinate space. Actual raster size is recorded by the source PNG; the comparison sheet normalizes each full view to an 800-pixel maximum width and labels its 2x rendered detail.

Combined full-view and focused evidence: `docs/mockups/data-highway/comparison-v2.png`. Additional browser states are in `output/ui-regression/organization-highway-refined/` (`highway-dark.png`, `highway-mobile.png`, reciprocal fullscreen tooltip and reduced-motion captures).

## Changes and findings

- The active organization container uses the theme's pale-blue surface; organization cards retain their normal white/theme surface.
- Decorative ribbon and centerline continue beneath actual card centers with flat caps. Packet motion and tooltip paths retain their original measured edge endpoints. The focused title remains text-safe. Browser hit-testing confirms both decorative endpoints are occluded by the corresponding card.
- A per-connection blue-white-blue SVG gradient provides a subtle luminous highlight; user-space coordinates work for horizontal and vertical connections.
- A 28-unit tapered, fading tail replaces the short stroke behind each packet head. It follows path orientation, including reverse streams.
- The rendered full view and enlarged connection detail show the requested tint, covered endpoints and gradient/tails without actionable P0/P1/P2 differences. Existing card typography/density is intentionally retained rather than adopting enlarged mockup cards.

## Required fidelity surfaces

- Typography: existing Noto Sans, navy organization caption/stripe, offered/consumed DP labels and counts are preserved.
- Spacing/layout: measured edge flight endpoints, hidden decorative endings and smooth routing; no user anchors are rewritten.
- Colors/tokens: light-blue container, subdued blue-white highlight, blue packet heads and fading tails; dark mode retains theme contrast.
- Image/geometry quality: crisp existing native graph geometry, valid unique SVG gradients, no flattened screenshot replacing the interactive canvas.
- Copy/content: unchanged authoritative relationship counts, directions, tooltip text and localized navigation.

## Verification

35 focused unit tests passed. Production image build passed. The extended `organization-highway` browser flow passed its pale-blue fill, occluded endpoints, flat caps, gradient/tail checks, exact 3000ms animation, real two-product train, curve tracking, reciprocal streams, hover/keyboard tooltip, fullscreen exit, static reduced motion, dark theme and 390px page-width checks without runtime exceptions.

final result: passed


---

# Design QA - Usable space below the organization heading (2026-10-31)

Source: the user's annotated EFD screenshot identifying the unused central strip directly below the focused title/description/counts. Scope is a placement-boundary correction within the existing data-landscape layout.

Browser evidence: `docs/mockups/organization-heading-space/heading-space-de.png`, `heading-space-fr.png` and `heading-space-fullscreen.png` (1440 x 1100 CSS viewport, device scale factor 1). An isolated read-only two-node graph and simulated personal-view saves make the drag destination inspectable; real catalog objects and personal view records are never altered.

The former fixed 160-unit title exclusion reserved too much empty space. The fallback now reserves 96 units, and live layout uses the measured complete heading block in SVG coordinates. Automatic placement, domain grouping, individual drag/arrow movement and marquee-group acceptance share that same current exclusion. The header is observed for wrapping/resize, keyed to organization and language, and measured again for fullscreen. Repeated unchanged bounds do not trigger another layout update.

The browser physically dragged an office card to a center 62 world units below the actual heading bottom, within the formerly prohibited strip, in DE/FR/IT/RM/EN and fullscreen. Every rendered card stayed below the text, and saved/reloaded coordinates retained the existing anchor origin. Language and fullscreen changes did not rewrite stored anchors. The screenshots show the card occupying the requested central space with ordinary typography, colors and spacing preserved.

Required fidelity surfaces: existing Noto Sans and localized headings are unchanged; the text-safe placement clearance replaces the artificial empty strip; pale-blue organization surface and all card/highway colors remain intact; existing vector/UI geometry is retained without raster substitution; API counts, labels and relationship copy are unchanged.

Verification: 44 focused unit tests passed across the component, scatter/domain layout and relationship optimizer. The `organization-heading-space` browser flow passed physical drag, title clearance, simulated save/reload, all five languages and fullscreen without runtime exceptions. Production image build and version consistency checks passed. External PoC rollout remains deferred.

final result: passed


---

# Design QA - More room between successive data packets (2026-10-31)

Source: the user's close-up of crowded St. Gallen / ESTV packet heads. The base phase gap increases from 7.5% to 18% of a three-second cycle. Short paths aim for 32 SVG world units between heads, capped at 45% of a cycle and by the product count, preserving exactly one head per product and the fixed transit time. This leaves room for the glow and tapered tails.

Browser evidence: `docs/mockups/data-highway/packet-spacing.png` (canvas capture from a 1440 x 1100 CSS viewport at device scale factor 1); full states are in `output/ui-regression/highway-packet-spacing/`. The rendered two-head stream was opened and visually checked: heads and trails are clearly separated. Layout, colors, typography, organization counts and data direction are unchanged.

Both focused flow tests passed, along with the production image build and the `organization-highway` browser check. Browser validation retains exact 3000ms wall-clock transit, distinct one/two-product streams, reciprocal directions, curve tracking, tooltips, fullscreen, dark/mobile states and static reduced motion. The long-path visual fixture now enforces more than 28 pixels between the two heads.

final result: passed


---

# Design QA - Smooth and slimmer organization highways (2026-10-31)

Source: the user's annotated diagonally offset St. Gallen / ESTV connection, highlighting abrupt joins and asking for a slimmer band. Scope: connection geometry and visible stroke widths.

## Comparison history

The previous ribbon joined straight under-card segments to a curved flight. An initial tangent-matched continuation removed the literal angle, but the rendered offset-card case still showed a small wave near the card. This was treated as an actionable P2 and replaced with a single continuous cubic from one organization to the other. The flight is now an exact cubic subdivision of that same ribbon, clipped at measured card bounds, so there are no attached end segments or curvature changes at a join. Focused-title attachments remain text-safe.

Combined before/after full-view and focused evidence: `docs/mockups/data-highway/smooth-offset-comparison.png`. Final browser images: `slimmer-smooth-offset.png` and `slimmer-smooth-canvas.png` in the same folder. Original browser viewport: 1440 x 1100 CSS pixels, device scale factor 1; comparison full views are normalized to 800px width, and details are enlarged 2x. The final images were opened and inspected after the geometry replacement.

The offset case now has one smooth S-curve entering/leaving each card, without the earlier angular/wavy neck. Main band width is 12 SVG units instead of 18 (one-third slimmer), edge 14 instead of 20, glow 18 instead of 24 with a smaller blur. The wider invisible tooltip hit target remains accessible.

Typography, existing card placement, pale-blue organization surface, blue-white gradient, packet count, distinct spacing, trails, directions and three-second transit remain intact. No user layout or catalog data was rewritten. Focused-title/unit cases retain correct perimeter attachment, and reverse streams use the same continuous geometry.

Verification: 37 focused tests passed, including exact clipping/reversal at measured card bounds. Production build and version check passed. The extended `organization-highway` browser flow passed single-cubic offset-card geometry, 12-unit ribbon width, packets staying on the visible ribbon, 3000ms wall-clock timing, packet separation, tooltips, fullscreen, dark/mobile and reduced-motion states. The real seeded `protected-buildings` counterflow check also passed; no runtime exceptions.

final result: passed

---

# Design QA - Compact data-landscape toolbar and active relationship filter (2026-10-31)

Source: the user's annotated toolbar screenshot. The redundant unsaved-arrangement status and top marquee-selection instruction are removed. Both standard toggles now sit in the upper arrangement toolbar, before fullscreen; compact gaps keep the desktop controls on one row. Breadcrumbs retain their own navigation row.

The relationship filter starts enabled and uses the exact German caption `Orgs ohne DP-Beziehungen ausblenden`, without terminal punctuation. Corresponding compact captions are provided in FR/IT/RM/EN. Domains remains disabled initially. The shared explanatory tooltip, checkable organization/domain context-menu options, selection interactions and Save/Discard behavior remain available. Filtering changes no saved positions or catalog data.

Browser evidence: `docs/mockups/organization-toolbar/compact-toolbar.png` and `compact-toolbar-mobile.png`, captured from the rebuilt local UI on port 8080 at 1440px and 390px viewport widths. Both images were opened and inspected. Desktop controls align on one row; mobile controls wrap within the page. Typography, existing graph geometry, card colors and counts are unchanged.

Verification: 34 focused component/i18n tests passed. Production image build and version consistency checks passed. The `organization-view-options` browser flow passed default visibility, exact caption and control placement, shared tooltip, organization/domain context-menu keyboard operation, unchanged saved view, fullscreen and mobile checks. External PoC rollout remains deferred.

final result: passed

---

# Design QA - Shared data highways and semantic cards in lineage (2026-10-31)

Source: the user's Lineage & Provenienz screenshot and the existing domain-network asset cards. Scope: adopt the approved data-landscape highway treatment and the domain-network card hierarchy on the lineage page.

The data landscape and lineage now consume one native-SVG highway stylesheet: 12-unit blue-white gradient ribbon, 14-unit edge, soft glow, fine spine and circular pulsing head with a tapered 28-unit tail. Lineage retains Dagre's routed waypoints and parallel edges; flat decorative ends continue under the source/target cards. One illustrative packet per metadata relationship crosses the visible path in three seconds, without arrowheads. Verified/declared spines remain solid/dashed. Reduced motion shows a stationary midpoint packet instead of hiding the relationship. The shared tooltip explicitly distinguishes illustrative motion from live traffic.

Domain-network asset cards and lineage use the same `daca-canvas-object` rules: 240 x 95 px, 2 px corners, 3 px left type stripe, muted icon/type caption, two-line title and small metadata footer. Known catalog products use mustard regardless of their source/consumer role. Explicit typed catalog URNs use the central organization, logical, physical, domain or term color; unresolved references retain their source/transform/consumer role. Registered connection/source URNs are not invented physical representations. Provenance events, metadata links, owner-only access capabilities and the selected-object panel retain their existing meaning. The selected card uses the pale-blue surface, and canvas/label colors now follow the theme in dark mode.

Browser evidence: `docs/mockups/lineage-highway/canvas.png`, `dark.png`, `mobile.png`, `domain-card-reference.png` and `lineage-card-comparison.png`. All were opened and inspected (desktop 1920/1440px and mobile 390px). An initial dark-mode screenshot exposed the old hardcoded light canvas background; this was corrected to theme tokens and the final dark screenshot was inspected again. Cards match the reference hierarchy; highways end under cards without visible round caps. Existing font family, catalog copy, full-title summaries and metadata remain available.

Verification: 61 focused component tests passed across lineage, organization canvas and domain network. The `lineage-explorer` browser flow passed labels, covered endpoints, shared type identity, actual packet travel at 3000ms, pulsing halos, summaries, native new tabs, reference selection, static reduced motion and mobile bounds. `canvas-card-styles` compares actual width/height, padding, stripe width, corners, caption color/font, title size/weight/line height and metadata size between domain and lineage cards, and passes across the remaining canvases and all five organization locales. The existing `organization-highway` flow also passes after extracting the shared skin, including its wall-clock three-second transit and curve tracking. Production build, version consistency and whitespace checks passed. Local UI on port 8080 is updated; external PoC rollout remains deferred.

final result: passed

---

# Design QA - Packets disappear underneath cards (2026-10-31)

The user's follow-up identifies packet heads disappearing before entering a box. Decorative ribbons already ran under cards, but lineage flights stopped at Dagre perimeter ports and organization flights were clipped six units outside the measured card bounds. Both flights now include covered sections: a shared 36-unit overlap in lineage's routed endpoints and inset measured rectangles in the organization canvas. The same smooth ribbon remains visible; heads, halos and tails travel under the opaque card before looping. Focused-title attachments remain outside the text, and no card positions or catalog records change.

Browser evidence: `docs/mockups/lineage-highway/packets-under-boxes.png` and `docs/mockups/data-highway/packets-under-boxes.png`, opened and inspected. Captures pause packets at the covered end of the loop. More decisively, the browser samples the start/end of every test flight at 0.1% and 99.9% and hit-tests the head center plus all four corners of a 16px halo footprint: each point is occluded by the corresponding source/target card. Organization fixtures also cover curved connections and two-packet trains.

41 focused component/geometry tests passed, including measured card-height changes. Both `lineage-explorer` and `organization-highway` browser regressions passed their new occlusion assertions and existing tooltips, curve tracking, reduced motion, mobile and theme checks. The organization wall-clock check still reports 3000ms at playback rate 1. Production image build, version consistency and whitespace checks passed. Local port 8080 is updated; external rollout remains deferred.

final result: passed

---

# Design QA - Product surface and Data Owner match domain cards (2026-10-31)

The user's reference shows a normal-surface domain-network product card with its Data Owner beneath the title. Lineage now retains the shared theme surface for selected cards and replaces the product card's catalog footer with the actual Data Owner. This also applies to known products with an upstream/downstream role. Unknown ownership stays explicitly unknown; catalog identity remains in the summary/details. The accessible card name includes Data Owner, and selection still uses its existing pressed state and type-colored border.

Evidence: `docs/mockups/lineage-highway/product-owner.png`, opened and inspected from the rebuilt UI on localhost:8080. The selected ESTV card is white in the light theme and visibly shows Kassandra Valdata beneath its title. The six existing lineage component tests pass, including visible/accessible owner assertions. The browser flow independently compares the selected background with the normal theme surface and verifies the actual owner; existing packet occlusion, motion, tooltips, native links, reduced-motion and mobile checks still pass. Production build, version consistency and whitespace checks passed. Documentation and current release features are updated; external rollout remains deferred.

final result: passed

---

# Release validation - DaCa 0.3.4 (2026-10-31)

The requested release updates the current feature overlay and all 29 managed version surfaces to 0.3.4. The local 0.3.3 working version was not published as a separate release; the existing 0.3.2 feature archive remains intact. Catalog UI/API were rebuilt and restarted locally at 0.3.4. Git commit/push is authorized; external PoC/OpenShift rollout remains deferred. The existing main-branch CI may build/publish images but performs no OpenShift deployment.

Verification: 710 frontend tests passed (704 catalog, six control-plane), 34 focused Catalog API tests passed against an isolated `daca_catalog_test` PostgreSQL database, 18 release-version/seed-CLI contract tests passed, and all 18 OPA checks passed. Both web production artifacts and all Python distributions built successfully, including 0.3.4 service-worker metadata checks. Generated data-model/OpenAPI documentation and whitespace checks are current.

The broad browser run exposed a legacy card-view assumption in owner search; that test now requests cards explicitly, preserving the requested default network view. Focused owner-search, metadata, handover and canvas-gesture checks verify those paths; the Windows harness now waits for its Edge process before removing its validated temporary profile. The startup contract explicitly exercises all four additive product fixture dispatches. The release commit is gated by the unchanged `.githooks/pre-commit` command `npm run test:ui-regression`; no bypass is used.

The domain-network browser check also waits for object loading and compares radial subpixel positions with a 0.02px CSS-serialization tolerance, rather than requiring a rounded inline style to equal the original full-precision coordinate. The focused domain-network flow passed private save/discard, shared-relation isolation, object searches and hierarchy after this test correction.

The complete browser gate caught narrow-viewport Mapping actions remaining 32px high when the browser reported a fine pointer. Shared canvas controls now use 44px minimum actions for widths up to 700px as well as coarse pointers; desktop density stays compact. `mapping-release-tail` passed existing-model mappings, the 390px target/overflow assertions, model Journey 10, source-access return/renewal and atomic field movement. The resulting mobile workspace screenshot was inspected and retained as `docs/mockups/canvas-controls/mobile-mapping-actions.png`. Catalog UI was rebuilt after the responsive correction.
