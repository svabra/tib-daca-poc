import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DacaGlossaryTermComponent, StatusBadgeComponent } from '@bit-daca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DataProduct, StoredAccessRequest } from '../../core/catalog.models';
import { selectNextWelcomeHeroTheme } from './welcome-hero-theme';
import {
  CATALOG_LIVE_RESULT_LIMIT,
  CATALOG_SEARCH_MIN_LENGTH,
  catalogSearchIsReady,
  expertSearchQueryParams,
  searchCatalogProducts,
  shouldExpandWelcomeSearch,
} from './welcome-search';

type SearchStatus = 'idle' | 'empty' | 'short' | 'match' | 'none';
const HERO_THEME_STORAGE_KEY = 'daca.welcome.hero-theme';

function selectSessionHeroTheme() {
  let previousThemeId: string | null = null;
  try {
    previousThemeId = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(HERO_THEME_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened browser contexts. Rotation still works for this render.
  }

  const selectedTheme = selectNextWelcomeHeroTheme(previousThemeId);
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(HERO_THEME_STORAGE_KEY, selectedTheme.id);
  } catch {
    // The selected theme remains usable even when persistence is blocked.
  }
  return selectedTheme;
}

@Component({
  selector: 'daca-welcome-page',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent, DacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="welcome-page">
      <section class="welcome-hero" aria-labelledby="welcome-title">
        <picture class="welcome-hero-background" [class.is-loaded]="heroImageLoaded()" aria-hidden="true">
          <source
            type="image/avif"
            [srcset]="heroAvifSrcset"
            sizes="(max-width: 760px) 960px, 1600px"
          >
          <source
            type="image/webp"
            [srcset]="heroWebpSrcset"
            sizes="(max-width: 760px) 960px, 1600px"
          >
          <img
            [src]="heroFallbackSrc"
            width="1600"
            height="800"
            alt=""
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            (load)="heroImageLoaded.set(true)"
          >
        </picture>
          <div class="welcome-hero-copy">
            <p class="daca-eyebrow"><daca-glossary-term term="DaCa" /></p>
            <h1 id="welcome-title">{{ i18n.t('welcomeTitle') }}</h1>
            <p class="welcome-lead">
              {{ i18n.t('welcomeLead') }}
            </p>
            <div class="welcome-hero-actions">
              <a class="daca-button" routerLink="/products">{{ i18n.t('openMyProducts') }}</a>
              <a class="daca-button is-secondary" [routerLink]="['/products', product().id, 'access']">{{ i18n.t('manageAccess') }}</a>
            </div>
            <p class="welcome-context">
              <span>Proof of Concept</span>
              PoC Data Catalog · {{ i18n.t('welcomeContext') }}
            </p>
          </div>

          <form
            class="welcome-search"
            role="search"
            [class.is-expanded]="searchExpanded()"
            (submit)="submitSearch($event)"
            (focusin)="expandSearch($event)"
            (focusout)="collapseSearchIfFocusLeaves($event)"
          >
            <div>
              <p class="daca-eyebrow">{{ i18n.t('catalogSearch') }}</p>
              <h2>{{ i18n.t('welcomeSearchQuestion') }}</h2>
              <p>{{ i18n.t('welcomeSearchIntro') }}</p>
            </div>
            <label for="catalog-search">{{ i18n.t('searchTerm') }}</label>
            <div class="welcome-search-control">
              <input
                id="catalog-search"
                type="search"
                autocomplete="off"
                [placeholder]="i18n.t('welcomeSearchPlaceholder')"
                aria-describedby="catalog-search-feedback"
                [attr.aria-invalid]="searchStatus() === 'empty' ? 'true' : null"
                [attr.aria-expanded]="searchExpanded()"
                aria-controls="catalog-search-feedback"
                [value]="searchQuery()"
                (input)="updateSearch($any($event.target).value)"
                (keydown.escape)="collapseSearch($event)"
              >
              <button class="daca-button" type="submit">{{ i18n.t('search') }}</button>
            </div>
            <div id="catalog-search-feedback" class="welcome-search-feedback" aria-live="polite">
              @switch (searchStatus()) {
                @case ('empty') {
                  <p class="is-warning">{{ i18n.t('enterSearchPlease') }}</p>
                }
                @case ('short') {
                  <p class="is-hint">{{ i18n.t('atLeastCharacters', { count: searchMinimumLength }) }}</p>
                }
                @case ('match') {
                  <p class="is-match">{{ i18n.t('productsFound', { count: searchResultCount() }) }}</p>
                  <ul class="welcome-search-results" [attr.aria-label]="i18n.t('foundProducts')">
                    @for (result of searchResults(); track result.id) {
                      <li>
                        <a [routerLink]="['/products', result.id, 'overview']">
                          <span>{{ result.title }}</span>
                          <small>{{ result.owner }} · {{ result.domain }}</small>
                        </a>
                      </li>
                    }
                  </ul>
                  @if (searchResultCount() > searchResults().length) {
                    <a class="welcome-search-all" [routerLink]="['/search']" [queryParams]="{ q: searchQuery().trim() }">
                      {{ i18n.t('allExpertResults', { count: searchResultCount() }) }}
                    </a>
                  }
                }
                @case ('none') {
                  <p>{{ i18n.t('noWelcomeProducts') }}</p>
                }
                @default {
                  <p class="is-hint">{{ i18n.t('welcomeSearchTip') }}</p>
                }
              }
            </div>
            <a
              class="welcome-search-expert-link"
              [routerLink]="['/search']"
              [queryParams]="expertSearchQueryParams()"
            >
              <span class="welcome-search-expert-meta">{{ i18n.t('expertFilters') }}</span>
              <strong>{{ i18n.t('openExpertSearch') }}</strong>
            </a>
          </form>
      </section>

      <section id="handlungsbedarf" class="welcome-alerts" aria-labelledby="welcome-alerts-title">
        <div class="welcome-alerts-heading">
          <div>
            <p class="daca-eyebrow">{{ i18n.t('forPerson', { name: api.identityUser().displayName }) }}</p>
            <h2 id="welcome-alerts-title">{{ i18n.t('actionNeeded') }}</h2>
          </div>
          @if (taskLoadError()) {
            <span><strong>–</strong> {{ i18n.t('statusUnknown') }}</span>
          } @else if (!ownerInboxLoading()) {
            <span>{{ i18n.t('openTasks', { count: actionCount() }) }}</span>
          }
        </div>

        @if (taskLoadError(); as loadError) {
          <div class="daca-card welcome-alert-empty is-error" role="alert">
            <strong>{{ i18n.t('taskStatusUnknown') }}</strong><p>{{ loadError }}</p>
            <button class="daca-button is-secondary" type="button" (click)="retryTaskStatus()">{{ i18n.t('retry') }}</button>
          </div>
        } @else if (ownerInboxLoading()) {
          <div class="daca-card welcome-alert-empty" aria-live="polite">{{ i18n.t('loadingTasks') }}</div>
        } @else if (actionCount()) {
          <div class="welcome-alert-list">
            @for (task of actionTasks(); track task.id) {
              <article class="daca-card welcome-alert-item is-simulation-alert">
                <span class="welcome-alert-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 21 20H3L12 3.5Z"/><path d="M12 9v5M12 17.2v.2"/></svg></span>
                <div class="welcome-alert-copy"><div><span>{{ i18n.t(task.taskType === 'simulation_isbo_restriction' ? 'urgent' : 'reviewNeeded') }}</span><time [attr.datetime]="task.createdAt">{{ task.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time></div><h3>{{ task.title }}</h3><p>{{ task.detail }}</p></div>
                <a class="daca-button is-secondary" [routerLink]="taskRoute(task)" [queryParams]="taskQueryParams(task)">{{ i18n.t('openTask') }}</a>
              </article>
            }
            @for (request of ownerRequests(); track request.id) {
              <article class="daca-card welcome-alert-item">
                <span class="welcome-alert-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 3.5 21 20H3L12 3.5Z"/><path d="M12 9v5M12 17.2v.2"/></svg>
                </span>
                <div class="welcome-alert-copy">
                  <div><span>{{ i18n.t('decisionNeeded') }}</span><time [attr.datetime]="request.createdAt">{{ request.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time></div>
                  <h3>{{ i18n.t('accessRequestFrom', { name: request.requesterName }) }}</h3>
                  <p><strong>{{ request.requesterOrganization }}</strong> {{ i18n.t('requestsAccessTo') }} «{{ requestProductTitle(request) }}».</p>
                  <dl>
                    <div><dt>Zugriff</dt><dd>{{ request.consumerType === 'person' ? 'Persönlich · eIAM ' + request.requesterId : 'M2M · ' + request.machineId }}</dd></div>
                    <div><dt>{{ i18n.t('purpose') }}</dt><dd>{{ request.purpose }}</dd></div>
                    <div><dt>{{ i18n.t('status') }}</dt><dd>{{ i18n.t('requestReceived') }}</dd></div>
                  </dl>
                </div>
                <a class="daca-button is-secondary" routerLink="/tasks">{{ i18n.t('openTask') }}</a>
              </article>
            }
          </div>
        } @else {
          <div class="daca-card welcome-alert-empty">{{ i18n.t('noOpenTasks') }}</div>
        }
      </section>

      <section class="welcome-tasks" aria-labelledby="welcome-tasks-title">
        <div class="welcome-section-heading">
          <div>
            <p class="daca-eyebrow">{{ i18n.t('directEntry') }}</p>
            <h2 id="welcome-tasks-title">{{ i18n.t('whatToDo') }}</h2>
          </div>
          <p>{{ i18n.t('chooseArea') }}</p>
        </div>

        <div class="welcome-task-grid">
          <a class="welcome-task-card" routerLink="/products">
            <span class="welcome-task-number" aria-hidden="true">01</span>
            <span class="welcome-task-copy">
              <strong>{{ i18n.t('maintainProduct') }}</strong>
              <span>{{ i18n.t('maintainProductText') }}</span>
            </span>
            <span class="welcome-task-link">{{ i18n.t('openMyProducts') }}</span>
          </a>
          <a class="welcome-task-card" routerLink="/tasks">
            <span class="welcome-task-number" aria-hidden="true">02</span>
            <span class="welcome-task-copy">
              <strong>{{ i18n.t('workOnTasks') }}</strong>
              <span>{{ i18n.t('workOnTasksText') }}</span>
            </span>
            <span class="welcome-task-link">{{ i18n.t('openTasksLink') }}</span>
          </a>
          <a class="welcome-task-card" [routerLink]="['/products', product().id, 'access']">
            <span class="welcome-task-number" aria-hidden="true">03</span>
            <span class="welcome-task-copy">
              <strong>{{ i18n.t('manageAccess') }}</strong>
              <span>{{ i18n.t('manageAccessText') }}</span>
            </span>
            <span class="welcome-task-link">{{ i18n.t('openAccess') }}</span>
          </a>
          <a class="welcome-task-card" [routerLink]="['/products', product().id, 'lineage']">
            <span class="welcome-task-number" aria-hidden="true">04</span>
            <span class="welcome-task-copy">
              <strong>{{ i18n.t('traceOrigin') }}</strong>
              <span>{{ i18n.t('traceOriginText') }}</span>
            </span>
            <span class="welcome-task-link">{{ i18n.t('openLineage') }}</span>
          </a>
        </div>
      </section>

      <section class="welcome-featured daca-card" aria-labelledby="welcome-product-title">
        <div class="welcome-product-main">
          <div class="welcome-product-heading">
            <div>
              <p class="daca-eyebrow">{{ i18n.t('exampleProduct') }}</p>
              <h2 id="welcome-product-title">{{ productTitle() }}</h2>
            </div>
            <daca-status-badge tone="red">{{ i18n.t('restricted') }}</daca-status-badge>
          </div>
          <p class="welcome-product-description">{{ productDescription() }}</p>
          <div class="welcome-product-meta" [attr.aria-label]="i18n.t('exampleProduct')">
            <span>{{ i18n.t('ownerFemale') }}: {{ product().owner }}</span>
            <span>Revision {{ product().revision }}</span>
            <span>{{ i18n.t('annually') }}</span>
            <span>REST &amp; PostgreSQL</span>
          </div>
          <p class="welcome-access-note">
            <strong>{{ i18n.t('demoAccess') }}</strong>
            {{ i18n.t('demoAccessText') }}
          </p>
          <div class="welcome-product-actions">
            <a class="daca-button" routerLink="/products">{{ i18n.t('openMyProducts') }}</a>
            <a class="daca-button is-secondary" [routerLink]="['/products', product().id, 'access']">{{ i18n.t('access') }}</a>
          </div>
        </div>

        <aside class="welcome-mcp-note" aria-labelledby="welcome-mcp-title">
          <span class="welcome-mcp-label">KOBY · AI Services</span>
          <h3 id="welcome-mcp-title">{{ i18n.t('metadataViaMcp') }}</h3>
          <p>
            {{ i18n.t('metadataViaMcpText') }}
          </p>
          <a [routerLink]="['/products', product().id, 'access', 'grant']" fragment="koby">{{ i18n.t('reviewKoby') }}</a>
        </aside>
      </section>

      <section class="welcome-trust" [attr.aria-label]="i18n.t('catalogPrinciples')">
        <article>
          <h3>{{ i18n.t('defaultDeny') }}</h3>
          <p>{{ i18n.t('defaultDenyText') }}</p>
        </article>
        <article>
          <h3>{{ i18n.t('noCredentials') }}</h3>
          <p>{{ i18n.t('noCredentialsText') }}</p>
        </article>
        <article>
          <h3>{{ i18n.t('standalone') }}</h3>
          <p>{{ i18n.t('standaloneText') }}</p>
        </article>
      </section>
    </div>
  `,
})
export class WelcomePageComponent {
  readonly api = inject(CatalogApiService);
  readonly i18n = inject(CatalogI18nService);
  private readonly router = inject(Router);
  readonly product = computed(() => this.api.product());
  readonly productTitle = computed(() =>
    this.product().globalId === 'urn:daca:ch:estv:tax-statistics-by-canton'
      ? this.i18n.t('exampleProductTitle')
      : this.product().title,
  );
  readonly productDescription = computed(() =>
    this.product().globalId === 'urn:daca:ch:estv:tax-statistics-by-canton'
      ? this.i18n.t('exampleProductDescription')
      : this.product().description,
  );
  readonly searchQuery = signal('');
  readonly searchStatus = signal<SearchStatus>('idle');
  readonly searchResults = signal<readonly DataProduct[]>([]);
  readonly searchResultCount = signal(0);
  readonly searchExpanded = signal(false);
  readonly expertSearchQueryParams = computed(() => expertSearchQueryParams(this.searchQuery()));
  readonly searchMinimumLength = CATALOG_SEARCH_MIN_LENGTH;
  readonly ownerRequests = this.api.ownerAccessRequests;
  readonly ownerInboxLoading = computed(() => this.api.ownerAccessRequestLoading() || this.api.workflowTasksLoading());
  readonly taskLoadError = computed(() => this.api.ownerAccessRequestError() || this.api.workflowTasksError());
  readonly actionTasks = computed(() => this.api.workflowTasks().filter((task) => task.taskType.startsWith('simulation_') || task.taskType === 'publication_approval' || task.taskType === 'service_level_approval'));
  readonly actionCount = computed(() => this.ownerRequests().length + this.actionTasks().length);
  readonly heroTheme = selectSessionHeroTheme();
  readonly heroAvifSrcset = `/assets/${this.heroTheme.assetName}-960.avif 960w, /assets/${this.heroTheme.assetName}-1600.avif 1600w`;
  readonly heroWebpSrcset = `/assets/${this.heroTheme.assetName}-960.webp 960w, /assets/${this.heroTheme.assetName}-1600.webp 1600w`;
  readonly heroFallbackSrc = `/assets/${this.heroTheme.assetName}-1600.webp`;
  readonly heroImageLoaded = signal(false);

  retryTaskStatus(): void {
    this.api.refreshOwnerAccessRequestInbox();
    this.api.refreshWorkflowTasks();
  }

  requestProductTitle(request: StoredAccessRequest): string {
    return this.api.products().find((product) => product.id === request.dataProductId)?.title ?? 'Datenprodukt';
  }

  taskRoute(task: { taskType: string; dataProductId: string | null; governanceSubmissionId?: string | null }): unknown[] {
    if (!task.dataProductId) return ['/tasks'];
    if (task.taskType === 'publication_approval' && task.governanceSubmissionId) return ['/governance-submissions', task.governanceSubmissionId];
    if (task.taskType === 'service_level_approval') return ['/products', task.dataProductId, 'sla'];
    return ['/products', task.dataProductId, 'overview'];
  }

  taskQueryParams(task: { taskType: string; serviceLevelRevisionId?: string | null }): Record<string, string> | null {
    return task.taskType === 'service_level_approval' && task.serviceLevelRevisionId
      ? { review: task.serviceLevelRevisionId }
      : null;
  }

  updateSearch(value: string): void {
    this.searchQuery.set(value);
    const normalizedQuery = value.trim();
    if (!normalizedQuery) {
      this.resetSearch('idle');
      return;
    }
    if (!catalogSearchIsReady(normalizedQuery)) {
      this.resetSearch('short');
      return;
    }
    this.runLiveSearch(normalizedQuery);
  }

  expandSearch(event: FocusEvent): void {
    if (!shouldExpandWelcomeSearch(event.target)) return;
    this.searchExpanded.set(true);
  }

  collapseSearchIfFocusLeaves(event: FocusEvent): void {
    const form = event.currentTarget as HTMLElement;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && form.contains(nextTarget)) return;
    this.searchExpanded.set(false);
  }

  collapseSearch(event: Event): void {
    event.preventDefault();
    this.searchExpanded.set(false);
    (event.currentTarget as HTMLInputElement).blur();
  }

  submitSearch(event: Event): void {
    event.preventDefault();
    const query = this.searchQuery().trim();
    if (!query) {
      this.resetSearch('empty');
      return;
    }
    if (!catalogSearchIsReady(query)) {
      this.resetSearch('short');
      return;
    }
    void this.router.navigate(['/search'], { queryParams: { q: query } });
  }

  private runLiveSearch(query: string): void {
    const allMatches = searchCatalogProducts(this.api.products(), query);
    this.searchResultCount.set(allMatches.length);
    this.searchResults.set(allMatches.slice(0, CATALOG_LIVE_RESULT_LIMIT));
    this.searchStatus.set(allMatches.length > 0 ? 'match' : 'none');
  }

  private resetSearch(status: SearchStatus): void {
    this.searchResultCount.set(0);
    this.searchResults.set([]);
    this.searchStatus.set(status);
  }
}
