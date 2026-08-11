import {
  INITIAL_EXPOSURE_DRAFT,
  exposureDurationDays,
  isExposureSubjectIdValid,
  isExposurePublishable,
} from './exposure-draft';

describe('Exposure studio mockup', () => {
  it('starts with the existing St. Gallen demo audience and explicit KOBY metadata consent', () => {
    expect(INITIAL_EXPOSURE_DRAFT.groupIds).toEqual(['kanton-st-gallen']);
    expect(INITIAL_EXPOSURE_DRAFT.subjectType).toBe('person');
    expect(INITIAL_EXPOSURE_DRAFT.subjectId).toBe('beat.stalder');
    expect(INITIAL_EXPOSURE_DRAFT.kobyMetadataAllowed).toBe(true);
    expect(isExposurePublishable(INITIAL_EXPOSURE_DRAFT)).toBe(true);
    expect(exposureDurationDays(INITIAL_EXPOSURE_DRAFT.validFrom, INITIAL_EXPOSURE_DRAFT.validUntil)).toBe(144);
  });

  it('fails closed when no trusted audience is selected', () => {
    expect(isExposurePublishable({ ...INITIAL_EXPOSURE_DRAFT, groupIds: [] })).toBe(false);
  });

  it('requires a valid eIAM or machine identity before publishing', () => {
    expect(isExposurePublishable({ ...INITIAL_EXPOSURE_DRAFT, subjectId: '' })).toBe(false);
    expect(isExposurePublishable({ ...INITIAL_EXPOSURE_DRAFT, subjectType: 'machine', subjectId: 'svc-estv-tax-api' })).toBe(true);
    expect(isExposureSubjectIdValid('svc-estv-tax-api')).toBe(true);
    expect(isExposureSubjectIdValid('secret value with spaces')).toBe(false);
  });

  it('keeps KOBY consent separate from product delivery protocols', () => {
    const withoutKoby = { ...INITIAL_EXPOSURE_DRAFT, kobyMetadataAllowed: false };
    expect(isExposurePublishable(withoutKoby)).toBe(true);
  });
});
