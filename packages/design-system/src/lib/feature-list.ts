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
            title: 'Rollen im Demo-Benutzerkontext erleben',
            description: 'Der Demo-Benutzerwechsel umfasst auch Giuseppe Starwars als Data Owner und Thomas Wikinger als Data Steward von armasuisse. Damit lassen sich die beiden Rollen im VBS-Modellierungsscope sichtbar nachvollziehen.',
          },
          {
            title: 'Logische Datenmodelle verständlich erfassen',
            description: 'Data Stewards speichern mehrere unabhängige, mehrsprachige Modelle als Entwurf in PostgreSQL. Die Modellübersicht zeigt den Änderungszeitpunkt mit Datum und Uhrzeit. Felder werden in einer kompakten Tabelle hinzugefügt, entfernt und ausgewählt; sämtliche Merkmale erscheinen im gemeinsamen Editor rechts. Derselbe Editor bleibt neben Graph oder Mapping-Tabelle sichtbar. Kontextuelle Hilfe erscheint ohne Info-Icon direkt über dem fokussierten oder berührten Feldtitel, schliesst beim Verlassen und ist immer nur einmal sichtbar. I14Y-Concepts bleiben optional.',
          },
          {
            title: 'Entwürfe gezielt zur Domänenfreigabe einreichen',
            description: 'Speichern und Einreichen sind bewusst getrennt. Die gewählte Domäne bestimmt den primären Domain Owner und die sichtbare Stellvertretung. Erst das Einreichen erzeugt einen persönlichen Prüfauftrag mit unveränderlichem Snapshot; nur der primäre Owner kann publizieren oder mit Begründung Änderungen verlangen.',
          },
          {
            title: 'Bestehende Datenquellen wie in DAAIF erkunden',
            description: '«Datenquellen» ist ein eigener Hauptmenüpunkt. Jede aktive Verbindungskarte steht für genau eine Systeminstanz pro Katalogpfad; mehrere PostgreSQL-, S3- oder künftige Oracle-Instanzen bleiben getrennt. Freitext, Typ und Owner filtern das Register; die aktive VIBDBU-Demoquelle kann erneut importiert werden. Die Karten führen in den Datenbank-/Schema-/Tabellenbaum mit denselben Server-, PostgreSQL-, Datenbank-, Schema-, Tabellen- und View-Icons wie DAAIF. Ein Modell-Icon vor dem «…»-Kontextmenü markiert Tabellen mit einer logischen Verknüpfung und erklärt sie per Tooltip unabhängig vom Status; beim Verlassen des Icons schliesst der Tooltip sofort. Bei einer Verknüpfung öffnet «Referenziertes logisches Modell öffnen» den Mapping-Arbeitsplatz mit Tabelle und Snapshot vorausgewählt. Das Kontextmenü einer Tabelle leitet ein vollständig editierbares logisches Modell direkt ab; die VIBDBU-Demoquelle liefert dafür 47 kommentierte Felder.',
          },
          {
            title: 'Logische und physische Modelle verbinden',
            description: 'Logical-first und Physical-first bleiben getrennte Einstiege. Die direkte Tabellenableitung erzeugt Modell und exakte 1:1-Mapping-Entwürfe atomar und öffnet sofort den Mapping-Arbeitsplatz; weitere versionierte Repräsentationen werden dort ergänzt. Die Snapshot-Karte im Graphen zeigt das Datenquellen-Icon, Data Ownerin, vollständigen Katalogpfad und gepinnte Revision. Die Kanten messen die gerenderten Anschlussknoten und bleiben bei variabler Kartenhöhe verbunden. Die Kante liest sich logisch zu physisch als «wird repräsentiert durch».',
          },
          {
            title: 'Domänen und Terminology gemeinsam steuern',
            description: 'Mehrsprachige Fachbegriffe und Geschäftsobjekte lassen sich kontrolliert erfassen, versionieren und per SKOS verknüpfen. Die TERMDAT-Suche liefert nach dem Titel-Fokusverlust sichtbare Treffer; Titel und Beschreibungen können anschließend bewusst übernommen oder bestehende Inhalte ausdrücklich überschrieben werden.',
          },
          {
            title: 'Oracle-Datenquellen kontrolliert erschliessen',
            description: 'Ein auffindbarer Quellenkatalog, vertrauenswürdige Gruppen, unveränderliche Gruppensnapshots und direkte Owner-Entscheide steuern den neuen DAAIF-Sourcing-PoC.',
          },
          {
            title: 'DAAIF-Quellen fachlich einordnen',
            description: 'Die Data-Analyst-Journey trennt DAAIF-Strukturmetadaten und DaCa-Semantik konsequent. Nur ein validiertes, nicht durch Drift gebrochenes Mapping darf Analysekontext begründen.',
          },
          {
            title: 'Neue Versionen ohne F5 übernehmen',
            description: 'DaCa erkennt bereitstehende Versionen, zeigt den Wechsel verständlich an und lädt die Anwendung kontrolliert neu.',
          },
          {
            title: 'PoC anhand geführter Journeys erleben',
            description: 'Der PoC Leitfaden erklärt zehn wiederholbare Abläufe mit Rollen, Voraussetzungen, echten Screenshots und klar ausgewiesenen Grenzen. Die Modellierungsabläufe decken Ableitung, Mapping, Validierung, Driftauflösung und die Freigabe eines armasuisse-Modells durch den Domain Owner ab.',
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
            title: 'Verantwortung und Stellvertretung sichtbar machen',
            description: 'Data Owner und ihre Organisation sind mit Foto und Kontaktwegen erkennbar. Eine ausdrücklich zugewiesene Stellvertretung sichert die Handlungsfähigkeit, ohne automatisch zusätzliche Berechtigungen zu erhalten.',
          },
          {
            title: 'Zugriff gezielt freigeben und verlängern',
            description: 'Legen Sie fest, wer ein Datenprodukt wie lange nutzen darf. Auslaufende Freigaben werden erst nach erneutem Vier-Augen-Entscheid verlängert.',
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
            title: 'Explore roles in the demo-user context',
            description: 'The demo-user selector includes Giuseppe Starwars as the armasuisse Data Owner and Thomas Wikinger as its Data Steward, making both roles visible in the VBS modelling scope.',
          },
          {
            title: 'Capture logical data models with clear guidance',
            description: 'Data stewards persist multiple independent multilingual models as PostgreSQL drafts. Contextual field help explains semantics in German, French or Italian; unique identifiers, concrete error lists and red field highlights guide corrections. I14Y Concepts remain optional.',
          },
          {
            title: 'Submit drafts deliberately for domain approval',
            description: 'Saving and submission are deliberately separate. The selected domain determines the primary domain owner and visible deputy. Only submission creates a personal review task with an immutable snapshot; only the primary owner can publish or request changes with a reason.',
          },
          {
            title: 'Explore existing data sources like DAAIF',
            description: 'Active connection cards lead into the DAAIF-style database/schema/table tree. A table context menu derives a logical model directly; the VIBDBU demo exposes 47 commented fields while its 1,000 synthetic building rows and credentials never leave PostgreSQL.',
          },
          {
            title: 'Connect logical and physical models',
            description: 'Logical-first and physical-first remain separate entry points. Direct table derivation atomically creates the model and exact 1:1 mapping drafts, then opens the mapping workspace; further versioned representations are added there. The logical-to-physical edge reads “is represented by”.',
          },
          {
            title: 'Govern domains and terminology together',
            description: 'Multilingual terms and business objects can be captured, versioned and linked with SKOS. TERMDAT search reports visible matches after the title loses focus; titles and descriptions can then be adopted deliberately or existing content can be overwritten explicitly.',
          },
          {
            title: 'Govern access to Oracle data sources',
            description: 'A discoverable source catalog, trusted groups, immutable group snapshots and direct owner decisions govern the new DAAIF sourcing proof of concept.',
          },
          {
            title: 'Put DAAIF sources into business context',
            description: 'The Data Analyst journey keeps DAAIF structural metadata and DaCa semantics separate. Only a validated, non-drifted mapping may establish analytical business context.',
          },
          {
            title: 'Apply new versions without F5',
            description: 'DaCa detects available versions, explains the change and reloads the application in a controlled way.',
          },
          {
            title: 'Explore the PoC through guided journeys',
            description: 'The PoC guide explains ten repeatable workflows with roles, prerequisites, real screenshots and clearly stated limitations. Modeling journeys cover derivation, mapping, validation, drift resolution and domain-owner approval of an armasuisse model.',
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
            title: 'Make ownership and deputies visible',
            description: 'Data owners and their organizations are identifiable through portraits and contact options. An explicitly assigned deputy preserves continuity without automatically receiving additional permissions.',
          },
          {
            title: 'Grant and renew access deliberately',
            description: 'Choose who may use a data product and for how long. Expiring access is renewed only after another four-eyes review.',
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
