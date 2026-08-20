import { DACA_VERSION } from './version';

export type DacaFeatureScope = 'catalog' | 'control-plane';
export type DacaFeatureLocale = 'de' | 'en';

export interface DacaFeatureItem {
  readonly title: string;
  readonly description: string;
}

export interface DacaFeatureList {
  readonly version: typeof DACA_VERSION;
  readonly title: string;
  readonly introduction: string;
  readonly pocNote: string;
  readonly features: readonly DacaFeatureItem[];
}

interface DacaLocalizedFeatureList {
  readonly title: string;
  readonly introduction: string;
  readonly pocNote: string;
  readonly features: readonly DacaFeatureItem[];
}

/**
 * Plain-language release capabilities shown from the version overlay.
 *
 * The release identifier deliberately references DACA_VERSION instead of
 * repeating a version literal, so the feature list cannot drift from the UI
 * and CI/CD release version.
 */
export const DACA_FEATURE_RELEASE = {
  version: DACA_VERSION,
  applications: {
    catalog: {
      de: {
        title: 'Was kann DaCa Catalog?',
        introduction: 'DaCa bringt Informationen, Freigaben und Aufgaben rund um Datenprodukte an einem Ort zusammen.',
        pocNote: 'Hinweis: Diese Liste beschreibt den aktuellen PoC-Stand. Einzelne Abläufe sind simuliert und noch keine produktive Leistung.',
        features: [
          {
            title: 'Neue Versionen ohne F5 übernehmen',
            description: 'DaCa erkennt bereitstehende Versionen, zeigt den Wechsel verständlich an und lädt die Anwendung kontrolliert neu.',
          },
          {
            title: 'PoC anhand geführter Journeys erleben',
            description: 'Der PoC Leitfaden erklärt sechs wiederholbare Abläufe mit Rollen, Voraussetzungen, echten Screenshots und klar ausgewiesenen Grenzen.',
          },
          {
            title: 'Datenprodukte finden und verstehen',
            description: 'Kompakte Qualitätsmedaillen, ein durchsuchbares Datenwörterbuch und sichere Schnittstellenbeispiele helfen bei der Einordnung und Nutzung.',
          },
          {
            title: 'Schnell oder gezielt suchen',
            description: 'Die Startseite zeigt bis zu drei Treffer über die volle verfügbare Breite. Die Expertensuche übernimmt den Suchbegriff und bietet erweiterte Filter.',
          },
          {
            title: 'Service Level gemeinsam festlegen',
            description: 'Versionierte SLA und Nutzungsbedingungen machen Gültigkeit, Supportziele und fachliche Grenzen sichtbar. Eine gespeicherte Kontrollperson gibt jede neue Fassung im Vier-Augen-Prinzip frei.',
          },
          {
            title: 'Änderungen nachvollziehen',
            description: 'Der echte Änderungsverlauf zeigt verständlich, wer Metadaten, Qualität, Freigaben oder die technische Aktivierung eines Datenprodukts verändert hat.',
          },
          {
            title: 'Eigene Datenprodukte verwalten',
            description: 'Ergänzen und prüfen Sie Metadaten, damit andere Personen die Daten richtig einordnen und verwenden können.',
          },
          {
            title: 'Zugriff gezielt freigeben',
            description: 'Legen Sie fest, welche Personen oder Gruppen ein Datenprodukt in welchem Zeitraum nutzen dürfen.',
          },
          {
            title: 'Prüfungen gemeinsam erledigen',
            description: 'Offene Qualitätsprüfungen und Freigaben erscheinen in der persönlichen Aufgabenliste der zuständigen Person.',
          },
          {
            title: 'DAAIF-Veröffentlichungen sicher übernehmen',
            description: 'Neue Datenprodukte werden zuerst geprüft und nach dem Vier-Augen-Prinzip freigegeben, bevor sie sichtbar und zugänglich sind.',
          },
        ],
      },
      en: {
        title: 'What can DaCa Catalog do?',
        introduction: 'DaCa brings product information, approvals and tasks together in one place.',
        pocNote: 'Note: This list describes the current PoC. Some workflows are simulated and are not yet a production service.',
        features: [
          {
            title: 'Apply new versions without F5',
            description: 'DaCa detects available versions, explains the change and reloads the application in a controlled way.',
          },
          {
            title: 'Explore the PoC through guided journeys',
            description: 'The PoC guide explains six repeatable workflows with roles, prerequisites, real screenshots and clearly stated limitations.',
          },
          {
            title: 'Find and understand data products',
            description: 'Compact quality medals, a searchable data dictionary and safe interface examples make products easier to assess and use.',
          },
          {
            title: 'Search quickly or precisely',
            description: 'The Home page shows up to three results across the full available width. Expert search preserves the query and provides advanced filters.',
          },
          {
            title: 'Agree service levels together',
            description: 'Versioned service levels and usage terms make validity, support targets and functional limits visible. A designated control person approves every new revision.',
          },
          {
            title: 'Understand what changed',
            description: 'A real product history explains who changed metadata, quality, approvals or the technical activation of a data product.',
          },
          {
            title: 'Manage your data products',
            description: 'Complete and review metadata so other people can understand and use the data correctly.',
          },
          {
            title: 'Grant access deliberately',
            description: 'Choose which people or groups may use a data product and for how long.',
          },
          {
            title: 'Complete reviews together',
            description: 'Quality checks and approvals appear in the responsible person’s task list.',
          },
          {
            title: 'Accept DAAIF publications safely',
            description: 'New data products are reviewed and approved by a second person before they become visible and accessible.',
          },
        ],
      },
    },
    'control-plane': {
      de: {
        title: 'Was kann DaCa Control Plane?',
        introduction: 'Die Control Plane hilft Betriebsverantwortlichen, die Zusammenarbeit zwischen Datenkatalogen sicher zu steuern.',
        pocNote: 'Hinweis: Diese Liste beschreibt den aktuellen PoC-Stand. Einzelne Abläufe sind simuliert und noch keine produktive Leistung.',
        features: [
          {
            title: 'Neue Versionen ohne F5 übernehmen',
            description: 'DaCa erkennt bereitstehende Versionen, zeigt den Wechsel verständlich an und lädt die Anwendung kontrolliert neu.',
          },
          {
            title: 'Kataloge registrieren',
            description: 'Erfassen Sie die beteiligten Kataloge und sehen Sie deren Verbindungs- und Betriebsstatus.',
          },
          {
            title: 'Vertrauen gezielt festlegen',
            description: 'Bestimmen Sie, welcher Katalog Informationen an welchen anderen Katalog weitergeben darf.',
          },
          {
            title: 'Synchronisation vorbereiten',
            description: 'Halten Sie fest, welche Informationen ausgetauscht werden sollen, ohne ungewollt eine Übertragung auszulösen.',
          },
          {
            title: 'Änderungen nachvollziehen',
            description: 'Status und Ereignisse zeigen, was konfiguriert wurde und wo noch Handlungsbedarf besteht.',
          },
        ],
      },
      en: {
        title: 'What can DaCa Control Plane do?',
        introduction: 'The Control Plane helps operations teams manage collaboration between data catalogs safely.',
        pocNote: 'Note: This list describes the current PoC. Some workflows are simulated and are not yet a production service.',
        features: [
          {
            title: 'Apply new versions without F5',
            description: 'DaCa detects available versions, explains the change and reloads the application in a controlled way.',
          },
          {
            title: 'Register catalogs',
            description: 'Record participating catalogs and see their connection and operating status.',
          },
          {
            title: 'Define trust deliberately',
            description: 'Decide which catalog may share information with which other catalog.',
          },
          {
            title: 'Prepare synchronization',
            description: 'Record what should be exchanged without accidentally starting a transfer.',
          },
          {
            title: 'Track changes',
            description: 'Statuses and events show what was configured and where action is still needed.',
          },
        ],
      },
    },
  },
} as const;

export function dacaFeatureList(
  scope: DacaFeatureScope,
  locale: DacaFeatureLocale,
): DacaFeatureList {
  return {
    version: DACA_FEATURE_RELEASE.version,
    ...DACA_FEATURE_RELEASE.applications[scope][locale],
  };
}
