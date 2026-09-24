import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StatusBadgeComponent, DacaStatusTone } from '@bit-daca/design-system';
import { ControlPlaneApiService } from '../../core/control-plane-api.service';
import { TrustGrant } from '../../core/control-plane.models';

@Component({
  selector: 'daca-trust',
  standalone: true,
  imports: [DatePipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div><p class="daca-eyebrow">Historical PoC configuration</p><h1>Directed trust records</h1><p>These prototype records describe former provider and consumer scenarios. DaCa manages catalog metadata centrally.</p></div>
      <button class="daca-button" type="button" disabled>Propose trust grant</button>
    </section>
    <div class="trust-explainer">
      <div><span>Provider</span><strong>Owns and signs resources</strong></div><i>→ scoped grant →</i><div><span>Consumer</span><strong>Receives read-only copies</strong></div>
      <p><strong>Bilateral ≠ automatic.</strong> Two independent arrows are required.</p>
    </div>
    <section class="daca-card">
      <div class="daca-card-header"><h2>Configured relationships</h2><span>{{ api.trustGrants().length }} directed grants</span></div>
      <div class="daca-table-wrap">
        <table class="daca-table trust-table">
          <thead><tr><th>Direction</th><th>State</th><th>Allowed resources</th><th>Filters</th><th>Validity</th></tr></thead>
          <tbody>
            @for (grant of api.trustGrants(); track grant.id) {
              <tr>
                <td><div class="trust-direction"><strong>{{ api.catalogName(grant.providerId) }}</strong><span>provides to ↓</span><strong>{{ api.catalogName(grant.consumerId) }}</strong></div></td>
                <td><daca-status-badge [tone]="stateTone(grant.state)">{{ grant.state }}</daca-status-badge></td>
                <td><div class="scope-tags">@for (scope of grant.resourceTypes; track scope) { <span [class.is-policy]="scope === 'policies'">{{ scope }}</span> }</div></td>
                <td><small>{{ grant.ownerFilter ? 'owner = ' + grant.ownerFilter : grant.domainFilter ? 'domain = ' + grant.domainFilter : grant.productFilter ? 'product = ' + grant.productFilter : 'No additional filter' }}</small></td>
                <td><small>{{ grant.validFrom | date: 'dd MMM yyyy' }}<br>to {{ grant.validUntil | date: 'dd MMM yyyy' }}</small></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    <p class="daca-alert is-warning trust-policy-note"><strong>Policy sharing is excluded by default.</strong> It must be selected in both the approved grant and sync intent; the current POC records this intent but does not exchange resources.</p>
  `,
})
export class TrustComponent {
  readonly api = inject(ControlPlaneApiService);
  stateTone(state: TrustGrant['state']): DacaStatusTone {
    return state === 'approved' ? 'green' : state === 'draft' || state === 'pending' ? 'orange' : state === 'suspended' || state === 'revoked' ? 'red' : 'neutral';
  }
}
