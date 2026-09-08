import { MultiLanguageText } from '../data-models/data-models.models';

export interface I14yAgentSummary {
  id: string;
  name: MultiLanguageText;
}

export interface I14yConcept {
  id: string;
  identifiers: string[];
  name: MultiLanguageText;
  description: MultiLanguageText;
  conceptType: 'CodeList' | 'Date' | 'Numeric' | 'String';
  publisher: I14yAgentSummary | null;
  version: string;
  publicationLevel: string | null;
  registrationStatus: string | null;
  themes: string[];
  validFrom: string | null;
  validTo: string | null;
  conformsTo: string[];
  constraints: {
    minLength?: number | null;
    maxLength?: number | null;
    minValue?: number | null;
    maxValue?: number | null;
    numberDecimals?: number | null;
    pattern?: string | null;
    measurementUnit?: string | null;
  };
  codeList: { entryCount: number; entriesLoaded: boolean } | null;
  sourceUrl: string;
  detailLoaded: boolean;
  systemCreatedAt: string | null;
  systemModifiedAt: string | null;
  fetchedAt: string;
}

export interface I14ySyncStatus {
  sourceUrl: string;
  status: 'never' | 'running' | 'success' | 'error';
  lastSuccessfulAt: string | null;
  conceptCount: number;
  lastRun: { startedAt: string; finishedAt: string | null; error: string | null } | null;
}

export interface I14yConceptCollection {
  items: I14yConcept[];
  total: number;
}

export interface I14yCodeListEntry {
  id: string;
  conceptId: string;
  code: string;
  parentCode: string | null;
  name: MultiLanguageText;
  description: MultiLanguageText;
  annotations: readonly Record<string, unknown>[];
  position: number;
  validFrom: string | null;
  validTo: string | null;
  fetchedAt: string;
}
