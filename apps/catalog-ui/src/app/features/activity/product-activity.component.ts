import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct, ProductActivityItem, ProductActivityResponse } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import {
  PRODUCT_ACTIVITY_FILTERS,
  ProductActivityFilter,
  presentProductActivity,
  productActivityMatchesFilter,
} from './product-activity.presenter';

const PAGE_SIZE = 20;

@Component({
  selector: 'daca-product-activity',
  standalone: true,
  imports: [DatePipe, ProductWorkspaceNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-product-workspace-nav
      [productId]="productId"
      [productTitle]="product()?.title ?? 'Datenprodukt wird geladen'"
      activeSection="history"
    />

    <section class="daca-page-heading product-activity-heading">
      <div>
        <p class="daca-eyebrow">Datenprodukt · Nachvollziehbarkeit</p>
        <h1>Änderungsverlauf</h1>
        <p>Persistierte Änderungen, Entscheidungen und technische Aktivierungen dieses Datenprodukts.</p>
      </div>
      @if (response(); as activity) {
        <div class="product-activity-summary" aria-label="Zusammenfassung des Änderungsverlaufs">
          <span><strong>{{ activity.items.length }}</strong> Ereignisse</span>
          <span><strong>{{ product()?.revision ?? '–' }}</strong> Produktrevision</span>
          <span>{{ activity.detailLevel === 'privileged' ? 'Mit technischer Evidenz' : 'Sichere Übersicht' }}</span>
        </div>
      }
    </section>

    <section class="daca-card product-activity-explanation" aria-labelledby="activity-scope-title">
      <div>
        <p class="daca-eyebrow">Abgrenzung</p>
        <h2 id="activity-scope-title">Was ist hier passiert?</h2>
      </div>
      <p>Der Änderungsverlauf zeigt Zustandsänderungen und Entscheidungen. Lineage &amp; Provenienz erklärt dagegen, woher die Daten stammen und wie sie verarbeitet wurden.</p>
    </section>

    <section class="product-activity-workspace" aria-labelledby="activity-list-title">
      <header>
        <div>
          <p class="daca-eyebrow">Chronologie</p>
          <h2 id="activity-list-title">Produktaktivitäten</h2>
        </div>
        <div class="product-activity-filters" role="group" aria-label="Änderungsverlauf filtern">
          @for (option of filters; track option.id) {
            <button
              type="button"
              [class.is-active]="activeFilter() === option.id"
              [attr.aria-pressed]="activeFilter() === option.id"
              (click)="selectFilter(option.id)"
            >{{ option.label }}</button>
          }
        </div>
      </header>

      <div class="product-activity-feedback" aria-live="polite">
        @if (loading()) {
          <div class="daca-card product-activity-state" role="status">
            <span class="product-activity-loader" aria-hidden="true"></span>
            <div><strong>Änderungsverlauf wird geladen</strong><p>Die persistierten Katalogereignisse werden zusammengestellt.</p></div>
          </div>
        } @else if (error()) {
          <div class="daca-card product-activity-state is-error" role="alert">
            <span aria-hidden="true">!</span>
            <div><strong>Änderungsverlauf nicht verfügbar</strong><p>{{ error() }}</p></div>
            <button type="button" class="daca-button is-secondary" (click)="load()">Erneut versuchen</button>
          </div>
        } @else if (response()?.items?.length === 0) {
          <div class="daca-card product-activity-state">
            <span aria-hidden="true">○</span>
            <div><strong>Noch keine Aktivitäten</strong><p>Für dieses Datenprodukt wurden noch keine Änderungen oder Entscheidungen protokolliert.</p></div>
          </div>
        } @else if (filteredItems().length === 0) {
          <div class="daca-card product-activity-state">
            <span aria-hidden="true">○</span>
            <div><strong>Keine passenden Aktivitäten</strong><p>In dieser Kategorie sind noch keine Ereignisse vorhanden.</p></div>
            <button type="button" class="daca-button is-secondary" (click)="selectFilter('all')">Alle anzeigen</button>
          </div>
        } @else {
          <p class="product-activity-result-count" role="status">
            {{ visibleItems().length }} von {{ filteredItems().length }} Ereignissen angezeigt
          </p>
          <ol class="product-activity-timeline" aria-label="Änderungen, neueste zuerst">
            @for (item of visibleItems(); track item.key; let first = $first) {
              @let presentation = present(item);
              <li [class]="'is-' + item.status">
                <span class="product-activity-marker" aria-hidden="true">{{ first ? '●' : '·' }}</span>
                <article class="daca-card">
                  <header>
                    <div class="product-activity-tags">
                      <span>{{ presentation.categoryLabel }}</span>
                      <span [class]="'is-' + item.status">{{ presentation.statusLabel }}</span>
                    </div>
                    <time [attr.datetime]="item.occurredAt">{{ item.occurredAt | date: 'dd.MM.yyyy, HH:mm' }} Uhr</time>
                  </header>
                  <h3>{{ presentation.title }}</h3>
                  <p>{{ presentation.description }}</p>
                  <dl class="product-activity-meta">
                    <div><dt>Akteur</dt><dd>{{ item.actor.displayName }} <small>({{ presentation.actorKindLabel }})</small></dd></div>
                    @if (item.productRevision !== null) { <div><dt>Produktrevision</dt><dd>{{ item.productRevision }}</dd></div> }
                    @if (item.policyRevision !== null) { <div><dt>Policy-Revision</dt><dd>{{ item.policyRevision }}</dd></div> }
                  </dl>
                  @if (item.facts.length > 0) {
                    <dl class="product-activity-facts" aria-label="Fachliche Ereignisdetails">
                      @for (fact of item.facts; track fact.label + fact.value) {
                        <div><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
                      }
                    </dl>
                  }
                  @if (response()?.detailLevel === 'privileged' && item.technicalEvidence.length > 0) {
                    <details class="product-activity-evidence">
                      <summary>Technische Evidenz anzeigen</summary>
                      <dl>
                        @for (evidence of item.technicalEvidence; track evidence.label + evidence.value) {
                          <div><dt>{{ evidence.label }}</dt><dd><code>{{ evidence.value }}</code></dd></div>
                        }
                      </dl>
                    </details>
                  }
                </article>
              </li>
            }
          </ol>
          @if (hasMore()) {
            <div class="product-activity-load-more">
              <button type="button" class="daca-button is-secondary" (click)="showMore()">Weitere anzeigen</button>
            </div>
          }
        }
      </div>
    </section>
  `,
})
export class ProductActivityComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly filters = PRODUCT_ACTIVITY_FILTERS;
  readonly activeFilter = signal<ProductActivityFilter>('all');
  readonly visibleCount = signal(PAGE_SIZE);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly product = signal<DataProduct | null>(null);
  readonly response = signal<ProductActivityResponse | null>(null);

  readonly filteredItems = computed<readonly ProductActivityItem[]>(() =>
    (this.response()?.items ?? []).filter((item) => productActivityMatchesFilter(item, this.activeFilter())),
  );
  readonly visibleItems = computed(() => this.filteredItems().slice(0, this.visibleCount()));
  readonly hasMore = computed(() => this.visibleItems().length < this.filteredItems().length);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      product: this.api.loadProduct(this.productId),
      activity: this.api.loadProductActivity(this.productId),
    }).subscribe({
      next: ({ product, activity }) => {
        if (product.id !== this.productId) {
          this.error.set('Das geladene Datenprodukt stimmt nicht mit dem angeforderten Änderungsverlauf überein.');
          this.loading.set(false);
          return;
        }
        this.product.set(product);
        this.response.set(activity);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Die Katalog-API konnte die Aktivitäten nicht laden. Es wurden keine Ersatzereignisse angezeigt.');
        this.loading.set(false);
      },
    });
  }

  selectFilter(filter: ProductActivityFilter): void {
    this.activeFilter.set(filter);
    this.visibleCount.set(PAGE_SIZE);
  }

  showMore(): void {
    this.visibleCount.update((current) => current + PAGE_SIZE);
  }

  present(item: ProductActivityItem) {
    return presentProductActivity(item);
  }
}
