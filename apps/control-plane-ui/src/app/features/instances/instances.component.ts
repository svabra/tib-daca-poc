import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StatusBadgeComponent, DacaStatusTone } from '@bit-daca/design-system';
import { ControlPlaneApiService } from '../../core/control-plane-api.service';
import { CatalogInstance } from '../../core/control-plane.models';

@Component({
  selector: 'daca-instances',
  standalone: true,
  imports: [DatePipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div><p class="daca-eyebrow">Historical PoC inventory</p><h1>Catalog records</h1><p>Earlier instance records, declared capabilities and observed operational state. DaCa is operated as one central catalog.</p></div>
      <button class="daca-button" type="button" disabled title="Registration API is available; creation is intentionally disabled in preview">Register catalog</button>
    </section>
    <p class="daca-alert">These records describe an earlier PoC scenario. The central DaCa catalog is the authoritative metadata store.</p>

    <section class="instance-grid" aria-label="Registered catalog instances">
      @for (catalog of api.catalogs(); track catalog.id) {
        <article class="daca-card instance-card">
          <div class="instance-card-top"><span class="instance-monogram">{{ monogram(catalog.name) }}</span><daca-status-badge [tone]="healthTone(catalog.health)">{{ catalog.health }}</daca-status-badge></div>
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
  healthTone(health: CatalogInstance['health']): DacaStatusTone {
    return health === 'healthy' ? 'green' : health === 'degraded' ? 'orange' : 'red';
  }
}

