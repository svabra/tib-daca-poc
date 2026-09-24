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
 * Cumulative PoC capability snapshot retained for compatibility.
 * The user-facing, version-specific and tagged archive lives in release-history.ts;
 * the version overlay renders only its newest release.
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
        introduction: 'DaCa ist der zentrale Datenkatalog der Data Platform BIT und bringt Metadaten, Freigaben und Aufgaben an einem Ort zusammen.',
        pocNote: 'Hinweis: Diese Liste beschreibt den aktuellen PoC-Stand. Einzelne Abläufe sind simuliert und noch keine produktive Leistung.',
        features: [
          {
            title: 'Zentraler Datenkatalog',
            description: 'DaCa verwaltet Metadaten, Datenprodukte, Endpunkte, Herkunftsinformationen und Zugriffsregeln in einem zentralen Katalog. Die bisherigen Trust- und Sync-Einträge der Control Plane sind PoC-Prototypdaten.',
          },
          {
            title: 'Zuständigkeiten aus drei Perspektiven und Katalogdokumentation',
            description: 'Unter Einstellungen zeigen Kategorien, Personen und Domänen dieselben in PostgreSQL gespeicherten Rollen- und Objektbeziehungen. Physische Tabellen bleiben über eine direkte Domänenzuordnung auch ohne logisches Mapping auffindbar. Die Dokumentation im Header bündelt User Journeys, Grundlagen und das eigenständige DaCa-Anwendungsglossar. Fachliche Terminologie bleibt separat. Rollenbegriffe sind hellgrau gewellt markiert und erhalten bei Bedarf eine Kurzbeschreibung mit Link zum vollständigen Eintrag und AKV. Der Tooltip bleibt beim Mausweg zum Link geöffnet.',
          },
          {
            title: 'Rollenprotokoll und Journey zur Verantwortung',
            description: 'Ein fortlaufendes PostgreSQL-Protokoll zeigt den Anfangsbestand sowie spätere Zuweisungen, Änderungen und Entzüge von Verwaltungsrollen und Objektverantwortungen. Die neue User Journey führt durch Kategorien, Personen und Domänen bis zum Protokoll und grenzt Verwaltungsrollen von Datenzugriffen ab.',
          },
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
            title: 'Sichtbare Datenquellen und persönliche Darstellung',
            description: '«Sichtbare Datenquellen» zeigt Verbindungskarten, einschliesslich der katalogweit lesbaren synthetischen VIBDBU-Quelle. Import bleibt auf ihre zuständigen Personen beschränkt. Freitext, Typ und Owner filtern das Register; die föderale Verwaltungsebene zeigt aktuell nur Bund als auswählbaren Wert, während Kantone, Gemeinde, bundesnahe Betriebe und Kantonalbanken sichtbar deaktiviert sind. Ein Tooltip erläutert die Einordnung. Der blaue Hinweis übernimmt den Suchtext in die Expertensuche, die auch sichtbare physische Quellen als Treffer zeigt. Die Karten führen in den Datenbank-/Schema-/Tabellenbaum; ein graublaues Modell-Icon markiert verknüpfte Tabellen und öffnet per Klick das logische Modell. Der Tooltip erklärt den Link in einer zweiten Zeile. Das Kontextmenü kann ein editierbares logisches Modell direkt ableiten. Im Kopf stehen Profilbild, lokale Anmeldung mit widerrufbarer HttpOnly-Sitzung sowie rahmenlose Sprach- und Moduswahl bereit; die Abmeldung liegt nur im Profil. Die Sprachliste bleibt in hellem und dunklem Modus lesbar. Das Bundeslogo behält im dunklen Modus einen transparenten Hintergrund, das rote Schild und weisse Schrift. Doppelte Arbeitskontext-Panels entfallen. Ein Sprachwechsel übersetzt Startseite, Suche und zentrale Übersichten sofort; Abbrechen stellt die vorherige Sprache wieder her. Speicherung im Browser oder Profil bleibt eine bewusste Wahl.',
          },
          {
            title: 'Persönliches Profil und erweiterte Modellierungsrollen',
            description: 'Nur der nicht unterstrichene Name im Header öffnet das Profil mit Foto oder Initialen, Abmeldung, Organisation, Server-Rollenzuweisungen und einer verständlichen Zuordnung der erlaubten Aktionen. Ohne lokale Anmeldung erscheint zuerst die Personenauswahl. Christian Spider und Christian Man besitzen zusätzlich eine Data-Steward-Zuweisung für armasuisse Immobilien und können VIBDBU-Modelle erstellen, ableiten und bearbeiten. Veröffentlichung bleibt an die persönliche Owner-Zuordnung gebunden.',
          },
          {
            title: 'Persönliche Einstellungen wie in DAAIF',
            description: 'Das Einstellungssymbol öffnet eine Seite mit Kontextnavigation für Spracheinstellungen, Erscheinungsbild und Featureliste. DaCa hat keine Mandantensprache. Sprach- und Moduswahl nutzen weiterhin den Dialog zur Speicherung im Browser oder im persönlichen Profil. Einstellungs- und Tag/Nacht-Symbol haben sichtbare Tooltips für Maus und Tastatur.',
          },
          {
            title: 'Logische und physische Modelle verbinden',
            description: 'Der Leitfaden trennt das manuelle logische Modell (Journey 10) von der VIBDBU-Ableitung (Journey 11) und erklärt den Inkonsistenzfall (Journey 13). Der kompakte Mappinggraph lässt den Feldeditor rechts sichtbar. Rechtsklick oder Umschalt+F10 öffnet am logischen Feld ein Kontextmenü zum Bearbeiten, Verbinden, gezielten Trennen und Entfernen. Lösch- und Trennaktionen erfordern serverseitig eine passende Data-Owner- oder Data-Steward-Rolle. Fehlende physische Counterparts bleiben speicherbar, werden aber als Qualitätsfehler und persönliche Aufgabe des Data Owners erfasst. Er kann den Fehler begründet akzeptieren oder einen Data Steward zur Prüfung beauftragen; eine erneute Zuordnung oder Feldlöschung löst ihn auf.',
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
            description: 'DaCa öffnet für jeden bereitstehenden Build automatisch einen Dialog mit bisheriger und neuer Version, Warnung zu ungespeicherten Seiteninhalten, Neuerungen und Link zur Featureliste. «Update durchführen» lädt die Anwendung vollständig neu; «Update später durchführen» erhält die laufende Arbeit.',
          },
          {
            title: 'PoC anhand geführter Journeys erleben',
            description: 'Der PoC Leitfaden erklärt dreizehn wiederholbare, nach Text und Tags durchsuchbare Abläufe mit Rollen und Voraussetzungen. Die statische Dokumentation enthält Artikel mit Kategorie, Tags und Erstelldatum sowie Bilder zum Umgang mit unverbundenen logischen Feldern und dem Entscheid des Data Owners.',
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
        introduction: 'DaCa is the central data catalog of the BIT data platform and brings metadata, approvals and tasks together in one place.',
        pocNote: 'Note: This list describes the current PoC. Some workflows are simulated and are not yet a production service.',
        features: [
          {
            title: 'Central data catalog',
            description: 'DaCa manages metadata, data products, endpoints, provenance and access rules in one central catalog. Earlier Control Plane trust and sync records are PoC prototype data.',
          },
          {
            title: 'Three responsibility perspectives and catalog documentation',
            description: 'Settings show PostgreSQL-backed role and object relationships by category, person and domain. Physical tables remain linked to a domain before any logical model mapping exists. The header documentation brings together user journeys, fundamentals and the separate DaCa application glossary. Business terminology stays independent. Role terms use a light-gray wavy underline and load short explanations on demand with links to full entries. The popup stays open while the pointer moves to its link.',
          },
          {
            title: 'Role change protocol and responsibility journey',
            description: 'A sequential PostgreSQL protocol shows the initial state and later assignments, changes and removals of management roles and object responsibilities. A new user journey connects the category, person and domain views to the protocol and distinguishes management roles from data access.',
          },
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
            description: 'Logical-first and physical-first remain separate entry points. The logical-model page puts its title above tabs for status and classification, model characteristics, and logical entities and fields; unsaved edits survive tab changes. The compact mapping graph leaves the field editor visible at the right. Connections and logical fields can be removed. A missing physical counterpart remains saveable but creates a quality error and an owner task. The owner can accept it with a reason or assign investigation to a data steward; reconnecting or removing the field resolves it.',
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
            description: 'DaCa automatically offers each ready build with its version transition, unsaved-content warning, release notes and feature-list link. Apply update reloads the app; Update later keeps the current work.',
          },
          {
            title: 'Explore the PoC through guided journeys',
            description: 'The PoC guide explains thirteen repeatable workflows searchable by text and topic tags. Static documentation articles carry a category, tags and creation date, with images for the mapping inconsistency and owner decision workflow.',
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
        introduction: 'Die Control Plane zeigt Betriebsbeobachtungen zum zentralen DaCa und bewahrt Konfigurationen des früheren PoC-Prototyps auf.',
        pocNote: 'Hinweis: Diese Liste beschreibt den aktuellen PoC-Stand. Einzelne Abläufe sind simuliert und noch keine produktive Leistung.',
        features: [
          {
            title: 'Neue Versionen ohne F5 übernehmen',
            description: 'DaCa öffnet für jeden bereitstehenden Build automatisch einen Dialog mit bisheriger und neuer Version, Warnung zu ungespeicherten Seiteninhalten, Neuerungen und Link zur Featureliste. «Update durchführen» lädt die Anwendung vollständig neu; «Update später durchführen» erhält die laufende Arbeit.',
          },
          {
            title: 'Katalogeinträge beobachten',
            description: 'Sehen Sie den Verbindungs- und Betriebsstatus der vorhandenen PoC-Einträge. DaCa verwaltet Metadaten zentral.',
          },
          {
            title: 'Frühere Trust-Konfiguration einsehen',
            description: 'Die vorhandenen Vertrauenseinträge dokumentieren Szenarien des früheren Prototyps.',
          },
          {
            title: 'PoC-Synchronisationseinträge einsehen',
            description: 'Gespeicherte Absichten bleiben nachvollziehbar; es wird kein Kataloginhalt übertragen.',
          },
          {
            title: 'Änderungen nachvollziehen',
            description: 'Status und Ereignisse zeigen, was konfiguriert wurde und wo noch Handlungsbedarf besteht.',
          },
        ],
      },
      en: {
        title: 'What can DaCa Control Plane do?',
        introduction: 'The Control Plane shows operations observations for central DaCa and retains earlier PoC configuration records.',
        pocNote: 'Note: This list describes the current PoC. Some workflows are simulated and are not yet a production service.',
        features: [
          {
            title: 'Apply new versions without F5',
            description: 'DaCa automatically offers each ready build with its version transition, unsaved-content warning, release notes and feature-list link. Apply update reloads the app; Update later keeps the current work.',
          },
          {
            title: 'Observe catalog records',
            description: 'View connection and operating status for existing PoC records. DaCa manages metadata centrally.',
          },
          {
            title: 'Review earlier trust configuration',
            description: 'Existing trust records document scenarios from the earlier prototype.',
          },
          {
            title: 'Review PoC synchronization records',
            description: 'Stored intent remains traceable; no catalog content is transferred.',
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
