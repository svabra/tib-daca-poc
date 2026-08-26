import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize, forkJoin, Observable } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainChangeRequest, DomainSummary, GlossaryTermProposal, GlossaryTermSummary } from '../../core/catalog.models';

@Component({
  selector: 'daca-domains-glossary',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div>
        <p class="daca-eyebrow">Fachliche Semantik</p>
        <h1>Domains & Glossar</h1>
        <p>Domains ordnen Datenprodukte fachlich ein. Sie sind keine Organisationen, Ämter oder Abteilungen.</p>
      </div>
      @if (canRequestDomain()) { <button class="daca-button" type="button" (click)="openCreate()">Domain beantragen</button> }
    </section>

    @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }} <button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button></p> }

    <nav class="semantic-tabs" aria-label="Domains und Glossar">
      <button type="button" [class.is-active]="tab() === 'domains'" (click)="tab.set('domains')">Domains <span>{{ domains().length }}</span></button>
      <button type="button" [class.is-active]="tab() === 'terms'" (click)="tab.set('terms')">Glossar <span>{{ terms().length }}</span></button>
      <button type="button" [class.is-active]="tab() === 'governance'" (click)="tab.set('governance')">Governance <span>{{ openGovernanceCount() }}</span></button>
    </nav>

    @if (loading()) {
      <div class="daca-card semantic-state" aria-live="polite">Domainregister und Glossar werden geladen …</div>
    } @else if (!error() && tab() === 'domains') {
      <label class="semantic-search">Domains durchsuchen <input type="search" [value]="query()" (input)="query.set(searchValue($event))" placeholder="Name, Definition oder Owner"></label>
      @if (filteredDomains().length) {
        <div class="semantic-grid">
          @for (domain of filteredDomains(); track domain.id) {
            <article class="daca-card semantic-card">
              <div class="daca-card-header"><div><p class="daca-eyebrow">Fachdomain</p><h2>{{ domain.preferredLabel }}</h2></div><daca-status-badge [tone]="domain.status === 'active' ? 'green' : 'neutral'">{{ domain.status === 'active' ? 'Aktiv' : 'Stillgelegt' }}</daca-status-badge></div>
              <div class="daca-card-body"><p>{{ domain.definition || 'Noch keine Definition hinterlegt.' }}</p><dl><div><dt>Data Owner</dt><dd>{{ domain.ownerName }} · {{ domain.ownerOrganization }}</dd></div><div><dt>Stellvertretung</dt><dd>{{ domain.deputyOwnerName }} · {{ domain.deputyOwnerOrganization }}</dd></div><div><dt>Inhalt</dt><dd>{{ domain.productCount }} Produkte · {{ domain.termCount }} Terme</dd></div><div><dt>Revision</dt><dd>{{ domain.revision }}</dd></div></dl><div class="domain-actions"><a class="daca-button is-secondary" [routerLink]="['/domains', domain.id]">Domain öffnen</a>@if(domain.status==='active'&&canRequestDomain()){<button class="daca-button is-secondary" type="button" (click)="openDomainEdit(domain,false)">Änderung beantragen</button><button type="button" (click)="requestRetirement(domain)">Stilllegung beantragen</button>}@if(domain.status==='active'&&isRegisterOwner()){<button type="button" (click)="openDomainEdit(domain,true)">Direkt bearbeiten</button><button type="button" (click)="retireDirect(domain)">Direkt stilllegen</button>}</div></div>
            </article>
          }
        </div>
      } @else { <div class="daca-card semantic-state">Keine passende Domain gefunden.</div> }
    } @else if (!error() && tab() === 'terms') {
      @if (terms().length) {
        <div class="semantic-grid">
          @for (term of terms(); track term.id) {
            <article class="daca-card semantic-card"><div class="daca-card-header"><div><p class="daca-eyebrow">SKOS Concept</p><h2>{{ term.preferredLabel }}</h2></div><daca-status-badge [tone]="term.status === 'active' ? 'green' : 'neutral'">{{ term.status }}</daca-status-badge></div><div class="daca-card-body"><p>{{ term.definition || 'Noch keine Definition hinterlegt.' }}</p><div class="semantic-chips">@for (domain of term.domains; track domain.id) { <a [routerLink]="['/domains', domain.id]">{{ domain.preferredLabel }}</a> }</div><dl><div><dt>Sprachen</dt><dd>{{ languages(term) }}</dd></div><div><dt>Relationen</dt><dd>{{ term.relations.length }}</dd></div></dl>@if(term.status==='active'){<div class="domain-actions term-actions"><button class="daca-button is-secondary" type="button" (click)="openTermUpdate(term)">Änderung vorschlagen</button><button type="button" (click)="requestTermRetirement(term)">Stilllegung beantragen</button></div>}</div></article>
          }
        </div>
      } @else { <div class="daca-card semantic-state">Noch keine akzeptierten Glossarterme.</div> }
    } @else if (!error()) {
      <div class="semantic-governance">
        <section><h2>Domain-Anträge</h2>@if (domainRequests().length) { @for (request of domainRequests(); track request.id) { <article class="daca-card governance-row"><div><strong>{{ requestTitle(request) }}</strong><p>{{ request.requesterName }} · Revision {{ request.revision }} · {{ request.status }}</p></div>@if (isRegisterOwner() && request.status === 'submitted') { <div><button class="daca-button is-secondary" type="button" (click)="openDomainRequestReview(request)">Antrag bearbeiten</button><button class="daca-button" type="button" (click)="decideDomain(request, 'approve')">Genehmigen</button><button class="daca-button is-secondary" type="button" (click)="decideDomain(request, 'reject')">Ablehnen</button></div> }</article> } } @else { <div class="daca-card semantic-state">Keine Domain-Anträge.</div> }</section>
        <section><h2>Termvorschläge</h2>@if (proposals().length) { @for (proposal of proposals(); track proposal.id) { <article class="daca-card governance-row"><div><strong>{{ proposalTitle(proposal) }}</strong><p>{{ proposal.requesterName }} · {{ proposal.reviews.length }} Domain-Reviews · {{ proposal.status }}</p></div><a class="daca-button is-secondary" [routerLink]="['/glossary/proposals', proposal.id, 'review']">Review öffnen</a></article> } } @else { <div class="daca-card semantic-state">Keine sichtbaren Termvorschläge.</div> }</section>
      </div>
    }

    @if (requestOpen()) {
      <div class="dialog-backdrop" (click)="requestOpen.set(false)"></div>
      <section class="daca-card semantic-dialog" role="dialog" aria-modal="true" aria-labelledby="domain-request-title">
        <div class="daca-card-header"><h2 id="domain-request-title">{{ reviewingRequest() ? 'Domain-Antrag prüfen · Revision ' + reviewingRequest()!.revision : requestMode() === 'create' ? 'Neue Domain beantragen' : directAction() ? 'Domain direkt bearbeiten' : 'Domain-Änderung beantragen' }}</h2><button type="button" aria-label="Schliessen" (click)="requestOpen.set(false)">×</button></div>
        <form class="daca-card-body dialog-form" [formGroup]="requestForm" (ngSubmit)="submitDomainRequest()">
          <label>Deutsche Bezeichnung *<input formControlName="label"></label>
          <label>Definition *<textarea rows="4" formControlName="definition"></textarea></label>
          <label>Data Owner (User-ID) *<input formControlName="ownerUserId"></label>
          <label>Stellvertretung (User-ID) *<input formControlName="deputyOwnerUserId"></label>
          <p>Owner und Stellvertretung müssen unterschiedliche aktive Data Owners sein.</p>
          <div><button class="daca-button is-secondary" type="button" (click)="requestOpen.set(false)">Abbrechen</button><button class="daca-button" type="submit" [disabled]="requestForm.invalid || saving()">{{ saving() ? 'Wird eingereicht …' : 'Antrag einreichen' }}</button></div>
        </form>
      </section>
    }

    @if (termRequestOpen() && termRequestTarget(); as target) {
      <div class="dialog-backdrop" (click)="closeTermRequest()"></div>
      <section class="daca-card semantic-dialog term-dialog" role="dialog" aria-modal="true" aria-labelledby="term-request-title" aria-describedby="term-request-help">
        <div class="daca-card-header"><div><p class="daca-eyebrow">Glossar-Governance</p><h2 id="term-request-title">Änderung an «{{ target.preferredLabel }}» vorschlagen</h2></div><button type="button" aria-label="Schliessen" (click)="closeTermRequest()">×</button></div>
        <form class="daca-card-body dialog-form" [formGroup]="termRequestForm" (ngSubmit)="submitTermUpdate()">
          <p id="term-request-help">Der Antrag wird von den primären Data Owners aller bisherigen und neu gewählten Domains geprüft. Bestehende SKOS-Relationen und weitere Sprachlabels bleiben erhalten.</p>
          <div class="term-language-grid">
            <fieldset><legend>Deutsch</legend><label>Bezeichnung<input formControlName="labelDe"></label><label>Synonyme, kommagetrennt<input formControlName="alternativeLabelsDe"></label><label>Definition<textarea rows="4" formControlName="definitionDe"></textarea></label></fieldset>
            <fieldset><legend>English</legend><label>Preferred label<input formControlName="labelEn"></label><label>Alternative labels, comma-separated<input formControlName="alternativeLabelsEn"></label><label>Definition<textarea rows="4" formControlName="definitionEn"></textarea></label></fieldset>
          </div>
          <fieldset class="term-domain-selection"><legend>Fachdomains *</legend>@for(domain of activeDomains();track domain.id){<label><input type="checkbox" [checked]="termDomainSelected(domain.id)" (change)="toggleTermDomain(domain.id, checkboxChecked($event))">{{domain.preferredLabel}}</label>}</fieldset>
          @if(!termFormValid()){<p class="form-hint">Mindestens eine Domain sowie pro ausgefüllter Sprache Bezeichnung und Definition sind erforderlich.</p>}
          <div><button class="daca-button is-secondary" type="button" (click)="closeTermRequest()">Abbrechen</button><button class="daca-button" type="submit" [disabled]="!termFormValid() || saving()">{{ saving() ? 'Wird eingereicht …' : 'Änderungsantrag einreichen' }}</button></div>
        </form>
      </section>
    }
  `,
  styles: [`
    .semantic-tabs{display:flex;gap:.5rem;margin:0 0 1.5rem;border-bottom:1px solid var(--daca-color-border,#d5d8dc)}.semantic-tabs button{border:0;background:none;padding:.9rem 1rem;font-weight:700;border-bottom:3px solid transparent}.semantic-tabs button.is-active{border-color:#e1001a}.semantic-tabs span{margin-left:.4rem;color:#646b72}.semantic-search{display:grid;gap:.35rem;max-width:38rem;margin-bottom:1.25rem;font-weight:700}.semantic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(19rem,1fr));gap:1rem}.semantic-card h2{margin:0}.semantic-card dl{display:grid;gap:.65rem}.semantic-card dl div{display:grid;grid-template-columns:7rem 1fr;gap:.75rem}.semantic-card dt{font-weight:700}.semantic-card dd{margin:0}.domain-actions{display:flex;flex-wrap:wrap;gap:.5rem}.term-actions{margin-top:1rem}.semantic-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0}.semantic-chips a{padding:.25rem .55rem;background:#eef3f7;border-radius:1rem}.semantic-state{padding:2rem;text-align:center}.semantic-governance{display:grid;gap:2rem}.governance-row{padding:1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:.75rem 0}.governance-row p{margin:.25rem 0 0}.governance-row>div:last-child{display:flex;gap:.5rem}.dialog-backdrop{position:fixed;inset:0;background:#0008;z-index:20}.semantic-dialog{position:fixed;z-index:21;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(36rem,calc(100vw - 2rem));max-height:90vh;overflow:auto}.term-dialog{width:min(58rem,calc(100vw - 2rem))}.semantic-dialog .daca-card-header button{font-size:1.75rem;border:0;background:none}.dialog-form{display:grid;gap:1rem}.dialog-form label{display:grid;gap:.35rem;font-weight:700}.dialog-form>div{display:flex;justify-content:flex-end;gap:.5rem}.term-language-grid{display:grid!important;grid-template-columns:1fr 1fr;gap:1rem;justify-content:stretch!important}.term-language-grid fieldset,.term-domain-selection{display:grid;gap:.75rem;margin:0;padding:1rem;border:1px solid var(--daca-color-border,#d5d8dc)}.term-language-grid legend,.term-domain-selection legend{font-weight:700}.term-domain-selection{grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}.term-domain-selection legend{grid-column:1/-1}.term-domain-selection label{display:flex;align-items:center;gap:.5rem}.form-hint{margin:0;color:#a3291b}@media(max-width:700px){.governance-row{align-items:flex-start;flex-direction:column}.semantic-card dl div,.term-language-grid{grid-template-columns:1fr}}
  `],
})
export class DomainsGlossaryComponent {
  readonly api = inject(CatalogApiService);
  readonly identity = inject(DemoIdentityService);
  private readonly fb = inject(FormBuilder);
  readonly tab = signal<'domains' | 'terms' | 'governance'>('domains');
  readonly domains = signal<readonly DomainSummary[]>([]);
  readonly terms = signal<readonly GlossaryTermSummary[]>([]);
  readonly domainRequests = signal<readonly DomainChangeRequest[]>([]);
  readonly proposals = signal<readonly GlossaryTermProposal[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly query = signal('');
  readonly requestOpen = signal(false);
  readonly requestMode = signal<'create' | 'update'>('create');
  readonly requestTarget = signal<DomainSummary | null>(null);
  readonly directAction = signal(false);
  readonly reviewingRequest = signal<DomainChangeRequest | null>(null);
  readonly termRequestOpen = signal(false);
  readonly termRequestTarget = signal<GlossaryTermSummary | null>(null);
  readonly selectedTermDomainIds = signal<readonly string[]>([]);
  readonly canRequestDomain = computed(() => this.identity.user().roles.includes('data_owner'));
  readonly isRegisterOwner = computed(() => this.identity.user().roles.includes('domain_register_owner'));
  readonly activeDomains = computed(() => this.domains().filter((domain) => domain.status === 'active'));
  readonly openGovernanceCount = computed(() => this.domainRequests().filter((item) => item.status === 'submitted').length + this.proposals().filter((item) => item.status === 'submitted' || item.status === 'in_review').length);
  readonly filteredDomains = computed(() => { const query = this.query().trim().toLocaleLowerCase('de-CH'); return query ? this.domains().filter((item) => [item.preferredLabel,item.definition,item.ownerName,item.ownerOrganization].some((value) => value.toLocaleLowerCase('de-CH').includes(query))) : this.domains(); });
  readonly requestForm = this.fb.nonNullable.group({ label: ['', [Validators.required, Validators.maxLength(160)]], definition: ['', [Validators.required, Validators.maxLength(2000)]], ownerUserId: ['', Validators.required], deputyOwnerUserId: ['', Validators.required] });
  readonly termRequestForm = this.fb.nonNullable.group({
    labelDe: ['', Validators.maxLength(255)],
    alternativeLabelsDe: [''],
    definitionDe: ['', Validators.maxLength(4000)],
    labelEn: ['', Validators.maxLength(255)],
    alternativeLabelsEn: [''],
    definitionEn: ['', Validators.maxLength(4000)],
  });

  constructor() { this.load(); }

  load(): void {
    this.loading.set(true); this.error.set('');
    forkJoin({ domains: this.api.loadDomains(true), terms: this.api.loadGlossaryTerms(), requests: this.api.loadDomainChangeRequests(), proposals: this.api.loadGlossaryTermProposals() }).pipe(finalize(() => this.loading.set(false))).subscribe({ next: (data) => { this.domains.set(data.domains); this.terms.set(data.terms); this.domainRequests.set(data.requests); this.proposals.set(data.proposals); }, error: () => this.error.set('Die fachlichen Metadaten konnten nicht geladen werden.') });
  }

  searchValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  checkboxChecked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  languages(term: GlossaryTermSummary): string { return term.labels.map((label) => label.language.toUpperCase()).join(', ') || '–'; }
  requestTitle(request: DomainChangeRequest): string { const localizations = request.reviewPayload['localizations'] ?? request.requestedPayload['localizations']; return Array.isArray(localizations) ? String((localizations[0] as Record<string, unknown>)?.['preferredLabel'] ?? request.operation) : request.operation; }
  proposalTitle(proposal: GlossaryTermProposal): string { const labels = proposal.reviewPayload['localizations'] ?? proposal.requestedPayload['localizations']; return Array.isArray(labels) ? String((labels[0] as Record<string, unknown>)?.['preferredLabel'] ?? 'Termvorschlag') : 'Termvorschlag'; }

  openDomainEdit(domain: DomainSummary, direct: boolean): void { this.reviewingRequest.set(null);this.requestMode.set('update'); this.requestTarget.set(domain); this.directAction.set(direct); this.requestForm.reset({ label: domain.preferredLabel, definition: domain.definition, ownerUserId: domain.ownerUserId, deputyOwnerUserId: domain.deputyOwnerUserId }); this.requestOpen.set(true); }
  openCreate(): void { this.reviewingRequest.set(null);this.requestMode.set('create'); this.requestTarget.set(null); this.directAction.set(false); this.requestForm.reset(); this.requestOpen.set(true); }
  openDomainRequestReview(request: DomainChangeRequest): void { const payload=request.reviewPayload;const localizations=Array.isArray(payload['localizations'])?payload['localizations'] as Array<Record<string,unknown>>:[];const de=localizations.find((item)=>item['language']==='de')??localizations[0];this.reviewingRequest.set(request);this.requestTarget.set(null);this.directAction.set(false);this.requestForm.reset({label:String(de?.['preferredLabel']??''),definition:String(de?.['definition']??''),ownerUserId:String(payload['ownerUserId']??''),deputyOwnerUserId:String(payload['deputyOwnerUserId']??'')});this.requestOpen.set(true);}

  openTermUpdate(term: GlossaryTermSummary): void {
    const de = term.labels.find((label) => label.language.toLocaleLowerCase() === 'de');
    const en = term.labels.find((label) => label.language.toLocaleLowerCase() === 'en');
    this.termRequestTarget.set(term);
    this.selectedTermDomainIds.set(term.domains.filter((domain) => domain.status === 'active').map((domain) => domain.id));
    this.termRequestForm.reset({
      labelDe: de?.preferredLabel ?? '',
      alternativeLabelsDe: de?.alternativeLabels.join(', ') ?? '',
      definitionDe: de?.definition ?? '',
      labelEn: en?.preferredLabel ?? '',
      alternativeLabelsEn: en?.alternativeLabels.join(', ') ?? '',
      definitionEn: en?.definition ?? '',
    });
    this.termRequestOpen.set(true);
  }

  closeTermRequest(): void {
    this.termRequestOpen.set(false);
    this.termRequestTarget.set(null);
    this.selectedTermDomainIds.set([]);
    this.termRequestForm.reset();
  }

  termDomainSelected(domainId: string): boolean { return this.selectedTermDomainIds().includes(domainId); }

  toggleTermDomain(domainId: string, selected: boolean): void {
    this.selectedTermDomainIds.update((current) => selected
      ? current.includes(domainId) ? current : [...current, domainId]
      : current.filter((item) => item !== domainId));
  }

  termFormValid(): boolean {
    const value = this.termRequestForm.getRawValue();
    const pairs = [
      [value.labelDe.trim(), value.definitionDe.trim()],
      [value.labelEn.trim(), value.definitionEn.trim()],
    ];
    const pairsComplete = pairs.every(([label, definition]) => Boolean(label) === Boolean(definition));
    const hasEditableLocalization = pairs.some(([label, definition]) => Boolean(label && definition));
    const hasPreservedLocalization = Boolean(this.termRequestTarget()?.labels.some((label) => !['de', 'en'].includes(label.language.toLocaleLowerCase())));
    return this.termRequestForm.valid && this.selectedTermDomainIds().length > 0 && pairsComplete && (hasEditableLocalization || hasPreservedLocalization);
  }

  submitTermUpdate(): void {
    const target = this.termRequestTarget();
    if (!target || !this.termFormValid() || this.saving()) return;
    this.saving.set(true);
    this.api.createGlossaryTermProposal({
      operation: 'update',
      targetTermId: target.id,
      autoAttach: false,
      domainIds: this.selectedTermDomainIds(),
      labels: this.termLocalizations(target),
      relations: this.termRelations(target),
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.closeTermRequest();
        this.tab.set('governance');
        this.notice.set('Der Änderungsantrag wurde den betroffenen Domain Owners zur Prüfung übermittelt.');
        this.load();
      },
      error: (error) => this.error.set(error?.error?.detail ?? 'Der Änderungsantrag konnte nicht eingereicht werden.'),
    });
  }

  requestTermRetirement(term: GlossaryTermSummary): void {
    if (this.saving() || !window.confirm(`Stilllegung von «${term.preferredLabel}» beantragen? Bestehende Referenzen bleiben historisch sichtbar.`)) return;
    this.saving.set(true);
    this.api.createGlossaryTermProposal({
      operation: 'retire',
      targetTermId: term.id,
      autoAttach: false,
      domainIds: term.domains.map((domain) => domain.id),
      labels: term.labels.map((label) => ({
        language: label.language,
        preferredLabel: label.preferredLabel,
        alternativeLabels: [...label.alternativeLabels],
        definition: label.definition,
      })),
      relations: this.termRelations(term),
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.tab.set('governance');
        this.notice.set('Der Stilllegungsantrag wurde den betroffenen Domain Owners zur Prüfung übermittelt.');
        this.load();
      },
      error: (error) => this.error.set(error?.error?.detail ?? 'Der Stilllegungsantrag konnte nicht eingereicht werden.'),
    });
  }

  submitDomainRequest(): void {
    if (this.requestForm.invalid || this.saving()) return;
    const value = this.requestForm.getRawValue();
    if (value.ownerUserId === value.deputyOwnerUserId) { this.error.set('Data Owner und Stellvertretung müssen verschieden sein.'); return; }
    this.saving.set(true);
    const target = this.requestTarget(); const review = this.reviewingRequest(); const draft = { localizations: [{ language: 'de', preferredLabel: value.label, definition: value.definition }], ownerUserId: value.ownerUserId, deputyOwnerUserId: value.deputyOwnerUserId };
    const isDirect = Boolean(target && this.directAction());
    const action: Observable<DomainChangeRequest | DomainSummary> = review ? this.api.updateDomainChangeRequest(review,draft) : target && isDirect ? this.api.updateDomainDirect(target, draft) : this.api.createDomainChangeRequest({ operation: target ? 'update' : 'create', targetDomainId: target?.id, baseRevision: target?.revision, requestedPayload: draft });
    action.pipe(finalize(() => this.saving.set(false))).subscribe({ next: (updated) => { this.requestOpen.set(false); this.requestForm.reset(); this.requestTarget.set(null); this.reviewingRequest.set(null);this.directAction.set(false); this.notice.set(review ? `Review-Revision ${(updated as DomainChangeRequest).revision} gespeichert.` : isDirect ? 'Die Domain wurde direkt aktualisiert.' : 'Der Domain-Antrag wurde eingereicht.'); this.load(); }, error: (error) => this.error.set(error?.error?.detail ?? 'Die Domain-Änderung konnte nicht gespeichert werden.') });
  }

  requestRetirement(domain: DomainSummary): void { if (!window.confirm(`Stilllegung von «${domain.preferredLabel}» beantragen?`)) return; this.api.createDomainChangeRequest({ operation: 'retire', targetDomainId: domain.id, baseRevision: domain.revision, requestedPayload: {} }).subscribe({ next: () => { this.notice.set('Der Stilllegungsantrag wurde eingereicht.'); this.load(); }, error: (error) => this.error.set(error?.error?.detail ?? 'Der Antrag konnte nicht eingereicht werden.') }); }
  retireDirect(domain: DomainSummary): void { if (!window.confirm(`«${domain.preferredLabel}» direkt stilllegen? Bestehende Referenzen bleiben historisch erhalten.`)) return; this.api.retireDomainDirect(domain).subscribe({ next: () => { this.notice.set('Die Domain wurde stillgelegt.'); this.load(); }, error: (error) => this.error.set(error?.error?.detail ?? 'Die Domain konnte nicht stillgelegt werden.') }); }

  decideDomain(request: DomainChangeRequest, decision: 'approve' | 'reject'): void {
    const comment = decision === 'approve' ? 'Im Domainregister geprüft.' : window.prompt('Begründung für die Ablehnung')?.trim() ?? '';
    if (decision === 'reject' && !comment) return;
    this.api.decideDomainChangeRequest(request, decision, comment).subscribe({ next: () => { this.notice.set(decision === 'approve' ? 'Domain-Antrag genehmigt.' : 'Domain-Antrag abgelehnt.'); this.load(); }, error: (error) => this.error.set(error?.error?.detail ?? 'Der Entscheid konnte nicht gespeichert werden.') });
  }

  private termLocalizations(term: GlossaryTermSummary): Array<{ language: string; preferredLabel: string; alternativeLabels: string[]; definition: string }> {
    const value = this.termRequestForm.getRawValue();
    const editable = [
      { language: 'de', preferredLabel: value.labelDe.trim(), alternativeLabels: this.commaSeparatedValues(value.alternativeLabelsDe), definition: value.definitionDe.trim() },
      { language: 'en', preferredLabel: value.labelEn.trim(), alternativeLabels: this.commaSeparatedValues(value.alternativeLabelsEn), definition: value.definitionEn.trim() },
    ].filter((label) => label.preferredLabel && label.definition);
    const preserved = term.labels
      .filter((label) => !['de', 'en'].includes(label.language.toLocaleLowerCase()))
      .map((label) => ({ ...label, alternativeLabels: [...label.alternativeLabels] }));
    return [...editable, ...preserved];
  }

  private termRelations(term: GlossaryTermSummary): Array<{
    relation: GlossaryTermSummary['relations'][number]['relationType'];
    targetTermId?: string;
    targetUri?: string;
  }> {
    const result: Array<{
      relation: GlossaryTermSummary['relations'][number]['relationType'];
      targetTermId?: string;
      targetUri?: string;
    }> = [];
    for (const relation of term.relations) {
      if (relation.targetTermId) result.push({ relation: relation.relationType, targetTermId: relation.targetTermId });
      else if (relation.targetUri) result.push({ relation: relation.relationType, targetUri: relation.targetUri });
    }
    return result;
  }

  private commaSeparatedValues(value: string): string[] {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  }
}
