import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct, DomainSummary, GlossaryTermSummary, ProductActivityItem, SemanticSuggestion } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { presentProductActivity } from '../activity/product-activity.presenter';
import { recentProductActivity } from './metadata-activity-preview';
import { termsForDomains, toggleSemanticSelection, validSelectedTermIds } from './domain-selection';
import { MetadataTermCandidate, metadataTermCandidates } from './metadata-term-candidates';
import { GlossaryProposalFormComponent, GlossaryProposalFormValue } from '../domains/glossary-proposal-form.component';

@Component({
  selector: 'daca-metadata-studio',
  standalone: true,
  imports: [DatePipe, GlossaryProposalFormComponent, ProductWorkspaceNavComponent, ReactiveFormsModule, RouterLink, StatusBadgeComponent],
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
            <div class="semantic-proposal-actions">
              <button class="daca-button is-secondary" type="button" [disabled]="!productReady() || !selectedDomainIds().length" (click)="openProposal()">Term vorschlagen</button>
              <button class="semantic-derive-action" type="button" [disabled]="!productReady()" (click)="deriveTermCandidates()">Begriffe aus Metadaten ableiten</button>
              @if (!selectedDomainIds().length) {
                <small>Wählen Sie mindestens eine Fachdomain, damit der zuständige Data Owner den Vorschlag prüfen kann.</small>
              } @else if (canAutoAttach()) {
                <small>Akzeptierte Vorschläge können automatisch an dieses Produkt angehängt werden.</small>
              } @else {
                <small>Sie dürfen einen Begriff vorschlagen. Automatisch anhängen dürfen nur Product Owner oder deren Stellvertretung.</small>
              }
            </div>
            <label class="semantic-term-search">Akzeptierte Terme durchsuchen
              <input type="search" [value]="termQuery()" (input)="termQuery.set(inputValue($event))" placeholder="Begriff, Abkürzung oder Definition">
            </label>
            <div class="semantic-options">@for (term of filteredTerms(); track term.id) { <label><input type="checkbox" [checked]="selectedTermIds().includes(term.id)" (change)="toggleTerm(term.id)"><span><strong>{{ term.preferredLabel }}</strong><small>{{ termLanguages(term) }}@if(termAlternativeLabels(term)){ · {{ termAlternativeLabels(term) }}} · {{ term.definition }}</small></span></label> } @empty { <span>{{ selectedDomainIds().length ? (termQuery().trim() ? 'Keine passenden akzeptierten Terme.' : 'Keine akzeptierten Terme für diese Domains.') : 'Wählen Sie zuerst mindestens eine Domain.' }}</span> }</div>
            @if (derivedCandidates().length) {
              <ul class="metadata-term-candidates" aria-label="Aus Metadaten abgeleitete Termkandidaten">
                @for (candidate of derivedCandidates(); track candidate.label) {
                  <li><span><strong>{{ candidate.label }}</strong><small>{{ candidate.reason }}</small></span><button type="button" [disabled]="!selectedDomainIds().length" (click)="openProposal(candidate.label, candidate.reason)">Als Term vorschlagen</button></li>
                }
              </ul>
            } @else if (derivationAttempted()) {
              <p class="metadata-derivation-empty">Aus dem aktuellen Titel und den Keywords liessen sich keine geeigneten Kandidaten ableiten.</p>
            }
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

    <dialog #termDialog class="daca-card term-dialog" aria-labelledby="metadata-term-dialog-title" (close)="resetProposal()">
      <div class="daca-card-header"><div><p class="daca-eyebrow">Glossar-Governance</p><h2 id="metadata-term-dialog-title">Term vorschlagen</h2></div><button type="button" aria-label="Dialog schliessen" (click)="closeProposal()">×</button></div>
      <div class="daca-card-body">
        @if (proposalContext()) { <p class="term-proposal-context"><strong>Aus den Metadaten abgeleitet:</strong> {{ proposalContext() }}</p> }
        <daca-glossary-proposal-form
          [domains]="availableDomains()"
          [terms]="availableTerms()"
          [target]="proposalTarget()"
          [product]="product()"
          [initialDomainIds]="selectedDomainIds()"
          [initialLabel]="proposalInitialLabel()"
          [canAttachProduct]="canAutoAttach()"
          [submitting]="proposalSaving()"
          (proposalSubmit)="submitProposal($event)"
          (proposalCancel)="closeProposal()"
          (targetSelect)="proposalTarget.set($event)"
        />
      </div>
    </dialog>

  `,
  styles: [`
    .semantic-picker{border:1px solid #c9ced3;padding:1rem}.semantic-picker legend{font-weight:800}.semantic-picker>p{margin-top:0;color:#535b63}.semantic-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.5rem;margin:.75rem 0}.semantic-options label{display:flex;gap:.65rem;padding:.65rem;border:1px solid #d7dadd;border-radius:.25rem}.semantic-options input{margin-top:.2rem}.semantic-options span{display:grid}.semantic-options small{font-weight:400;color:#59616a}.semantic-proposal-actions{display:flex;align-items:center;flex-wrap:wrap;gap:.65rem}.semantic-proposal-actions small{flex-basis:100%;color:#59616a}.semantic-term-search{display:grid;gap:.35rem;max-width:32rem;margin-top:1rem;font-weight:700}.semantic-derive-action{border:0;background:none;color:#006699;text-decoration:underline;text-underline-offset:.16rem;cursor:pointer;font:inherit;font-weight:700}.semantic-derive-action:disabled{color:#747b81;cursor:not-allowed}.metadata-term-candidates{list-style:none;margin:1rem 0 0;padding:0;border-top:1px solid #d7dadd}.metadata-term-candidates li{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.65rem 0;border-bottom:1px solid #d7dadd}.metadata-term-candidates li span{display:grid}.metadata-term-candidates small,.metadata-derivation-empty{color:#59616a}.metadata-term-candidates button{border:0;background:none;color:#006699;text-decoration:underline;cursor:pointer;font:inherit;font-weight:700}.metadata-term-candidates button:disabled{color:#747b81;cursor:not-allowed}.semantic-error{color:#b00020;font-weight:700}.suggestion-panel{padding:1rem;background:#f2f6f8;border-left:4px solid #006699}.suggestion-panel>div,.suggestion-panel li{display:flex;align-items:center;justify-content:space-between;gap:1rem}.suggestion-panel h3{margin:.1rem 0}.suggestion-panel ul{list-style:none;padding:0}.suggestion-panel li{padding:.55rem 0;border-top:1px solid #cbd3d8}.suggestion-panel li span{display:grid}.term-dialog{width:min(70rem,calc(100vw - 2rem));max-height:92vh;padding:0;border:0;overflow:auto}.term-dialog::backdrop{background:#0008}.term-dialog .daca-card-header button{font-size:1.75rem;border:0;background:none}.term-proposal-context{padding:.65rem;background:#eef5f8;border-left:3px solid #006699}
  `],
})
export class MetadataStudioComponent {
  readonly api = inject(CatalogApiService);
  private readonly identity = inject(DemoIdentityService);
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
  readonly derivedCandidates = signal<readonly MetadataTermCandidate[]>([]);
  readonly derivationAttempted = signal(false);
  readonly proposalInitialLabel = signal('');
  readonly proposalContext = signal('');
  readonly proposalSaving = signal(false);
  readonly proposalTarget = signal<GlossaryTermSummary | null>(null);
  readonly termQuery = signal('');
  readonly filteredTerms = computed(() => {
    const terms = termsForDomains(this.availableTerms(), this.selectedDomainIds());
    const query = this.termQuery().trim().toLocaleLowerCase('de-CH');
    if (!query) return terms;
    return terms.filter((term) => term.labels.some((label) => [
      label.preferredLabel,
      label.definition,
      ...label.alternativeLabels,
    ].some((value) => value.toLocaleLowerCase('de-CH').includes(query))));
  });
  readonly canAutoAttach = computed(() => {
    const product = this.product();
    const userId = this.identity.userId();
    return userId === product.ownerUserId || userId === product.deputyOwnerUserId;
  });
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

  deriveTermCandidates(): void {
    const value = this.form.getRawValue();
    this.derivedCandidates.set(metadataTermCandidates(value.title, value.keywords));
    this.derivationAttempted.set(true);
  }

  openProposal(label = '', context = ''): void {
    if (!this.selectedDomainIds().length) return;
    this.proposalInitialLabel.set(label.trim());
    this.proposalContext.set(context);
    this.termDialog?.nativeElement.showModal();
    setTimeout(() => this.termDialog?.nativeElement.querySelector<HTMLInputElement>('input[formcontrolname="labelDe"]')?.focus());
  }

  closeProposal(): void { this.termDialog?.nativeElement.close(); }
  resetProposal(): void { this.proposalInitialLabel.set(''); this.proposalContext.set(''); this.proposalTarget.set(null); }
  submitProposal(value: GlossaryProposalFormValue): void {
    if (this.proposalSaving()) return;
    this.proposalSaving.set(true);
    this.api.createGlossaryTermProposal(value).pipe(finalize(() => this.proposalSaving.set(false))).subscribe({
      next: () => {
        this.closeProposal();
        this.messageTone.set('info');
        this.message.set('Der Termvorschlag wurde den Domain Owners zur Prüfung übermittelt.');
      },
      error: (error) => {
        this.messageTone.set('error');
        this.message.set(error?.error?.detail ?? 'Der Termvorschlag konnte nicht eingereicht werden.');
      },
    });
  }

  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  termAlternativeLabels(term: GlossaryTermSummary): string { return term.labels.flatMap((label) => label.alternativeLabels).join(', '); }

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
