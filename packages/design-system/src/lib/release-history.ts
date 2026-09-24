import { DacaFeatureLocale, DacaFeatureScope } from './feature-list';
import { DACA_VERSION } from './version';

// A version bump must supply new customer-facing notes before the UI can build.
const CURRENT_RELEASE_VERSION: typeof DACA_VERSION = '0.1.29';

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
    { title: 'Feldmerkmale direkt bearbeiten', description: 'Nach der Auswahl eines logischen Felds im Mappinggraph steht der Schreibcursor direkt im Eingabefeld «Entität». Das gilt auch für «Feld bearbeiten» im Kontextmenü.', tags: ['Datenmodelle', 'Bedienung'] },
    { title: 'Feldaktionen im Kontextmenü', description: 'Data Owner und Data Stewards können am logischen Feld per Rechtsklick oder Umschalt+F10 Merkmale bearbeiten, eine Verbindung beginnen, einzelne physische Verbindungen trennen oder das Feld entfernen.', tags: ['Datenmodelle', 'Zuordnungen'] },
    { title: 'Co-Design auf der Versionskarte', description: 'Die Versionskarte nennt V, armasuisse, ESTV und BIT als Co-Designer über dem Versionsstatus.', tags: ['Updates', 'Information'] },
  ] : [
    { title: 'Edit field characteristics immediately', description: 'Selecting a logical field in the mapping graph places the text cursor in the Entity input. The same applies to Edit field in the context menu.', tags: ['Data models', 'Usability'] },
    { title: 'Field actions in the context menu', description: 'Data owners and data stewards can right-click a logical field or press Shift+F10 to edit its characteristics, start a connection, remove an individual physical link, or delete the field.', tags: ['Data models', 'Mappings'] },
    { title: 'Co-design credit on the version card', description: 'The version card credits V, armasuisse, ESTV and BIT above the version status.', tags: ['Updates', 'Information'] },
  ];
  const controlPlaneFeatures: readonly DacaReleaseFeature[] = locale === 'de' ? [
    { title: 'Versionsstand gemeinsam aktualisiert', description: 'Die Kontrollkomponente zeigt denselben aktuellen Versionsstand wie der Datenkatalog.', tags: ['Updates', 'Betrieb'] },
  ] : [
    { title: 'Shared version updated', description: 'The control plane displays the same current version as the data catalog.', tags: ['Updates', 'Operations'] },
  ];
  const latest: DacaRelease = { version: CURRENT_RELEASE_VERSION, features: scope === 'catalog' ? catalogFeatures : controlPlaneFeatures };
  const historical = scope === 'catalog' ? CATALOG_HISTORY : CONTROL_PLANE_HISTORY;
  return [latest, ...historical.map((item) => ({ version: item.version, features: [localizedFeature(item, locale)] }))];
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
