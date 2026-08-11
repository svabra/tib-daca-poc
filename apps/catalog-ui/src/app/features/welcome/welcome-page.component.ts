import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-didaca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct, StoredAccessRequest } from '../../core/catalog.models';
import { catalogProductMatches } from './welcome-search';

type SearchStatus = 'idle' | 'empty' | 'match' | 'none';

@Component({
  selector: 'didaca-welcome-page',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="welcome-page">
      <section class="welcome-hero" aria-labelledby="welcome-title">
        <div class="welcome-hero-copy">
          <p class="didaca-eyebrow">DaCa</p>
          <h1 id="welcome-title">Willkommen im zentralen Data Catalog der Schweizer Bundesverwaltung</h1>
          <p class="welcome-lead">
            Entdecken, beschreiben und verantwortungsvoll freigeben: Hier finden Sie Metadaten,
            Schnittstellen, Herkunft und Zugriffsregeln Ihrer Datenprodukte an einem Ort.
          </p>
          <div class="welcome-hero-actions">
            <a class="didaca-button" routerLink="/metadata">Meine Datenprodukte öffnen</a>
            <a class="didaca-button is-secondary" routerLink="/exposure">Freigabe konfigurieren</a>
          </div>
          <p class="welcome-context">
            <span>Proof of Concept</span>
            PoC Data Catalog · Anmeldung noch nicht verfügbar
          </p>
        </div>

        <form class="welcome-search" role="search" (submit)="submitSearch($event)">
          <div>
            <p class="didaca-eyebrow">Katalog durchsuchen</p>
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
              [value]="searchQuery()"
              (input)="updateSearch($any($event.target).value)"
            >
            <button class="didaca-button" type="submit">Suchen</button>
          </div>
          <div id="catalog-search-feedback" class="welcome-search-feedback" aria-live="polite">
            @switch (searchStatus()) {
              @case ('empty') {
                <p class="is-warning">Bitte geben Sie einen Suchbegriff ein.</p>
              }
              @case ('match') {
                <p class="is-match">{{ searchResults().length }} {{ searchResults().length === 1 ? 'Datenprodukt gefunden' : 'Datenprodukte gefunden' }}</p>
                <ul class="welcome-search-results" aria-label="Gefundene Datenprodukte">
                  @for (result of searchResults(); track result.id) {
                    <li>
                      <a [routerLink]="['/products', result.id, 'metadata']">
                        <span>{{ result.title }}</span>
                        <small>{{ result.owner }} · {{ result.domain }}</small>
                      </a>
                    </li>
                  }
                </ul>
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
            <p class="didaca-eyebrow">Für Kassandra Valdata</p>
            <h2 id="welcome-alerts-title">Handlungsbedarf</h2>
          </div>
          @if (!ownerInboxLoading()) {
            <span><strong>{{ ownerRequests().length }}</strong> {{ ownerRequests().length === 1 ? 'offene Aufgabe' : 'offene Aufgaben' }}</span>
          }
        </div>

        @if (ownerInboxLoading()) {
          <div class="didaca-card welcome-alert-empty" aria-live="polite">Aufgaben werden geladen…</div>
        } @else if (ownerRequests().length) {
          <div class="welcome-alert-list">
            @for (request of ownerRequests(); track request.id) {
              <article class="didaca-card welcome-alert-item">
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
                <a class="didaca-button is-secondary" routerLink="/exposure">Anfrage prüfen</a>
              </article>
            }
          </div>
        } @else {
          <div class="didaca-card welcome-alert-empty">Keine offenen Aufgaben. Ihre Datenprodukte benötigen aktuell keinen Entscheid.</div>
        }
      </section>

      <section class="welcome-tasks" aria-labelledby="welcome-tasks-title">
        <div class="welcome-section-heading">
          <div>
            <p class="didaca-eyebrow">Direkteinstieg</p>
            <h2 id="welcome-tasks-title">Was möchten Sie tun?</h2>
          </div>
          <p>Wählen Sie einen Bereich, um mit dem Beispiel-Datenprodukt zu arbeiten.</p>
        </div>

        <div class="welcome-task-grid">
          <a class="welcome-task-card" routerLink="/metadata">
            <span class="welcome-task-number" aria-hidden="true">01</span>
            <span class="welcome-task-copy">
              <strong>Datenprodukt pflegen</strong>
              <span>Metadaten, Qualität und REST-/PostgreSQL-Endpunkte prüfen und bearbeiten.</span>
            </span>
            <span class="welcome-task-link">Meine Datenprodukte öffnen</span>
          </a>
          <a class="welcome-task-card" routerLink="/exposure">
            <span class="welcome-task-number" aria-hidden="true">02</span>
            <span class="welcome-task-copy">
              <strong>Freigabe verwalten</strong>
              <span>Benutzergruppen, Zeitraum und KOBY-Metadatenzugriff über MCP festlegen.</span>
            </span>
            <span class="welcome-task-link">Freigabe & MCP öffnen</span>
          </a>
          <a class="welcome-task-card" routerLink="/lineage">
            <span class="welcome-task-number" aria-hidden="true">03</span>
            <span class="welcome-task-copy">
              <strong>Herkunft nachvollziehen</strong>
              <span>Lineage, Transformationen und append-only Provenienz einsehen.</span>
            </span>
            <span class="welcome-task-link">Lineage öffnen</span>
          </a>
          <a class="welcome-task-card" routerLink="/security">
            <span class="welcome-task-number" aria-hidden="true">04</span>
            <span class="welcome-task-copy">
              <strong>Zugriff prüfen</strong>
              <span>PBAC-Regeln sowie die Projektion nach OPA und PostgreSQL kontrollieren.</span>
            </span>
            <span class="welcome-task-link">Sicherheit öffnen</span>
          </a>
        </div>
      </section>

      <section class="welcome-featured didaca-card" aria-labelledby="welcome-product-title">
        <div class="welcome-product-main">
          <div class="welcome-product-heading">
            <div>
              <p class="didaca-eyebrow">Beispiel-Datenprodukt</p>
              <h2 id="welcome-product-title">{{ productTitle() }}</h2>
            </div>
            <didaca-status-badge tone="red">Eingeschränkt</didaca-status-badge>
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
            <a class="didaca-button" routerLink="/metadata">Meine Datenprodukte öffnen</a>
            <a class="didaca-button is-secondary" routerLink="/exposure">Freigabe & MCP</a>
          </div>
        </div>

        <aside class="welcome-mcp-note" aria-labelledby="welcome-mcp-title">
          <span class="welcome-mcp-label">KOBY · AI Services</span>
          <h3 id="welcome-mcp-title">Metadatenzugriff über MCP</h3>
          <p>
            KOBY erhält nur nach ausdrücklicher Freigabe Zugriff auf Metadaten.
            Produktdaten und Zugangsdaten bleiben ausgeschlossen.
          </p>
          <a routerLink="/exposure">MCP-Freigabe prüfen</a>
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
  readonly product = computed(() => this.api.product());
  readonly productTitle = computed(() =>
    this.product().globalId === 'urn:didaca:ch:estv:tax-statistics-by-canton'
      ? 'ESTV-Steuerstatistik nach Kanton'
      : this.product().title,
  );
  readonly productDescription = computed(() =>
    this.product().globalId === 'urn:didaca:ch:estv:tax-statistics-by-canton'
      ? 'Aggregierte jährliche Steuerstatistiken der Schweizer Kantone. Das Datenprodukt enthält synthetische Werte für den DaCa-Proof-of-Concept und keine Personendaten.'
      : this.product().description,
  );
  readonly searchQuery = signal('');
  readonly searchStatus = signal<SearchStatus>('idle');
  readonly searchResults = signal<readonly DataProduct[]>([]);
  readonly ownerRequests = this.api.ownerAccessRequests;
  readonly ownerInboxLoading = this.api.ownerAccessRequestLoading;

  requestProductTitle(request: StoredAccessRequest): string {
    return this.api.products().find((product) => product.id === request.dataProductId)?.title ?? 'Datenprodukt';
  }

  updateSearch(value: string): void {
    this.searchQuery.set(value);
    this.searchStatus.set('idle');
  }

  submitSearch(event: Event): void {
    event.preventDefault();
    const query = this.searchQuery();
    if (!query.trim()) {
      this.searchResults.set([]);
      this.searchStatus.set('empty');
      return;
    }

    const matches = this.api.products().filter((candidate) => catalogProductMatches(query, [
      candidate.title,
      candidate.description,
      candidate.owner,
      candidate.domain,
      candidate.globalId,
      candidate.updateFrequency,
      ...candidate.keywords,
      ...candidate.endpoints.map((endpoint) => endpoint.title),
      JSON.stringify(candidate.additionalMetadata),
      'Öffentliche Finanzen Steuern Kantone Gemeinden Statistik Bundessteuern',
    ]));
    this.searchResults.set(matches);
    this.searchStatus.set(matches.length > 0 ? 'match' : 'none');
  }
}
