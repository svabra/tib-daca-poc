import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct, OwnedAccessConsumer } from '../../core/catalog.models';
import { QualityMedalComponent, QualityMedalLevel } from '../../shared/quality-medal.component';
import {
  accessConsumerSummary,
  connectedAuthorities,
  accessRequest,
  AccessRequest,
  canTransferOwnership,
  dataOwner,
  DataOwnerProfile,
  dataConsumerCountLabel,
  DEFAULT_PRODUCT_RELATIONSHIP_FILTER,
  deliveryProtocols,
  initialProductRelationshipFilter,
  isConsumedProduct,
  matchesProduct,
  ProductRelationshipFilter,
  consumersForProduct,
  relationshipBadges,
} from './my-data-products';

@Component({
  selector: 'daca-my-data-products',
  standalone: true,
  imports: [DatePipe, RouterLink, QualityMedalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading product-index-heading">
      <div>
        <p class="daca-eyebrow">Data Owner Workspace</p>
        <h1>Meine Datenprodukte</h1>
        <p>Finden Sie Datenprodukte, die Sie anbieten, freigegeben oder angefragt haben – sowie Produkte, die für Sie freigegeben wurden.</p>
      </div>
      <aside class="product-index-identity" aria-label="Aktueller Arbeitskontext">
        @if (api.identityUser().avatarUrl) { <img class="product-index-avatar" [src]="api.identityUser().avatarUrl!" alt=""> }
        <span><small>Aktueller Arbeitskontext</small><strong>{{ api.identityUser().displayName }}</strong><small>{{ api.identityUser().organization }}</small></span>
      </aside>
    </section>

    @if (api.usingFallback()) {
      <p class="daca-alert is-warning">Vorschaudaten: Die PostgreSQL-gestützte Katalog-API ist lokal nicht erreichbar. Suche und Filter bleiben mit dem identischen ESTV-Beispielportfolio nutzbar.</p>
    }

    <section class="daca-card product-search" aria-labelledby="product-search-title">
      <div class="product-search-main">
        <div>
          <p class="daca-eyebrow">Katalog durchsuchen</p>
          <h2 id="product-search-title">Welches Datenprodukt suchen Sie?</h2>
          <p>Titel, Fachgebiet, Behörde, Kanton, Gemeinde oder Machine ID eingeben.</p>
        </div>
        <label class="product-search-field">
          <span>Suchbegriff</span>
          <span class="product-search-control">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
            <input
              type="search"
              [value]="query()"
              (input)="updateQuery($event)"
              placeholder="z. B. Bundessteuer, Kanton oder svc-estv-…"
              autocomplete="off"
            >
            @if (query()) { <button type="button" (click)="query.set('')">Zurücksetzen</button> }
          </span>
        </label>
      </div>

      <div class="product-filter-row" aria-label="Datenprodukte nach Beziehung filtern">
        @for (item of filters; track item.value) {
          <button
            type="button"
            [class.is-active]="filter() === item.value"
            [attr.aria-pressed]="filter() === item.value"
            aria-controls="product-results"
            (click)="filter.set(item.value)"
          >
            <span>{{ item.label }}</span><strong>{{ filterCount(item.value) }}</strong>
          </button>
        }
      </div>
    </section>

    <section class="product-results" id="product-results" aria-live="polite">
      <div class="product-results-heading">
        <div>
          <p class="daca-eyebrow">Ergebnisse</p>
          <h2>{{ productCountLabel(filteredProducts().length) }}</h2>
        </div>
        <div class="product-results-tools">
          <p>
            @if (api.loading()) { Katalog wird aktualisiert… }
            @else { Für {{ api.identityUser().displayName }} · {{ api.identityUser().organization }} }
          </p>
          <div class="product-view-switch" role="group" aria-label="Darstellung der Datenprodukte">
            <button type="button" [class.is-active]="viewMode() === 'records'" [attr.aria-pressed]="viewMode() === 'records'" (click)="viewMode.set('records')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="6"/><rect x="3.5" y="14" width="17" height="6"/></svg>
              <span>Records</span>
            </button>
            <button type="button" [class.is-active]="viewMode() === 'table'" [attr.aria-pressed]="viewMode() === 'table'" (click)="viewMode.set('table')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16"/><path d="M3.5 9h17M9 4v16M15 4v16"/></svg>
              <span>Tabelle</span>
            </button>
          </div>
        </div>
      </div>

      @if (transferNotice(); as notice) {
        <div class="ownership-transfer-notice" role="status">
          <span><strong>Ownership-Transfer vorbereitet</strong>{{ notice }}</span>
          <button type="button" (click)="transferNotice.set(null)" aria-label="Meldung schliessen">×</button>
        </div>
      }
      @if (identifierCopyNotice(); as identifier) {
        <div class="ownership-transfer-notice product-copy-notice" role="status">
          <span><strong>Identifier kopiert</strong><code>{{ identifier }}</code></span>
          <button type="button" (click)="identifierCopyNotice.set(null)" aria-label="Meldung schliessen">×</button>
        </div>
      }
      @if (identifierCopyError()) {
        <p class="daca-alert is-error" role="alert">Der Identifier konnte nicht in die Zwischenablage kopiert werden.</p>
      }

      @if (filteredProducts().length === 0) {
        <div class="daca-card product-empty">
          <strong>Keine passenden Datenprodukte gefunden.</strong>
          <p>Ändern Sie den Suchbegriff oder wählen Sie eine andere Beziehung.</p>
          <button class="daca-button is-secondary" type="button" (click)="resetFilters()">Alle Datenprodukte anzeigen</button>
        </div>
      } @else if (viewMode() === 'records') {
        <div class="product-list">
          @for (product of filteredProducts(); track product.id) {
            <article class="daca-card product-list-item">
              <div class="product-list-accent" aria-hidden="true"></div>
              <div class="product-list-body">
                <div class="product-list-meta">
                  <span>{{ product.domain }}</span>
                  <span>{{ product.owner }}</span>
                  <span>{{ classificationLabel(product.classification) }}</span>
                  <span>{{ lifecycleLabel(product.lifecycle) }}</span>
                  <daca-quality-medal [medal]="qualityMedal(product)" [score]="product.qualityScore ?? 0" />
                </div>
                <h3>{{ product.title }}</h3>
                <p>{{ product.description }}</p>
                @for (alert of simulationAlerts(product); track alert.eventId) {
                  <div class="product-simulation-alert"><strong>{{ alert.title }}</strong><span>{{ alert.detail }}</span></div>
                }

                <div class="product-relationships" aria-label="Ihre Beziehung zu diesem Datenprodukt">
                  @for (badge of badges(product); track badge.kind + badge.detail) {
                    @if (badge.kind === 'offered' && consumerSummary(product).total > 0) {
                      <button
                        class="product-consumer-badge is-offered"
                        [class.needs-attention]="badge.tone === 'attention'"
                        type="button"
                        [attr.aria-label]="dataConsumerLabel(consumerSummary(product).total) + ' von ' + product.title + ' anzeigen'"
                        (click)="openConsumerDrawer(product, $event)"
                      >
                        <strong>{{ badge.label }}</strong>
                        <small>{{ badge.detail }}</small>
                        <span>{{ consumerBreakdown(product) }}</span>
                      </button>
                    } @else {
                      <span
                        [class.is-offered]="badge.kind === 'offered'"
                        [class.is-shared-by]="badge.kind === 'sharedByMe'"
                        [class.is-requested]="badge.kind === 'requestedByMe'"
                        [class.is-shared-with]="badge.kind === 'sharedWithMe'"
                        [class.is-machine]="badge.kind === 'machine'"
                        [class.needs-attention]="badge.tone === 'attention'"
                      >
                        <strong>{{ badge.label }}</strong><small>{{ badge.detail }}</small>
                        @if (badge.kind === 'offered') { <span>{{ consumerBreakdown(product) }}</span> }
                      </span>
                    }
                  }
                </div>

                @if (request(product); as access) {
                  <section class="product-request-status" [class.is-granted]="access.tone === 'granted'" [class.is-rejected]="access.tone === 'rejected'">
                    <div>
                      <small>Zugriffsanfrage {{ access.requestId }}</small>
                      <time [attr.datetime]="access.updatedAt">Stand {{ access.updatedAt | date: 'dd.MM.yyyy' }}</time>
                    </div>
                    <strong>{{ access.label }}</strong>
                    <p>{{ access.detail }}</p>
                  </section>
                }

                @if (visibleOwner(product); as owner) {
                  <div class="product-data-owner">
                    <img [src]="owner.avatarUrl" alt="">
                    <span>
                      <small>Data Owner</small><strong>{{ owner.name }}</strong><small>{{ owner.organization }}</small>
                      @if (owner.phone || owner.teamsUrl) {
                        <span class="product-owner-contact">
                          @if (owner.phone) { <a [href]="'tel:' + owner.phone.replaceAll(' ', '')">{{ owner.phone }}</a> }
                          @if (owner.teamsUrl) {
                            <a class="product-owner-teams" [href]="owner.teamsUrl" target="_blank" rel="noreferrer" [attr.aria-label]="owner.name + ' über Microsoft Teams kontaktieren'" title="In Microsoft Teams kontaktieren">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.2h5.3v2.1H12.7v6.1h-2.2V8.3H9V6.2Z"/><path d="M16 8.7h2.6c.8 0 1.4.6 1.4 1.4v4.8c0 .8-.6 1.4-1.4 1.4H16V8.7Zm-9.8.6h5.2v6.5H6.2c-.7 0-1.2-.5-1.2-1.2v-4.1c0-.7.5-1.2 1.2-1.2Z"/></svg>
                              <span>Teams</span>
                            </a>
                          }
                        </span>
                      }
                    </span>
                  </div>
                }

                @if (authorities(product).length) {
                  <p class="product-authorities"><strong>Verbundene Behörden:</strong> {{ authorities(product).join(' · ') }}</p>
                }
              </div>
              <footer class="product-list-footer">
                <div class="product-protocols">
                  @for (protocol of protocols(product); track protocol) { <span>{{ protocol }}</span> }
                </div>
                <dl>
                  <div><dt>Aktualisierung</dt><dd>{{ frequencyLabel(product.updateFrequency) }}</dd></div>
                  <div><dt>Revision</dt><dd>{{ product.revision }}</dd></div>
                  <div><dt>Geändert</dt><dd>{{ product.updatedAt | date: 'dd.MM.yyyy' }}</dd></div>
                </dl>
                <div class="product-list-actions">
                  <a class="daca-button is-secondary" [routerLink]="['/products', product.id, 'overview']">Produktdetails öffnen</a>
                  <div class="product-context-menu" (click)="$event.stopPropagation()">
                    <button
                      class="product-context-trigger"
                      type="button"
                      aria-haspopup="menu"
                      [attr.aria-expanded]="activeProductMenuId() === product.id"
                      [attr.aria-controls]="'product-actions-' + product.id"
                      aria-label="Weitere Aktionen für dieses Datenprodukt"
                      title="Weitere Aktionen"
                      (click)="toggleProductMenu(product.id)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
                    </button>
                    @if (activeProductMenuId() === product.id) {
                      <div class="product-context-popover" role="menu" [id]="'product-actions-' + product.id">
                        <a role="menuitem" [routerLink]="['/products', product.id, 'overview']">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10.5L19 8v11.5H5z"/><path d="M15.5 4.5V8H19M8 12h8M8 15h6"/></svg>
                          <span>Produktdetails öffnen</span>
                        </a>
                        <button type="button" role="menuitem" (click)="copyProductIdentifier(product)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11"/><path d="M16 8V5H5v11h3"/></svg>
                          <span>Identifier kopieren</span>
                        </button>
                        @if (ownershipTransferAvailable(product)) {
                          <button type="button" role="menuitem" (click)="startOwnershipTransfer(product)">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M3.5 18c.7-3 2.2-4.5 4.5-4.5 1.2 0 2.2.4 3 1.2M14 9h6M17 6l3 3-3 3M20 16h-6M17 13l-3 3 3 3"/></svg>
                            <span>Ownership transferieren</span>
                          </button>
                        } @else {
                          <a role="menuitem" [routerLink]="['/products', product.id, 'access-request']">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h8l3 3v14H7z"/><path d="M15 3.5v3h3M10 11h5M10 14h5M10 17h3"/><path d="m3.5 12 1.4 1.5L7.5 10"/></svg>
                            <span>Zugriff anfragen</span>
                          </a>
                        }
                      </div>
                    }
                  </div>
                </div>
              </footer>
            </article>
          }
        </div>
      } @else {
        <div class="daca-card product-table-shell">
          <table class="product-table">
            <thead>
              <tr>
                <th scope="col">Datenprodukt</th>
                <th scope="col">Data Owner</th>
                <th scope="col">Beziehung</th>
                <th scope="col">Status</th>
                <th scope="col">Schnittstellen</th>
                <th scope="col">Aktualisiert</th>
                <th scope="col"><span class="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody>
              @for (product of filteredProducts(); track product.id) {
                <tr>
                  <td>
                    <a class="product-table-title" [routerLink]="['/products', product.id, 'overview']">
                      <strong>{{ product.title }}</strong>
                      <span class="product-table-summary">
                        <span>{{ product.domain }} · Revision {{ product.revision }}</span>
                        <daca-quality-medal [medal]="qualityMedal(product)" [score]="product.qualityScore ?? 0" />
                      </span>
                    </a>
                  </td>
                  <td>
                    @if (visibleOwner(product); as owner) {
                      <span class="product-table-owner">
                        <img [src]="owner.avatarUrl" alt="">
                        <span><strong>{{ owner.name }}</strong><small>{{ owner.organization }}</small></span>
                      </span>
                    } @else {
                      <span class="product-table-owner-text">{{ product.owner }}</span>
                    }
                  </td>
                  <td>
                    <span class="product-table-relationships">
                      @for (badge of badges(product); track badge.kind + badge.detail) {
                        @if (badge.kind === 'offered' && consumerSummary(product).total > 0) {
                          <button
                            type="button"
                            [class.needs-attention]="badge.tone === 'attention'"
                            [attr.aria-label]="dataConsumerLabel(consumerSummary(product).total) + ' von ' + product.title + ' anzeigen'"
                            (click)="openConsumerDrawer(product, $event)"
                          >
                            <strong>{{ badge.label }}</strong>
                            <small>{{ badge.detail }}</small>
                            <span>{{ consumerBreakdown(product) }}</span>
                          </button>
                        } @else {
                          <span [class.needs-attention]="badge.tone === 'attention'">
                            <strong>{{ badge.label }}</strong>
                            @if (badge.kind === 'offered') {
                              <small>{{ badge.detail }}</small><span>{{ consumerBreakdown(product) }}</span>
                            }
                          </span>
                        }
                      }
                    </span>
                  </td>
                  <td>
                    @if (simulationAlerts(product).length) {
                      <span class="product-table-request is-attention"><strong>{{ simulationAlerts(product)[0].title }}</strong><small>{{ simulationAlerts(product)[0].detail }}</small></span>
                    } @else if (request(product); as access) {
                      <span class="product-table-request" [class.is-granted]="access.tone === 'granted'" [class.is-rejected]="access.tone === 'rejected'">
                        <strong>{{ access.label }}</strong><small>{{ access.requestId }}</small>
                      </span>
                    } @else {
                      <span class="product-table-state"><strong>{{ lifecycleLabel(product.lifecycle) }}</strong><small>{{ classificationLabel(product.classification) }}</small></span>
                    }
                  </td>
                  <td>
                    <span class="product-table-protocols">
                      @for (protocol of protocols(product); track protocol) { <span>{{ protocol }}</span> }
                    </span>
                  </td>
                  <td><span class="product-table-date">{{ product.updatedAt | date: 'dd.MM.yyyy' }}<small>{{ frequencyLabel(product.updateFrequency) }}</small></span></td>
                  <td>
                    <div class="product-table-actions">
                      <a [routerLink]="['/products', product.id, 'overview']">Öffnen</a>
                      <div class="product-context-menu" (click)="$event.stopPropagation()">
                        <button
                          class="product-context-trigger"
                          type="button"
                          aria-haspopup="menu"
                          [attr.aria-expanded]="activeProductMenuId() === product.id"
                          [attr.aria-controls]="'product-table-actions-' + product.id"
                          aria-label="Weitere Aktionen für dieses Datenprodukt"
                          title="Weitere Aktionen"
                          (click)="toggleProductMenu(product.id)"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
                        </button>
                        @if (activeProductMenuId() === product.id) {
                          <div class="product-context-popover" role="menu" [id]="'product-table-actions-' + product.id">
                            <a role="menuitem" [routerLink]="['/products', product.id, 'overview']">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10.5L19 8v11.5H5z"/><path d="M15.5 4.5V8H19M8 12h8M8 15h6"/></svg>
                              <span>Produktdetails öffnen</span>
                            </a>
                            <button type="button" role="menuitem" (click)="copyProductIdentifier(product)">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11"/><path d="M16 8V5H5v11h3"/></svg>
                              <span>Identifier kopieren</span>
                            </button>
                            @if (ownershipTransferAvailable(product)) {
                              <button type="button" role="menuitem" (click)="startOwnershipTransfer(product)">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M3.5 18c.7-3 2.2-4.5 4.5-4.5 1.2 0 2.2.4 3 1.2M14 9h6M17 6l3 3-3 3M20 16h-6M17 13l-3 3 3 3"/></svg>
                                <span>Ownership transferieren</span>
                              </button>
                            } @else {
                              <a role="menuitem" [routerLink]="['/products', product.id, 'access-request']">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h8l3 3v14H7z"/><path d="M15 3.5v3h3M10 11h5M10 14h5M10 17h3"/><path d="m3.5 12 1.4 1.5L7.5 10"/></svg>
                                <span>Zugriff anfragen</span>
                              </a>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    @if (consumerDrawerProduct(); as product) {
      <div class="access-consumer-backdrop" (click)="closeConsumerDrawer()">
        <aside
          class="access-consumer-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-consumer-title"
          (click)="$event.stopPropagation()"
          (keydown)="trapConsumerDrawerFocus($event)"
        >
          <header class="access-consumer-header">
            <div>
              <p class="daca-eyebrow">Aktive Zugriffe</p>
              <h2 id="access-consumer-title">Datenkonsumenten</h2>
              <p>{{ product.title }}</p>
            </div>
            <button id="access-consumer-close" type="button" (click)="closeConsumerDrawer()" aria-label="Datenkonsumenten schliessen">×</button>
          </header>

          <section class="access-consumer-summary" aria-label="Zusammenfassung">
            <strong>{{ dataConsumerLabel(consumerSummary(product).total) }}</strong>
            <span>{{ consumerBreakdown(product) }}</span>
          </section>

          <div class="access-consumer-controls">
            <div class="access-consumer-type-filter" role="group" aria-label="Datenkonsumenten filtern">
              <button type="button" [class.is-active]="consumerTypeFilter() === 'all'" [attr.aria-pressed]="consumerTypeFilter() === 'all'" (click)="consumerTypeFilter.set('all')">Alle <strong>{{ consumerSummary(product).total }}</strong></button>
              <button type="button" [class.is-active]="consumerTypeFilter() === 'person'" [attr.aria-pressed]="consumerTypeFilter() === 'person'" (click)="consumerTypeFilter.set('person')">Personen <strong>{{ consumerSummary(product).persons }}</strong></button>
              <button type="button" [class.is-active]="consumerTypeFilter() === 'machine'" [attr.aria-pressed]="consumerTypeFilter() === 'machine'" (click)="consumerTypeFilter.set('machine')">Maschinen <strong>{{ consumerSummary(product).machines }}</strong></button>
            </div>
            <label class="access-consumer-search">
              <span>In Datenkonsumenten suchen</span>
              <span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
                <input type="search" [value]="consumerQuery()" (input)="updateConsumerQuery($event)" placeholder="Name, Organisation, eIAM- oder Machine ID" autocomplete="off">
              </span>
            </label>
          </div>

          <div class="access-consumer-results" aria-live="polite">
            @if (filteredDrawerConsumers().length === 0) {
              <p class="access-consumer-empty">Keine passenden Datenkonsumenten gefunden.</p>
            } @else {
              @for (consumer of filteredDrawerConsumers(); track consumer.consumerType + consumer.identityId) {
                <article class="access-consumer-item">
                  <header>
                    <span class="access-consumer-kind" [class.is-machine]="consumer.consumerType === 'machine'" aria-hidden="true">
                      @if (consumer.consumerType === 'person') {
                        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6"/></svg>
                      } @else {
                        <svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 10h8M8 14h5M9 3v3M15 3v3M9 18v3M15 18v3"/></svg>
                      }
                    </span>
                    <span>
                      <small>{{ consumerTypeLabel(consumer.consumerType) }}</small>
                      <strong>{{ consumer.displayName }}</strong>
                      <span>{{ consumer.organization }}</span>
                    </span>
                  </header>
                  <code>{{ consumer.identityId }}</code>
                  <div class="access-consumer-grants">
                    @for (grant of consumer.grants; track grant.requestNumber) {
                      <section>
                        <div><strong>{{ protocolLabel(grant.protocol) }}</strong><span>{{ variantLabel(grant.variant) }}</span></div>
                        <p>Gültig {{ grant.validFrom | date: 'dd.MM.yyyy' }}–{{ grant.validUntil | date: 'dd.MM.yyyy' }}</p>
                        <small>{{ grant.requestNumber }}</small>
                      </section>
                    }
                  </div>
                </article>
              }
            }
          </div>
          <footer><p>Die Übersicht ist schreibgeschützt. Änderungen und Widerrufe erfolgen in der Freigabeverwaltung.</p></footer>
        </aside>
      </div>
    }

    @if (transferProduct(); as product) {
      <div class="ownership-transfer-backdrop" (click)="closeOwnershipTransfer()">
        <section class="ownership-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="ownership-transfer-title" (click)="$event.stopPropagation()">
          <header>
            <div>
              <p class="daca-eyebrow">Data Governance</p>
              <h2 id="ownership-transfer-title">Ownership transferieren</h2>
            </div>
            <button type="button" (click)="closeOwnershipTransfer()" aria-label="Dialog schliessen">×</button>
          </header>
          <p>Wählen Sie die neue verantwortliche Person für <strong>{{ product.title }}</strong>.</p>
          <dl>
            <div><dt>Aktuelle Data Ownerin</dt><dd>Kassandra Valdata · ESTV</dd></div>
            <div><dt>Produkt</dt><dd>{{ product.domain }}</dd></div>
          </dl>
          <label>
            <span>Neue Data Ownerin / neuer Data Owner</span>
            <select [value]="transferTarget()" (change)="updateTransferTarget($event)" autofocus>
              <option value="">Person oder Organisation auswählen</option>
              <option value="Noémie Rochat · Kanton Neuchâtel">Noémie Rochat · Kanton Neuchâtel</option>
              <option value="Ariane Keller · ESTV">Ariane Keller · ESTV</option>
              <option value="Daniel Aebischer · EFV">Daniel Aebischer · EFV</option>
            </select>
          </label>
          <p class="ownership-transfer-hint"><strong>Kontrollierter Übergang:</strong> Die bisherige Data Ownerin bleibt verantwortlich, bis die neue Stelle den Transfer bestätigt hat.</p>
          @if (transferError(); as error) {
            <p class="ownership-transfer-error" role="alert">{{ error }}</p>
          }
          <footer>
            <button class="daca-button is-secondary" type="button" [disabled]="transferSubmitting()" (click)="closeOwnershipTransfer()">Abbrechen</button>
            <button class="daca-button is-primary" type="button" [disabled]="!transferTarget() || transferSubmitting()" (click)="prepareOwnershipTransfer()">
              {{ transferSubmitting() ? 'Anfrage wird gespeichert…' : 'Transferanfrage erstellen' }}
            </button>
          </footer>
        </section>
      </div>
    }
  `,
})
export class MyDataProductsComponent implements OnDestroy {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  readonly query = signal('');
  readonly filter = signal<ProductRelationshipFilter>(DEFAULT_PRODUCT_RELATIONSHIP_FILTER);
  readonly viewMode = signal<'records' | 'table'>('table');
  readonly activeProductMenuId = signal<string | null>(null);
  readonly transferProduct = signal<DataProduct | null>(null);
  readonly transferTarget = signal('');
  readonly transferNotice = signal<string | null>(null);
  readonly identifierCopyNotice = signal<string | null>(null);
  readonly identifierCopyError = signal(false);
  readonly transferSubmitting = signal(false);
  readonly transferError = signal<string | null>(null);
  readonly consumerDrawerProduct = signal<DataProduct | null>(null);
  readonly consumerTypeFilter = signal<'all' | 'person' | 'machine'>('all');
  readonly consumerQuery = signal('');
  private consumerDrawerReturnFocus: HTMLElement | null = null;
  private bodyOverflowBeforeDrawer: string | null = null;
  readonly filters: readonly { value: ProductRelationshipFilter; label: string }[] = [
    { value: 'all', label: 'Alle Datenprodukte' },
    { value: 'offered', label: 'Von mir angeboten' },
    { value: 'sharedByMe', label: 'Von mir freigegeben' },
    { value: 'requestedByMe', label: 'Von mir angefragt' },
    { value: 'sharedWithMe', label: 'Für mich freigegeben' },
  ];

  readonly filteredProducts = computed(() =>
    this.api.products().filter((product) => matchesProduct(
      product,
      this.query(),
      this.filter(),
      this.api.identityUserId(),
      this.api.ownedAccessConsumers(),
    )),
  );
  readonly filteredDrawerConsumers = computed(() => {
    const product = this.consumerDrawerProduct();
    if (!product) return [];
    const type = this.consumerTypeFilter();
    const needle = this.consumerQuery().trim().toLocaleLowerCase('de-CH');
    return consumersForProduct(product.id, this.api.ownedAccessConsumers()).filter((consumer) => {
      if (type !== 'all' && consumer.consumerType !== type) return false;
      if (!needle) return true;
      return [consumer.displayName, consumer.organization, consumer.identityId]
        .join(' ')
        .toLocaleLowerCase('de-CH')
        .includes(needle);
    });
  });

  constructor() {
    this.filter.set(initialProductRelationshipFilter(
      this.route.snapshot.queryParamMap.get('relationship'),
    ));
  }

  updateQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  filterCount(filter: ProductRelationshipFilter): number {
    return this.api.products().filter((product) => matchesProduct(
      product,
      '',
      filter,
      this.api.identityUserId(),
      this.api.ownedAccessConsumers(),
    )).length;
  }

  badges(product: DataProduct) {
    return relationshipBadges(product, this.api.identityUserId(), this.api.ownedAccessConsumers());
  }

  consumerSummary(product: DataProduct) {
    return accessConsumerSummary(product.id, this.api.ownedAccessConsumers());
  }

  consumerBreakdown(product: DataProduct): string {
    const summary = this.consumerSummary(product);
    return `${summary.persons} ${summary.persons === 1 ? 'Person' : 'Personen'} · ${summary.machines} ${summary.machines === 1 ? 'Maschine' : 'Maschinen'}`;
  }

  dataConsumerLabel(count: number): string {
    return dataConsumerCountLabel(count);
  }

  authorities(product: DataProduct) {
    return connectedAuthorities(product);
  }

  protocols(product: DataProduct) {
    return deliveryProtocols(product);
  }

  qualityMedal(product: DataProduct): QualityMedalLevel {
    return product.qualityMedal ?? 'bronze';
  }

  simulationAlerts(product: DataProduct): Array<{ eventId: string; title: string; detail: string }> {
    const value = product.additionalMetadata['simulationAlerts'];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is { eventId: string; title: string; detail: string } => Boolean(item && typeof item === 'object' && 'eventId' in item && 'title' in item && 'detail' in item));
  }

  visibleOwner(product: DataProduct): DataOwnerProfile | null {
    const isRelevantOwner = isConsumedProduct(product, this.api.identityUserId())
      || canTransferOwnership(product, this.api.identityUserId());
    return isRelevantOwner ? dataOwner(product) : null;
  }

  request(product: DataProduct): AccessRequest | null {
    return accessRequest(product);
  }

  ownershipTransferAvailable(product: DataProduct): boolean {
    return canTransferOwnership(product, this.api.identityUserId());
  }

  toggleProductMenu(productId: string): void {
    this.activeProductMenuId.update((activeId) => activeId === productId ? null : productId);
  }

  openConsumerDrawer(product: DataProduct, event: Event): void {
    if (this.consumerSummary(product).total === 0) return;
    this.consumerDrawerReturnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.consumerTypeFilter.set('all');
    this.consumerQuery.set('');
    this.bodyOverflowBeforeDrawer = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.consumerDrawerProduct.set(product);
    setTimeout(() => document.getElementById('access-consumer-close')?.focus());
  }

  closeConsumerDrawer(): void {
    if (!this.consumerDrawerProduct()) return;
    const returnFocus = this.consumerDrawerReturnFocus;
    this.consumerDrawerProduct.set(null);
    this.consumerDrawerReturnFocus = null;
    this.restoreBodyScrolling();
    queueMicrotask(() => returnFocus?.focus());
  }

  ngOnDestroy(): void {
    this.restoreBodyScrolling();
  }

  private restoreBodyScrolling(): void {
    if (this.bodyOverflowBeforeDrawer === null) return;
    document.body.style.overflow = this.bodyOverflowBeforeDrawer;
    this.bodyOverflowBeforeDrawer = null;
  }

  updateConsumerQuery(event: Event): void {
    this.consumerQuery.set((event.target as HTMLInputElement).value);
  }

  trapConsumerDrawerFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const drawer = event.currentTarget as HTMLElement;
    const focusable = [...drawer.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  consumerTypeLabel(type: OwnedAccessConsumer['consumerType']): string {
    return type === 'person' ? 'Persönlicher Zugriff · eIAM' : 'Maschineller Zugriff · M2M';
  }

  protocolLabel(protocol: OwnedAccessConsumer['grants'][number]['protocol']): string {
    return ({ http: 'REST', postgresql: 'PostgreSQL', both: 'REST & PostgreSQL' })[protocol];
  }

  variantLabel(variant: OwnedAccessConsumer['grants'][number]['variant']): string {
    return variant === 'original' ? 'Original' : 'Modifiziert';
  }

  async copyProductIdentifier(product: DataProduct): Promise<void> {
    this.activeProductMenuId.set(null);
    this.identifierCopyNotice.set(null);
    this.identifierCopyError.set(false);
    try {
      await this.writeToClipboard(product.globalId);
      this.identifierCopyNotice.set(product.globalId);
    } catch {
      this.identifierCopyError.set(true);
    }
  }

  private async writeToClipboard(value: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }
    } catch {
      // Fall back for browsers that expose the Clipboard API but deny it in the current context.
    }

    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Clipboard write failed');
  }

  startOwnershipTransfer(product: DataProduct): void {
    this.activeProductMenuId.set(null);
    this.transferTarget.set('');
    this.transferError.set(null);
    this.transferProduct.set(product);
  }

  updateTransferTarget(event: Event): void {
    this.transferTarget.set((event.target as HTMLSelectElement).value);
  }

  prepareOwnershipTransfer(): void {
    const product = this.transferProduct();
    const target = this.transferTarget();
    if (!product || !target) return;
    this.transferSubmitting.set(true);
    this.transferError.set(null);
    this.api.selectProduct(product.id);
    this.api.updateMetadata({
      additionalMetadata: {
        ...product.additionalMetadata,
        ownershipTransfer: {
          requestId: `OT-${Date.now()}`,
          status: 'pending_acceptance',
          from: 'Kassandra Valdata · ESTV',
          to: target,
          requestedAt: new Date().toISOString(),
        },
      },
    }).subscribe({
      next: () => {
        this.transferSubmitting.set(false);
        this.transferNotice.set(`Für „${product.title}“ wurde eine Transferanfrage an ${target} erstellt.`);
        this.closeOwnershipTransfer();
      },
      error: (error: Error) => {
        this.transferSubmitting.set(false);
        this.transferError.set(error.message);
      },
    });
  }

  closeOwnershipTransfer(): void {
    this.transferProduct.set(null);
    this.transferTarget.set('');
    this.transferError.set(null);
  }

  @HostListener('document:click')
  closeProductMenu(): void {
    this.activeProductMenuId.set(null);
  }

  @HostListener('document:keydown.escape')
  closeTransientUi(): void {
    if (this.consumerDrawerProduct()) this.closeConsumerDrawer();
    else if (this.transferProduct()) this.closeOwnershipTransfer();
    else this.activeProductMenuId.set(null);
  }

  classificationLabel(value: DataProduct['classification']): string {
    return ({ public: 'Öffentlich', internal: 'Intern', confidential: 'Vertraulich', restricted: 'Eingeschränkt' })[value];
  }

  lifecycleLabel(value: DataProduct['lifecycle']): string {
    return ({ draft: 'Entwurf', active: 'Aktiv', deprecated: 'Abgekündigt', retired: 'Ausser Betrieb' })[value];
  }

  productCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'Datenprodukt' : 'Datenprodukte'}`;
  }

  frequencyLabel(value: string): string {
    return ({ annual: 'Jährlich', quarterly: 'Vierteljährlich', monthly: 'Monatlich' } as Record<string, string>)[value] ?? value;
  }

  resetFilters(): void {
    this.query.set('');
    this.filter.set('all');
  }
}
