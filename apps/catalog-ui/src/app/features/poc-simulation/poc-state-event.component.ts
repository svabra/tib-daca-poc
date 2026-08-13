import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DacaGlossaryTermComponent } from '@bit-daca/design-system';
import { catchError, forkJoin, of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { PocSimulationEventType, PocSimulationEventWire, PocSimulationTriggerWire } from './poc-simulation.models';

const COPY = {
  quality_below_threshold: {
    eyebrow: 'Qualitätsereignis',
    title: 'Simulationsereignis: Datenqualität zu tief',
    description: 'Die Qualitätsmessung meldet 58 % bei einem Mindestwert von 80 %. Die Bronze-, Silber-, Gold- oder Platinum-Reife bleibt davon getrennt.',
    action: 'Ereignis «Datenqualität zu tief» auslösen',
  },
  not_discoverable: {
    eyebrow: 'Auffindbarkeitsereignis',
    title: 'Simulationsereignis: Ihr Datenprodukt ist nicht auffindbar',
    description: 'Das ausgewählte Produkt wird im Katalog für andere Identitäten unsichtbar. Der Data Owner erhält eine konkrete Aufgabe.',
    action: 'Ereignis «Datenprodukt nicht auffindbar» auslösen',
  },
  isbo_restricted: {
    eyebrow: 'Sicherheitsereignis',
    title: 'Simulationsereignis: Ihr Datenprodukt wurde durch den ISBO eingeschränkt',
    description: 'Auffindbarkeit und Klassifikation werden eingeschränkt. Bereits aktive Freigaben bleiben bestehen und müssen bewusst geprüft werden.',
    action: 'Ereignis «Durch ISBO eingeschränkt» auslösen',
  },
} as const;

@Component({
  selector: 'daca-poc-state-event',
  standalone: true,
  imports: [DatePipe, RouterLink, DacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div><p class="daca-eyebrow">{{ copy().eyebrow }} · <daca-glossary-term term="PoC" /></p><h1>{{ copy().title }}</h1><p>{{ copy().description }}</p></div>
      <a routerLink="/poc-simulation">Alle Simulationen</a>
    </section>

    @if (eventType() === 'isbo_restricted') {
      <p class="daca-alert is-warning"><strong><daca-glossary-term term="ISBO" />:</strong> Die Simulation widerruft keine aktiven Freigaben. Damit bleibt der bewusste Sicherheitsentscheid sichtbar und prüfbar.</p>
    }

    @if (loading()) {
      <div class="daca-card simulation-empty">Simulationsdaten werden geladen…</div>
    } @else if (ownedFixtureProducts().length) {
      <div class="simulation-products">
        @for (product of ownedFixtureProducts(); track product.id) {
          <article class="daca-card simulation-product-row">
            <div><small>{{ product.domain }} · Revision {{ product.revision }}</small><h2>{{ product.title }}</h2><p>{{ product.description }}</p></div>
            @if (activeFor(product.id); as event) {
              <div class="simulation-active"><strong>Ereignis aktiv</strong><span>Ausgelöst {{ event.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</span><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="reset(event)">Ereignis zurücksetzen</button></div>
            } @else {
              <button class="daca-button" type="button" [disabled]="busy() || anyActiveFor(product.id)" (click)="trigger(product)">{{ copy().action }}</button>
            }
          </article>
        }
      </div>
    } @else {
      <div class="daca-card simulation-empty"><h2>Noch kein Fixture-Produkt vorhanden</h2><p>Reichen Sie zuerst eines der synthetischen Produkte über die echte Metadaten-Publikationsschnittstelle ein.</p><a class="daca-button" routerLink="/poc-simulation/product-submitted">Einreichung simulieren</a></div>
    }

    @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }}</p> }
  `,
})
export class PocStateEventComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CatalogApiService);
  readonly identity = inject(DemoIdentityService);
  readonly eventType = signal(this.route.snapshot.data['eventType'] as Exclude<PocSimulationEventType, 'product_submitted'>);
  readonly copy = computed(() => COPY[this.eventType()]);
  readonly events = signal<readonly PocSimulationEventWire[]>([]);
  readonly fixtureProductIds = signal<ReadonlySet<string>>(new Set());
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly notice = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly ownedFixtureProducts = computed(() => this.api.products().filter((product) => product.ownerUserId === this.identity.userId() && this.fixtureProductIds().has(product.id)));

  constructor() { this.load(); }

  activeFor(productId: string): PocSimulationEventWire | null {
    return this.events().find((event) => event.productId === productId && event.eventType === this.eventType() && event.active) ?? null;
  }

  anyActiveFor(productId: string): boolean {
    return this.events().some((event) => event.productId === productId && event.active);
  }

  trigger(product: DataProduct): void {
    this.busy.set(true); this.error.set(null); this.notice.set(null);
    this.http.post<PocSimulationTriggerWire>(`/api/v1/poc/data-products/${encodeURIComponent(product.id)}/simulation-events/${this.eventType()}`, {}, { headers: this.identity.headers() }).subscribe({
      next: () => { this.notice.set('Das Ereignis wurde ausgelöst. Produkt, Aufgaben und Alert-Badge wurden aktualisiert.'); this.finishMutation(); },
      error: (error) => { this.busy.set(false); this.error.set(error?.error?.detail ?? 'Das Ereignis konnte nicht ausgelöst werden.'); },
    });
  }

  reset(event: PocSimulationEventWire): void {
    this.busy.set(true); this.error.set(null); this.notice.set(null);
    this.http.post(`/api/v1/poc/simulation-events/${encodeURIComponent(event.id)}/reset`, {}, { headers: this.identity.headers() }).subscribe({
      next: () => { this.notice.set('Das Ereignis wurde zurückgesetzt; der Nachweis bleibt erhalten.'); this.finishMutation(); },
      error: (error) => { this.busy.set(false); this.error.set(error?.error?.detail ?? 'Das Ereignis konnte nicht zurückgesetzt werden.'); },
    });
  }

  private finishMutation(): void {
    this.api.refreshProducts(); this.api.refreshWorkflowTasks(); this.load();
  }

  private load(): void {
    this.loading.set(true);
    forkJoin({
      fixtures: this.http.get<Array<{ ownerUserId: string; injectedProductId: string | null }>>('/api/v1/poc/product-fixtures'),
      events: this.http.get<PocSimulationEventWire[]>('/api/v1/poc/simulation-events/mine', { headers: this.identity.headers() }),
    }).pipe(catchError(() => of({ fixtures: [], events: [] }))).subscribe(({ fixtures, events }) => {
      this.fixtureProductIds.set(new Set(fixtures.filter((fixture) => fixture.ownerUserId === this.identity.userId() && fixture.injectedProductId).map((fixture) => fixture.injectedProductId!)));
      this.events.set(events); this.loading.set(false); this.busy.set(false);
    });
  }
}
