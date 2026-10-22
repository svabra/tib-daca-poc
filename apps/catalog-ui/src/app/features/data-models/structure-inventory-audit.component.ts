import { DemoIdentityService } from '../../core/demo-identity.service';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { finalize } from 'rxjs';
import { DataModelsApiService } from './data-models-api.service';
import { StructureInventoryAuditEvent } from './data-models.models';

@Component({
  selector: 'daca-structure-inventory-audit', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger class="daca-button is-secondary" type="button" (click)="open()">Inventarprotokoll</button>
    <dialog #dialog aria-labelledby="inventory-audit-title" (close)="restoreFocus()"><header><div><p class="daca-eyebrow">Nachvollziehbarkeit</p><h2 id="inventory-audit-title">Protokoll der Strukturinventare</h2></div><button type="button" aria-label="Protokoll schliessen" (click)="close()">×</button></header>
      <p>Letzte 200 Aktionen in Ihren berechtigten Organisationen. Einträge bleiben nach dem Löschen eines Inventars erhalten.</p>
      @if(loading()){<p role="status">Protokoll wird geladen …</p>}
      @if(error()){<p class="daca-alert is-error" role="alert">{{ error() }}</p><button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button>}
      <div class="daca-table-wrap" role="region" tabindex="0" aria-label="Inventaraktionen"><table class="daca-table"><thead><tr><th>Zeitpunkt</th><th>Strukturinventar</th><th>Aktion</th><th>Person</th><th>Revision</th></tr></thead><tbody>@for(event of events();track event.id){<tr><td>{{ date(event.occurredAt) }}</td><td>{{ event.details['name'] || event.resourceId }}</td><td>{{ label(event.action) }}</td><td>{{ event.actor }}</td><td>{{ event.revision }}</td></tr>}@empty{ @if(!loading() && !error()){<tr><td colspan="5">Noch keine protokollierten Inventaraktionen.</td></tr>} }</tbody></table></div>
      <footer><button class="daca-button is-secondary" type="button" (click)="close()">Schliessen</button></footer>
    </dialog>
  `,
  styles: [`dialog{box-sizing:border-box;width:min(1000px,calc(100vw - 2rem));max-height:90vh;overflow:auto;border:1px solid var(--daca-border);border-top:5px solid var(--daca-red);padding:1.25rem;background:#fff;color:var(--daca-ink)}dialog::backdrop{background:#13253688}header{display:flex;justify-content:space-between;align-items:start;gap:1rem}header>button{min-width:44px;min-height:44px;border:0;background:transparent;font-size:1.6rem;cursor:pointer}h2{margin:.2rem 0}p{font-size:.75rem;color:var(--daca-muted)}.daca-table-wrap{max-height:55vh;overflow:auto}.daca-table{min-width:640px}.daca-table td,.daca-table th{font-size:.7rem}footer{display:flex;justify-content:flex-end;margin-top:1rem}`],
})
export class StructureInventoryAuditComponent {
  private readonly api = inject(DataModelsApiService);
  private readonly identity = inject(DemoIdentityService);
  constructor() { effect(() => {this.identity.userId(); this.error.set(''); this.events.set([]); const dialog=this.dialog()?.nativeElement; if(dialog?.open) dialog.close();}); }

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly events = signal<StructureInventoryAuditEvent[]>([]);
  readonly loading = signal(false); readonly error = signal('');
  open(): void { this.dialog()?.nativeElement.showModal(); this.load(); }
  close(): void { this.dialog()?.nativeElement.close(); }
  restoreFocus(): void { this.trigger()?.nativeElement.focus(); }
  load(): void {
    this.loading.set(true); this.error.set(''); this.events.set([]);
    this.api.structureInventoryAudit().pipe(finalize(() => this.loading.set(false))).subscribe({next: events => this.events.set(events),error: (error: Error) => this.error.set(error.message)});
  }
  label(action: string): string {return ({imported: 'Importiert', archived: 'Archiviert', restored: 'Wiederhergestellt', deleted: 'Gelöscht'} as Record<string,string>)[action] ?? action;}
  date(value: string): string {return new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Zurich'}).format(new Date(value));}
}
