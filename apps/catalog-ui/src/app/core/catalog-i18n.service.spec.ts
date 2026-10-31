import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CATALOG_COPY } from './catalog-copy';
import { CATALOG_RM } from './catalog-rm';
import { CatalogI18nService } from './catalog-i18n.service';
import { catalogCopy } from './catalog-localization';
import { UserPreferencesService } from './user-preferences.service';

describe('Romansh catalog UI', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('covers every central key and preserves all interpolation parameters', () => {
    const parameters = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const key of Object.keys(CATALOG_COPY) as (keyof typeof CATALOG_COPY)[]) {
      expect(CATALOG_RM[key].trim(), key).not.toBe('');
      expect(parameters(CATALOG_RM[key]), key).toEqual(parameters(CATALOG_COPY[key][3]));
    }
  });
  it('switches reactively, interpolates Romansh and keeps untranslated copy readable', () => {
    const language = signal<'de'|'rm'>('de');
    TestBed.configureTestingModule({providers:[{provide:UserPreferencesService,useValue:{language}}]});
    const i18n = TestBed.inject(CatalogI18nService);
    expect(i18n.t('home')).toBe('Startseite');
    language.set('rm');
    expect(i18n.t('home')).toBe('Pagina iniziala');
    expect(i18n.t('forPerson',{name:'Fausto Marzo'})).toBe('Per Fausto Marzo');
    expect(i18n.t('owner')).toBe('Data Owner');
    expect(catalogCopy(['a','b','c','Save layout'],'rm')).toBe('Memorisar l’ordinaziun');
    expect(catalogCopy(['a','b','c','External untranslated text'],'rm')).toBe('External untranslated text');
  });
});
