import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CreationProduct, CreationRequest, ProductCreationApiService } from './product-creation-api.service';
import { BasisWindowType, CREATION_FORMATS, CREATION_FREQUENCIES, CreationFormat, CreationFrequency, ROLLING_WINDOW_UNITS, RollingWindowUnit, creationFormatLabel, creationFrequencyLabel, rollingWindowLabel } from './creation-request-fields';

@Component({
  selector: 'daca-product-creation', standalone: true, imports: [DatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-creation.component.html', styleUrl: './product-creation.component.css',
})
export class ProductCreationComponent {
  private readonly api = inject(ProductCreationApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly identity = inject(DemoIdentityService);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly isNew = computed(() => this.params().get('id') === 'new');
  readonly detail = signal<CreationRequest | null>(null);
  readonly requests = signal<CreationRequest[]>([]);
  readonly products = signal<CreationProduct[]>([]);
  readonly loading = signal(false); readonly busy = signal(false); readonly error = signal('');
  readonly isOwner = computed(() => this.detail()?.ownerUserId === this.identity.userId());
  readonly ownedResults = computed(() => this.products().filter(product => product.ownerUserId === this.identity.userId() && product.lifecycle === 'active' && !this.detail()?.sourceProductIds.includes(product.id)));
  readonly formatOptions = CREATION_FORMATS; readonly frequencyOptions = CREATION_FREQUENCIES;
  readonly formatLabel = creationFormatLabel; readonly frequencyLabel = creationFrequencyLabel;
  sourceId = ''; title = ''; purpose = ''; basisFrom = ''; basisUntil = ''; legalBasis = '';
  basisWindowType:BasisWindowType = 'fixed'; rollingWindowSize:number|null = null; rollingWindowUnit:RollingWindowUnit = 'months';
  readonly windowUnits = ROLLING_WINDOW_UNITS; readonly windowLabel = rollingWindowLabel;
  formats:CreationFormat[] = []; frequency:CreationFrequency|'' = '';
  comment = ''; resultId = ''; private epoch = 0;
  constructor() { effect(() => { const id = this.params().get('id'); this.identity.userId(); void this.load(id); }); }
  statusLabel(value: string) { return ({ submitted: 'Eingereicht', in_progress: 'In Bearbeitung', fulfilled: 'Erfüllt', rejected: 'Abgelehnt' } as Record<string, string>)[value] || value; }
  private message(error: unknown): string { const failure = error as { error?: { detail?: string }; message?: string }; return failure.error?.detail || failure.message || 'Der Vorgang konnte nicht abgeschlossen werden.'; }
  private async load(id: string | null) {
    const epoch = ++this.epoch;
    this.busy.set(false); this.title = ''; this.purpose = ''; this.comment = ''; this.resultId = ''; this.sourceId = '';
    this.basisFrom = ''; this.basisUntil = ''; this.legalBasis = ''; this.formats = []; this.frequency = '';
    this.basisWindowType = 'fixed'; this.rollingWindowSize = null; this.rollingWindowUnit = 'months';
    this.loading.set(true); this.error.set(''); this.detail.set(null); this.products.set([]); this.requests.set([]);
    try {
      const [products, detail, requests] = await Promise.all([this.api.products(), id && id !== 'new' ? this.api.read(id) : null, !id ? this.api.list() : []]);
      if (epoch !== this.epoch) return;
      this.products.set(products); this.detail.set(detail); this.requests.set(requests);
      if (id === 'new') {
        const query = this.route.snapshot.queryParamMap;
        this.sourceId = query.get('sourceProductId') || products.find(product => product.metadata.sourceProductId === query.get('source'))?.id || '';
      }
    } catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); }
    finally { if (epoch === this.epoch) this.loading.set(false); }
  }
  async submit() {
    if (this.busy() || !this.canSubmit()) return;
    const epoch = this.epoch;
    this.busy.set(true); this.error.set('');
    try {
      const row = await this.api.create({ sourceProductIds: [this.sourceId], proposedTitle: this.title.trim(), purpose: this.purpose.trim(),
        basisWindowType:this.basisWindowType,
        ...(this.basisWindowType === 'fixed' ? {basisFrom:this.basisFrom,basisUntil:this.basisUntil}
          : {rollingWindowSize:this.rollingWindowSize!,rollingWindowUnit:this.rollingWindowUnit}),
        legalBasis:this.legalBasis.trim(),formats:[...this.formats],updateFrequency:this.frequency as CreationFrequency });
      if (epoch !== this.epoch) return;
      this.catalog.refreshWorkflowTasks(true);
      await this.router.navigate(['/product-creation-requests', row.id]);
    } catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); } finally { if (epoch === this.epoch) this.busy.set(false); }
  }
  addFormat(value:string):void {
    const option = this.formatOptions.find(option=>option.value===value);
    if (option && !this.formats.includes(option.value)) this.formats = [...this.formats,option.value];
  }
  removeFormat(value:CreationFormat):void { this.formats = this.formats.filter(format=>format!==value); }
  periodInvalid():boolean { return Boolean(this.basisFrom && this.basisUntil && this.basisFrom > this.basisUntil); }
  changeWindowType(value:BasisWindowType):void {
    this.basisWindowType=value;this.basisFrom='';this.basisUntil='';this.rollingWindowSize=null;this.rollingWindowUnit='months';
  }
  validWindow():boolean {
    return this.basisWindowType === 'fixed' ? Boolean(this.basisFrom && this.basisUntil && !this.periodInvalid())
      : Number.isInteger(this.rollingWindowSize) && this.rollingWindowSize! >= 1 && this.rollingWindowSize! <= 10000
        && this.windowUnits.some(option=>option.value===this.rollingWindowUnit);
  }
  canSubmit():boolean {
    return Boolean(this.sourceId && this.title.trim().length >= 3 && this.title.trim().length <= 255
      && this.validWindow() && this.purpose.trim().length >= 10
      && this.purpose.trim().length <= 2000 && this.legalBasis.trim().length >= 5 && this.legalBasis.trim().length <= 2000
      && this.formats.length && this.frequencyOptions.some(option=>option.value===this.frequency));
  }
  async decide(decision: 'accept' | 'reject') {
    const row = this.detail(); if (!row || this.busy()) return;
    const epoch = this.epoch;
    this.busy.set(true); this.error.set('');
    try { const decided = await this.api.decide(row, decision, this.comment); if (epoch !== this.epoch) return; this.detail.set(decided); this.catalog.refreshWorkflowTasks(true); }
    catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); } finally { if (epoch === this.epoch) this.busy.set(false); }
  }
  async fulfill() {
    const row = this.detail(); if (!row || this.busy()) return;
    const epoch = this.epoch;
    this.busy.set(true); this.error.set('');
    try { const fulfilled = await this.api.fulfill(row, this.resultId); if (epoch !== this.epoch) return; this.detail.set(fulfilled); this.catalog.refreshWorkflowTasks(true); }
    catch (error) { if (epoch === this.epoch) this.error.set(this.message(error)); } finally { if (epoch === this.epoch) this.busy.set(false); }
  }
}
