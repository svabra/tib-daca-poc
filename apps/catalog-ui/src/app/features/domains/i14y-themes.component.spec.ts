import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { I14yConceptsApiService } from './i14y-concepts-api.service';
import { I14yConcept } from './i14y-concepts.models';
import { aggregateI14yThemes, I14yThemesComponent } from './i14y-themes.component';

function concept(id: string, name: string, themes: string[]): I14yConcept {
  return {
    id,
    identifiers: [id],
    name: { de: name, fr: '', it: '', en: '' },
    description: { de: '', fr: '', it: '', en: '' },
    conceptType: 'String',
    publisher: null,
    version: '1.0.0',
    publicationLevel: null,
    registrationStatus: null,
    themes,
    validFrom: null,
    validTo: null,
    conformsTo: [],
    constraints: {},
    codeList: null,
    sourceUrl: `https://example.test/concepts/${id}`,
    detailLoaded: false,
    systemCreatedAt: null,
    systemModifiedAt: null,
    fetchedAt: '2026-09-07T12:00:00Z',
  };
}

const CONCEPTS = [
  concept('vehicle', 'Fahrzeug', [' Mobilität ', 'Verteidigung', 'mobilität']),
  concept('inventory', 'Bestand', ['Verteidigung']),
  concept('person', 'Person', ['Personal', '']),
];

describe('I14yThemesComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('aggregates local-cache themes case-insensitively without double-counting a concept', () => {
    expect(aggregateI14yThemes(CONCEPTS).map((theme) => ({ label: theme.label, count: theme.concepts.length }))).toEqual([
      { label: 'Mobilität', count: 1 },
      { label: 'Personal', count: 1 },
      { label: 'Verteidigung', count: 2 },
    ]);
  });

  it('renders a read-only theme overview with addressable semantic navigation', async () => {
    const api = { search: vi.fn(() => of({ items: CONCEPTS, total: CONCEPTS.length })) };
    const identity = {
      userId: signal('cinthya.thor'),
      user: signal({
        id: 'cinthya.thor', displayName: 'Cinthya Thor', organization: 'Verteidigung', department: 'VBS',
        office: 'vbs-verteidigung', primaryModelingRole: 'data_steward', roles: ['data_steward'],
      }),
    };
    await TestBed.configureTestingModule({
      imports: [I14yThemesComponent],
      providers: [
        provideRouter([]),
        { provide: I14yConceptsApiService, useValue: api },
        { provide: DemoIdentityService, useValue: identity },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(I14yThemesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(api.search).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll('.theme-card')).toHaveLength(3);
    expect(root.textContent).toContain('3 Concepts bilden 3 Themen');
    expect([...root.querySelectorAll<HTMLAnchorElement>('.semantic-tabs a')].map((link) => link.getAttribute('href'))).toEqual([
      '/domains', '/domains/terminology', '/domains/concepts', '/domains/themes', '/domains/governance',
    ]);

    fixture.componentInstance.query.set('Bestand');
    fixture.detectChanges();
    expect(fixture.componentInstance.filteredThemes().map((theme) => theme.label)).toEqual(['Verteidigung']);
  });
});
