import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StatusBadgeComponent, DidacaStatusTone } from '@bit-didaca/design-system';
import { ControlPlaneApiService } from '../../core/control-plane-api.service';
import { CatalogInstance } from '../../core/control-plane.models';

@Component({
  selector: 'didaca-instances',
  standalone: true,
  imports: [DatePipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="didaca-page-heading">
      <div><p class="didaca-eyebrow">Control-plane inventory</p><h1>Catalog instances</h1><p>Registered autonomous catalogs, declared capabilities and observed operational state.</p></div>
      <button class="didaca-button" type="button" disabled title="Registration API is available; creation is intentionally disabled in preview">Register catalog</button>
    </section>
    <p class="didaca-alert">Registration records endpoint and capability declarations only. Data and credentials remain with each catalog owner.</p>

    <section class="instance-grid" aria-label="Registered catalog instances">
      @for (catalog of api.catalogs(); track catalog.id) {
        <article class="didaca-card instance-card">
          <div class="instance-card-top"><span class="instance-monogram">{{ monogram(catalog.name) }}</span><didaca-status-badge [tone]="healthTone(catalog.health)">{{ catalog.health }}</didaca-status-badge></div>
          <h2>{{ catalog.name }}</h2><p>{{ catalog.organization }}</p>
          <dl>
            <div><dt>Environment</dt><dd>{{ catalog.environment }}</dd></div>
            <div><dt>Endpoint</dt><dd><code>{{ catalog.endpoint }}</code></dd></div>
            <div><dt>Version</dt><dd>{{ catalog.version }}</dd></div>
            <div><dt>Latency</dt><dd>{{ catalog.latencyMs === null ? '—' : catalog.latencyMs + ' ms' }}</dd></div>
            <div><dt>Configuration</dt><dd [class.is-drift]="catalog.desiredRevision !== catalog.observedRevision">{{ catalog.observedRevision }} / {{ catalog.desiredRevision }}</dd></div>
            <div><dt>Last seen</dt><dd>{{ catalog.lastSeenAt | date: 'dd MMM, HH:mm:ss' }}</dd></div>
          </dl>
          <div class="instance-capabilities">@for (capability of catalog.capabilities; track capability) { <span>{{ capability }}</span> }</div>
        </article>
      }
    </section>
  `,
})
export class InstancesComponent {
  readonly api = inject(ControlPlaneApiService);
  monogram(name: string): string { return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  healthTone(health: CatalogInstance['health']): DidacaStatusTone {
    return health === 'healthy' ? 'green' : health === 'degraded' ? 'orange' : 'red';
  }
}

