export type RaciCode = 'A' | 'R' | 'C' | 'I' | 'A/R' | '–';
export interface GovernanceActivity { area: string; activity: string; assignments: readonly RaciCode[]; }

/** Transcription of the user-provided matrix; department-specific abbreviations are omitted. */
export const GOVERNANCE_COLUMNS = ['ADB (Vorlage)', 'Data Owner', 'ALDS', 'LDS (Vorlage)', 'Data Custodian', 'LDSD', 'IKT-Leitung Departement'] as const;
export const GOVERNANCE_ACTIVITIES: readonly GovernanceActivity[] = [
  {area:'Governance',activity:'Data Governance weiterentwickeln und überwachen',assignments:['I','C','C','C','C','R','A']},
  {area:'Governance',activity:'Datenspezifische Rollen kommunizieren',assignments:['I','C','A/R','C','C','C','–']},
  {area:'Governance',activity:'Umsetzung der Data Governance innerhalb der Verwaltungseinheit sicherstellen',assignments:['I','C','R','C','C','A','–']},
  {area:'Governance',activity:'Umsetzung der datenspezifischen Aufträge sicherstellen',assignments:['I','C','R','C','C','A','–']},
  {area:'Datenarchitektur',activity:'Datenprinzipien und Anforderungen anwenden',assignments:['I','A','C','R','C','I','–']},
  {area:'Datenarchitektur',activity:'Datendomänen definieren, dokumentieren und kommunizieren',assignments:['I','A','R','C','I','C','–']},
  {area:'Datenarchitektur',activity:'Verantwortlichkeiten je Datendomäne festlegen',assignments:['I','A','C','R','I','I','–']},
  {area:'Meta- und Datenmanagement',activity:'Metadaten-Attribute-Standard einhalten',assignments:['I','A','C','R','C','C','–']},
  {area:'Meta- und Datenmanagement',activity:'Metadaten erfassen, publizieren und aktuell halten',assignments:['I','A','C','R','C','C','–']},
  {area:'Meta- und Datenmanagement',activity:'Open Government Data identifizieren, publizieren und aktuell halten',assignments:['I','A','C','R','C','C','–']},
  {area:'Datenqualitätsmanagement',activity:'Anforderungen an Datenqualität festlegen',assignments:['I','A','C','R','C','C','–']},
  {area:'Datenqualitätsmanagement',activity:'Datenqualität überwachen und verbessern',assignments:['I','A','C','R','C','I','–']},
  {area:'Semantik und Standards',activity:'Datenspezifische Terminologien gemäss TERMDAT anwenden',assignments:['I','A','C','R','I','I','–']},
  {area:'Semantik und Standards',activity:'Verbindliche eCH-Standards berücksichtigen',assignments:['I','A','C','R','C','C','–']},
  {area:'Stammdatenmanagement',activity:'Stammdaten aus definierten Quellen beziehen',assignments:['I','A','C','R','C','C','–']},
  {area:'Stammdatenmanagement',activity:'Verwendung der Stammdaten dokumentieren und rapportieren',assignments:['I','A','C','R','C','C','–']},
  {area:'Datenlebenszyklusmanagement',activity:'Zweck und rechtliche Grundlagen der Datenbearbeitung festlegen',assignments:['–','A','C','R','I','–','–']},
  {area:'Datenlebenszyklusmanagement',activity:'Operative Umsetzung der Vorgaben sicherstellen',assignments:['I','A','C','R','C','C','–']},
  {area:'Datenlebenszyklusmanagement',activity:'Technische Umsetzung der Vorgaben sicherstellen',assignments:['–','A','I','C','R','–','–']},
];
