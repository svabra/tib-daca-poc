import { metadataTermCandidates } from './metadata-term-candidates';

describe('metadataTermCandidates', () => {
  it('derives at most three deterministic and editable candidates from current title and keywords', () => {
    expect(metadataTermCandidates(
      'Flottenbestand gepanzerte Fahrzeuge',
      'Fahrzeugflotte, Einsatzmittel, Logistik, synthetisch',
    )).toEqual([
      {
        label: 'gepanzerte Fahrzeuge',
        source: 'title',
        reason: 'Aus dem aktuell eingegebenen Produkttitel abgeleitet.',
      },
      {
        label: 'Fahrzeugflotte',
        source: 'keyword',
        reason: 'Aus dem aktuellen Keyword «Fahrzeugflotte» abgeleitet.',
      },
      {
        label: 'Einsatzmittel',
        source: 'keyword',
        reason: 'Aus dem aktuellen Keyword «Einsatzmittel» abgeleitet.',
      },
    ]);
  });

  it('deduplicates candidates and trims contextual title qualifiers', () => {
    expect(metadataTermCandidates(
      'Direkte Bundessteuer – Veranlagungen nach Kanton und Gemeinde',
      ['direkte bundessteuer', 'Veranlagungen', 'Steuerperiode'],
    )).toEqual([
      expect.objectContaining({ label: 'Direkte Bundessteuer', source: 'title' }),
      expect.objectContaining({ label: 'Veranlagungen', source: 'title' }),
      expect.objectContaining({ label: 'Steuerperiode', source: 'keyword' }),
    ]);
  });

  it('never returns more than three candidates even with a larger requested limit', () => {
    expect(metadataTermCandidates('Mehrwertsteuer', 'MWST, Vorsteuer, Bezugsteuer, Einfuhrsteuer', 99))
      .toHaveLength(3);
  });
});
