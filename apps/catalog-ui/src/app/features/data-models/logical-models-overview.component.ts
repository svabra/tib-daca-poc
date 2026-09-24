import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModelStatus, LogicalModelSummary } from './data-models.models';

@Component({
  selector: 'daca-logical-models-overview', standalone: true,
  imports: [RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading models-heading">
      <div><p class="daca-eyebrow">{{ i18n.t('catalogIndependent') }}</p><h1>{{ i18n.t('dataModels') }}</h1><p>{{ i18n.t('modelIntro') }}</p></div>
    </section>

    <div class="models-actions">
      <button #newModelTrigger class="daca-button" type="button" [disabled]="!identity.canEditModels()" (click)="openCreationChoice()">{{ i18n.t('newLogicalModel') }}</button>
      <a class="daca-button is-secondary" routerLink="/physical-models">{{ i18n.t('visibleSources') }}</a>
      <a class="daca-button is-secondary" routerLink="/mappings">{{ i18n.t('mappingWorkspace') }}</a>
    </div>

    <dialog #creationDialog class="creation-dialog" aria-labelledby="creation-dialog-title" (close)="restoreCreationFocus()">
      <form method="dialog" class="dialog-close"><button type="submit" [attr.aria-label]="i18n.t('closeDialog')">×</button></form>
      <p class="daca-eyebrow">{{ i18n.t('selectCreationPath') }}</p>
      <h2 id="creation-dialog-title">{{ i18n.t('newLogicalModel') }}</h2>
      <p>{{ i18n.t('modelCreationIntro') }}</p>
      <div class="creation-choices">
        <a class="creation-card" routerLink="/models/new" (click)="closeCreationChoice()">
          <strong>{{ i18n.t('purelyLogical') }}</strong>
          <span>{{ i18n.t('purelyLogicalText') }}</span>
        </a>
        <a class="creation-card" routerLink="/physical-models" [queryParams]="{ mode: 'derive' }" (click)="closeCreationChoice()">
          <strong>{{ i18n.t('deriveFromSource') }}</strong>
          <span>{{ i18n.t('deriveFromSourceText') }}</span>
        </a>
      </div>
    </dialog>

    <section class="daca-card model-filters" aria-labelledby="model-filter-title">
      <header><div><p class="daca-eyebrow">{{ i18n.t('inventory') }}</p><h2 id="model-filter-title">{{ i18n.t('filterModels') }}</h2></div><button type="button" (click)="resetFilters()">{{ i18n.t('resetFilters') }}</button></header>
      <div>
        <label>{{ i18n.t('searchModels') }}<input type="search" [value]="query()" (input)="query.set(inputValue($event))" [placeholder]="i18n.t('modelSearchPlaceholder')"></label>
        <label>{{ i18n.t('department') }}<select [value]="department()" (change)="department.set(selectValue($event))"><option value="">{{ i18n.t('all') }}</option>@for(value of departments();track value){<option [value]="value">{{ value }}</option>}</select></label>
        <label>{{ i18n.t('office') }}<select [value]="office()" (change)="office.set(selectValue($event))"><option value="">{{ i18n.t('all') }}</option>@for(value of offices();track value){<option [value]="value">{{ officeLabel(value) }}</option>}</select></label>
        <label>{{ i18n.t('domain') }}<select [value]="domain()" (change)="domain.set(selectValue($event))"><option value="">{{ i18n.t('all') }}</option>@for(value of domains();track value){<option [value]="value">{{ value }}</option>}</select></label>
        <label>Data Owner<select aria-label="Data Owner" [value]="owner()" (change)="owner.set(selectValue($event))"><option value="">{{ i18n.t('all') }}</option>@for(value of owners();track value.id){<option [value]="value.id">{{ value.displayName }}</option>}</select></label>
        <label>{{ i18n.t('status') }}<select [value]="status()" (change)="status.set(statusValue($event))"><option value="">{{ i18n.t('all') }}</option><option value="draft">{{ i18n.t('draft') }}</option><option value="review_pending">{{ i18n.t('reviewPending') }}</option><option value="changes_requested">{{ i18n.t('changesRequested') }}</option><option value="published">{{ i18n.t('published') }}</option><option value="superseded">{{ i18n.t('superseded') }}</option><option value="retired">{{ i18n.t('retired') }}</option></select></label>
        <label>{{ i18n.t('physicalMapping') }}<select [value]="mappingFilter()" (change)="mappingFilter.set(mappingValue($event))"><option value="all">{{ i18n.t('all') }}</option><option value="mapped">{{ i18n.t('yes') }}</option><option value="unmapped">{{ i18n.t('no') }}</option></select></label>
      </div>
    </section>

    @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }} <button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button></p> }
    @if (loading()) {
      <div class="daca-card models-state" aria-live="polite">{{ i18n.t('loadingModels') }}</div>
    } @else if (!error() && filteredModels().length) {
      <p class="model-result-count" aria-live="polite">{{ i18n.t('modelsCount', { count: filteredModels().length, total: models().length }) }}</p>
      <div class="model-list">
        @for (model of filteredModels(); track model.id) {
          <article class="daca-card model-row">
            <div class="model-row-main"><div class="model-row-title"><div><span>{{ model.department }} / {{ officeLabel(model.office) }}</span><h2><a [routerLink]="['/models', model.id]">{{ model.title[i18n.language()] || model.title.de || model.identifiers[0] }}</a></h2></div><daca-status-badge [tone]="statusTone(model.status)">{{ statusLabel(model.status) }}</daca-status-badge></div><p>{{ model.description[i18n.language()] || model.description.de || i18n.t('noGermanDescription') }}</p><ul><li>{{ model.dataDomain.displayName }}</li><li>{{ i18n.t('fieldsCount', { count: model.fieldCount }) }}</li><li>{{ i18n.t('version') }} {{ model.revision }}</li><li>{{ i18n.t(model.hasPhysicalMapping ? 'mappingAvailable' : 'noPhysicalMapping') }}</li>@if(model.mappingInconsistencyCount){<li class="mapping-quality-error"><a [routerLink]="['/models', model.id, 'mappings']">Inkonsistenzfehler ({{ model.mappingInconsistencyCount }})</a></li>}</ul></div>
            <aside><dl><div><dt>Data Owner</dt><dd>{{ model.dataOwner.displayName }}</dd></div><div><dt>{{ i18n.t('identifier') }}</dt><dd>{{ model.identifiers[0] || model.urn }}</dd></div><div><dt>{{ i18n.t('changed') }}</dt><dd>{{ dateLabel(model.updatedAt) }}</dd></div></dl><a class="daca-button is-secondary" [routerLink]="['/models', model.id]">{{ i18n.t('openModel') }}</a></aside>
          </article>
        }
      </div>
    } @else if (!error()) {
      <div class="daca-card models-state"><h2>{{ i18n.t('noModels') }}</h2><p>{{ i18n.t(models().length ? 'adjustFilters' : 'createFirstModel') }}</p><button class="daca-button" type="button" [disabled]="!identity.canEditModels()" (click)="openCreationChoice()">{{ i18n.t('newLogicalModel') }}</button></div>
    }
  `,
  styles: [`
    .models-heading{align-items:center}.models-actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:-.25rem 0 1.5rem}.models-actions .is-disabled{pointer-events:none;opacity:.55}.model-filters{margin-bottom:1.5rem;box-shadow:none}.model-filters header{display:flex;align-items:end;justify-content:space-between;padding:1rem 1.2rem;border-bottom:1px solid var(--daca-border)}.model-filters h2{margin:0;font-size:1.05rem}.model-filters header button{border:0;background:transparent;color:var(--daca-blue);font-weight:750;cursor:pointer}.model-filters>div{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(6,minmax(130px,1fr));gap:.8rem;padding:1.1rem 1.2rem}.model-filters label{display:grid;align-content:end;gap:.35rem;color:var(--daca-muted);font-size:.68rem;font-weight:800}.model-filters input,.model-filters select{width:100%;min-height:42px;border:1px solid var(--daca-border-strong);border-radius:0;padding:.5rem;background:#fff;color:var(--daca-ink)}.model-result-count{margin:.5rem 0;color:var(--daca-muted);font-size:.75rem}.model-list{display:grid;gap:.8rem}.model-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.34fr);border-left:5px solid var(--daca-blue);box-shadow:none}.model-row-main{min-width:0;padding:1.25rem}.model-row-title{display:flex;align-items:start;justify-content:space-between;gap:1rem}.model-row-title span{color:var(--daca-muted);font-size:.65rem;font-weight:800;text-transform:uppercase}.model-row h2{margin:.2rem 0 .55rem;font-size:1.12rem}.model-row h2 a{color:var(--daca-ink);text-decoration:none}.model-row h2 a:hover{text-decoration:underline}.model-row-main>p{max-width:75ch;margin:0;color:var(--daca-muted);font-size:.8rem}.model-row ul{display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0 0;padding:0;list-style:none}.model-row li{border:1px solid var(--daca-border);padding:.22rem .45rem;background:#f7f9fa;font-size:.66rem}.model-row li.mapping-quality-error{border-color:var(--daca-red);background:#fff1f2;font-weight:800}.mapping-quality-error a{color:#a30016}.model-row aside{display:grid;align-content:space-between;gap:1rem;border-left:1px solid var(--daca-border);padding:1.2rem;background:#f7f9fa}.model-row dl{display:grid;gap:.5rem;margin:0}.model-row dl div{display:grid;grid-template-columns:80px minmax(0,1fr);gap:.5rem}.model-row dt{color:var(--daca-muted);font-size:.62rem;font-weight:800;text-transform:uppercase}.model-row dd{margin:0;overflow-wrap:anywhere;font-size:.7rem;font-weight:700}.models-state{display:grid;justify-items:start;gap:.5rem;padding:2rem;box-shadow:none}.models-state h2,.models-state p{margin:0}.models-state p{color:var(--daca-muted)}@media(max-width:1150px){.model-filters>div{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:820px){.models-heading{align-items:flex-start;flex-direction:column}.model-row{grid-template-columns:1fr}.model-row aside{border-top:1px solid var(--daca-border);border-left:0}.model-filters>div{grid-template-columns:1fr 1fr}}@media(max-width:520px){.model-filters>div{grid-template-columns:1fr}.model-row-title{flex-direction:column}.models-actions,.models-actions .daca-button{width:100%}}
  `, `
    .creation-dialog{width:min(760px,calc(100vw - 2rem));border:0;border-top:6px solid var(--daca-red);padding:1.5rem;box-shadow:0 18px 55px rgb(0 0 0/.28)}
    .creation-dialog::backdrop{background:rgb(0 0 0/.5)}
    .creation-dialog h2{margin:.15rem 0 .5rem}
    .creation-dialog>p:not(.daca-eyebrow){margin:.25rem 0 1.2rem;color:var(--daca-muted)}
    .dialog-close{display:flex;justify-content:flex-end}
    .dialog-close button{border:0;background:transparent;font-size:1.8rem;line-height:1;cursor:pointer}
    .creation-choices{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
    .creation-card{display:grid;gap:.55rem;min-height:150px;border:2px solid var(--daca-border);padding:1.2rem;color:var(--daca-ink);text-decoration:none}
    .creation-card:hover,.creation-card:focus-visible{border-color:var(--daca-red);outline:3px solid rgb(220 0 30/.18);outline-offset:2px}
    .creation-card strong{font-size:1rem}.creation-card span{color:var(--daca-muted);font-size:.78rem;line-height:1.5}
    @media(max-width:820px){.creation-choices{grid-template-columns:1fr}}
  `],
})
export class LogicalModelsOverviewComponent {
  readonly identity = inject(DemoIdentityService);
  readonly i18n = inject(CatalogI18nService);
  private readonly api = inject(DataModelsApiService);
  readonly models = signal<readonly LogicalModelSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly query = signal(''); readonly department = signal(''); readonly office = signal(''); readonly domain = signal(''); readonly owner = signal('');
  readonly status = signal<LogicalModelStatus | ''>(''); readonly mappingFilter = signal<'all' | 'mapped' | 'unmapped'>('all');
  readonly departments = computed(() => this.unique(this.models().map((item) => item.department)));
  readonly offices = computed(() => this.unique(this.models().map((item) => item.office)));
  readonly domains = computed(() => this.unique(this.models().map((item) => item.dataDomain.displayName)));
  readonly owners = computed(() => [...new Map(this.models().map((item)=>[item.dataOwner.id,item.dataOwner])).values()].sort((a,b)=>a.displayName.localeCompare(b.displayName,'de-CH')));
  readonly filteredModels = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('de-CH');
    return this.models().filter((item) => (!query || [item.title.de, item.description.de, item.identifiers.join(' '), item.dataOwner.displayName].join(' ').toLocaleLowerCase('de-CH').includes(query))
      && (!this.department() || item.department === this.department()) && (!this.office() || item.office === this.office())
      && (!this.domain() || item.dataDomain.displayName === this.domain()) && (!this.owner() || item.dataOwner.id === this.owner()) && (!this.status() || item.status === this.status())
      && (this.mappingFilter() === 'all' || item.hasPhysicalMapping === (this.mappingFilter() === 'mapped')));
  });
  private readonly creationDialog = viewChild<ElementRef<HTMLDialogElement>>('creationDialog');
  private readonly newModelTrigger = viewChild<ElementRef<HTMLButtonElement>>('newModelTrigger');

  constructor() { effect(() => { this.identity.userId(); this.load(); }); }
  openCreationChoice(): void {
    if (this.identity.canEditModels()) this.creationDialog()?.nativeElement.showModal();
  }
  closeCreationChoice(): void { this.creationDialog()?.nativeElement.close(); }
  restoreCreationFocus(): void { this.newModelTrigger()?.nativeElement.focus(); }
  load(): void { this.loading.set(true); this.error.set(null); this.api.listLogicalModels().pipe(finalize(() => this.loading.set(false))).subscribe({ next: (items) => this.models.set(items), error: (error: Error) => this.error.set(error.message) }); }
  resetFilters(): void { this.query.set(''); this.department.set(''); this.office.set(''); this.domain.set(''); this.owner.set(''); this.status.set(''); this.mappingFilter.set('all'); }
  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  selectValue(event: Event): string { return (event.target as HTMLSelectElement).value; }
  statusValue(event: Event): LogicalModelStatus | '' { return this.selectValue(event) as LogicalModelStatus | ''; }
  mappingValue(event: Event): 'all' | 'mapped' | 'unmapped' { return this.selectValue(event) as 'all' | 'mapped' | 'unmapped'; }
  statusLabel(status: LogicalModelStatus): string { return this.i18n.t(({ draft: 'draft', review_pending: 'reviewPending', changes_requested: 'changesRequested', published: 'published', superseded: 'superseded', retired: 'retired' } as const)[status]); }
  statusTone(status: LogicalModelStatus): 'green' | 'blue' | 'orange' | 'neutral' { return ({ draft: 'neutral', review_pending: 'orange', changes_requested: 'orange', published: 'green', superseded: 'blue', retired: 'neutral' } as const)[status]; }
  officeLabel(value: string): string { return value === 'vbs-verteidigung' ? 'Verteidigung' : value; }
  dateLabel(value: string): string { return value ? new Intl.DateTimeFormat(`${this.i18n.language()}-CH`, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '–'; }
  private unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de-CH')); }
}
