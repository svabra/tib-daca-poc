import { DacaFeatureLocale, DacaFeatureScope } from './feature-list';
import { DACA_VERSION } from './version';

// A version bump must supply new customer-facing notes before the UI can build.
const CURRENT_RELEASE_VERSION: typeof DACA_VERSION = '0.1.31';

export interface DacaReleaseFeature {
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
}

export interface DacaRelease {
  readonly version: string;
  readonly features: readonly DacaReleaseFeature[];
}

interface HistoricalFeature {
  readonly version: string;
  readonly de: readonly [string, string, readonly string[]];
  readonly en: readonly [string, string, readonly string[]];
}

/** Verified release versions from VERSION history; unreleased numbers are deliberately absent. */
const CATALOG_HISTORY: readonly HistoricalFeature[] = [
  { version: '0.1.29', de: ['Feldbearbeitung und Co-Design', 'Ausgewählte logische Felder öffnen direkt die Entitätsbearbeitung. Das Kontextmenü bietet Feldmerkmale, neue Verbindungen, das Trennen einzelner Links und das Entfernen von Feldern. Die Versionskarte nennt V, armasuisse, ESTV und BIT als Co-Designer.', ['Datenmodelle', 'Bedienung', 'Updates']], en: ['Field editing and co-design', 'Selecting a logical field focuses its Entity input. The context menu offers field characteristics, new connections, unlinking and field removal. The version card credits V, armasuisse, ESTV and BIT as co-designers.', ['Data models', 'Usability', 'Updates']] },
  { version: '0.1.28', de: ['Updates und Einstellungen im Blick', 'Die Versionskarte erklärt Neuerungen und führt zur durchsuchbaren Featureliste; Updates lassen sich bewusst übernehmen. Die Einstellungen sind direkt im Header erreichbar.', ['Updates', 'Einstellungen']], en: ['See updates and settings', 'The version card explains changes and links to the searchable feature list; you choose when to apply updates. Settings are available from the header.', ['Updates', 'Settings']] },
  { version: '0.1.27', de: ['Quellenpfade zuverlässig öffnen', 'Verweise auf den Katalogpfad einer Datenquelle führen wieder zum passenden Objekt.', ['Datenquellen', 'Navigation']], en: ['Open source paths reliably', 'Catalog source links lead to the corresponding object again.', ['Data sources', 'Navigation']] },
  { version: '0.1.26', de: ['Mit einer vorhandenen Tabelle starten', 'Aus einer sichtbaren Datenquelle lässt sich direkt ein bearbeitbarer Entwurf für ein logisches Modell ableiten.', ['Datenquellen', 'Datenmodelle']], en: ['Start from an existing table', 'Derive an editable logical-model draft directly from a visible data source.', ['Data sources', 'Data models']] },
  { version: '0.1.25', de: ['Modellkennung zugänglich wählen', 'Die Wahl der Modellkennung ist auch mit Tastatur und Hilfstechnologien verständlich bedienbar.', ['Datenmodelle', 'Bedienung']], en: ['Choose model identifiers accessibly', 'The model identifier control works clearly with keyboards and assistive technology.', ['Data models', 'Usability']] },
  { version: '0.1.24', de: ['Speicherprobleme besser verstehen', 'Beim Speichern eines Modells helfen verständliche Rückmeldungen, Eingaben gezielt zu korrigieren.', ['Datenmodelle', 'Qualität']], en: ['Understand save problems', 'Clear feedback helps you correct model inputs when a save fails.', ['Data models', 'Quality']] },
  { version: '0.1.23', de: ['Modelle erfassen und einreichen', 'Feldhilfen unterstützen die Erfassung; Speichern und Einreichen zur fachlichen Freigabe sind getrennte Schritte.', ['Datenmodelle', 'Freigabe']], en: ['Capture and submit models', 'Field help supports entry; saving and submitting for business approval are separate steps.', ['Data models', 'Approval']] },
  { version: '0.1.22', de: ['Modellentwürfe übersichtlicher prüfen', 'Entwürfe und persönliche Prüfaufträge sind klarer voneinander getrennt.', ['Datenmodelle', 'Aufgaben']], en: ['Review model drafts more clearly', 'Drafts and personal review tasks are easier to distinguish.', ['Data models', 'Tasks']] },
  { version: '0.1.21', de: ['Fehler im Modell gezielt korrigieren', 'Hinweise an betroffenen Feldern unterstützen die Korrektur vor der Freigabe.', ['Datenmodelle', 'Qualität']], en: ['Correct model errors', 'Field-level guidance helps you make corrections before approval.', ['Data models', 'Quality']] },
  { version: '0.1.20', de: ['Modellierung verlässlicher fortsetzen', 'Datenbankänderungen für logische Modelle lassen sich in der lokalen Vorschau kontrolliert zurücknehmen.', ['Datenmodelle', 'Stabilität']], en: ['Continue modeling reliably', 'Database changes for logical models can be rolled back in the local preview.', ['Data models', 'Reliability']] },
  { version: '0.1.19', de: ['Logische und physische Modelle verbinden', 'Datenmodelle können mit versionierten physischen Darstellungen verknüpft und geprüft werden.', ['Datenmodelle', 'Datenquellen']], en: ['Connect logical and physical models', 'Link and review models against versioned physical representations.', ['Data models', 'Data sources']] },
  { version: '0.1.18', de: ['Fachbegriffe gemeinsam pflegen', 'Mehrsprachige Begriffe lassen sich kontrolliert bearbeiten und miteinander verknüpfen.', ['Terminologie', 'Zusammenarbeit']], en: ['Maintain terms together', 'Edit and connect multilingual business terms in a governed workflow.', ['Terminology', 'Collaboration']] },
  { version: '0.1.17', de: ['Domänen und Begriffe ordnen', 'Fachliche Domänen und ihre Terminologie können gemeinsam verwaltet werden.', ['Domänen', 'Terminologie']], en: ['Organize domains and terms', 'Manage business domains and their terminology together.', ['Domains', 'Terminology']] },
  { version: '0.1.15', de: ['Stellvertretung sichtbar machen', 'Data Owner können eine ausdrücklich zugewiesene Stellvertretung erkennen.', ['Verantwortung', 'Freigabe']], en: ['See assigned deputies', 'Data owners can identify an explicitly assigned deputy.', ['Ownership', 'Approval']] },
  { version: '0.1.14', de: ['Prüfverantwortung erkennen', 'Owner- und Prüferangaben sind bei Entscheidungen besser nachvollziehbar.', ['Verantwortung', 'Aufgaben']], en: ['Identify reviewers', 'Owner and reviewer details make decisions easier to follow.', ['Ownership', 'Tasks']] },
  { version: '0.1.13', de: ['Oracle-Quellen kontrolliert erschliessen', 'Eine geführte Journey zeigt, wie der Zugang zu Oracle-Datenquellen beantragt und geprüft wird.', ['Datenquellen', 'Zugriff']], en: ['Explore Oracle sources safely', 'A guided journey shows how Oracle source access is requested and reviewed.', ['Data sources', 'Access']] },
  { version: '0.1.12', de: ['Neue Versionen leichter übernehmen', 'DaCa informiert über bereitstehende Updates und lädt die Anwendung nach Bestätigung neu.', ['Updates', 'Bedienung']], en: ['Apply new versions easily', 'DaCa announces available updates and reloads after confirmation.', ['Updates', 'Usability']] },
  { version: '0.1.11', de: ['Katalogfunktionen gemeinsam nutzen', 'Die bisher eingeführten Katalogfunktionen stehen in einer abgestimmten Version bereit.', ['Datenprodukte', 'Stabilität']], en: ['Use catalog features together', 'Previously introduced catalog capabilities are available in a coordinated release.', ['Data products', 'Reliability']] },
  { version: '0.1.10', de: ['Gezielter zur Suche wechseln', 'Von der Startseite gelangen Sie mit übernommenem Suchbegriff in die Expertensuche.', ['Suche', 'Navigation']], en: ['Move to advanced search', 'Carry a search term from the home page into advanced search.', ['Search', 'Navigation']] },
  { version: '0.1.9', de: ['Service Level nachvollziehen', 'Gültigkeit, Supportziele und Nutzungsbedingungen eines Datenprodukts sind versioniert sichtbar.', ['Datenprodukte', 'Vereinbarungen']], en: ['Understand service levels', 'See versioned validity, support targets and usage terms for a data product.', ['Data products', 'Agreements']] },
  { version: '0.1.8', de: ['Datenprodukte geführt kennenlernen', 'Die Produktansicht erklärt die wichtigsten Informationen entlang typischer Aufgaben.', ['Datenprodukte', 'Lernen']], en: ['Explore data products with guidance', 'The product view explains key information through typical tasks.', ['Data products', 'Learning']] },
  { version: '0.1.6', de: ['Änderungen am Produkt verfolgen', 'Ein Verlauf zeigt, wer Produktinformationen geändert hat und warum dies für die Nutzung relevant ist.', ['Datenprodukte', 'Änderungsverlauf']], en: ['Track product changes', 'A history shows who changed product information and why it matters for use.', ['Data products', 'History']] },
  { version: '0.1.4', de: ['Produkte übersichtlicher erreichen', 'Die Startseite und die Liste eigener Datenprodukte wurden besser aufeinander abgestimmt.', ['Datenprodukte', 'Navigation']], en: ['Reach products more easily', 'The home page and personal product list work together more clearly.', ['Data products', 'Navigation']] },
  { version: '0.1.3', de: ['Geführte PoC-Abläufe nutzen', 'Ein Leitfaden erklärt typische Schritte, Rollen und Grenzen der lokalen Vorschau.', ['Lernen', 'PoC']], en: ['Follow guided PoC workflows', 'A guide explains typical steps, roles and limits of the local preview.', ['Learning', 'PoC']] },
  { version: '0.1.1', de: ['Versionsstand erkennen', 'Die Versionskarte macht den Stand der lokalen Vorschau und ihre Funktionen sichtbar.', ['Updates', 'PoC']], en: ['See the current version', 'The version card shows the status and capabilities of the local preview.', ['Updates', 'PoC']] },
];

const CONTROL_PLANE_HISTORY: readonly HistoricalFeature[] = [
  { version: '0.1.29', de: ['Versionsstand gemeinsam aktualisiert', 'Die Kontrollkomponente zeigt denselben aktuellen Versionsstand wie der Datenkatalog.', ['Updates', 'Betrieb']], en: ['Shared version updated', 'The control plane displays the same current version as the data catalog.', ['Updates', 'Operations']] },
  { version: '0.1.28', de: ['Updates und Einstellungen im Blick', 'Die Versionskarte führt zur durchsuchbaren Featureliste. Updates lassen sich nach einer Warnung zu ungespeicherten Inhalten bewusst übernehmen; Einstellungen sind direkt im Header erreichbar.', ['Updates', 'Einstellungen']], en: ['See updates and settings', 'The version card links to the searchable feature list. Choose when to apply an update after a warning about unsaved content; settings are available from the header.', ['Updates', 'Settings']] },
  { version: '0.1.12', de: ['Neue Versionen leichter übernehmen', 'Bereitstehende Updates können nach Bestätigung geladen werden.', ['Updates', 'Bedienung']], en: ['Apply new versions easily', 'Available updates can be loaded after confirmation.', ['Updates', 'Usability']] },
  { version: '0.1.11', de: ['Kataloge im Blick behalten', 'Registrierte Kataloge und ihr Status sind in der lokalen Steuerungsansicht sichtbar.', ['Kataloge', 'Betrieb']], en: ['Monitor catalogs', 'Registered catalogs and their status are visible in the local control view.', ['Catalogs', 'Operations']] },
  { version: '0.1.1', de: ['Zusammenarbeit vorbereiten', 'Vertrauensbeziehungen und gewünschte Synchronisationen lassen sich ohne Datenübertragung festhalten.', ['Vertrauen', 'Synchronisation']], en: ['Prepare collaboration', 'Record trust and desired synchronization without transferring data.', ['Trust', 'Synchronization']] },
];

function localizedFeature(source: HistoricalFeature, locale: DacaFeatureLocale): DacaReleaseFeature {
  const [title, description, tags] = source[locale];
  return { title, description, tags };
}

export function dacaReleaseHistory(scope: DacaFeatureScope, locale: DacaFeatureLocale): readonly DacaRelease[] {
  const catalogFeatures: readonly DacaReleaseFeature[] = locale === 'de' ? [
    { title: "Strukturinventare organisationsübergreifend zuordnen", description: "Strukturinventare auch aus anderen Organisationen mit logischen Modellen verbinden, wenn für beide Bereiche eine Berechtigung besteht. Der Dialog verwendet die serverseitige Auswahlentscheidung; Speichern und Inspektion prüfen die Rechte erneut. Angebundene Quellen behalten ihre Organisationsgrenze.", tags: ["Datenmodelle", "Datenquellen", "Berechtigungen"] },
    { title: "Strukturinventare importieren und verwalten", description: "CSV-Strukturinventare ohne technische Anbindung von angebundenen Datenquellen unterscheiden. Physische Modelle mit Vorschau, Suche und Originalangaben inspizieren. Inventare mit Bestätigung archivieren, wiederherstellen oder bei fehlenden Modellverknüpfungen löschen; das Inventarprotokoll hält Person und Zeitpunkt fest und bleibt nach dem Löschen erhalten.", tags: ["Datenmodelle", "Import", "Datenquellen", "Protokoll"] },
  ] : [
    { title: "Attach structure inventories across organizations", description: "Link inventories from other organizations when independently authorized for both the model and inventory. The picker uses server-side eligibility; saving and inspection recheck access. Connected sources retain their organization boundary.", tags: ["Data models", "Data sources", "Permissions"] },
    { title: "Import and manage structure inventories", description: "Distinguish endpoint-free CSV structure inventories from connected data sources. Inspect physical models with preview, search and original declarations. Confirm archival, restoration or deletion of unreferenced inventories; the inventory audit records actor and time and survives deletion.", tags: ["Data models", "Import", "Data sources", "Audit"] },
  ];
  const previousCatalogFeatures: readonly DacaReleaseFeature[] = locale === 'de' ? [
    { title: "Physische Modelle aus CSV laden", description: "Strukturinventare mit Vorschau, Suche und Organisationsauswahl als statische Datenquelle importieren. Tabellen und Felder öffnen direkt im Explorer; Originalangaben bleiben erhalten und identische Importe werden wiederverwendet.", tags: ["Datenmodelle", "Import"] },
    { title: "Mehrere physische Repräsentationen verbinden", description: "PostgreSQL-Tabellen und Views, S3-Parquet-Objekte und CSV-Modelle gemeinsam mit einem logischen Modell verbinden. Eindeutig namensgleiche Felder werden unabhängig von Gross- und Kleinschreibung als Entwürfe verknüpft; Typkonflikte bleiben sichtbar.", tags: ["Datenmodelle", "Zuordnungen", "Datenquellen"] },
    { title: "Beziehungen direkt im Canvas bearbeiten", description: "Verbindungslinien per Kontextmenü löschen oder ihren Mapping-Typ und ihre Regel ändern. Erklärende Tooltips helfen bei der Typwahl; beide Linienenden lassen sich auf andere Felder desselben Modells ziehen. Änderungen bleiben Entwürfe bis zum Speichern.", tags: ["Zuordnungen", "Editor"] },
    { title: "Canvas frei anordnen, vergrössern und drucken", description: "Modellkarten frei verschieben; dünne Verbindungen folgen den zugewandten Anschlüssen. Sticky-Steuerungen öffnen Vollbild oder drucken den Canvas mit Titel, Bundeslogo, Modellstand und Druckdatum. Darstellungen lassen sich ohne Löschen der Mappings ausblenden.", tags: ["Editor", "Druck", "Bedienung"] },
    { title: "Domänen und zugehörige Modelle im Blick", description: "Domänen direkt am logischen oder physischen Modell zuordnen und öffnen. Bei logischen Modellen lassen sich die physischen Repräsentationen für die Weitergabe auswählen. Domänen zeigen durchsuchbare Listen ihrer logischen und sichtbaren physischen Modelle.", tags: ["Domänen", "Datenmodelle"] },
    { title: "Begriffsnetz als editierbarer Graph", description: "Begriffe frei anordnen und ihre beschrifteten Beziehungen mit sichtbaren Anschlüssen bearbeiten, umhängen oder löschen. Fachliche Änderungen werden als Entwürfe zur Domänenfreigabe eingereicht. Personal enthält zehn verknüpfte Demobegriffe; Vollbild und Druck unterstützen die Übersicht.", tags: ["Domänen", "Terminologie", "Editor"] },
  ] : [
    { title: "Load physical models from CSV", description: "Import structure inventories as a static metadata source with preview, search and organization selection. Tables and fields open in the explorer, original declarations stay inspectable and identical imports are reused.", tags: ["Data models", "Import"] },
    { title: "Connect multiple physical representations", description: "Connect PostgreSQL tables and views, S3 Parquet objects and CSV models to one logical model. Unique case-insensitive exact field names create draft links; type conflicts remain visible.", tags: ["Data models", "Mappings", "Data sources"] },
    { title: "Edit relationships on the canvas", description: "Use a connection context menu to delete a relationship or change its mapping type and rule. Tooltips explain each type; drag either endpoint to another field in the same model. Changes remain drafts until saved.", tags: ["Mappings", "Editor"] },
    { title: "Arrange, expand and print the canvas", description: "Move model cards freely; thin connections follow the facing ports. Sticky controls open fullscreen or print the canvas with its title, federal logo, model update and print date. Hide a drawing while retaining its mappings.", tags: ["Editor", "Print", "Usability"] },
    { title: "Explore domains and their models", description: "Assign and open domains from logical and physical model headers. Select which physical representations receive a logical model’s domain. Domains list their logical and visible physical models with search and direct links.", tags: ["Domains", "Data models"] },
    { title: "Edit the concept network as a graph", description: "Arrange concepts freely and edit, rewire or delete their labelled relationships through visible ports. Submit terminology drafts for domain approval. Personnel includes ten linked demo concepts; fullscreen and print support exploration.", tags: ["Domains", "Terminology", "Editor"] },
  ];
  const controlPlaneFeatures: readonly DacaReleaseFeature[] = locale === 'de' ? [
    { title: 'Versionsstand gemeinsam aktualisiert', description: 'Die Kontrollkomponente zeigt denselben aktuellen Versionsstand wie der Datenkatalog.', tags: ['Updates', 'Betrieb'] },
  ] : [
    { title: 'Shared version updated', description: 'The control plane displays the same current version as the data catalog.', tags: ['Updates', 'Operations'] },
  ];
  const latest: DacaRelease = { version: CURRENT_RELEASE_VERSION, features: scope === 'catalog' ? catalogFeatures : controlPlaneFeatures };
  const historical = scope === 'catalog' ? CATALOG_HISTORY : CONTROL_PLANE_HISTORY;
  return [latest, { version: '0.1.30', features: scope === 'catalog' ? previousCatalogFeatures : controlPlaneFeatures }, ...historical.map((item) => ({ version: item.version, features: [localizedFeature(item, locale)] }))];
}

export function searchDacaReleases(scope: DacaFeatureScope, locale: DacaFeatureLocale, query: string): readonly DacaRelease[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return dacaReleaseHistory(scope, locale);
  return dacaReleaseHistory(scope, locale).map((release) => ({
    ...release,
    features: release.features.filter((feature) => terms.every((term) =>
      `${release.version} ${feature.title} ${feature.description} ${feature.tags.join(' ')}`.toLocaleLowerCase().includes(term))),
  })).filter((release) => release.features.length > 0);
}
