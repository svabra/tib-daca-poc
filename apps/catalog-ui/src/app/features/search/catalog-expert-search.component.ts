import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { PhysicalSource } from '../data-models/data-models.models';
import { DataProduct } from '../../core/catalog.models';
import { QualityMedalComponent, QualityMedalLevel } from '../../shared/quality-medal.component';
import { deliveryProtocols } from '../products/my-data-products';
import {
  CATALOG_SEARCH_MIN_LENGTH,
  catalogSearchIsReady,
  searchCatalogProducts,
} from '../welcome/welcome-search';

@Component({
  selector: 'daca-catalog-expert-search',
  standalone: true,
  imports: [DatePipe, RouterLink, QualityMedalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="expert-search-breadcrumb" aria-label="Brotkrümelnavigation">
      <a routerLink="/">{{ i18n.t('home') }}</a><span aria-hidden="true">›</span><span>{{ i18n.t('expertSearch') }}</span>
    </nav>

    <section class="daca-page-heading expert-search-heading">
      <div>
        <p class="daca-eyebrow">{{ i18n.t('catalogSearch') }}</p>
        <h1>{{ i18n.t('expertSearch') }}</h1>
        <p>{{ i18n.t('expertIntro') }}</p>
      </div>
    </section>

    <section class="daca-card expert-search-panel" aria-label="Expertensuche">
      <form role="search" (submit)="$event.preventDefault()">
        <div class="expert-search-field">
          <label for="expert-search-input">{{ i18n.t('searchTerm') }}</label>
          <span class="expert-search-control">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
            <input
              id="expert-search-input"
              type="search"
              autocomplete="off"
              [placeholder]="i18n.t('searchPlaceholder')"
              [value]="query()"
              (input)="updateQuery($any($event.target).value)"
              aria-describedby="expert-search-hint"
            >
            @if (query()) {
              <button type="button" (click)="clearQuery()" [attr.aria-label]="i18n.t('clearSearch')">×</button>
            }
          </span>
        </div>

        <div class="expert-search-filters" [attr.aria-label]="i18n.t('filterResults')">
          <label>
            <span>{{ i18n.t('domain') }}</span>
            <select [value]="selectedDomain()" (change)="selectedDomain.set($any($event.target).value)">
              <option value="all">{{ i18n.t('allDomains') }}</option>
              @for (domain of domains(); track domain) { <option [value]="domain">{{ domain }}</option> }
            </select>
          </label>
          <label>
            <span>{{ i18n.t('organization') }}</span>
            <select [value]="selectedOwner()" (change)="selectedOwner.set($any($event.target).value)">
              <option value="all">{{ i18n.t('allOrganizations') }}</option>
              @for (owner of owners(); track owner) { <option [value]="owner">{{ owner }}</option> }
            </select>
          </label>
          <button class="daca-button is-secondary" type="button" (click)="resetFilters()">{{ i18n.t('resetFilters') }}</button>
        </div>
      </form>
      <p id="expert-search-hint" class="expert-search-hint">
        {{ i18n.t('searchHint') }}
      </p>
    </section>

    <section class="expert-search-results" aria-labelledby="expert-search-results-title" aria-live="polite">
      <header>
        <div>
          <p class="daca-eyebrow">{{ i18n.t('results') }}</p>
          <h2 id="expert-search-results-title">
            @if (searchReady()) {
              {{ resultCountLabel(results().length) }} @if (sourceResults().length) { · {{ sourceResults().length }} {{ i18n.t('sourcePlural') }} }
            } @else {
              {{ i18n.t('enterSearch') }}
            }
          </h2>
        </div>
        @if (searchReady()) { <p>{{ i18n.t('for') }} «{{ query().trim() }}»</p> }
      </header>

      @if (api.loading()) {
        <div class="daca-card expert-search-empty">{{ i18n.t('loadingCatalog') }}</div>
      } @else if (!searchReady()) {
        <div class="daca-card expert-search-empty">
          <strong>{{ i18n.t('minimumLength') }}</strong>
          <p>{{ i18n.t('refineResults') }}</p>
        </div>
      } @else if (results().length === 0 && sourceResults().length === 0) {
        <div class="daca-card expert-search-empty">
          <strong>{{ i18n.t('noMatches') }}</strong>
          <p>{{ i18n.t('changeSearch') }}</p>
          <a class="expert-search-term-link" routerLink="/glossary/proposals/new" [queryParams]="{q:query().trim()}">{{ i18n.t('proposeTerm') }}</a>
        </div>
      } @else {
        <div class="expert-search-list">
          @for (product of results(); track product.id) {
            <article class="daca-card expert-search-result">
              <div class="expert-search-result-main">
                <div class="expert-search-result-tags">
                  <span>{{ product.domain }}</span>
                  <span>{{ product.owner }}</span>
                  <span>{{ lifecycleLabel(product) }}</span>
                  <daca-quality-medal [medal]="qualityMedal(product)" [score]="product.qualityScore ?? 0" />
                </div>
                <h3><a [routerLink]="['/products', product.id, 'overview']">{{ product.title }}</a></h3>
                <p>{{ product.description }}</p>
                @if (product.keywords.length) {
                  <ul aria-label="Schlagwörter">
                    @for (keyword of product.keywords.slice(0, 5); track keyword) { <li>{{ keyword }}</li> }
                  </ul>
                }
              </div>
              <aside>
                <dl>
                  <div><dt>Schnittstellen</dt><dd>{{ protocolLabel(product) }}</dd></div>
                  <div><dt>Aktualisiert</dt><dd>{{ product.updatedAt | date: 'dd.MM.yyyy' }}</dd></div>
                  <div><dt>Identifier</dt><dd><code>{{ product.globalId }}</code></dd></div>
                </dl>
                <a class="daca-button is-secondary" [routerLink]="['/products', product.id, 'overview']">Produktdetails öffnen</a>
              </aside>
            </article>
          }
        </div>
      }
      @if (searchReady() && sourceResults().length) {
        <section class="expert-source-results" aria-labelledby="expert-source-results-title">
          <h2 id="expert-source-results-title">{{ i18n.t('visibleSources') }} ({{ sourceResults().length }})</h2>
          <div class="expert-search-list">
            @for (source of sourceResults(); track source.id) {
              <article class="daca-card expert-search-result">
                <div class="expert-search-result-main"><h3><a [routerLink]="['/physical-models', source.id]">{{ source.name }}</a></h3><p>{{ source.description }}</p><p>{{ source.ownerName }} · {{ source.catalogPath }}</p></div>
                <a class="daca-button is-secondary" [routerLink]="['/physical-models', source.id]">{{ i18n.t('openSource') }}</a>
              </article>
            }
          </div>
        </section>
      }
    </section>
  `,
  styles: [`.expert-search-term-link{display:inline-block;margin-top:.7rem;color:#006699;font-size:.78rem;font-weight:700;text-decoration:underline;text-underline-offset:.16rem}.expert-source-results{margin-top:2rem}.expert-source-results h2{font-size:1.2rem}.expert-source-results .expert-search-result{display:flex;align-items:center;justify-content:space-between;gap:1rem}.expert-source-results .expert-search-result-main p{overflow-wrap:anywhere}`],
})
export class CatalogExpertSearchComponent {
  readonly api = inject(CatalogApiService);
  readonly i18n = inject(CatalogI18nService);
  private readonly modelsApi = inject(DataModelsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly query = linkedSignal(() => this.queryParams().get('q') ?? '');
  readonly sources = signal<readonly PhysicalSource[]>([]);
  readonly selectedDomain = signal('all');
  readonly selectedOwner = signal('all');
  readonly searchMinimumLength = CATALOG_SEARCH_MIN_LENGTH;
  readonly searchReady = computed(() => catalogSearchIsReady(this.query()));
  readonly domains = computed(() => this.uniqueValues(this.api.products().flatMap((product) => product.domains.length ? product.domains.map((domain) => domain.preferredLabel) : [product.domain])));
  readonly owners = computed(() => this.uniqueValues(this.api.products().map((product) => product.owner)));
  readonly results = computed(() => [...searchCatalogProducts(this.api.products(), this.query())]
    .filter((product) => this.selectedDomain() === 'all' || product.domains.some((domain) => domain.preferredLabel === this.selectedDomain()) || (!product.domains.length && product.domain === this.selectedDomain()))
    .filter((product) => this.selectedOwner() === 'all' || product.owner === this.selectedOwner())
    .sort((left, right) => left.title.localeCompare(right.title, 'de-CH')));
  readonly sourceResults = computed(() => {
    if (!this.searchReady()) return [];
    const needle = this.query().trim().toLocaleLowerCase('de-CH');
    return this.sources().filter((source) => [source.name, source.description, source.catalogPath, source.ownerName, source.databaseName].join(' ').toLocaleLowerCase('de-CH').includes(needle));
  });

  constructor() {
    this.modelsApi.listPhysicalSources().subscribe({ next: (sources) => this.sources.set(sources), error: () => this.sources.set([]) });
  }

  updateQuery(value: string): void {
    this.query.set(value);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: value.trim() || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  clearQuery(): void {
    this.updateQuery('');
  }

  resetFilters(): void {
    this.selectedDomain.set('all');
    this.selectedOwner.set('all');
  }

  resultCountLabel(count: number): string {
    return `${count} ${this.i18n.t(count === 1 ? 'productSingular' : 'productPlural')}`;
  }

  lifecycleLabel(product: DataProduct): string {
    return ({ draft: 'Entwurf', active: 'Aktiv', deprecated: 'Veraltet', retired: 'Ausser Betrieb' } as const)[product.lifecycle];
  }

  qualityMedal(product: DataProduct): QualityMedalLevel {
    return product.qualityMedal ?? 'bronze';
  }

  protocolLabel(product: DataProduct): string {
    const protocols = deliveryProtocols(product);
    return [...new Set(protocols)].join(' · ') || 'Nicht angegeben';
  }

  private uniqueValues(values: readonly string[]): readonly string[] {
    return [...new Set(values)].filter(Boolean).sort((left, right) => left.localeCompare(right, 'de-CH'));
  }
}
