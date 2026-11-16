import { termdatSourceUri } from './termdat-ribbon.component';
import { GlossaryTermSummary } from '../core/catalog.models';

describe('TERMDAT source ribbon', () => {
  const term = (uri: string, relationType = 'exactMatch') => ({relations: [{relationType, targetUri: uri}]} as Pick<GlossaryTermSummary, 'relations'>);
  it('uses a concrete TERMDAT entry match, including the website-only sports collections', () => {
    expect(termdatSourceUri(term('https://www.termdat.bk.admin.ch/entry/144557'))).toBe('https://www.termdat.bk.admin.ch/entry/144557');
    expect(termdatSourceUri(term('https://register.ld.admin.ch/termdat/2884'))).toContain('/2884');
  });
  it('does not label unverified, malformed, merely related or lookalike sources as TERMDAT', () => {
    expect(termdatSourceUri(null)).toBeNull();
    for (const uri of ['javascript:alert(1)', 'https://www.termdat.bk.admin.ch.example.org/entry/2884', 'https://www.termdat.bk.admin.ch/', 'https://person:secret@www.termdat.bk.admin.ch/entry/2884']) expect(termdatSourceUri(term(uri))).toBeNull();
    expect(termdatSourceUri(term('https://www.termdat.bk.admin.ch/entry/2884', 'related'))).toBeNull();
  });
});
