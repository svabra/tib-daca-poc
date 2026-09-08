import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DemoUser } from '../../core/demo-identity.service';

@Component({
  selector: 'daca-work-context', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<aside class="work-context" aria-label="Aktueller Arbeitskontext"><span>Aktueller Arbeitskontext</span><strong>{{ user().displayName }}</strong><small>{{ roleLabel() }} · {{ user().department || 'VBS' }} / {{ user().office || user().organization }}</small></aside>`,
  styles: [`.work-context{display:grid;justify-items:end;min-width:235px;border-left:3px solid var(--daca-red);padding:.25rem 0 .25rem 1rem;text-align:right}.work-context span{color:var(--daca-muted);font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.work-context strong{margin-top:.2rem;font-size:.86rem}.work-context small{color:var(--daca-muted);font-size:.68rem}@media(max-width:820px){.work-context{justify-items:start;width:100%;border-left:0;border-top:3px solid var(--daca-red);padding:.65rem 0 0;text-align:left}}`],
})
export class WorkContextComponent {
  readonly user = input.required<DemoUser>();
  roleLabel(): string {
    const role = this.user().primaryModelingRole ?? this.user().roles.find((item) => ['data_owner', 'deputy_data_owner', 'data_steward'].includes(item));
    return ({ data_owner: 'Data Owner', deputy_data_owner: 'Stv. Data Owner', data_steward: 'Data Steward' } as Record<string, string>)[role ?? ''] ?? 'Katalogbenutzer/in';
  }
}
