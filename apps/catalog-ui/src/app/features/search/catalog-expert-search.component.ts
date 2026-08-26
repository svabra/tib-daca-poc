import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogApiService } from '../../core/catalog-api.service';
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
      <a routerLink="/">Startseite</a><span aria-hidden="true">›</span><span>Expertensuche</span>
    </nav>

    <section class="daca-page-heading expert-search-heading">
      <div>
        <p class="daca-eyebrow">Katalog durchsuchen</p>
        <h1>Expertensuche</h1>
        <p>Durchsuchen und filtern Sie den vollständigen Katalog nach Datenprodukt, Thema, Organisation oder technischem Identifier.</p>
      </div>
    </section>

    <section class="daca-card expert-search-panel" aria-label="Expertensuche">
      <form role="search" (submit)="$event.preventDefault()">
        <div class="expert-search-field">
          <label for="expert-search-input">Suchbegriff</label>
          <span class="expert-search-control">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
            <input
              id="expert-search-input"
              type="search"
              autocomplete="off"
              placeholder="z. B. Bundessteuer, Kanton, ESTV oder Produkt-URN"
              [value]="query()"
              (input)="updateQuery($any($event.target).value)"
              aria-describedby="expert-search-hint"
            >
            @if (query()) {
              <button type="button" (click)="clearQuery()" aria-label="Suchbegriff löschen">×</button>
            }
          </span>
        </div>

        <div class="expert-search-filters" aria-label="Suchergebnisse filtern">
          <label>
            <span>Fachgebiet</span>
            <select [value]="selectedDomain()" (change)="selectedDomain.set($any($event.target).value)">
              <option value="all">Alle Fachgebiete</option>
              @for (domain of domains(); track domain) { <option [value]="domain">{{ domain }}</option> }
            </select>
          </label>
          <label>
            <span>Organisation</span>
            <select [value]="selectedOwner()" (change)="selectedOwner.set($any($event.target).value)">
              <option value="all">Alle Organisationen</option>
              @for (owner of owners(); track owner) { <option [value]="owner">{{ owner }}</option> }
            </select>
          </label>
          <button class="daca-button is-secondary" type="button" (click)="resetFilters()">Filter zurücksetzen</button>
        </div>
      </form>
      <p id="expert-search-hint" class="expert-search-hint">
        Die Suche beginnt automatisch ab {{ searchMinimumLength }} Zeichen. Der Suchbegriff bleibt in der URL erhalten.
      </p>
    </section>

    <section class="expert-search-results" aria-labelledby="expert-search-results-title" aria-live="polite">
      <header>
        <div>
          <p class="daca-eyebrow">Ergebnisse</p>
          <h2 id="expert-search-results-title">
            @if (searchReady()) {
              {{ resultCountLabel(results().length) }}
            } @else {
              Suchbegriff eingeben
            }
          </h2>
        </div>
        @if (searchReady()) { <p>für «{{ query().trim() }}»</p> }
      </header>

      @if (api.loading()) {
        <div class="daca-card expert-search-empty">Katalog wird geladen…</div>
      } @else if (!searchReady()) {
        <div class="daca-card expert-search-empty">
          <strong>Mindestens {{ searchMinimumLength }} Zeichen erforderlich</strong>
          <p>Verfeinern Sie anschliessend die Treffer nach Fachgebiet oder Organisation.</p>
        </div>
      } @else if (results().length === 0) {
        <div class="daca-card expert-search-empty">
          <strong>Keine passenden Datenprodukte gefunden</strong>
          <p>Ändern Sie den Suchbegriff oder setzen Sie die Filter zurück.</p>
          <a class="expert-search-term-link" routerLink="/glossary/proposals/new" [queryParams]="{q:query().trim()}">Fachbegriff fehlt? Vorschlagen</a>
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
    </section>
  `,
  styles: [`.expert-search-term-link{display:inline-block;margin-top:.7rem;color:#006699;font-size:.78rem;font-weight:700;text-decoration:underline;text-underline-offset:.16rem}`],
})
export class CatalogExpertSearchComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly query = linkedSignal(() => this.queryParams().get('q') ?? '');
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
    return `${count} ${count === 1 ? 'Datenprodukt' : 'Datenprodukte'}`;
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
