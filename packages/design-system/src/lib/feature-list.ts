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
            title: 'Datenprodukte finden und verstehen',
            description: 'Durchsuchen Sie den Katalog und sehen Sie Beschreibung, Herkunft und verfügbare Schnittstellen auf einen Blick.',
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
            title: 'Find and understand data products',
            description: 'Search the catalog and see descriptions, origins and available interfaces at a glance.',
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
