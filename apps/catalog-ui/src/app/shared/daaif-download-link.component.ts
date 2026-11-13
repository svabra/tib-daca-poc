import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DemoIdentityService } from '../core/demo-identity.service';
import { EndpointDescriptor } from '../core/catalog.models';
import { daaifHttpRepresentations } from './daaif-http-formats';

@Component({
  selector: 'daca-daaif-download-link', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  host: {style:'display:block;min-width:0;grid-column:1 / -1'},
  template: `@if (selected(); as selection) {
    <section class="download-link" aria-label="Datenformat wählen">
      <h2>Daten über HTTP beziehen</h2>
      <p>Ein Datenprodukt, eine Produktfreigabe für alle HTTP-Formate. DAAIF prüft Ihre Freigabe beim Datenbezug.</p>
      <div>
        <label>Datenformat<select [value]="selection.id" (change)="selectedId.set($any($event.target).value)">
          @for (format of formats();track format.id) {<option [value]="format.id">{{format.label}}</option>}
        </select></label>
        <a class="daca-button" [href]="selection.launchUrl" target="_blank" rel="noopener noreferrer">{{selection.format==='rest'?'REST in DAAIF öffnen':'In DAAIF herunterladen'}} ↗</a>
      </div>
    </section>
  }`,
  styles: [`.download-link{margin:0 0 24px;padding:20px;border:1px solid var(--daca-border);border-top:4px solid var(--daca-blue);background:var(--daca-surface);min-width:0}.download-link h2{margin:0 0 12px}.download-link p{font-size:.85rem}.download-link>div{display:flex;align-items:end;flex-wrap:wrap;gap:16px}.download-link label{display:grid;gap:6px;font-weight:700;min-width:0;flex:1 1 230px}.download-link select{min-width:0;width:100%;padding:10px;border:1px solid var(--daca-border-strong);color:var(--daca-ink);background:var(--daca-surface);font:inherit}.download-link a{white-space:normal}@media(max-width:420px){.download-link{padding:12px}.download-link a{width:100%}}`],
})
export class DaaifDownloadLinkComponent {
  readonly endpoints = input.required<readonly EndpointDescriptor[]>();
  private readonly identity = inject(DemoIdentityService);
  readonly selectedId=signal('');
  readonly formats=computed(()=>daaifHttpRepresentations(this.endpoints(),this.identity.userId()));
  readonly selected=computed(()=>this.formats().find(item=>item.id===this.selectedId())??this.formats()[0]??null);
}
