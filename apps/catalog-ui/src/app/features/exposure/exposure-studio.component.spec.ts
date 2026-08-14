import {
  INITIAL_EXPOSURE_DRAFT,
  exposureDurationDays,
  isExposurePublishable,
  isExposureSubjectIdValid,
} from './exposure-draft';

describe('Exposure studio access-setting contract', () => {
  it('requires an explicitly selected directory result', () => {
    expect(INITIAL_EXPOSURE_DRAFT.subjectType).toBe('person');
    expect(INITIAL_EXPOSURE_DRAFT.subjectId).toBe('');
    expect(isExposurePublishable(INITIAL_EXPOSURE_DRAFT)).toBe(false);
    expect(isExposurePublishable({ ...INITIAL_EXPOSURE_DRAFT, subjectId: 'beat.stalder' })).toBe(true);
  });

  it('accepts exactly one personal, machine or group identifier', () => {
    expect(isExposurePublishable({ ...INITIAL_EXPOSURE_DRAFT, subjectType: 'machine', subjectId: 'svc-estv-tax-api' })).toBe(true);
    expect(isExposurePublishable({ ...INITIAL_EXPOSURE_DRAFT, subjectType: 'group', subjectId: 'kanton-neuchatel' })).toBe(true);
    expect(isExposureSubjectIdValid('svc-estv-tax-api')).toBe(true);
    expect(isExposureSubjectIdValid('secret value with spaces')).toBe(false);
  });

  it('uses an inclusive, time-bounded validity period', () => {
    expect(exposureDurationDays(INITIAL_EXPOSURE_DRAFT.validFrom, INITIAL_EXPOSURE_DRAFT.validUntil)).toBe(142);
    expect(isExposurePublishable({ ...INITIAL_EXPOSURE_DRAFT, subjectId: 'beat.stalder', validUntil: '2026-08-11' })).toBe(false);
  });

  it('keeps KOBY and I14Y independent from the product delivery protocols', () => {
    const noMetadataChannels = {
      ...INITIAL_EXPOSURE_DRAFT,
      subjectId: 'beat.stalder',
      kobyMetadataAllowed: false,
      i14yMetadataDelivery: false,
    };
    expect(isExposurePublishable(noMetadataChannels)).toBe(true);
  });
});
