describe('domain glossary fixture confirmation', () => {
  it('requires the exact explicit reset phrase', () => {
    const isConfirmed = (value: string) => value === 'DOMAIN-GLOSSARY';
    expect(isConfirmed('DOMAIN-GLOSSARY')).toBe(true);
    expect(isConfirmed('domain-glossary')).toBe(false);
  });
});
