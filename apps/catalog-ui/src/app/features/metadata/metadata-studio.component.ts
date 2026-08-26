import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct, DomainSummary, GlossaryTermSummary, ProductActivityItem, SemanticSuggestion } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { presentProductActivity } from '../activity/product-activity.presenter';
import { recentProductActivity } from './metadata-activity-preview';
import { termsForDomains, toggleSemanticSelection, validSelectedTermIds } from './domain-selection';

@Component({
  selector: 'daca-metadata-studio',
  standalone: true,
  imports: [DatePipe, ProductWorkspaceNavComponent, ReactiveFormsModule, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-product-workspace-nav
      [productId]="product().id"
      [productTitle]="product().title"
      activeSection="metadata"
    />

    <section class="daca-page-heading metadata-heading">
      <div>
        <p class="daca-eyebrow">Datenprodukt · Metadaten</p>
        <h1>Metadaten</h1>
        <p>Bearbeiten Sie den DCAT-AP-CH-kompatiblen Katalogeintrag. Änderungen erzeugen eine neue Revision und einen Audit-Eintrag.</p>
      </div>
      <div class="metadata-revision">
        <daca-status-badge tone="green">{{ product().lifecycle }}</daca-status-badge>
        <span>Revision <strong>{{ product().revision }}</strong></span>
      </div>
    </section>

    @if (api.usingFallback()) {
      <p class="daca-alert is-warning">Preview mode: the editor is populated, but saving requires the catalog API.</p>
    }
    @if (message()) {
      <p class="daca-alert" [class.is-error]="messageTone() === 'error'" role="status">{{ message() }}</p>
    }

    <div class="metadata-layout">
      <form class="daca-card metadata-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="daca-card-header">
          <div><p class="daca-eyebrow">Descriptive metadata</p><h2>Product identity</h2></div>
          <span class="metadata-required">* Required fields</span>
        </div>
        <div class="daca-card-body metadata-form-grid">
          <label class="metadata-field metadata-field-wide">Title *
            <input formControlName="title" autocomplete="off">
            @if (form.controls.title.touched && form.controls.title.invalid) { <small>Enter a product title.</small> }
          </label>
          <label class="metadata-field">Owner *<input formControlName="owner" autocomplete="organization"></label>
          <fieldset class="metadata-field metadata-field-wide semantic-picker">
            <legend>Fachdomains</legend>
            <p>Domains sind fachliche Einordnungen und keine Organisationen. Ein Entwurf darf ohne Domain gespeichert werden; für vollständige Business-Metadaten ist mindestens eine nötig.</p>
            @if (semanticsLoading()) { <span role="status">Domains werden geladen …</span> }
            @else if (semanticsError()) { <span class="semantic-error">{{ semanticsError() }}</span> }
            @else { <div class="semantic-options">@for (domain of availableDomains(); track domain.id) { <label><input type="checkbox" [checked]="selectedDomainIds().includes(domain.id)" (change)="toggleDomain(domain.id)"><span><strong>{{ domain.preferredLabel }}</strong><small>{{ domain.definition }}</small></span></label> } @empty { <span>Keine aktiven Domains verfügbar.</span> }</div> }
          </fieldset>
          <fieldset class="metadata-field metadata-field-wide semantic-picker">
            <legend>Glossarterme</legend>
            <p>Akzeptierte Begriffe werden anhand der gewählten Domains angeboten. Keywords bleiben davon unabhängig.</p>
            <div class="semantic-options">@for (term of filteredTerms(); track term.id) { <label><input type="checkbox" [checked]="selectedTermIds().includes(term.id)" (change)="toggleTerm(term.id)"><span><strong>{{ term.preferredLabel }}</strong><small>{{ termLanguages(term) }} · {{ term.definition }}</small></span></label> } @empty { <span>{{ selectedDomainIds().length ? 'Keine akzeptierten Terme für diese Domains.' : 'Wählen Sie zuerst mindestens eine Domain.' }}</span> }</div>
            <button class="daca-button is-secondary" type="button" [disabled]="!productReady() || !selectedDomainIds().length" (click)="openProposal()">Term vorschlagen</button>
          </fieldset>
          <section class="metadata-field metadata-field-wide suggestion-panel" aria-labelledby="semantic-suggestion-title">
            <div><div><p class="daca-eyebrow">Regelbasiert · PoC</p><h3 id="semantic-suggestion-title">Semantische Vorschläge</h3></div><button class="daca-button is-secondary" type="button" [disabled]="suggestionsLoading()" (click)="loadSuggestions()">{{ suggestionsLoading() ? 'Analysiert …' : 'Neu analysieren' }}</button></div>
            @if (suggestionsError()) { <p class="semantic-error">{{ suggestionsError() }}</p> }
            @else if (suggestions().length) { <ul>@for (suggestion of suggestions(); track suggestion.kind + suggestion.id) { <li><span><strong>{{ suggestion.label }}</strong><small>{{ suggestion.kind === 'domain' ? 'Domain' : 'Term' }} · {{ suggestion.score }} % · {{ suggestion.reason }}</small></span><button type="button" (click)="applySuggestion(suggestion)" [disabled]="suggestionApplied(suggestion)">{{ suggestionApplied(suggestion) ? 'Ausgewählt' : 'Übernehmen' }}</button></li> }</ul> }
            @else if (!suggestionsLoading()) { <p>Keine ausreichend ähnlichen aktiven Domains oder Terme gefunden.</p> }
            <small>Die Auswahl wird nie automatisch verändert.</small>
          </section>
          <label class="metadata-field metadata-field-wide">Description *
            <textarea rows="5" formControlName="description"></textarea>
            <span class="metadata-counter">{{ form.controls.description.value.length }} characters</span>
          </label>
          <label class="metadata-field">Lifecycle
            <select formControlName="lifecycle"><option value="draft">Draft</option><option value="active">Active</option><option value="deprecated">Deprecated</option><option value="retired">Retired</option></select>
          </label>
          <label class="metadata-field">Classification
            <select formControlName="classification"><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select>
          </label>
          <label class="metadata-field">Contact *<input type="email" formControlName="contact" autocomplete="email"></label>
          <label class="metadata-field">Update frequency<input formControlName="updateFrequency" autocomplete="off"></label>
          <label class="metadata-field metadata-field-wide">Keywords <span>(comma-separated)</span><input formControlName="keywords" autocomplete="off"></label>
          <label class="metadata-field">License<input formControlName="license" autocomplete="off"></label>
          <label class="metadata-field">Quality statement<input formControlName="quality" autocomplete="off"></label>
        </div>
        <div class="metadata-form-actions">
          <span>@if (form.dirty) { Unsaved changes } @else { All fields reflect revision {{ product().revision }} }</span>
          <button class="daca-button" type="submit" [disabled]="form.invalid || saving() || !productReady()">
            {{ saving() ? 'Saving…' : 'Save new revision' }}
          </button>
        </div>
      </form>

      <aside class="metadata-sidebar">
        <section class="daca-card">
          <div class="daca-card-header"><h2>Catalog identity</h2><daca-status-badge tone="blue">DCAT profile</daca-status-badge></div>
          <div class="daca-card-body">
            <dl class="metadata-definition-list">
              <div><dt>Global ID</dt><dd class="daca-code">{{ product().globalId }}</dd></div>
              <div><dt>Origin</dt><dd>{{ product().originCatalog }}</dd></div>
              <div><dt>Last changed</dt><dd>{{ product().updatedAt | date: 'medium' }}</dd></div>
            </dl>
          </div>
        </section>

        <section class="daca-card">
          <div class="daca-card-header"><h2>Distribution endpoints</h2><span>{{ product().endpoints.length }}</span></div>
          <div class="daca-card-body metadata-endpoints">
            @for (endpoint of product().endpoints; track endpoint.id) {
              <article class="metadata-endpoint">
                <span class="metadata-protocol">{{ endpoint.protocol === 'http-rest' ? 'REST' : 'PG' }}</span>
                <div>
                  <strong>{{ endpoint.title }}</strong>
                  @if (endpoint.protocol === 'http-rest') {
                    <code>{{ endpoint.method }} {{ endpoint.url }}</code>
                  } @else {
                    <code>{{ endpoint.host }}:{{ endpoint.port }}/{{ endpoint.database }} · {{ endpoint.schema }}.{{ endpoint.relation }}</code>
                  }
                  <small>Credentials: secret reference only</small>
                </div>
              </article>
            }
          </div>
        </section>

        <section class="daca-card" aria-labelledby="metadata-activity-title">
          <div class="daca-card-header metadata-activity-header">
            <h2 id="metadata-activity-title">Letzte Änderungen</h2>
            <a [routerLink]="['/products', routeProductId, 'history']">Vollständigen Verlauf öffnen</a>
          </div>
          <div class="daca-card-body metadata-audit" aria-live="polite">
            @if (activityLoading()) {
              <p class="metadata-activity-state" role="status">Aktivitäten werden geladen …</p>
            } @else if (activityError()) {
              <div class="metadata-activity-state is-error" role="alert">
                <p>Die letzten Änderungen konnten nicht geladen werden. Der Metadateneditor bleibt verfügbar.</p>
                <button class="daca-button is-secondary" type="button" (click)="loadRecentActivity()">Erneut versuchen</button>
              </div>
            } @else if (recentActivity().length === 0) {
              <p class="metadata-activity-state">Noch keine protokollierten Änderungen.</p>
            } @else {
              <ol class="metadata-activity-list">
                @for (item of recentActivity(); track item.key) {
                  <li>
                    <span aria-hidden="true"></span>
                    <strong>{{ presentActivity(item).title }}</strong>
                    <small>
                      {{ item.actor.displayName }} ·
                      <time [attr.datetime]="item.occurredAt">{{ item.occurredAt | date: 'dd.MM.yyyy, HH:mm' }}</time>
                    </small>
                  </li>
                }
              </ol>
            }
          </div>
        </section>
      </aside>
    </div>

    <dialog #termDialog class="daca-card term-dialog" (close)="termForm.reset({ labelDe: '', definitionDe: '', labelEn: '', definitionEn: '' })">
      <div class="daca-card-header"><div><p class="daca-eyebrow">Glossar-Governance</p><h2>Term vorschlagen</h2></div><button type="button" aria-label="Dialog schliessen" (click)="closeProposal()">×</button></div>
      <form class="daca-card-body term-form" [formGroup]="termForm" (ngSubmit)="submitProposal()">
        <p>Der Vorschlag geht an die Data Owners aller gewählten Domains und wird nach vollständiger Freigabe automatisch an dieses Produkt angehängt.</p>
        <label>Deutscher Begriff *<input formControlName="labelDe" autocomplete="off"></label><label>Deutsche Definition *<textarea rows="3" formControlName="definitionDe"></textarea></label><label>Englischer Begriff<input formControlName="labelEn" autocomplete="off"></label><label>Englische Definition<textarea rows="3" formControlName="definitionEn"></textarea></label>
        <div><button class="daca-button is-secondary" type="button" (click)="closeProposal()">Abbrechen</button><button class="daca-button" type="submit" [disabled]="termForm.invalid || proposalSaving()">{{ proposalSaving() ? 'Wird eingereicht …' : 'Vorschlag einreichen' }}</button></div>
      </form>
    </dialog>
  `,
  styles: [`
    .semantic-picker{border:1px solid #c9ced3;padding:1rem}.semantic-picker legend{font-weight:800}.semantic-picker>p{margin-top:0;color:#535b63}.semantic-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.5rem;margin:.75rem 0}.semantic-options label{display:flex;gap:.65rem;padding:.65rem;border:1px solid #d7dadd;border-radius:.25rem}.semantic-options input{margin-top:.2rem}.semantic-options span{display:grid}.semantic-options small{font-weight:400;color:#59616a}.semantic-error{color:#b00020;font-weight:700}.suggestion-panel{padding:1rem;background:#f2f6f8;border-left:4px solid #006699}.suggestion-panel>div,.suggestion-panel li{display:flex;align-items:center;justify-content:space-between;gap:1rem}.suggestion-panel h3{margin:.1rem 0}.suggestion-panel ul{list-style:none;padding:0}.suggestion-panel li{padding:.55rem 0;border-top:1px solid #cbd3d8}.suggestion-panel li span{display:grid}.term-dialog{width:min(38rem,calc(100vw - 2rem));padding:0;border:0}.term-dialog::backdrop{background:#0008}.term-dialog .daca-card-header button{font-size:1.75rem;border:0;background:none}.term-form{display:grid;gap:1rem}.term-form label{display:grid;gap:.35rem;font-weight:700}.term-form>div{display:flex;justify-content:flex-end;gap:.5rem}
  `],
})
export class MetadataStudioComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  readonly routeProductId = this.route.snapshot.paramMap.get('id') ?? this.api.product().id;
  readonly product = signal<DataProduct>({
    ...this.api.product(),
    id: this.routeProductId,
    title: 'Datenprodukt wird geladen',
    revision: 0,
    endpoints: [],
  });
  readonly productReady = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly messageTone = signal<'info' | 'error'>('info');
  readonly recentActivity = signal<readonly ProductActivityItem[]>([]);
  readonly activityLoading = signal(true);
  readonly activityError = signal(false);
  readonly availableDomains = signal<readonly DomainSummary[]>([]);
  readonly availableTerms = signal<readonly GlossaryTermSummary[]>([]);
  readonly selectedDomainIds = signal<readonly string[]>([]);
  readonly selectedTermIds = signal<readonly string[]>([]);
  readonly semanticsLoading = signal(true);
  readonly semanticsError = signal('');
  readonly suggestions = signal<readonly SemanticSuggestion[]>([]);
  readonly suggestionsLoading = signal(false);
  readonly suggestionsError = signal('');
  readonly proposalSaving = signal(false);
  readonly filteredTerms = computed(() => termsForDomains(this.availableTerms(), this.selectedDomainIds()));
  @ViewChild('termDialog') private termDialog?: ElementRef<HTMLDialogElement>;
  readonly presentActivity = presentProductActivity;
  private appliedRevision = 0;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.maxLength(4000)]],
    owner: ['', Validators.required],
    lifecycle: ['active' as DataProduct['lifecycle']],
    classification: ['restricted' as DataProduct['classification']],
    keywords: [''],
    contact: ['', [Validators.required, Validators.email]],
    license: [''],
    quality: [''],
    updateFrequency: [''],
  });
  readonly termForm = this.fb.nonNullable.group({ labelDe: ['', Validators.required], definitionDe: ['', Validators.required], labelEn: [''], definitionEn: [''] });

  constructor() {
    this.api.loadProduct(this.routeProductId).subscribe({
      next: (product) => {
        if (product.id !== this.routeProductId) {
          this.messageTone.set('error');
          this.message.set('Das geladene Datenprodukt stimmt nicht mit der angeforderten Metadatenseite überein.');
          return;
        }
        this.product.set(product);
        this.productReady.set(true);
        this.selectedDomainIds.set(product.domains.map((domain) => domain.id));
        this.selectedTermIds.set(product.glossaryTerms.map((term) => term.id));
        this.loadSuggestions();
      },
      error: () => {
        this.messageTone.set('error');
        this.message.set('Die Produktmetadaten konnten nicht geladen werden. Es werden keine Ersatzdaten angezeigt.');
      },
    });
    this.loadSemantics();
    this.loadRecentActivity();
    effect(() => {
      const product = this.product();
      if (product.revision === this.appliedRevision || this.form.dirty) return;
      this.appliedRevision = product.revision;
      this.form.reset({
        title: product.title,
        description: product.description,
        owner: product.owner,
        lifecycle: product.lifecycle,
        classification: product.classification,
        keywords: product.keywords.join(', '),
        contact: product.contact,
        license: product.license,
        quality: product.quality,
        updateFrequency: product.updateFrequency,
      });
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || !this.productReady()) return;
    const value = this.form.getRawValue();
    const current = this.product();
    this.saving.set(true);
    this.message.set('');
    this.api
      .updateProductMetadata(current, {
        ...value,
        domains: this.availableDomains().filter((domain) => this.selectedDomainIds().includes(domain.id)),
        glossaryTerms: this.availableTerms().filter((term) => this.selectedTermIds().includes(term.id)),
        keywords: value.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.product.set(updated);
          this.appliedRevision = updated.revision;
          this.form.markAsPristine();
          this.messageTone.set('info');
          this.message.set(`Revision ${updated.revision} saved and added to the audit trail.`);
          this.loadRecentActivity();
        },
        error: (error: Error) => {
          this.messageTone.set('error');
          this.message.set(error.message);
        },
      });
  }

  toggleDomain(domainId: string): void {
    this.selectedDomainIds.update((ids) => toggleSemanticSelection(ids, domainId));
    this.selectedTermIds.update((ids) => validSelectedTermIds(this.availableTerms(), this.selectedDomainIds(), ids));
    this.form.markAsDirty();
  }

  toggleTerm(termId: string): void { this.selectedTermIds.update((ids) => toggleSemanticSelection(ids, termId)); this.form.markAsDirty(); }
  termLanguages(term: GlossaryTermSummary): string { return term.labels.map((label) => `${label.language.toUpperCase()}: ${label.preferredLabel}`).join(' · '); }
  suggestionApplied(suggestion: SemanticSuggestion): boolean { return suggestion.kind === 'domain' ? this.selectedDomainIds().includes(suggestion.id) : this.selectedTermIds().includes(suggestion.id); }
  applySuggestion(suggestion: SemanticSuggestion): void { if (suggestion.kind === 'domain' && !this.selectedDomainIds().includes(suggestion.id)) this.toggleDomain(suggestion.id); if (suggestion.kind === 'glossaryTerm' && !this.selectedTermIds().includes(suggestion.id)) this.toggleTerm(suggestion.id); }

  loadSemantics(): void {
    this.semanticsLoading.set(true); this.semanticsError.set('');
    this.api.loadDomains().subscribe({ next: (domains) => { this.availableDomains.set(domains.filter((domain) => domain.status === 'active')); this.api.loadGlossaryTerms().pipe(finalize(() => this.semanticsLoading.set(false))).subscribe({ next: (terms) => this.availableTerms.set(terms.filter((term) => term.status === 'active')), error: () => this.semanticsError.set('Glossarterme konnten nicht geladen werden.') }); }, error: () => { this.semanticsLoading.set(false); this.semanticsError.set('Domains konnten nicht geladen werden.'); } });
  }

  loadSuggestions(): void {
    if (!this.productReady()) return;
    this.suggestionsLoading.set(true); this.suggestionsError.set('');
    this.api.loadSemanticSuggestions(this.routeProductId).pipe(finalize(() => this.suggestionsLoading.set(false))).subscribe({ next: (items) => this.suggestions.set(items.slice(0, 5)), error: () => { this.suggestions.set([]); this.suggestionsError.set('Vorschläge sind derzeit nicht verfügbar; die manuelle Auswahl bleibt möglich.'); } });
  }

  openProposal(): void { this.termDialog?.nativeElement.showModal(); }
  closeProposal(): void { this.termDialog?.nativeElement.close(); }
  submitProposal(): void {
    if (this.termForm.invalid || this.proposalSaving() || !this.selectedDomainIds().length) return;
    const value = this.termForm.getRawValue(); this.proposalSaving.set(true);
    this.api.createGlossaryTermProposal({ operation: 'create', sourceProductId: this.routeProductId, autoAttach: true, domainIds: this.selectedDomainIds(), labels: [{ language: 'de', preferredLabel: value.labelDe, alternativeLabels: [], definition: value.definitionDe }, ...(value.labelEn ? [{ language: 'en', preferredLabel: value.labelEn, alternativeLabels: [], definition: value.definitionEn }] : [])] }).pipe(finalize(() => this.proposalSaving.set(false))).subscribe({ next: () => { this.closeProposal(); this.messageTone.set('info'); this.message.set('Der Termvorschlag wurde den Domain Owners zur Prüfung übermittelt.'); }, error: (error) => { this.messageTone.set('error'); this.message.set(error?.error?.detail ?? 'Der Termvorschlag konnte nicht eingereicht werden.'); } });
  }

  loadRecentActivity(): void {
    this.activityLoading.set(true);
    this.activityError.set(false);
    this.api.loadProductActivity(this.routeProductId)
      .pipe(finalize(() => this.activityLoading.set(false)))
      .subscribe({
        next: (response) => this.recentActivity.set(recentProductActivity(response.items)),
        error: () => {
          this.recentActivity.set([]);
          this.activityError.set(true);
        },
      });
  }
}
