export interface ExposureAudienceGroup {
  id: string;
  label: string;
  description: string;
}

export interface ExposureDraft {
  subjectType: 'person' | 'machine';
  subjectId: string;
  groupIds: readonly string[];
  validFrom: string;
  validUntil: string;
  kobyMetadataAllowed: boolean;
}

export const EXPOSURE_AUDIENCE_GROUPS: readonly ExposureAudienceGroup[] = [
  { id: 'kanton-st-gallen', label: 'Kanton St. Gallen', description: 'Finanzanalyse · produktiver Zugriff' },
  { id: 'estv-data-stewards', label: 'ESTV Data Stewards', description: 'Qualitätssicherung · interner Zugriff' },
  { id: 'bund-forschung', label: 'Forschung Bund', description: 'Aggregierte Analysen · projektbezogen' },
];

export const INITIAL_EXPOSURE_DRAFT: ExposureDraft = {
  subjectType: 'person',
  subjectId: 'beat.stalder',
  groupIds: ['kanton-st-gallen'],
  validFrom: '2026-08-10',
  validUntil: '2026-12-31',
  kobyMetadataAllowed: true,
};

export function isExposureDateRangeValid(validFrom: string, validUntil: string): boolean {
  const start = exposureUtcDay(validFrom);
  const end = exposureUtcDay(validUntil);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
}

export function exposureDurationDays(validFrom: string, validUntil: string): number {
  if (!isExposureDateRangeValid(validFrom, validUntil)) return 0;
  return Math.floor((exposureUtcDay(validUntil) - exposureUtcDay(validFrom)) / 86_400_000) + 1;
}

export function isExposurePublishable(draft: ExposureDraft): boolean {
  return isExposureSubjectIdValid(draft.subjectId)
    && draft.groupIds.length > 0
    && isExposureDateRangeValid(draft.validFrom, draft.validUntil);
}

export function isExposureSubjectIdValid(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:@-]{2,199}$/.test(value.trim());
}

export function exposureUtcDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day);
}
