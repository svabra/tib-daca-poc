import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogResponsibilityIndex, DocumentationApiService } from '../../core/documentation-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { ResponsibilityPerspectivesComponent } from './responsibility-perspectives.component';

const index: CatalogResponsibilityIndex = {
  domains: [{ id: 'domain-1', name: 'Immobilienmanagement VBS' }],
  people: [
    { id: 'daniel.wenger', name: 'Daniel Wenger', organization: 'armasuisse', avatarUrl: null, roles: [{ role: 'data_owner', organizationId: 'org-1', organizationName: 'armasuisse Immobilien' }] },
    { id: 'christian.man', name: 'Christian Man', organization: 'Verteidigung', avatarUrl: null, roles: [{ role: 'data_steward', organizationId: 'org-1', organizationName: 'armasuisse Immobilien' }] },
  ],
  objects: [
    { id: 'domain:domain-1', category: 'domain', name: 'Immobilienmanagement VBS', description: 'Immobilien', href: '/domains/domain-1', domainIds: ['domain-1'], responsibilities: [{ userId: 'daniel.wenger', role: 'data_owner', basis: 'domain_owner' }] },
    { id: 'logical_model:model-1', category: 'logical_model', name: 'LM Gebäude', description: '', href: '/models/model-1', domainIds: ['domain-1'], responsibilities: [{ userId: 'christian.man', role: 'data_steward', basis: 'explicit' }] },
    { id: 'physical_representation:source-1:table-1', category: 'physical_representation', name: 'VIBDBU', description: '', href: '/physical-models/source-1', domainIds: ['domain-1'], responsibilities: [{ userId: 'christian.man', role: 'data_steward', basis: 'explicit' }] },
    { id: 'data_product:product-1', category: 'data_product', name: 'Gebäudeportfolio', description: '', href: '/products/product-1/overview', domainIds: ['domain-1'], responsibilities: [{ userId: 'daniel.wenger', role: 'data_owner', basis: 'product_owner' }] },
  ],
};

describe('ResponsibilityPerspectivesComponent', () => {
  const language = signal<'de' | 'fr' | 'it' | 'en'>('de');
  const responsibilities = vi.fn(() => of(index));

  beforeEach(() => {
    language.set('de'); responsibilities.mockClear();
    TestBed.configureTestingModule({
      imports: [ResponsibilityPerspectivesComponent],
      providers: [
        provideRouter([]),
        { provide: DocumentationApiService, useValue: { responsibilities } },
        { provide: UserPreferencesService, useValue: { language } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('uses one persisted relationship index for category, person and domain views', async () => {
    const fixture = TestBed.createComponent(ResponsibilityPerspectivesComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    expect(responsibilities).toHaveBeenCalledWith('de');
    expect(root.textContent).toContain('Daniel Wenger');
    expect(root.textContent).toContain('Gebäudeportfolio');

    component.perspective.set('person'); component.selectedPersonId.set('christian.man'); fixture.detectChanges();
    expect(root.querySelector('.people-matrix')?.textContent).toContain('Christian Man');
    expect(root.querySelector('.person-detail')?.textContent).toContain('LM Gebäude');
    expect(root.querySelector('.person-detail')?.textContent).toContain('VIBDBU');
    expect(component.personObjects('christian.man', 'data_product')).toHaveLength(0);

    component.perspective.set('domain'); fixture.detectChanges();
    expect(root.querySelector('.domain-content')?.textContent).toContain('Gebäudeportfolio');
    expect(root.querySelector('.domain-content')?.textContent).toContain('VIBDBU');
    expect(root.querySelector('.domain-content')?.textContent).toContain('Daniel Wenger');
  });

  it('filters categories and updates the translated perspective title immediately', async () => {
    const fixture = TestBed.createComponent(ResponsibilityPerspectivesComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const search = root.querySelector<HTMLInputElement>('.category-explorer input')!;
    search.value = 'VIBDBU'; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.componentInstance.objectsInCategory('physical_representation')).toHaveLength(1);
    expect(fixture.componentInstance.objectsInCategory('data_product')).toHaveLength(0);
    language.set('fr'); fixture.detectChanges();
    expect(root.textContent).toContain('Qui peut gérer quels objets de données');
  });
});
