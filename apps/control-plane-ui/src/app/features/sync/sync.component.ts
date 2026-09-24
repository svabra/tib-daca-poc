import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { ControlPlaneApiService } from '../../core/control-plane-api.service';

@Component({
  selector: 'daca-sync',
  standalone: true,
  imports: [StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div><p class="daca-eyebrow">Historical PoC configuration</p><h1>Synchronization records</h1><p>These prototype records retain earlier synchronization scenarios. DaCa manages metadata centrally and this service transfers no catalog resources.</p></div>
      <button class="daca-button" type="button" disabled>Create sync intent</button>
    </section>
    <p class="daca-alert"><strong>No catalog-resource synchronization runs.</strong> These historical records do not change the central catalog's operating model.</p>

    <section class="sync-grid">
      @for (config of api.syncConfigurations(); track config.id) {
        <article class="daca-card sync-card">
          <div class="daca-card-header"><div><p class="daca-eyebrow">{{ config.direction }} · {{ config.schedule }}</p><h2>{{ config.name }}</h2></div><daca-status-badge [tone]="config.lastValidation === 'valid' ? 'green' : 'orange'">{{ config.lastValidation }}</daca-status-badge></div>
          <div class="daca-card-body">
            <div class="sync-route"><div><span>Source</span><strong>{{ api.catalogName(config.sourceId) }}</strong></div><i>→</i><div><span>Target</span><strong>{{ api.catalogName(config.targetId) }}</strong></div></div>
            <dl>
              <div><dt>Resource scopes</dt><dd><div class="scope-tags">@for (scope of config.resourceScopes; track scope) { <span [class.is-policy]="scope === 'policies'">{{ scope }}</span> }</div></dd></div>
              <div><dt>Trust grant</dt><dd><code>{{ config.trustGrantId }}</code></dd></div>
              <div><dt>Conflict rule</dt><dd>Origin wins</dd></div>
              <div><dt>Transport</dt><dd>No resource transfer</dd></div>
            </dl>
          </div>
          <div class="sync-card-footer">
            <span>{{ config.enabled ? 'Previously enabled in PoC' : 'Inactive PoC record' }}</span>
          </div>
        </article>
      }
    </section>
  `,
})
export class SyncComponent {
  readonly api = inject(ControlPlaneApiService);
}
