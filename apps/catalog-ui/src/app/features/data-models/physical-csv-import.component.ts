import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { CsvInventoryPreview, CsvPreviewTable } from './physical-csv.models';

@Component({
  selector: 'daca-physical-csv-import', standalone: true, imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './physical-csv-import.component.html',
  styleUrl: './physical-csv-import.component.css',
})
export class PhysicalCsvImportComponent {
  readonly identity = inject(DemoIdentityService);
  private readonly api = inject(DataModelsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private autoOpenRequested = this.route.snapshot.queryParamMap.get('importCsv') === '1';
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  readonly preview = signal<CsvInventoryPreview | null>(null);
  readonly filename = signal('');
  readonly name = signal('');
  readonly scopeId = signal('');
  readonly query = signal('');
  readonly selectedKey = signal('');
  readonly reading = signal(false);
  readonly dragging = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly scopes = computed(() => {
    const user = this.identity.user();
    const assignments = user.modelingAssignments ?? [];
    return [...new Map(assignments.map(item => [item.organizationId, {
      id: item.organizationId, department: item.departmentCode, label: item.organizationName,
    }])).values()];
  });
  readonly tables = computed(() => (this.preview()?.tables ?? []).filter(table =>
    [table.system, table.name, table.comment].join(' ').toLocaleLowerCase('de-CH').includes(this.query().toLocaleLowerCase('de-CH'))));
  readonly selectedTable = computed(() => this.preview()?.tables.find(table => table.stableKey === this.selectedKey()) ?? null);
  private contentBase64 = '';
  private generation = 0;

  constructor() {
    effect(() => {
      this.identity.userId(); this.reset();
      const dialog = this.dialog()?.nativeElement;
      if (dialog?.open) dialog.close();
    });
    effect(() => {
      const requestedScope = this.route.snapshot.queryParamMap.get('organizationId');
      if (!this.autoOpenRequested || !this.identity.canEditModels() || !this.scopes().length
          || (requestedScope && !this.scopes().some(scope => scope.id === requestedScope))) return;
      this.autoOpenRequested = false;
      afterNextRender(() => {
        this.open();
        if (requestedScope) this.scopeId.set(requestedScope);
        void this.router.navigate([], {relativeTo: this.route, queryParams: {importCsv: null, organizationId: null}, queryParamsHandling: 'merge', replaceUrl: true});
      }, {injector: this.injector});
    });
  }

  open(): void {
    if (!this.identity.canEditModels()) return;
    this.reset();
    this.scopeId.set(this.scopes()[0]?.id ?? '');
    this.dialog()?.nativeElement.showModal();
  }

  close(event?: Event): void {
    if (this.saving()) { event?.preventDefault(); return; }
    this.reset();
    this.dialog()?.nativeElement.close();
  }

  restoreFocus(): void { this.trigger()?.nativeElement.focus(); }

  private reset(): void {
    this.generation++;
    this.contentBase64 = '';
    this.preview.set(null); this.filename.set(''); this.name.set(''); this.query.set('');
    this.selectedKey.set(''); this.error.set(''); this.reading.set(false); this.saving.set(false);
    this.dragging.set(false);
    if (this.fileInput()) this.fileInput()!.nativeElement.value = '';
  }

  async selectFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    await this.readFile(file);
  }

  dragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.saving() || !event.dataTransfer?.types.includes('Files')) return;
    event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  dragLeave(event: DragEvent): void {
    if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) this.dragging.set(false);
  }

  async dropFile(event: DragEvent): Promise<void> {
    event.preventDefault(); this.dragging.set(false);
    if (this.saving()) return;
    const files = event.dataTransfer?.files;
    if (!files || files.length !== 1) {
      await this.readFile(undefined);
      this.error.set('Bitte genau eine CSV-Datei ablegen.'); return;
    }
    await this.readFile(files[0]);
  }

  private async readFile(file: File | undefined): Promise<void> {
    if (this.saving()) return;
    const generation = ++this.generation;
    this.preview.set(null); this.contentBase64 = ''; this.error.set(''); this.query.set('');
    this.reading.set(false);
    if (!file) { this.filename.set(''); this.name.set(''); return; }
    this.filename.set(file.name);
    this.name.set(file.name.replace(/\.csv$/i, ''));
    if (!/\.csv$/i.test(file.name) || file.size === 0 || file.size > 2 * 1024 * 1024) {
      this.error.set('Bitte eine nicht leere CSV-Datei mit höchstens 2 MiB auswählen.'); return;
    }
    this.reading.set(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (generation !== this.generation) return;
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      this.contentBase64 = btoa(binary);
      this.api.previewPhysicalCsv(this.contentBase64).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: preview => {
          if (generation !== this.generation) return;
          this.preview.set(preview); this.selectedKey.set(preview.tables[0]?.stableKey ?? ''); this.reading.set(false);
        },
        error: (error: Error) => { if (generation === this.generation) { this.error.set(error.message); this.reading.set(false); } },
      });
    } catch {
      if (generation === this.generation) { this.error.set('Die Datei konnte nicht gelesen werden. Bitte erneut auswählen.'); this.reading.set(false); }
    }
  }

  selectTable(table: CsvPreviewTable): void { this.selectedKey.set(table.stableKey); }

  import(): void {
    const preview = this.preview();
    const scope = this.scopes().find(scope => scope.id === this.scopeId());
    if (!preview || !scope || !this.name().trim() || this.saving() || this.reading()) return;
    const generation = this.generation;
    this.saving.set(true); this.error.set('');
    this.api.importPhysicalCsv({ contentBase64: this.contentBase64, filename: this.filename(), name: this.name(),
      departmentCode: scope.department, organizationId: scope.id, fingerprint: preview.fingerprint,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        if (generation !== this.generation) return;
        this.saving.set(false); this.dialog()?.nativeElement.close();
        void this.router.navigate(['/physical-models', result.sourceId], { queryParams: { snapshotId: result.snapshot.id,
          tableId: result.snapshot.tables[0]?.id, imported: preview.tableCount, reused: result.reused ? '1' : undefined } });
      },
      error: (error: Error) => { if (generation === this.generation) { this.error.set(error.message); this.saving.set(false); } },
    });
  }
}
