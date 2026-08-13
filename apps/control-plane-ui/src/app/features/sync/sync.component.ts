import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { ControlPlaneApiService } from '../../core/control-plane-api.service';
import { SyncConfiguration } from '../../core/control-plane.models';

@Component({
  selector: 'daca-sync',
  standalone: true,
  imports: [StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div><p class="daca-eyebrow">Declarative configuration</p><h1>Synchronization intent</h1><p>Define future resource flows. This POC validates and stores intent but never initiates federation traffic.</p></div>
      <button class="daca-button" type="button" disabled>Create sync intent</button>
    </section>
    <p class="daca-alert"><strong>No resource synchronization runs in this POC.</strong> These declarations prepare stable trust, scope and conflict semantics for a later federation protocol.</p>

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
              <div><dt>Transport</dt><dd>Future HTTP federation protocol</dd></div>
            </dl>
          </div>
          <div class="sync-card-footer">
            <span>{{ config.enabled ? 'Intent enabled' : 'Intent disabled' }}</span>
            <button class="sync-switch" type="button" role="switch" [attr.aria-checked]="config.enabled" [disabled]="api.usingFallback() || config.lastValidation !== 'valid'" (click)="toggle(config)" [attr.aria-label]="'Toggle ' + config.name"><span></span></button>
          </div>
        </article>
      }
    </section>
    @if (feedback()) { <p class="daca-alert is-warning" role="status">{{ feedback() }}</p> }
    @if (api.mutationError()) { <p class="daca-alert is-error" role="alert">{{ api.mutationError() }}</p> }
  `,
})
export class SyncComponent {
  readonly api = inject(ControlPlaneApiService);
  readonly feedback = signal('');
  toggle(config: SyncConfiguration): void {
    if (config.lastValidation !== 'valid') {
      this.feedback.set('This sync intent is blocked until its directed trust grant is approved.');
      return;
    }
    this.feedback.set('The desired state was sent to the control-plane API. No federation traffic is started.');
    this.api.setSyncEnabled(config, !config.enabled);
  }
}
