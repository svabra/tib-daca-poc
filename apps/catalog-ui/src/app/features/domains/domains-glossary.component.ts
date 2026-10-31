import { NgTemplateOutlet } from '@angular/common';
import { DestroyRef, effect, untracked, afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize, forkJoin, Observable, Subscription } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainChangeRequest, DomainSummary, GlossaryTermProposal, GlossaryTermSummary, SemanticGraphState } from '../../core/catalog.models';
import { TermCardActionsComponent } from './term-card-actions.component';
import { OrganizationTermNetworkComponent } from './organization-term-network.component';
import { DomainNetworkComponent } from './domain-network.component';
import { DomainTransferDialogComponent } from './domain-transfer-dialog.component';
import { DomainCardAction, DomainCardActionsComponent } from './domain-card-actions.component';
import { TooltipDirective } from '../../shared/tooltip.directive';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator.component';

export type SemanticTab = 'domains' | 'terms' | 'governance';

function searchableText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-CH');
}

export function resolveSemanticTab(routeTab: unknown, legacyTab: string | null): SemanticTab {
  if (routeTab === 'terms' || routeTab === 'governance') return routeTab;
  return legacyTab === 'terms' || legacyTab === 'governance' ? legacyTab : 'domains';
}

@Component({
  selector: 'daca-domains-glossary',
  standalone: true,
  imports: [NgTemplateOutlet, ReactiveFormsModule, RouterLink, StatusBadgeComponent, DomainCardActionsComponent, TermCardActionsComponent, OrganizationTermNetworkComponent, DomainNetworkComponent, DomainTransferDialogComponent, TooltipDirective, LoadingIndicatorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div>
        <p class="daca-eyebrow">{{ i18n.t('businessSemantics') }}</p>
        <h1>{{ i18n.t('domainTerminology') }}</h1>
        <p>{{ i18n.t('domainIntro') }}</p>
      </div>
      @if (tab() === 'domains' && canRequestDomain()) {
        <button class="daca-button" type="button" (click)="openCreate()">{{ i18n.t('requestDomain') }}</button>
      } @else if (tab() === 'terms') {
        <a class="daca-button" routerLink="/glossary/proposals/new">{{ i18n.t('proposeNewTerm') }}</a>
      }
    </section>

    @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }} <button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button></p> }

    <nav class="semantic-tabs" [attr.aria-label]="i18n.t('domainTerminology')">
      <a routerLink="/domains" [queryParams]="{ownOffice: ownOfficeOnly() ? '1' : '0'}" [attr.aria-current]="tab() === 'domains' ? 'page' : null" [class.is-active]="tab() === 'domains'">{{ i18n.t('domains') }} <span>{{ domains().length }}</span></a>
      <a routerLink="/domains/terminology" [queryParams]="{ownOffice: ownOfficeOnly() ? '1' : '0'}" [attr.aria-current]="tab() === 'terms' ? 'page' : null" [class.is-active]="tab() === 'terms'">{{ i18n.t('terminology') }} <span>{{ terms().length }}</span></a>
      <a routerLink="/domains/concepts">{{ i18n.t('i14yConcepts') }}</a>
      <a routerLink="/domains/themes">{{ i18n.t('themes') }}</a>
      <a routerLink="/domains/governance" [attr.aria-current]="tab() === 'governance' ? 'page' : null" [class.is-active]="tab() === 'governance'">Governance <span>{{ openGovernanceCount() }}</span></a>
    </nav>

    <ng-template #officeFilter>
      <div class="office-filter">
        <label [dacaTooltip]="i18n.t(officeId() ? 'ownOfficeFilterHint' : 'ownOfficeUnavailable', {name: officeName()})">
          <input type="checkbox" [checked]="ownOfficeOnly()" [disabled]="!officeId() && !ownOfficeOnly()" (change)="setOwnOfficeOnly($event)">
          {{ i18n.t('ownOfficeOnly') }}
        </label>
        @if (ownOfficeOnly() && officeLoading()) { <daca-loading-indicator [label]="i18n.t('loadingOfficeScope')"/> }
        @if (ownOfficeOnly() && officeError()) { <span class="daca-alert is-error" role="alert">{{ i18n.t('officeScopeError') }} <button type="button" class="daca-button is-secondary" (click)="loadOfficeScope()">{{i18n.t('retryOfficeScope')}}</button></span> }
        @if (ownOfficeOnly() && !officeId()) { <span role="status">{{i18n.t('ownOfficeUnavailable')}}</span> }
      </div>
    </ng-template>
    @if (loading()) {
      <div class="daca-card semantic-state"><daca-loading-indicator [label]="i18n.t('loadingSemantics')"/></div>
    } @else if (!error() && tab() === 'domains') {
      <div class="term-view-switch domain-view-switch" role="group" [attr.aria-label]="i18n.t('domainView')"><button class="daca-button is-secondary" type="button" [attr.aria-pressed]="domainView()==='cards'" (click)="setDomainView('cards')">{{i18n.t('semanticCards')}}</button><button class="daca-button is-secondary" type="button" [attr.aria-pressed]="domainView()==='network'" (click)="setDomainView('network')">{{i18n.t('domainNetwork')}}</button></div>
      <div class="semantic-filter-row" [class.is-network]="domainView()==='network'">
        @if(domainView()==='cards'){
      <label class="semantic-search">{{ i18n.t('searchDomains') }} <input type="search" [value]="query()" (input)="query.set(searchValue($event))" [placeholder]="i18n.t('domainSearchPlaceholder')"></label>
        }
        <ng-container [ngTemplateOutlet]="officeFilter"/>
      </div>
      @if(domainView()==='network'){<daca-domain-network [embedded]="true" [visibleDomainIds]="officeDomainIds()"/>}@else{
      @if (filteredDomains().length) {
        <div class="semantic-grid">
          @for (domain of filteredDomains(); track domain.id) {
            <article class="daca-card semantic-card domain-card" [attr.data-domain-id]="domain.id">
              <a class="daca-card-header domain-card-heading" [routerLink]="['/domains',domain.id]" [attr.aria-label]="i18n.t('openNamedDomain',{name:domain.preferredLabel})"><div><p class="daca-eyebrow">Fachdomain</p><h2>{{ domain.preferredLabel }}</h2></div><daca-status-badge [tone]="domain.status === 'active' ? 'green' : 'neutral'">{{ domain.status === 'active' ? 'Aktiv' : 'Stillgelegt' }}</daca-status-badge></a>
              <div class="daca-card-body"><p>{{ domain.definition || i18n.t('noDefinition') }}</p><dl><div><dt>Data Owner</dt><dd>{{ domain.ownerName }} · {{ domain.ownerOrganization }}</dd></div><div><dt>Stellvertretung</dt><dd>{{ domain.deputyOwnerName }} · {{ domain.deputyOwnerOrganization }}</dd></div><div><dt>Inhalt</dt><dd>{{ domain.productCount }} Produkte · {{ domain.termCount }} Terme</dd></div><div><dt>Revision</dt><dd>{{ domain.revision }}</dd></div></dl><div class="domain-actions"><daca-domain-card-actions [domain]="domain" [canRequest]="canRequestDomain()" [canGovern]="canGovernDomain(domain)" [busy]="saving()" (action)="domainCardAction(domain,$event)" /></div></div>
            </article>
          }
        </div>
      } @else if (!officeLoading() && !officeError()) { <div class="daca-card semantic-state">{{ i18n.t('noMatchingDomain') }}</div> }
      }
    } @else if (!error() && tab() === 'terms') {
      <div class="term-view-switch" role="group" [attr.aria-label]="i18n.t('semanticView')"><button class="daca-button is-secondary" type="button" [attr.aria-pressed]="termView()==='cards'" (click)="setTermView('cards')">{{i18n.t('semanticCards')}}</button><button class="daca-button is-secondary" type="button" [attr.aria-pressed]="termView()==='network'" (click)="setTermView('network')">{{i18n.t('termNetwork')}}</button></div>
      <div class="semantic-filter-row" [class.is-network]="termView()==='network'">
        @if(termView()==='cards'){
      <label class="semantic-search">{{ i18n.t('searchTerminology') }} <input type="search" [value]="termQuery()" (input)="termQuery.set(searchValue($event))" [placeholder]="i18n.t('termSearchPlaceholder')"></label>
        }
        <ng-container [ngTemplateOutlet]="officeFilter"/>
      </div>
      @if(termView()==='network'){<daca-organization-term-network [domains]="domains()" [terms]="terms()" [ownOfficeOnly]="ownOfficeOnly()" [visibleNodeIds]="officeNodeIds()"/>}@else{
      @if (filteredTerms().length) {
        <div class="semantic-grid">
          @for (term of filteredTerms(); track term.id) {
            <article class="daca-card semantic-card term-card" [attr.data-term-id]="term.id"><div class="daca-card-header"><div><p class="daca-eyebrow">SKOS Concept</p><h2>{{ term.preferredLabel }}</h2></div><daca-status-badge [tone]="term.status === 'active' ? 'green' : 'neutral'">{{ term.status }}</daca-status-badge></div><div class="daca-card-body"><p>{{ term.definition || 'Noch keine Definition hinterlegt.' }}</p><div class="semantic-chips">@for (domain of term.domains; track domain.id) { <a [routerLink]="['/domains', domain.id]">{{ domain.preferredLabel }}</a> }</div><dl>@if(term.ownerUserId){<div><dt>Data Owner</dt><dd>{{personName(term.ownerUserId)}}</dd></div>}@if(term.deputyOwnerUserId){<div><dt>Stellvertretung</dt><dd>{{personName(term.deputyOwnerUserId)}}</dd></div>}<div><dt>Sprachen</dt><dd>{{ languages(term) }}</dd></div><div><dt>Abkürzungen</dt><dd>{{ alternativeLabels(term) || '–' }}</dd></div><div><dt>Relationen</dt><dd>{{ term.relations.length }}</dd></div></dl>@if(term.status==='active'){<div class="domain-actions term-actions"><daca-term-card-actions [term]="term" [busy]="saving()" (action)="requestTermRetirement(term)"/></div>}</div></article>
          }
        </div>
      } @else if (!officeLoading() && !officeError()) { <div class="daca-card semantic-state">{{ i18n.t('noMatchingTerm') }}</div> }
      }
    } @else if (!error()) {
      <div class="semantic-governance">
        <section><h2>Domain-Anträge</h2>@if (domainRequests().length) { @for (request of domainRequests(); track request.id) { <article class="daca-card governance-row"><div><strong>{{ requestTitle(request) }}</strong><p>{{ request.requesterName }} · Revision {{ request.revision }} · {{ request.status }}</p></div>@if (request.canReview && request.status === 'submitted') { <div><button class="daca-button is-secondary" type="button" (click)="openDomainRequestReview(request)">Antrag bearbeiten</button><button class="daca-button" type="button" (click)="decideDomain(request, 'approve')">Genehmigen</button><button class="daca-button is-secondary" type="button" (click)="decideDomain(request, 'reject')">Ablehnen</button></div> }</article> } } @else { <div class="daca-card semantic-state">Keine Domain-Anträge.</div> }</section>
        <section><h2>Termvorschläge</h2>@if (proposals().length) { @for (proposal of proposals(); track proposal.id) { <article class="daca-card governance-row"><div><strong>{{ proposalTitle(proposal) }}</strong><p>{{ proposal.requesterName }} · {{ proposal.reviews.length }} Domain-Reviews · {{ proposal.status }}</p></div><a class="daca-button is-secondary" [routerLink]="['/glossary/proposals', proposal.id, 'review']">Review öffnen</a></article> } } @else { <div class="daca-card semantic-state">Keine sichtbaren Termvorschläge.</div> }</section>
      </div>
    }

    @if(transferTarget();as target){<daca-domain-transfer-dialog [domain]="target" (closed)="transferTarget.set(null)" (saved)="transferSaved($event)"/>}
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
          @if(requestMode()==='create'){<p>Neue Domänen benötigen die Freigabe durch den zuständigen Amts-ALDS oder seine mandatierte Stellvertretung. Zuständig ist das Amt des vorgeschlagenen Data Owners; der Antragsteller darf nicht selbst bewilligen.</p>}
          <div><button class="daca-button is-secondary" type="button" (click)="requestOpen.set(false)">Abbrechen</button><button class="daca-button" type="submit" [disabled]="requestForm.invalid || saving()">{{ saving() ? 'Wird eingereicht …' : 'Antrag einreichen' }}</button></div>
        </form>
      </section>
    }

  `,
  styles: [`
    .semantic-filter-row{display:flex;align-items:flex-start;flex-wrap:wrap;gap:.75rem 1.5rem;margin-bottom:1.25rem}.semantic-filter-row .semantic-search{flex:0 1 38rem;width:100%;min-width:0;margin:0}.office-filter{display:flex;align-items:flex-start;flex-direction:column;gap:.5rem;min-width:0;max-width:100%;padding-top:1.65rem}.semantic-filter-row.is-network .office-filter{padding-top:0}.office-filter .daca-alert{max-width:36rem}.office-filter label{font-size:.875rem;font-weight:400}.semantic-search input{width:100%;min-height:44px;border:1px solid var(--daca-border-strong);padding:.55rem .7rem;background:var(--daca-surface,#fff);font:inherit;font-weight:400}@media(max-width:900px){.semantic-filter-row{gap:.4rem}.semantic-filter-row .semantic-search{flex-basis:100%;max-width:none}.office-filter{padding-top:0}}.office-filter label{display:flex;align-items:center;gap:.5rem;min-height:44px;cursor:pointer}.office-filter input{width:1rem;height:1rem;accent-color:var(--daca-blue)}
    .domain-card-heading{color:inherit;text-decoration:none;cursor:pointer}.domain-card-heading>div{min-width:0}.domain-card-heading h2{overflow-wrap:anywhere}.domain-card-heading:hover{background:var(--daca-blue-soft)}.domain-card-heading:focus-visible{outline:2px solid var(--daca-blue);outline-offset:-3px}.domain-card .domain-actions{justify-content:flex-end}
    .semantic-tabs{display:flex;gap:.5rem;min-width:0;max-width:100%;overflow-x:auto;margin:0 0 1.5rem;border-bottom:1px solid var(--daca-color-border,#d5d8dc)}.semantic-tabs>a{flex:0 0 auto;white-space:nowrap;padding:.9rem 1rem;color:inherit;font-weight:700;text-decoration:none;border-bottom:3px solid transparent}.semantic-tabs>a.is-active{border-color:#e1001a}.semantic-tabs span{margin-left:.4rem;color:#646b72}.semantic-search{display:grid;gap:.35rem;max-width:38rem;margin-bottom:1.25rem;font-weight:700}.semantic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(19rem,1fr));gap:1rem}.semantic-card h2{margin:0}.semantic-card dl{display:grid;gap:.65rem}.semantic-card dl div{display:grid;grid-template-columns:7rem 1fr;gap:.75rem}.semantic-card dt{font-weight:700}.semantic-card dd{margin:0}.domain-actions{display:flex;flex-wrap:wrap;gap:.5rem}.term-actions{margin-top:1rem;justify-content:flex-end}.term-view-switch{display:flex;gap:.5rem;margin-bottom:1rem}.term-view-switch [aria-pressed=true]{background:var(--daca-blue-soft);border-color:var(--daca-blue)}.term-actions .daca-button{font-size:.875rem;min-height:40px}.semantic-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0}.semantic-chips a{padding:.25rem .55rem;background:#eef3f7;border-radius:1rem}.semantic-state{padding:2rem;text-align:center}.semantic-governance{display:grid;gap:2rem}.governance-row{padding:1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:.75rem 0}.governance-row p{margin:.25rem 0 0}.governance-row>div:last-child{display:flex;gap:.5rem}.dialog-backdrop{position:fixed;inset:0;background:#0008;z-index:20}.semantic-dialog{position:fixed;z-index:21;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(36rem,calc(100vw - 2rem));max-height:90vh;overflow:auto}.term-dialog{width:min(58rem,calc(100vw - 2rem))}.semantic-dialog .daca-card-header button{font-size:1.75rem;border:0;background:none}.dialog-form{display:grid;gap:1rem}.dialog-form label{display:grid;gap:.35rem;font-weight:700}.dialog-form>div{display:flex;justify-content:flex-end;gap:.5rem}.term-language-grid{display:grid!important;grid-template-columns:1fr 1fr;gap:1rem;justify-content:stretch!important}.term-language-grid fieldset,.term-domain-selection{display:grid;gap:.75rem;margin:0;padding:1rem;border:1px solid var(--daca-color-border,#d5d8dc)}.term-language-grid legend,.term-domain-selection legend{font-weight:700}.term-domain-selection{grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}.term-domain-selection legend{grid-column:1/-1}.term-domain-selection label{display:flex;align-items:center;gap:.5rem}.form-hint{margin:0;color:#a3291b}@media(max-width:700px){.governance-row{align-items:flex-start;flex-direction:column}.semantic-card dl div,.term-language-grid{grid-template-columns:1fr}}
  `],
})
export class DomainsGlossaryComponent {
  private loadRequest?:Subscription;
  readonly api = inject(CatalogApiService);
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector=inject(Injector);
  readonly i18n = inject(CatalogI18nService);
  readonly identity = inject(DemoIdentityService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly tab = signal<SemanticTab>('domains');
  readonly domains = signal<readonly DomainSummary[]>([]);
  readonly terms = signal<readonly GlossaryTermSummary[]>([]);
  readonly domainRequests = signal<readonly DomainChangeRequest[]>([]);
  readonly proposals = signal<readonly GlossaryTermProposal[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly query = signal('');
  readonly termQuery = signal('');
  readonly termView=signal<'cards'|'network'>('cards');
  readonly domainView=signal<'cards'|'network'>('cards');
  readonly domainNetwork=viewChild(DomainNetworkComponent);
  readonly organizationNetwork=viewChild(OrganizationTermNetworkComponent);
  setDomainView(view:'cards'|'network'):void{if(view===this.domainView())return;void this.router.navigate([],{relativeTo:this.route,queryParams:{view:view==='network'?'network':null},queryParamsHandling:'merge',replaceUrl:true});}
  setTermView(view:'cards'|'network'):void{if(view===this.termView()||!this.canDeactivate())return;this.termView.set(view);void this.router.navigate([],{relativeTo:this.route,queryParams:{view:view==='network'?'network':null},queryParamsHandling:'merge',replaceUrl:true});}
  readonly ownOfficeOnly = signal(true);
  readonly officeId = computed(() => this.identity.user().office ?? '');
  readonly officeName = computed(() => this.officeScope()?.organizationName
    ?? this.identity.user().modelingAssignments?.find(assignment => assignment.organizationId === this.officeId())?.organizationName
    ?? this.identity.user().organization);
  readonly officeScope = signal<SemanticGraphState | null>(null);
  readonly officeLoading = signal(false);
  readonly officeError = signal(false);
  private officeRequest?: Subscription;
  readonly officeDomainIds = computed(() => this.ownOfficeOnly() ? this.officeScope()?.scopeDomainIds ?? [] : null);
  readonly officeTermIds = computed(() => this.ownOfficeOnly() ? this.officeScope()?.scopeTermIds ?? [] : null);
  readonly officeNodeIds = computed(() => this.ownOfficeOnly() ? [
    ...(this.officeDomainIds() ?? []).map(id => 'domain:' + id),
    ...(this.officeTermIds() ?? []).map(id => 'term:' + id),
  ] : null);
  setOwnOfficeOnly(event: Event): void {
    const control = event.target as HTMLInputElement;
    if (control.checked && this.organizationNetwork() && this.organizationNetwork()!.organizationId() !== this.officeId() && !this.organizationNetwork()!.canDeactivate()) {
      control.checked = this.ownOfficeOnly(); return;
    }
    void this.router.navigate([], {relativeTo: this.route, queryParams: {ownOffice: control.checked ? '1' : '0'}, queryParamsHandling: 'merge', replaceUrl: true});
  }
  loadOfficeScope(): void {
    this.officeRequest?.unsubscribe(); this.officeScope.set(null); this.officeError.set(false);
    const office = this.officeId(); this.officeLoading.set(!!office);
    if (!office) return;
    this.officeRequest = this.api.loadSemanticGraph('organizations', office).subscribe({
      next: scope => { this.officeScope.set(scope); this.officeLoading.set(false); },
      error: () => { this.officeError.set(true); this.officeLoading.set(false); },
    });
  }
  readonly transferTarget=signal<DomainSummary|null>(null);
  readonly transferDialog=viewChild(DomainTransferDialogComponent);
  canDeactivate():boolean{if(this.transferDialog()?.busy())return false;if(this.transferDialog()?.hasChanges()&&!window.confirm(this.i18n.t('discardDomainEdit')))return false;return (this.domainNetwork()?.canDeactivate()??true)&&(this.organizationNetwork()?.canDeactivate()??true);}
  readonly requestOpen = signal(false);
  readonly requestMode = signal<'create' | 'update'>('create');
  readonly requestTarget = signal<DomainSummary | null>(null);
  readonly directAction = signal(false);
  readonly reviewingRequest = signal<DomainChangeRequest | null>(null);
  readonly canRequestDomain = computed(() => this.identity.user().roles.includes('data_owner')||(this.identity.canEditModels?.()??false)||this.domains().some(domain=>this.canGovernDomain(domain)));
  personName(id:string):string{return this.identity.users().find(user=>user.id===id)?.displayName??id;}
  canGovernDomain(domain:DomainSummary):boolean{return [domain.ownerUserId,domain.deputyOwnerUserId].includes(this.identity.userId());}
  readonly openGovernanceCount = computed(() => this.domainRequests().filter((item) => item.status === 'submitted').length + this.proposals().filter((item) => item.status === 'submitted' || item.status === 'in_review').length);
  readonly officeDomains = computed(() => this.domains().filter(item => this.officeDomainIds() === null || this.officeDomainIds()!.includes(item.id)));
  readonly officeTerms = computed(() => this.terms().filter(item => this.officeTermIds() === null || this.officeTermIds()!.includes(item.id)));
  readonly filteredDomains = computed(() => { const query = searchableText(this.query().trim()); return query ? this.officeDomains().filter((item) => [item.preferredLabel,item.definition,item.ownerName,item.ownerOrganization,item.deputyOwnerName,item.deputyOwnerOrganization,item.ownerUserId,item.deputyOwnerUserId].some((value) => searchableText(value??'').includes(query))) : this.officeDomains(); });
  readonly filteredTerms = computed(() => {
    const query = searchableText(this.termQuery().trim());
    if (!query) return this.officeTerms();
    return this.officeTerms().filter((term) => [
      term.preferredLabel, term.definition,
      ...term.labels.flatMap(label => [label.preferredLabel, label.definition, ...label.alternativeLabels]),
      ...[term.ownerUserId, term.deputyOwnerUserId].flatMap(id => id ? [id, this.personName(id)] : []),
    ].some(value => searchableText(value??'').includes(query)));
  });
  readonly requestForm = this.fb.nonNullable.group({ label: ['', [Validators.required, Validators.maxLength(160)]], definition: ['', [Validators.required, Validators.maxLength(2000)]], ownerUserId: ['', Validators.required], deputyOwnerUserId: ['', Validators.required] });

  constructor() {
    const routeTab = this.route.snapshot.data['semanticTab'];
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.ownOfficeOnly.set(params.get('ownOffice') !== '0');
      this.tab.set(resolveSemanticTab(routeTab, params.get('tab')));
      this.termView.set(params.get('view')==='network'?'network':'cards');
      this.domainView.set(params.get('view')==='network'?'network':'cards');
      if(params.has('q')){this.termQuery.set(params.get('q')??'');this.query.set(params.get('q')??'');}
    });
    effect(()=>{this.identity.userId();untracked(()=>{this.transferTarget.set(null);this.load();});});
    effect(() => {
      const active = this.ownOfficeOnly(); this.officeId(); this.identity.userId();
      untracked(() => {
        this.officeRequest?.unsubscribe(); this.officeScope.set(null); this.officeError.set(false); this.officeLoading.set(false);
        if (active) this.loadOfficeScope();
      });
    });
    inject(DestroyRef).onDestroy(()=>{this.loadRequest?.unsubscribe();this.officeRequest?.unsubscribe();});
  }

  load(): void {
    this.loadRequest?.unsubscribe();const actor=this.identity.userId();this.domains.set([]);this.terms.set([]);this.loading.set(true); this.error.set('');
    this.loadRequest=forkJoin({ domains: this.api.loadDomains(true), terms: this.api.loadGlossaryTerms(), requests: this.api.loadDomainChangeRequests(), proposals: this.api.loadGlossaryTermProposals() }).pipe(finalize(() => this.loading.set(false))).subscribe({ next: (data) => { if(actor!==this.identity.userId())return;this.domains.set(data.domains); this.terms.set(data.terms); this.domainRequests.set(data.requests); this.proposals.set(data.proposals); }, error: () => this.error.set('Die fachlichen Metadaten konnten nicht geladen werden.') });
  }

  searchValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  selectTab(tab: SemanticTab): void {
    this.tab.set(tab);
    void this.router.navigateByUrl(({ domains: '/domains', terms: '/domains/terminology', governance: '/domains/governance' } as const)[tab]);
  }
  languages(term: GlossaryTermSummary): string { return term.labels.map((label) => label.language.toUpperCase()).join(', ') || '–'; }
  alternativeLabels(term: GlossaryTermSummary): string { return term.labels.flatMap((label) => label.alternativeLabels).join(', '); }
  requestTitle(request: DomainChangeRequest): string { const localizations = request.reviewPayload['localizations'] ?? request.requestedPayload['localizations']; return Array.isArray(localizations) ? String((localizations[0] as Record<string, unknown>)?.['preferredLabel'] ?? request.operation) : request.operation; }
  proposalTitle(proposal: GlossaryTermProposal): string { const labels = proposal.reviewPayload['localizations'] ?? proposal.requestedPayload['localizations']; return Array.isArray(labels) ? String((labels[0] as Record<string, unknown>)?.['preferredLabel'] ?? 'Termvorschlag') : 'Termvorschlag'; }

  domainCardAction(domain:DomainSummary,action:DomainCardAction):void{
    if(action==='transfer'){this.transferTarget.set(domain);}
    else if(action==='request-change'||action==='edit'){
      this.openDomainEdit(domain,action==='edit');
      afterNextRender(()=>this.host.nativeElement.querySelector<HTMLInputElement>('.semantic-dialog input')?.focus(),{injector:this.injector});
    }else if(action==='request-retirement')this.requestRetirement(domain);
    else this.retireDirect(domain);
  }

  transferSaved(domain:DomainSummary):void{this.transferTarget.set(null);this.notice.set(this.i18n.t('domainTransferSaved'));this.domains.update(items=>items.map(item=>item.id===domain.id?domain:item));this.api.refreshWorkflowTasks();this.load();}

  openDomainEdit(domain: DomainSummary, direct: boolean): void { this.reviewingRequest.set(null);this.requestMode.set('update'); this.requestTarget.set(domain); this.directAction.set(direct); this.requestForm.reset({ label: domain.preferredLabel, definition: domain.definition, ownerUserId: domain.ownerUserId, deputyOwnerUserId: domain.deputyOwnerUserId }); this.requestOpen.set(true); }
  openCreate(): void { this.reviewingRequest.set(null);this.requestMode.set('create'); this.requestTarget.set(null); this.directAction.set(false); this.requestForm.reset(); this.requestOpen.set(true); }
  openDomainRequestReview(request: DomainChangeRequest): void { const payload=request.reviewPayload;const localizations=Array.isArray(payload['localizations'])?payload['localizations'] as Array<Record<string,unknown>>:[];const de=localizations.find((item)=>item['language']==='de')??localizations[0];this.reviewingRequest.set(request);this.requestTarget.set(null);this.directAction.set(false);this.requestForm.reset({label:String(de?.['preferredLabel']??''),definition:String(de?.['definition']??''),ownerUserId:String(payload['ownerUserId']??''),deputyOwnerUserId:String(payload['deputyOwnerUserId']??'')});this.requestOpen.set(true);}


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
        this.selectTab('governance');
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

}
