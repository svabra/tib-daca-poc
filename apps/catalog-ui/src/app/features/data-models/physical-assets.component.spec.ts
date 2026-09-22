import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { AssetMapping, LogicalModel, PhysicalSource } from './data-models.models';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { PhysicalAssetsComponent } from './physical-assets.component';

describe('PhysicalAssetsComponent DAAIF source explorer', () => {
  const steward = { id: 'cinthya.thor', displayName: 'Cinthya Thor', organization: 'Verteidigung', department: 'VBS', office: 'vbs-verteidigung', email: 'cinthya.thor@vtg.admin.ch', phone: null, avatarUrl: null, roles: ['data_consumer'], primaryModelingRole: 'data_steward' };
  const source: PhysicalSource = { id: FALLBACK_PHYSICAL_SNAPSHOT.sourceId, revision: 3, name: 'BIT Shared PostgreSQL', description: 'Freigegebene PostgreSQL-Strukturmetadaten.', connectorType: 'postgresql', systemName: 'PostgreSQL', databaseName: 'hr_core', department: 'VBS', office: 'vbs-verteidigung', latestSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id, latestSnapshotSequence: FALLBACK_PHYSICAL_SNAPSHOT.revision, latestSnapshot: null, catalogPath: 'postgresql://hr_core/', ownerName: 'Christian Man', updatedAt: '2026-09-05T07:20:00Z' };
  const pendingSource: PhysicalSource = { ...source, id: 'vibdbu-source', revision: 1, name: 'SAP VIBDBU Gebäudebestand', databaseName: 'daca_sample', catalogPath: 'postgresql://daca_sample/', ownerName: 'Mirjam Keller', office: 'vbs-armasuisse-immobilien', latestSnapshotId: null, latestSnapshotSequence: null };
  const previousSnapshot = { ...FALLBACK_PHYSICAL_SNAPSHOT, id: 'fallback-hr-snapshot-1', revision: 1, previousSnapshotId: null };
  const api = {
    listPhysicalSources: vi.fn(() => of([source, pendingSource])), listPhysicalSnapshots: vi.fn(() => of([FALLBACK_PHYSICAL_SNAPSHOT, previousSnapshot])), loadPhysicalSnapshot: vi.fn(() => of(FALLBACK_PHYSICAL_SNAPSHOT)), listMappings: vi.fn(() => of([] as AssetMapping[])), importPhysicalSource: vi.fn(() => of({ body: FALLBACK_PHYSICAL_SNAPSHOT, etag: '"4"' })), quickDeriveLogicalModel: vi.fn(() => of({ body: FALLBACK_LOGICAL_MODEL as LogicalModel, etag: '"1"' })),
  };

  function configure(sourceId: string | null = null, query: Record<string, string> = {}): void {
    TestBed.configureTestingModule({ imports: [PhysicalAssetsComponent], providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(sourceId ? { sourceId } : {}), queryParamMap: convertToParamMap(query) } } }, { provide: DemoIdentityService, useValue: { user: signal(steward).asReadonly(), userId: signal('cinthya.thor').asReadonly(), canEditModels: signal(true).asReadonly() } }, { provide: DataModelsApiService, useValue: api }] });
  }

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => TestBed.resetTestingModule());

  it('shows existing sources as DAAIF-style connection cards', () => {
    configure(); const fixture = TestBed.createComponent(PhysicalAssetsComponent); fixture.detectChanges(); const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Bestehende Datenquellen'); expect(root.textContent).toContain('Aktive Verbindungen'); expect(root.querySelectorAll('.source-card')).toHaveLength(2); expect(root.textContent).toContain('Nicht ingestiert');
  });

  it('groups matching catalog paths and filters instances by text, type, and owner', () => {
    const duplicate = { ...source, id: 'duplicate-source', name: 'Same PostgreSQL', updatedAt: '2026-09-06T07:20:00Z' }; api.listPhysicalSources.mockReturnValue(of([source, duplicate, pendingSource])); configure(); const fixture = TestBed.createComponent(PhysicalAssetsComponent); fixture.detectChanges(); const component = fixture.componentInstance;
    expect(component.sourceInstances()).toHaveLength(2); component.sourceQuery.set('Christian'); expect(component.filteredSources().map((item) => item.id)).toEqual(['duplicate-source']);
    component.sourceQuery.set(''); component.sourceType.set('s3'); expect(component.filteredSources()).toEqual([]); component.sourceType.set('postgresql'); component.sourceOwner.set('Christian Man'); expect(component.filteredSources().map((item) => item.id)).toEqual(['duplicate-source']);
  });

  it('drills into one source and keeps older snapshots in history', () => {
    configure(source.id); const fixture = TestBed.createComponent(PhysicalAssetsComponent); fixture.detectChanges(); const component = fixture.componentInstance;
    expect(component.activeSnapshot()?.id).toBe(FALLBACK_PHYSICAL_SNAPSHOT.id); expect(component.sourceHistory().map((item) => item.id)).toEqual([previousSnapshot.id]); expect((fixture.nativeElement as HTMLElement).textContent).toContain('Struktur');
  });

  it('opens the four-entry table context menu with only derivation enabled', () => {
    configure(source.id); const fixture = TestBed.createComponent(PhysicalAssetsComponent); fixture.detectChanges(); const table = FALLBACK_PHYSICAL_SNAPSHOT.tables[0]; fixture.componentInstance.toggleMenu(table.id); fixture.detectChanges(); const items = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Logisches Modell ableiten', 'Referenziertes logisches Modell öffnen', 'Als Datenprodukt veröffentlichen', 'In DAAIF untersuchen']); expect(items.map((item) => item.disabled)).toEqual([false, true, true, true]); expect((fixture.nativeElement as HTMLElement).querySelector('.table-actions-button')?.textContent?.trim()).toBe('…');
  });

  it('marks a table with a linked logical model regardless of mapping status', () => {
    const table = FALLBACK_PHYSICAL_SNAPSHOT.tables[0]; const mapping = { logicalModelId: FALLBACK_LOGICAL_MODEL.id, physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id, physicalColumnIds: [table.columns[0].id], status: 'draft' } as AssetMapping;
    api.listMappings.mockReturnValue(of([mapping])); configure(source.id); const fixture = TestBed.createComponent(PhysicalAssetsComponent); fixture.detectChanges();
    const indicator = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.linked-model-indicator');
    expect(indicator?.getAttribute('aria-label')).toContain('Ein logisches Modell ist'); expect(indicator?.textContent).toContain('Entwurf');
    fixture.componentInstance.showLinkedModelTooltip(table.id); fixture.detectChanges(); expect(indicator?.getAttribute('data-tooltip-open')).toBe('true');
    fixture.componentInstance.hideLinkedModelTooltip(table.id); fixture.detectChanges(); expect(indicator?.getAttribute('data-tooltip-open')).toBe('false');
    fixture.componentInstance.toggleMenu(table.id); fixture.detectChanges(); const referencedModelItem = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]')][1];
    expect(referencedModelItem.disabled).toBe(false); const router = TestBed.inject(Router); const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true); fixture.componentInstance.openReferencedLogicalModel(FALLBACK_PHYSICAL_SNAPSHOT, table);
    expect(navigate).toHaveBeenCalledWith(['/models', FALLBACK_LOGICAL_MODEL.id, 'mappings'], { queryParams: { physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id, physicalTableId: table.id } });
  });

  it('derives atomically and navigates straight to the mapping workspace', () => {
    configure(source.id); const fixture = TestBed.createComponent(PhysicalAssetsComponent); fixture.detectChanges(); const router = TestBed.inject(Router); const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true); const table = FALLBACK_PHYSICAL_SNAPSHOT.tables[0];
    fixture.componentInstance.deriveOrAttach(FALLBACK_PHYSICAL_SNAPSHOT, table);
    expect(api.quickDeriveLogicalModel).toHaveBeenCalledWith(table.id); expect(navigate).toHaveBeenCalledWith(['/models', FALLBACK_LOGICAL_MODEL.id, 'mappings'], { queryParams: { physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id, physicalTableId: table.id, editModel: '1' } });
  });

  it('returns to mapping suggestions when adding another representation', () => {
    configure(source.id, { logicalModelId: 'model-1' }); const fixture = TestBed.createComponent(PhysicalAssetsComponent); fixture.detectChanges(); const router = TestBed.inject(Router); const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true); const table = FALLBACK_PHYSICAL_SNAPSHOT.tables[0];
    fixture.componentInstance.deriveOrAttach(FALLBACK_PHYSICAL_SNAPSHOT, table); expect(api.quickDeriveLogicalModel).not.toHaveBeenCalled(); expect(navigate).toHaveBeenCalledWith(['/models', 'model-1', 'mappings'], { queryParams: { physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id, physicalTableId: table.id, suggest: '1' } });
  });
});
