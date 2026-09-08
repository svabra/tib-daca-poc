import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type DataModelWorkspaceSection = 'model' | 'mappings' | 'drift';

@Component({
  selector: 'daca-data-model-workspace-nav',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="model-breadcrumb" aria-label="Brotkrümelnavigation">
      <a routerLink="/models">Datenmodelle</a><span aria-hidden="true">›</span><strong>{{ modelTitle() }}</strong>
    </nav>
    <nav class="model-tabs" aria-label="Bereiche dieses logischen Modells">
      <a [routerLink]="['/models', modelId()]" [class.is-active]="activeSection() === 'model'" [attr.aria-current]="activeSection() === 'model' ? 'page' : null">Logisches Modell</a>
      <a [routerLink]="['/models', modelId(), 'mappings']" [class.is-active]="activeSection() === 'mappings'" [attr.aria-current]="activeSection() === 'mappings' ? 'page' : null">Zuordnungen</a>
      <a [routerLink]="['/models', modelId(), 'drift']" [class.is-active]="activeSection() === 'drift'" [attr.aria-current]="activeSection() === 'drift' ? 'page' : null">Drift</a>
    </nav>
  `,
  styles: [`
    :host{display:block;margin-bottom:1.5rem}.model-breadcrumb{display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;color:var(--daca-muted);font-size:.76rem}.model-breadcrumb a{font-weight:750}.model-breadcrumb strong{min-width:0;overflow:hidden;color:var(--daca-ink);text-overflow:ellipsis;white-space:nowrap}.model-tabs{display:flex;gap:.25rem;overflow-x:auto;border-bottom:1px solid var(--daca-border)}.model-tabs a{flex:0 0 auto;min-height:44px;padding:.75rem 1rem;border-bottom:3px solid transparent;color:var(--daca-ink);font-weight:750;text-decoration:none}.model-tabs a:hover{color:var(--daca-blue)}.model-tabs a.is-active{border-color:var(--daca-red);color:var(--daca-red-dark)}
  `],
})
export class DataModelWorkspaceNavComponent {
  readonly modelId = input.required<string>();
  readonly modelTitle = input.required<string>();
  readonly activeSection = input.required<DataModelWorkspaceSection>();
}
