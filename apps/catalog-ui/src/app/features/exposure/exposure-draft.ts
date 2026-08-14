export interface ExposureDraft {
  subjectType: 'person' | 'machine' | 'group';
  subjectId: string;
  validFrom: string;
  validUntil: string;
  kobyMetadataAllowed: boolean;
  i14yMetadataDelivery: boolean;
}

export const INITIAL_EXPOSURE_DRAFT: ExposureDraft = {
  subjectType: 'person',
  subjectId: '',
  validFrom: '2026-08-12',
  validUntil: '2026-12-31',
  kobyMetadataAllowed: true,
  i14yMetadataDelivery: false,
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
