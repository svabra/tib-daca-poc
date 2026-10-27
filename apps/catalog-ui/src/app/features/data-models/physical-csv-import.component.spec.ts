import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DataModelsApiService } from './data-models-api.service';
import { CsvInventoryPreview } from './physical-csv.models';
import { PhysicalCsvImportComponent } from './physical-csv-import.component';

const preview: CsvInventoryPreview = {
  fingerprint: 'a'.repeat(64), encoding: 'Windows-1252', rowCount: 3, fieldCount: 2, tableCount: 2,
  warnings: ['Doppeltes Feld: beide Beschreibungen erhalten.'],
  tables: [{ name: 'Gebäude / Bauwerke', system: 'BIM', stableKey: 'bim', comment: 'Gebäude', importMetadata: {format: 'test'},
    columns: [{ name: 'Name', dataType: 'IfcLabel', normalizedDataType: 'string', comment: '<script>not instructions</script>',
      importMetadata: {format: 'test', records: [{Datentyp: 'IfcLabel', Werteliste: 'Schutzzonen', Klassifizierung: 'Projektabhängig'}]} }] },
    {name: 'VIBDBU', system: 'SAP', stableKey: 'sap', comment: 'Gebäude', columns: [], importMetadata: {format: 'test'}}],
};

describe('PhysicalCsvImportComponent', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const userId = signal('owner');
    const identity = { userId, canEditModels: signal(true), user: signal({id: 'owner', modelingAssignments: [
      {organizationId: 'vbs-armasuisse-immobilien', departmentCode: 'VBS', organizationName: 'armasuisse Immobilien'},
    ]}) };
    const api = {previewPhysicalCsv: vi.fn(() => of(preview)), importPhysicalCsv: vi.fn(() => of({sourceId: 'source-1', reused: false, snapshot: {id: 'snap-1', tables: [{id: 'table-1'}]}}))};
    TestBed.configureTestingModule({imports: [PhysicalCsvImportComponent], providers: [provideRouter([]),
      {provide: CatalogI18nService, useValue: {t: (key: string) => key}},
      {provide: DemoIdentityService, useValue: identity}, {provide: DataModelsApiService, useValue: api}]});
    const fixture = TestBed.createComponent(PhysicalCsvImportComponent);
    fixture.detectChanges(); TestBed.tick(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('dialog')!;
    Object.defineProperty(dialog, 'showModal', {configurable: true, value: vi.fn(() => dialog.setAttribute('open', ''))});
    Object.defineProperty(dialog, 'close', {configurable: true, value: vi.fn(() => dialog.removeAttribute('open'))});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.open(); fixture.detectChanges();
    return {fixture, root, component: fixture.componentInstance, api, identity, navigate, dialog};
  }

  async function upload(context: ReturnType<typeof setup>, size = 3) {
    const file = new File(['CSV'], 'Gebäude.csv', {type: 'text/csv'});
    Object.defineProperty(file, 'arrayBuffer', {value: async () => new Uint8Array([67,83,86]).buffer});
    Object.defineProperty(file, 'size', {value: size});
    const input = context.root.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', {configurable: true, value: [file]});
    await context.component.selectFile({target: input} as unknown as Event);
    context.fixture.detectChanges();
  }

  it('previews a dropped CSV without importing and rejects multiple files',async()=>{
    const context=setup();
    const file=new File(['Tabelle;Feldname;Datentyp\nADA;ADA_ID;UUID'],'ada.csv',{type:'text/csv'});
    Object.defineProperty(file,'arrayBuffer',{value:async()=>new TextEncoder().encode('CSV').buffer});
    const preventDefault=vi.fn();
    await context.component.dropFile({preventDefault,dataTransfer:{files:[file]}} as unknown as DragEvent);
    expect(preventDefault).toHaveBeenCalledOnce();expect(context.component.preview()).toEqual(preview);
    expect(context.component.filename()).toBe('ada.csv');expect(context.api.importPhysicalCsv).not.toHaveBeenCalled();
    await context.component.dropFile({preventDefault,dataTransfer:{files:[file,file]}} as unknown as DragEvent);
    expect(context.component.preview()).toBeNull();expect(context.component.error()).toContain('genau eine');
    context.component.saving.set(true);
    await context.component.dropFile({preventDefault,dataTransfer:{files:[file]}} as unknown as DragEvent);
    expect(context.api.previewPhysicalCsv).toHaveBeenCalledTimes(1);
  });

  it('previews the file without saving, preserves original values, searches tables and escapes metadata', async () => {
    const context = setup(); await upload(context);
    expect(context.api.previewPhysicalCsv).toHaveBeenCalledWith(btoa('CSV'));
    expect(context.api.importPhysicalCsv).not.toHaveBeenCalled();
    expect(context.root.textContent).toContain('2 physische Modelle');
    expect(context.root.textContent).toContain('Schutzzonen');
    expect(context.root.textContent).toContain('Projektabhängig');
    expect(context.root.querySelector('script')).toBeNull();
    expect(context.root.textContent).toContain('<script>not instructions</script>');
    context.component.query.set('SAP'); context.fixture.detectChanges();
    expect(context.root.querySelectorAll('.table-list button')).toHaveLength(1);
    (context.root.querySelector('.table-list button') as HTMLButtonElement).click(); context.fixture.detectChanges();
    expect(context.root.querySelector('h3')?.textContent).toBe('VIBDBU');
  });

  it('commits only on confirmation and immediately opens the persisted snapshot', async () => {
    const context = setup(); await upload(context);
    context.component.import();
    expect(context.api.importPhysicalCsv).toHaveBeenCalledWith(expect.objectContaining({
      departmentCode: 'VBS', organizationId: 'vbs-armasuisse-immobilien', filename: 'Gebäude.csv', fingerprint: preview.fingerprint,
    }));
    expect(context.navigate).toHaveBeenCalledWith(['/physical-models', 'source-1'], {queryParams: {snapshotId: 'snap-1', tableId: 'table-1', imported: 2, reused: undefined}});
  });

  it('keeps the import entry free of journey menus',()=>{
    const c=setup();
    expect(c.root.querySelector('daca-physical-import-journey')).toBeNull();
    expect(c.root.querySelector('.journey-menu-trigger')).toBeNull();
  });

  it('cancels without mutations and ignores a late preview response', async () => {
    const context = setup();
    const response = new Subject<CsvInventoryPreview>();
    context.api.previewPhysicalCsv.mockReturnValue(response);
    await upload(context);
    context.component.close(); response.next(preview); context.fixture.detectChanges();
    expect(context.component.preview()).toBeNull();
    expect(context.api.importPhysicalCsv).not.toHaveBeenCalled();
    expect(context.dialog.hasAttribute('open')).toBe(false);
  });

  it('retains the preview after a server error for a corrected retry', async () => {
    const context = setup(); await upload(context);
    context.api.importPhysicalCsv.mockReturnValue(throwError(() => new Error('Keine Berechtigung in dieser Organisation.')));
    context.component.import(); context.fixture.detectChanges();
    expect(context.component.preview()).toEqual(preview);
    expect(context.component.saving()).toBe(false);
    expect(context.root.querySelector('[role=alert]')?.textContent).toContain('Keine Berechtigung');
    expect(context.navigate).not.toHaveBeenCalled();
  });

  it('rejects oversized files before transport and clears state on identity changes', async () => {
    const context = setup(); await upload(context, 2 * 1024 * 1024 + 1);
    expect(context.api.previewPhysicalCsv).not.toHaveBeenCalled();
    expect(context.component.error()).toContain('höchstens 2 MiB');
    await upload(context);
    context.identity.userId.set('another-user'); TestBed.tick(); context.fixture.detectChanges();
    expect(context.component.preview()).toBeNull();
    expect(context.dialog.hasAttribute('open')).toBe(false);
  });
});
