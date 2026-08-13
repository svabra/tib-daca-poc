import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DacaGlossaryTermComponent, StatusBadgeComponent } from '@bit-daca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct, StoredAccessRequest } from '../../core/catalog.models';
import { selectNextWelcomeHeroTheme } from './welcome-hero-theme';
import {
  CATALOG_LIVE_RESULT_LIMIT,
  CATALOG_SEARCH_MIN_LENGTH,
  catalogSearchIsReady,
  searchCatalogProducts,
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
            <h1 id="welcome-title">Willkommen im zentralen Data Catalog der Schweizer<br>Bundesverwaltung</h1>
            <p class="welcome-lead">
              Entdecken, beschreiben und verantwortungsvoll freigeben: Hier finden Sie Metadaten,
              Schnittstellen, Herkunft und Zugriffsregeln Ihrer Datenprodukte an einem Ort.
            </p>
            <div class="welcome-hero-actions">
              <a class="daca-button" routerLink="/products">Meine Datenprodukte öffnen</a>
              <a class="daca-button is-secondary" [routerLink]="['/products', product().id, 'access']">Freigaben verwalten</a>
            </div>
            <p class="welcome-context">
              <span>Proof of Concept</span>
              PoC Data Catalog · Anmeldung noch nicht verfügbar
            </p>
          </div>

          <form
            class="welcome-search"
            role="search"
            [class.is-expanded]="searchExpanded()"
            (submit)="submitSearch($event)"
            (focusin)="expandSearch()"
            (focusout)="collapseSearchIfFocusLeaves($event)"
          >
            <div>
              <p class="daca-eyebrow">Katalog durchsuchen</p>
              <h2>Wonach suchen Sie?</h2>
              <p>Finden Sie Datenprodukte nach Thema, Organisation oder Stichwort.</p>
            </div>
            <label for="catalog-search">Suchbegriff</label>
            <div class="welcome-search-control">
              <input
                id="catalog-search"
                type="search"
                autocomplete="off"
                placeholder="z. B. Steuerstatistik oder ESTV"
                aria-describedby="catalog-search-feedback"
                [attr.aria-invalid]="searchStatus() === 'empty' ? 'true' : null"
                [attr.aria-expanded]="searchExpanded()"
                aria-controls="catalog-search-feedback"
                [value]="searchQuery()"
                (input)="updateSearch($any($event.target).value)"
                (keydown.escape)="collapseSearch($event)"
              >
              <button class="daca-button" type="submit">Suchen</button>
            </div>
            <div id="catalog-search-feedback" class="welcome-search-feedback" aria-live="polite">
              @switch (searchStatus()) {
                @case ('empty') {
                  <p class="is-warning">Bitte geben Sie einen Suchbegriff ein.</p>
                }
                @case ('short') {
                  <p class="is-hint">Geben Sie mindestens {{ searchMinimumLength }} Zeichen ein.</p>
                }
                @case ('match') {
                  <p class="is-match">{{ searchResultCount() }} {{ searchResultCount() === 1 ? 'Datenprodukt gefunden' : 'Datenprodukte gefunden' }}</p>
                  <ul class="welcome-search-results" aria-label="Gefundene Datenprodukte">
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
                      Alle {{ searchResultCount() }} Ergebnisse in der Expertensuche anzeigen
                    </a>
                  }
                }
                @case ('none') {
                  <p>Keine Datenprodukte für diesen Suchbegriff gefunden.</p>
                }
                @default {
                  <p class="is-hint">Tipp: Suchen Sie nach „Kanton“ oder „ESTV“.</p>
                }
              }
            </div>
          </form>
      </section>

      <section id="handlungsbedarf" class="welcome-alerts" aria-labelledby="welcome-alerts-title">
        <div class="welcome-alerts-heading">
          <div>
            <p class="daca-eyebrow">Für {{ api.identityUser().displayName }}</p>
            <h2 id="welcome-alerts-title">Handlungsbedarf</h2>
          </div>
          @if (!ownerInboxLoading()) {
            <span><strong>{{ actionCount() }}</strong> {{ actionCount() === 1 ? 'offene Aufgabe' : 'offene Aufgaben' }}</span>
          }
        </div>

        @if (ownerInboxLoading()) {
          <div class="daca-card welcome-alert-empty" aria-live="polite">Aufgaben werden geladen…</div>
        } @else if (actionCount()) {
          <div class="welcome-alert-list">
            @for (task of simulationTasks(); track task.id) {
              <article class="daca-card welcome-alert-item is-simulation-alert">
                <span class="welcome-alert-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 21 20H3L12 3.5Z"/><path d="M12 9v5M12 17.2v.2"/></svg></span>
                <div class="welcome-alert-copy"><div><span>{{ task.taskType === 'simulation_isbo_restriction' ? 'Dringend' : 'Prüfung nötig' }}</span><time [attr.datetime]="task.createdAt">{{ task.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time></div><h3>{{ task.title }}</h3><p>{{ task.detail }}</p></div>
                <a class="daca-button is-secondary" [routerLink]="['/products', task.dataProductId, 'overview']">Aufgabe öffnen</a>
              </article>
            }
            @for (request of ownerRequests(); track request.id) {
              <article class="daca-card welcome-alert-item">
                <span class="welcome-alert-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 3.5 21 20H3L12 3.5Z"/><path d="M12 9v5M12 17.2v.2"/></svg>
                </span>
                <div class="welcome-alert-copy">
                  <div><span>Entscheid nötig</span><time [attr.datetime]="request.createdAt">{{ request.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time></div>
                  <h3>Zugriffsanfrage von {{ request.requesterName }}</h3>
                  <p><strong>{{ request.requesterOrganization }}</strong> beantragt Zugriff auf «{{ requestProductTitle(request) }}».</p>
                  <dl>
                    <div><dt>Zugriff</dt><dd>{{ request.consumerType === 'person' ? 'Persönlich · eIAM ' + request.requesterId : 'M2M · ' + request.machineId }}</dd></div>
                    <div><dt>Zweck</dt><dd>{{ request.purpose }}</dd></div>
                    <div><dt>Status</dt><dd>Anfrage eingegangen</dd></div>
                  </dl>
                </div>
                <a class="daca-button is-secondary" routerLink="/tasks">Aufgabe öffnen</a>
              </article>
            }
          </div>
        } @else {
          <div class="daca-card welcome-alert-empty">Keine offenen Aufgaben. Ihre Datenprodukte benötigen aktuell keinen Entscheid.</div>
        }
      </section>

      <section class="welcome-tasks" aria-labelledby="welcome-tasks-title">
        <div class="welcome-section-heading">
          <div>
            <p class="daca-eyebrow">Direkteinstieg</p>
            <h2 id="welcome-tasks-title">Was möchten Sie tun?</h2>
          </div>
          <p>Wählen Sie einen Bereich, um mit dem Beispiel-Datenprodukt zu arbeiten.</p>
        </div>

        <div class="welcome-task-grid">
          <a class="welcome-task-card" routerLink="/products">
            <span class="welcome-task-number" aria-hidden="true">01</span>
            <span class="welcome-task-copy">
              <strong>Datenprodukt pflegen</strong>
              <span>Metadaten, Qualität und REST-/PostgreSQL-Endpunkte prüfen und bearbeiten.</span>
            </span>
            <span class="welcome-task-link">Meine Datenprodukte öffnen</span>
          </a>
          <a class="welcome-task-card" routerLink="/tasks">
            <span class="welcome-task-number" aria-hidden="true">02</span>
            <span class="welcome-task-copy">
              <strong>Aufgaben bearbeiten</strong>
              <span>Zugriffsanfragen und weitere Aufgaben zu Ihren Datenprodukten bearbeiten.</span>
            </span>
            <span class="welcome-task-link">Aufgaben öffnen</span>
          </a>
          <a class="welcome-task-card" [routerLink]="['/products', product().id, 'access']">
            <span class="welcome-task-number" aria-hidden="true">03</span>
            <span class="welcome-task-copy">
              <strong>Freigaben verwalten</strong>
              <span>Zugriffsanfragen, Datenkonsumenten und KOBY-Metadatenzugriff verwalten.</span>
            </span>
            <span class="welcome-task-link">Freigaben öffnen</span>
          </a>
          <a class="welcome-task-card" [routerLink]="['/products', product().id, 'lineage']">
            <span class="welcome-task-number" aria-hidden="true">04</span>
            <span class="welcome-task-copy">
              <strong>Herkunft nachvollziehen</strong>
              <span>Lineage, Transformationen und append-only Provenienz einsehen.</span>
            </span>
            <span class="welcome-task-link">Lineage öffnen</span>
          </a>
        </div>
      </section>

      <section class="welcome-featured daca-card" aria-labelledby="welcome-product-title">
        <div class="welcome-product-main">
          <div class="welcome-product-heading">
            <div>
              <p class="daca-eyebrow">Beispiel-Datenprodukt</p>
              <h2 id="welcome-product-title">{{ productTitle() }}</h2>
            </div>
            <daca-status-badge tone="red">Eingeschränkt</daca-status-badge>
          </div>
          <p class="welcome-product-description">{{ productDescription() }}</p>
          <div class="welcome-product-meta" aria-label="Produktmerkmale">
            <span>Eigentümerin: {{ product().owner }}</span>
            <span>Revision {{ product().revision }}</span>
            <span>Jährlich</span>
            <span>REST &amp; PostgreSQL</span>
          </div>
          <p class="welcome-access-note">
            <strong>Zugriff im Demo-Szenario:</strong>
            Nur die Benutzergruppe Kanton St. Gallen darf die Produktdaten lesen.
          </p>
          <div class="welcome-product-actions">
            <a class="daca-button" routerLink="/products">Meine Datenprodukte öffnen</a>
            <a class="daca-button is-secondary" [routerLink]="['/products', product().id, 'access']">Freigaben</a>
          </div>
        </div>

        <aside class="welcome-mcp-note" aria-labelledby="welcome-mcp-title">
          <span class="welcome-mcp-label">KOBY · AI Services</span>
          <h3 id="welcome-mcp-title">Metadatenzugriff über MCP</h3>
          <p>
            KOBY erhält nur nach ausdrücklicher Freigabe Zugriff auf Metadaten.
            Produktdaten und Zugangsdaten bleiben ausgeschlossen.
          </p>
          <a [routerLink]="['/products', product().id, 'access', 'grant']" fragment="koby">KOBY-Metadatenzugriff prüfen</a>
        </aside>
      </section>

      <section class="welcome-trust" aria-label="Grundsätze des Datenkatalogs">
        <article>
          <h3>Standardmässig gesperrt</h3>
          <p>Unklare oder fehlende Entscheide geben keine Daten frei.</p>
        </article>
        <article>
          <h3>Keine Zugangsdaten im Katalog</h3>
          <p>Endpunkte werden beschrieben, Geheimnisse nicht gespeichert.</p>
        </article>
        <article>
          <h3>Eigenständig nutzbar</h3>
          <p>Der lokale Katalog bleibt ohne Control Plane funktionsfähig.</p>
        </article>
      </section>
    </div>
  `,
})
export class WelcomePageComponent {
  readonly api = inject(CatalogApiService);
  private readonly router = inject(Router);
  readonly product = computed(() => this.api.product());
  readonly productTitle = computed(() =>
    this.product().globalId === 'urn:daca:ch:estv:tax-statistics-by-canton'
      ? 'ESTV-Steuerstatistik nach Kanton'
      : this.product().title,
  );
  readonly productDescription = computed(() =>
    this.product().globalId === 'urn:daca:ch:estv:tax-statistics-by-canton'
      ? 'Aggregierte jährliche Steuerstatistiken der Schweizer Kantone. Das Datenprodukt enthält synthetische Werte für den DaCa-Proof-of-Concept und keine Personendaten.'
      : this.product().description,
  );
  readonly searchQuery = signal('');
  readonly searchStatus = signal<SearchStatus>('idle');
  readonly searchResults = signal<readonly DataProduct[]>([]);
  readonly searchResultCount = signal(0);
  readonly searchExpanded = signal(false);
  readonly searchMinimumLength = CATALOG_SEARCH_MIN_LENGTH;
  readonly ownerRequests = this.api.ownerAccessRequests;
  readonly ownerInboxLoading = this.api.ownerAccessRequestLoading;
  readonly simulationTasks = computed(() => this.api.workflowTasks().filter((task) => task.taskType.startsWith('simulation_')));
  readonly actionCount = computed(() => this.ownerRequests().length + this.simulationTasks().length);
  readonly heroTheme = selectSessionHeroTheme();
  readonly heroAvifSrcset = `/assets/${this.heroTheme.assetName}-960.avif 960w, /assets/${this.heroTheme.assetName}-1600.avif 1600w`;
  readonly heroWebpSrcset = `/assets/${this.heroTheme.assetName}-960.webp 960w, /assets/${this.heroTheme.assetName}-1600.webp 1600w`;
  readonly heroFallbackSrc = `/assets/${this.heroTheme.assetName}-1600.webp`;
  readonly heroImageLoaded = signal(false);

  requestProductTitle(request: StoredAccessRequest): string {
    return this.api.products().find((product) => product.id === request.dataProductId)?.title ?? 'Datenprodukt';
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

  expandSearch(): void {
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
