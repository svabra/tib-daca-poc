import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize, forkJoin, of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct, DomainSummary, GlossaryTermProposal, GlossaryTermSummary } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { GlossaryProposalFormComponent, GlossaryProposalFormValue } from './glossary-proposal-form.component';

@Component({
  selector: 'daca-glossary-proposal-new',
  standalone: true,
  imports: [GlossaryProposalFormComponent, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="context-back" type="button" (click)="cancel()">← {{ returnLabel() }}</button>
    <section class="daca-page-heading">
      <div>
        <p class="daca-eyebrow">Terminology-Governance</p>
        <h1>{{ target() ? 'Terminology-Term ändern' : 'Neuen Term vorschlagen' }}</h1>
        <p>Erfassen Sie ein fachliches Konzept. Abkürzungen und Synonyme werden als alternative Sprachlabels desselben Konzepts gespeichert.</p>
      </div>
      <daca-status-badge tone="blue">SKOS Concept</daca-status-badge>
    </section>

    @if (notice()) {
      <p class="daca-alert" role="status">{{ notice() }}</p>
    }
    @if (error()) {
      <p class="daca-alert is-error" role="alert">{{ error() }}</p>
    }

    @if (submitted(); as proposal) {
      <section class="daca-card submitted-state">
        <div class="daca-card-header"><h2>Vorschlag eingereicht</h2><daca-status-badge tone="orange">{{ proposal.status }}</daca-status-badge></div>
        <div class="daca-card-body">
          <p>Die zuständigen Domain Owners wurden informiert. Erst ihre Freigaben erzeugen oder ändern den Terminology-Term.</p>
          <div><a class="daca-button" [routerLink]="['/glossary/proposals', proposal.id, 'review']">Status öffnen</a><button class="daca-button is-secondary" type="button" (click)="cancel()">{{ returnLabel() }}</button></div>
        </div>
      </section>
    } @else if (loading()) {
      <div class="daca-card loading-state" aria-live="polite">Domänen, Terminology und Produktkontext werden geladen …</div>
    } @else if (!error()) {
      <section class="daca-card proposal-card">
        <div class="daca-card-body">
          <daca-glossary-proposal-form
            [domains]="domains()"
            [terms]="terms()"
            [target]="target()"
            [product]="product()"
            [initialDomainIds]="initialDomainIds()"
            [initialLabel]="initialLabel()"
            [canAttachProduct]="canAttachProduct()"
            [submitting]="saving()"
            (proposalSubmit)="submit($event)"
            (proposalCancel)="cancel()"
            (targetSelect)="selectTarget($event)"
          />
        </div>
      </section>
    }
  `,
  styles: [`
    .context-back{border:0;background:none;padding:0;color:#006699;text-decoration:underline;cursor:pointer;font:inherit}.proposal-card{max-width:68rem;margin-inline:auto}.loading-state{padding:2rem;text-align:center}.submitted-state{max-width:48rem}.submitted-state .daca-card-body div{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}
  `],
})
export class GlossaryProposalNewComponent {
  private readonly api = inject(CatalogApiService);
  private readonly identity = inject(DemoIdentityService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly domains = signal<readonly DomainSummary[]>([]);
  readonly terms = signal<readonly GlossaryTermSummary[]>([]);
  readonly product = signal<DataProduct | null>(null);
  readonly target = signal<GlossaryTermSummary | null>(null);
  readonly initialDomainIds = signal<readonly string[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly submitted = signal<GlossaryTermProposal | null>(null);
  readonly initialLabel = signal('');

  private sourceProductId: string | null = null;
  private targetTermId: string | null = null;
  private readonly requestedDomainIds = signal<readonly string[]>([]);
  private loadGeneration = 0;
  readonly canAttachProduct = computed(() => {
    const product = this.product();
    const actor = this.identity.userId();
    return Boolean(product && actor && [product.ownerUserId, product.deputyOwnerUserId].includes(actor));
  });
  readonly returnLabel = computed(() => this.product()
    ? 'Zurück zum Datenprodukt'
    : this.requestedDomainIds().length === 1
      ? 'Zurück zur Domain'
      : 'Zurück zur Terminology');

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.initialLabel.set(params.get('q')?.trim() ?? '');
      this.sourceProductId = params.get('sourceProductId')?.trim() || null;
      this.targetTermId = params.get('termId')?.trim() || null;
      this.requestedDomainIds.set(queryDomainIds(params.get('domainId'), params.get('domainIds')));
      this.submitted.set(null);
      this.notice.set('');
      this.load();
    });
  }

  submit(value: GlossaryProposalFormValue): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.createGlossaryTermProposal(value).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (proposal) => {
        this.submitted.set(proposal);
        this.notice.set('Der Termvorschlag wurde den zuständigen Domain Owners zur Prüfung übermittelt.');
      },
      error: (error) => this.error.set(error?.error?.detail ?? 'Der Termvorschlag konnte nicht eingereicht werden.'),
    });
  }

  cancel(): void {
    const product = this.product();
    if (product) {
      void this.router.navigate(['/products', product.id, 'overview']);
    } else if (this.requestedDomainIds().length === 1) {
      void this.router.navigate(['/domains', this.requestedDomainIds()[0]]);
    } else {
      void this.router.navigate(['/domains/glossary']);
    }
  }

  selectTarget(term: GlossaryTermSummary): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { termId: term.id, q: null },
      queryParamsHandling: 'merge',
    });
  }

  private load(): void {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      domains: this.api.loadDomains(true),
      terms: this.api.loadGlossaryTerms(),
      product: this.sourceProductId ? this.api.loadProduct(this.sourceProductId) : of(null),
    }).pipe(finalize(() => {
      if (generation === this.loadGeneration) this.loading.set(false);
    })).subscribe({
      next: ({ domains, terms, product }) => {
        if (generation !== this.loadGeneration) return;
        const activeDomains = domains.filter((domain) => domain.status === 'active');
        const target = this.targetTermId ? terms.find((term) => term.id === this.targetTermId) ?? null : null;
        if (this.targetTermId && !target) {
          this.error.set('Der zu ändernde Terminology-Term wurde nicht gefunden oder ist nicht mehr aktiv.');
          return;
        }
        const defaults = this.requestedDomainIds().length
          ? this.requestedDomainIds()
          : target?.domains.map((domain) => domain.id) ?? product?.domains.map((domain) => domain.id) ?? [];
        this.domains.set(domains);
        this.terms.set(terms);
        this.product.set(product);
        this.target.set(target);
        this.initialDomainIds.set(defaults.filter((id) => activeDomains.some((domain) => domain.id === id)));
      },
      error: () => {
        if (generation === this.loadGeneration) {
          this.error.set('Die Daten für den Termvorschlag konnten nicht vollständig geladen werden.');
        }
      },
    });
  }
}

export function queryDomainIds(domainId: string | null, domainIds: string | null): string[] {
  return [...new Set([
    ...(domainId?.trim() ? [domainId.trim()] : []),
    ...(domainIds?.split(',').map((value) => value.trim()).filter(Boolean) ?? []),
  ])];
}
