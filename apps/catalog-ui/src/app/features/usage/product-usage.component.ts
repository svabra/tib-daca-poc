import { DOCUMENT, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { ClipboardService } from '../../core/clipboard.service';
import {
  DataProduct,
  EndpointDescriptor,
  ProductEffectiveAccessGrant,
  ProductEffectiveAccessResponse,
  ProductQualityMapping,
  ProductQualityWorkspace,
  StoredAccessRequest,
} from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { QualityMedalComponent } from '../../shared/quality-medal.component';
import {
  DictionaryFieldPresentation,
  endpointIsInternal,
  filterDictionaryFields,
  PostgreSQLQuickstart,
  postgreSQLQuickstart,
  presentDictionaryFields,
  RestQuickstart,
  restQuickstart,
} from './product-usage.presenter';

@Component({
  selector: 'daca-product-usage',
  standalone: true,
  imports: [DatePipe, ProductWorkspaceNavComponent, QualityMedalComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-product-workspace-nav
      [productId]="productId"
      [productTitle]="product()?.title ?? 'Datenprodukt wird geladen'"
      activeSection="usage"
    />

    <section class="daca-page-heading product-usage-heading">
      <div>
        <p class="daca-eyebrow">Datenprodukt · Daten &amp; Nutzung</p>
        <h1>Datenprodukt verstehen und nutzen</h1>
        <p>Felder fachlich einordnen und dokumentierte Schnittstellen sicher in eigene Werkzeuge übernehmen.</p>
      </div>
      @if (quality(); as currentQuality) {
        <daca-quality-medal [medal]="currentQuality.quality.medal" [score]="currentQuality.quality.score" />
      }
    </section>

    <section class="daca-card product-usage-safety" aria-labelledby="usage-safety-title">
      <div>
        <p class="daca-eyebrow">Sicherer Schnellstart</p>
        <h2 id="usage-safety-title">Metadaten kopieren, keinen Datenzugriff ausführen</h2>
      </div>
      <p>Diese Seite sendet keine Anfrage an ein Datenprodukt. DaCa zeigt keine Datensätze oder Zugangsdaten. Kopierte Beispiele enthalten ausschliesslich dokumentierte Verbindungsparameter und gewähren noch keinen Zugriff.</p>
    </section>

    <div class="product-usage-feedback" aria-live="polite" aria-atomic="true">
      @if (copiedKey()) { <span class="is-success">In die Zwischenablage kopiert.</span> }
      @if (copyError()) { <span class="is-error">{{ copyError() }}</span> }
    </div>

    @if (loading()) {
      <section class="daca-card product-usage-state" role="status">
        <span class="product-usage-loader" aria-hidden="true"></span>
        <div><strong>Daten &amp; Nutzung werden geladen</strong><p>Schema und Schnittstellen werden aus dem Katalog gelesen.</p></div>
      </section>
    } @else if (error()) {
      <section class="daca-card product-usage-state is-error" role="alert">
        <span aria-hidden="true">!</span>
        <div><strong>Daten &amp; Nutzung nicht verfügbar</strong><p>{{ error() }}</p></div>
        <button type="button" class="daca-button is-secondary" (click)="load()">Erneut versuchen</button>
      </section>
    } @else if (product(); as currentProduct) {
      <section id="data-dictionary" class="product-dictionary" aria-labelledby="product-dictionary-title">
        <header>
          <div>
            <p class="daca-eyebrow">Datenwörterbuch</p>
            <h2 id="product-dictionary-title">Was bedeuten die Felder?</h2>
            <p>{{ dictionaryFields().length }} Felder · {{ completeFieldCount() }} vollständig beschrieben</p>
          </div>
          @if (dictionaryFields().length > 0) {
            <label class="product-dictionary-search">
              <span>Felder durchsuchen</span>
              <input
                type="search"
                [value]="searchQuery()"
                (input)="searchQuery.set($any($event.target).value)"
                placeholder="Name, Datentyp, Bedeutung oder Ontologie"
              >
            </label>
          }
        </header>

        @if (dictionaryFields().length === 0) {
          <section class="daca-card product-usage-empty">
            <span aria-hidden="true">i</span>
            <div>
              <h3>Noch kein Feldschema dokumentiert</h3>
              @if (isOwner()) {
                <p>Ergänzen Sie das technische Schema und die fachlichen Feldbeschreibungen in der Qualitätsprüfung.</p>
                <a class="daca-button is-secondary" [routerLink]="['/products', productId, 'quality']">Schema und Metadaten ergänzen</a>
              } @else {
                <p>Der Data Owner {{ currentProduct.owner }} hat für dieses Datenprodukt noch kein Feldschema veröffentlicht.</p>
              }
            </div>
          </section>
        } @else if (filteredFields().length === 0) {
          <section class="daca-card product-usage-empty">
            <span aria-hidden="true">○</span>
            <div><h3>Keine passenden Felder</h3><p>Ändern oder löschen Sie den Suchbegriff.</p><button type="button" class="daca-button is-secondary" (click)="searchQuery.set('')">Alle Felder anzeigen</button></div>
          </section>
        } @else {
          <div
            class="daca-card product-dictionary-table-wrap"
            role="region"
            aria-label="Datenwörterbuch horizontal scrollen"
            tabindex="0"
          >
            <table class="product-dictionary-table">
              <caption class="sr-only">Feldschema mit fachlicher Bedeutung und dokumentierten Metadatenlücken</caption>
              <thead><tr><th scope="col">Feld</th><th scope="col">Datentyp</th><th scope="col">Verwendung</th><th scope="col">Fachliche Bedeutung</th><th scope="col">Ontologie</th><th scope="col">Metadatenstatus</th></tr></thead>
              <tbody>
                @for (field of filteredFields(); track field.id) {
                  <tr>
                    <th scope="row"><code>{{ field.name }}</code></th>
                    <td><code>{{ field.dataType }}</code></td>
                    <td><span>{{ field.nullable ? 'Optional' : 'Pflichtfeld' }}</span>@if (field.keyField) { <small>Kernfeld</small> }</td>
                    <td>{{ field.businessDescription || 'Noch nicht beschrieben' }}</td>
                    <td>
                      @if (field.ontology; as mapping) {
                        <strong>{{ mapping.termLabel }}</strong><small>{{ mappingStatusLabel(mapping) }}</small><code>{{ mapping.termUri }}</code>
                      } @else { <span class="product-dictionary-muted">{{ field.keyField ? 'Nicht zugeordnet' : 'Nicht erforderlich' }}</span> }
                    </td>
                    <td>
                      @if (field.complete) { <span class="product-dictionary-status is-complete">Vollständig</span> }
                      @else { <span class="product-dictionary-status is-gap">Lücke</span>@for (gap of field.gaps; track gap) { <small>{{ gap }}</small> } }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <section id="endpoint-quickstart" class="product-endpoint-quickstarts" aria-labelledby="endpoint-quickstarts-title">
        <header>
          <div><p class="daca-eyebrow">Schnittstellen</p><h2 id="endpoint-quickstarts-title">So beginnen Sie mit der Nutzung</h2></div>
          <p>Die Beispiele sind statisch und enthalten bewusst keine Zugangsdaten. Interne Adressen sind nur aus dem vorgesehenen Netzwerk erreichbar.</p>
        </header>

        @if (currentProduct.endpoints.length === 0) {
          <section class="daca-card product-usage-empty"><span aria-hidden="true">i</span><div><h3>Noch keine Schnittstelle dokumentiert</h3><p>Für dieses Datenprodukt ist derzeit kein REST- oder PostgreSQL-Endpunkt im Katalog hinterlegt.</p></div></section>
        } @else {
          <div class="product-endpoint-grid">
            @for (endpoint of currentProduct.endpoints; track endpoint.id) {
              <article class="daca-card product-endpoint-card">
                <header>
                  <div><span>{{ endpoint.protocol === 'http-rest' ? 'REST' : 'PostgreSQL' }}</span><h3>{{ endpoint.title }}</h3></div>
                  @if (isInternal(endpoint)) { <strong class="product-endpoint-internal">Nur internes Netzwerk</strong> }
                </header>

                @if (endpoint.protocol === 'http-rest') {
                  @if (rest(endpoint); as quickstart) {
                    <dl class="product-endpoint-facts"><div><dt>Methode</dt><dd>{{ endpoint.method }}</dd></div><div><dt>Medientyp</dt><dd>{{ endpoint.mediaType }}</dd></div></dl>
                    <div class="product-endpoint-snippet"><span>Endpoint-URL</span><code>{{ quickstart.url }}</code><button type="button" (click)="copy('rest-url-' + endpoint.id, quickstart.url)">{{ copyButtonLabel('rest-url-' + endpoint.id, 'URL kopieren') }}</button></div>
                    <div class="product-endpoint-snippet"><span>PowerShell / Terminal</span><code>{{ quickstart.command }}</code><button type="button" (click)="copy('rest-command-' + endpoint.id, quickstart.command)">{{ copyButtonLabel('rest-command-' + endpoint.id, 'Befehl kopieren') }}</button></div>
                    <p class="product-endpoint-note"><code>X-DaCa-User</code> ist ausschliesslich eine PoC-Demo-Identität und keine produktive Anmeldung.</p>
                    @if (endpoint.method === 'POST') { <p class="product-endpoint-note"><code>&lt;request-body&gt;</code> ist ein Platzhalter. Struktur und Berechtigung werden vom anbietenden System vorgegeben; DaCa erfindet keine Nutzdaten.</p> }
                  } @else { <p class="daca-alert is-error">Die Endpoint-Angaben sind nicht sicher darstellbar. Es wurde kein Beispiel erzeugt.</p> }
                } @else {
                  @if (postgres(endpoint); as quickstart) {
                    <dl class="product-endpoint-facts is-postgresql"><div><dt>Host</dt><dd><code>{{ endpoint.host }}</code></dd></div><div><dt>Port</dt><dd>{{ endpoint.port }}</dd></div><div><dt>Datenbank</dt><dd><code>{{ endpoint.database }}</code></dd></div><div><dt>Schema</dt><dd><code>{{ endpoint.schema }}</code></dd></div><div><dt>Relation</dt><dd><code>{{ endpoint.relation }}</code></dd></div><div><dt>SSL-Modus</dt><dd><code>{{ endpoint.sslMode }}</code></dd></div></dl>
                    <div class="product-endpoint-snippet"><span>Verbindungsparameter ohne Zugangsdaten</span><code>{{ quickstart.connectionParameters }}</code><button type="button" (click)="copy('pg-connection-' + endpoint.id, quickstart.connectionParameters)">{{ copyButtonLabel('pg-connection-' + endpoint.id, 'Parameter kopieren') }}</button></div>
                    <div class="product-endpoint-snippet"><span>SQL-Abfrage</span><code>{{ quickstart.query }}</code><button type="button" (click)="copy('pg-query-' + endpoint.id, quickstart.query)">{{ copyButtonLabel('pg-query-' + endpoint.id, 'SQL kopieren') }}</button></div>
                  } @else { <p class="daca-alert is-error">Die Verbindungsangaben sind nicht sicher darstellbar. Es wurde kein Beispiel erzeugt.</p> }
                }
                @if (isInternal(endpoint)) { <p class="product-endpoint-note">Interne Adresse: Die Erreichbarkeit von Ihrem Arbeitsplatz wird durch DaCa nicht geprüft.</p> }
              </article>
            }
          </div>
        }
      </section>

      <section class="daca-card product-usage-access" aria-labelledby="product-usage-access-title">
        @if (isOwner()) {
          <div><p class="daca-eyebrow">Ihre Rolle · Data Owner</p><h2 id="product-usage-access-title">Nutzung und Freigaben pflegen</h2><p>Sie können Schema, Metadaten und Zugriffsfreigaben verwalten. Die Schnellstarts selbst führen keine Verbindung aus.</p></div>
          <div><a class="daca-button is-secondary" [routerLink]="['/products', productId, 'quality']">Datenwörterbuch pflegen</a><a class="daca-button" [routerLink]="['/products', productId, 'access']">Freigaben verwalten</a></div>
        } @else {
          <div><p class="daca-eyebrow">Ihre Rolle · Data Consumer</p>
            @if (effectiveGrants().length > 0) {
              <h2 id="product-usage-access-title">Freigabe dokumentiert</h2>
              @for (grant of effectiveGrants(); track $index) {
                <p>Für Ihre Demo-Identität ist eine veröffentlichte Freigabe für <strong>{{ grantProtocolLabel(grant) }}</strong> dokumentiert. Sie gilt vom {{ grant.validFrom | date: 'dd.MM.yyyy' }} bis {{ grant.validUntil | date: 'dd.MM.yyyy' }}. Das Zielsystem prüft zusätzlich die vereinbarten Laufzeitregeln{{ grantAvailabilityLabel(grant) }}.</p>
              }
            } @else if (accessStatusError()) {
              <h2 id="product-usage-access-title">Zugriffsstatus derzeit nicht verfügbar</h2>
              <p class="daca-alert is-error" role="alert">Der wirksame Zugriffsstatus konnte nicht vollständig geladen werden. Deshalb wird hier keine neue Anfrage angeboten.</p>
            } @else if (latestRequest(); as request) {
              <h2 id="product-usage-access-title">Zugriffsantrag in Bearbeitung</h2>
              <p>Ihr jüngster Katalogantrag <strong>{{ request.requestNumber }}</strong> hat den Status «{{ requestStatusLabel(request.status) }}» und gilt für den beantragten Zeitraum {{ request.validFrom | date: 'dd.MM.yyyy' }} bis {{ request.validUntil | date: 'dd.MM.yyyy' }}. Der technische Zugriff wird weiterhin am Zielsystem geprüft.</p>
            } @else {
              <h2 id="product-usage-access-title">Zugriff separat beantragen</h2>
              <p>Die dokumentierten Endpunkte sind keine Zugriffsfreigabe. Stellen Sie vor der Nutzung einen Antrag mit Zweck, Rechtsgrundlage und Gültigkeitszeitraum.</p>
            }
          </div>
          <div>
            @if (effectiveGrants().length > 0) {
              <a class="daca-button is-secondary" [routerLink]="['/products', productId, 'history']">Änderungsverlauf öffnen</a>
            } @else if (!accessStatusError()) {
              @if (canRequestAgain()) { <a class="daca-button" [routerLink]="['/products', productId, 'access-request']">Zugriff anfragen</a> }
              @else { <a class="daca-button is-secondary" routerLink="/products" [queryParams]="{ relationship: 'requestedByMe' }">Meine Anfrage anzeigen</a> }
            }
          </div>
        }
      </section>
    }
  `,
})
export class ProductUsageComponent implements OnDestroy {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly clipboard = inject(ClipboardService);
  private readonly document = inject(DOCUMENT);
  readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly product = signal<DataProduct | null>(null);
  readonly quality = signal<ProductQualityWorkspace | null>(null);
  readonly requests = signal<readonly StoredAccessRequest[]>([]);
  readonly effectiveAccess = signal<ProductEffectiveAccessResponse | null>(null);
  readonly requestStatusError = signal(false);
  readonly policyStatusError = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly copiedKey = signal<string | null>(null);
  readonly copyError = signal<string | null>(null);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private loadGeneration = 0;

  readonly dictionaryFields = computed<readonly DictionaryFieldPresentation[]>(() => {
    const quality = this.quality();
    return quality ? presentDictionaryFields(quality.fields, quality.mappings) : [];
  });
  readonly filteredFields = computed(() => filterDictionaryFields(this.dictionaryFields(), this.searchQuery()));
  readonly completeFieldCount = computed(() => this.dictionaryFields().filter((field) => field.complete).length);
  readonly latestRequest = computed(() => [...this.requests()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null);
  readonly effectiveGrants = computed<readonly ProductEffectiveAccessGrant[]>(() => {
    const status = this.effectiveAccess();
    return status?.granted ? status.grants : [];
  });
  readonly accessStatusError = computed(() => this.requestStatusError() || this.policyStatusError());

  constructor() {
    effect(() => {
      this.api.identityUserId();
      this.load();
    });
  }

  ngOnDestroy(): void {
    if (this.copyTimer) clearTimeout(this.copyTimer);
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
  }

  load(): void {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.error.set(null);
    this.product.set(null);
    this.quality.set(null);
    this.effectiveAccess.set(null);
    this.requestStatusError.set(false);
    this.policyStatusError.set(false);
    if (!this.productId) {
      this.error.set('Die Produkt-ID fehlt in der Adresse.');
      this.loading.set(false);
      return;
    }
    forkJoin({
      product: this.api.loadProduct(this.productId),
      quality: this.api.loadProductQuality(this.productId),
      requests: this.api.loadMyAccessRequests(this.productId, true).pipe(
        map((items) => ({ items, failed: false })),
        catchError(() => of({ items: [] as readonly StoredAccessRequest[], failed: true })),
      ),
      effectiveAccess: this.api.loadEffectiveAccess(this.productId).pipe(
        map((status) => ({ status, failed: false })),
        catchError(() => of({ status: null, failed: true })),
      ),
    }).subscribe({
      next: ({ product, quality, requests, effectiveAccess }) => {
        if (generation !== this.loadGeneration) return;
        if (product.id !== this.productId || quality.quality.dataProductId !== this.productId) {
          this.error.set('Die geladenen Katalogdaten stimmen nicht mit dem angeforderten Datenprodukt überein.');
          this.loading.set(false);
          return;
        }
        this.product.set(product);
        this.quality.set(quality);
        this.requests.set(requests.items);
        this.effectiveAccess.set(effectiveAccess.status);
        this.requestStatusError.set(requests.failed);
        this.policyStatusError.set(
          effectiveAccess.failed
          || Boolean(effectiveAccess.status?.granted && effectiveAccess.status.grants.length === 0)
          || Boolean(effectiveAccess.status && !effectiveAccess.status.granted && effectiveAccess.status.grants.length > 0),
        );
        this.loading.set(false);
        this.scrollToRequestedSection();
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.error.set('Die Katalog-API konnte Schema oder Schnittstellen nicht laden. Es werden keine Ersatzdaten angezeigt.');
        this.loading.set(false);
      },
    });
  }

  isOwner(): boolean {
    return this.product()?.ownerUserId === this.api.identityUserId();
  }

  mappingStatusLabel(mapping: ProductQualityMapping): string {
    return ({ confirmed: 'Bestätigt', suggested: 'Vorgeschlagen', unresolved: 'Ungeklärt' })[mapping.status];
  }

  rest(endpoint: EndpointDescriptor): RestQuickstart | null {
    return endpoint.protocol === 'http-rest' ? restQuickstart(endpoint, this.api.identityUserId()) : null;
  }

  postgres(endpoint: EndpointDescriptor): PostgreSQLQuickstart | null {
    return endpoint.protocol === 'postgresql' ? postgreSQLQuickstart(endpoint) : null;
  }

  isInternal(endpoint: EndpointDescriptor): boolean {
    return endpointIsInternal(endpoint);
  }

  async copy(key: string, value: string): Promise<void> {
    this.copyError.set(null);
    try {
      await this.clipboard.writeText(value);
      this.copiedKey.set(key);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiedKey.set(null), 2200);
    } catch {
      this.copiedKey.set(null);
      this.copyError.set('Kopieren ist in diesem Browser nicht verfügbar. Markieren Sie den Text manuell.');
    }
  }

  copyButtonLabel(key: string, defaultLabel: string): string {
    return this.copiedKey() === key ? 'Kopiert' : defaultLabel;
  }

  canRequestAgain(): boolean {
    if (this.effectiveGrants().length > 0 || this.accessStatusError()) return false;
    const status = this.latestRequest()?.status;
    return !status || status === 'rejected' || status === 'withdrawn';
  }

  grantProtocolLabel(grant: ProductEffectiveAccessGrant): string {
    const labels = grant.protocols.map((protocol) => protocol === 'http' ? 'REST' : 'PostgreSQL');
    return labels.length > 0 ? labels.join(' und ') : 'die dokumentierte Schnittstelle';
  }

  grantAvailabilityLabel(grant: ProductEffectiveAccessGrant): string {
    const availability = grant.weeklyAvailability;
    if (!availability) return '';
    const weekdays = availability.weekdays.map((day) => ({
      monday: 'Mo', tuesday: 'Di', wednesday: 'Mi', thursday: 'Do', friday: 'Fr', saturday: 'Sa', sunday: 'So',
    })[day]).join(', ');
    return ` (${weekdays}, ${availability.startTime}–${availability.endTime} ${availability.timeZone})`;
  }

  requestStatusLabel(status: StoredAccessRequest['status']): string {
    return {
      submitted: 'Anfrage eingegangen',
      identity_review: 'Identität wird geprüft',
      legal_review: 'Rechtslage wird geprüft',
      conditions_review: 'Zugriffskonditionen werden geprüft',
      approved_policy_pending: 'Genehmigt, Policy wird publiziert',
      granted_modified: 'Zugriff gewährt (modifiziert)',
      granted_original: 'Zugriff gewährt (original)',
      rejected: 'Nicht gewährt',
      withdrawn: 'Zurückgezogen',
    }[status];
  }

  private scrollToRequestedSection(): void {
    const fragment = this.route.snapshot.fragment;
    if (fragment !== 'data-dictionary' && fragment !== 'endpoint-quickstart') return;
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      const target = this.document.getElementById(fragment);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'start' });
      }
      this.scrollTimer = null;
    }, 0);
  }
}
