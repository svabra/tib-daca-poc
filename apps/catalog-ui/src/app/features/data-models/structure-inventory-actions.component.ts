import { DemoIdentityService } from '../../core/demo-identity.service';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { finalize } from 'rxjs';
import { DataModelsApiService } from './data-models-api.service';
import { PhysicalSource } from './data-models.models';

export type InventoryAction = 'archive' | 'restore' | 'delete';

@Component({
  selector: 'daca-structure-inventory-actions', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showActions() && source().inventoryManageable) {
      <div class="actions"><button type="button" (click)="open(source().lifecycle === 'archived' ? 'restore' : 'archive', $event)">{{ source().lifecycle === 'archived' ? 'Wiederherstellen' : 'Archivieren' }}</button><button type="button" class="danger" (click)="open('delete', $event)">Löschen</button></div>
    }
    <dialog #dialog [attr.aria-labelledby]="'inventory-action-title-' + source().id" (cancel)="cancel($event)" (close)="restoreFocus()">
      <p class="daca-eyebrow">Strukturinventar</p><h2 [id]="'inventory-action-title-' + source().id">{{ label() }}</h2><p><strong>{{ source().name }}</strong></p>
      @switch(action()) {
        @case('archive') {<p>Das Inventar wird aus der aktiven Auswahl genommen. Seine physischen Deklarationen, Revisionen und bestehenden Verknüpfungen bleiben erhalten. Über „Archivierte Inventare anzeigen“ kann es später wiederhergestellt werden.</p>}
        @case('restore') {<p>Das Inventar und seine Modelle werden wieder in der aktiven Auswahl angezeigt.</p>}
        @case('delete') {<p>Das Inventar und seine importierten Strukturen werden endgültig gelöscht. Bestehende Modellverknüpfungen oder historische Mappings verhindern das Löschen; in diesem Fall ist Archivieren möglich.</p>}
      }
      <p>Die Aktion wird mit Zeitpunkt und ausführender Person protokolliert. Das Protokoll bleibt auch nach dem Löschen erhalten.</p>
      @if(error()){<p class="daca-alert is-error" role="alert">{{ error() }}</p>}
      <footer><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="cancel()">Abbrechen</button><button class="daca-button" type="button" [disabled]="busy()" (click)="confirm()">{{ busy() ? 'Wird ausgeführt …' : label() }}</button></footer>
    </dialog>
  `,
  styles: [`:host{display:block}.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:.7rem}.actions button{min-height:40px;border:1px solid var(--daca-border-strong);padding:.4rem .7rem;background:#fff;color:var(--daca-blue);font:inherit;font-size:.7rem;font-weight:750;cursor:pointer}.actions .danger{color:var(--daca-red-dark)}.actions button:hover{background:#fff0f1;border-color:var(--daca-red)}dialog{box-sizing:border-box;width:min(620px,calc(100vw - 2rem));border:1px solid var(--daca-border);border-top:5px solid var(--daca-red);padding:1.4rem;background:#fff;color:var(--daca-ink);box-shadow:0 15px 45px #102a3b55}dialog::backdrop{background:#13253688}h2{margin:.2rem 0}p{font-size:.8rem;line-height:1.5;overflow-wrap:anywhere}footer{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1.2rem}`],
})
export class StructureInventoryActionsComponent {
  readonly source = input.required<PhysicalSource>();
  readonly showActions = input(true);
  readonly changed = output<{action: InventoryAction; name: string}>();
  readonly action = signal<InventoryAction>('archive');
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly api = inject(DataModelsApiService);
  private readonly identity = inject(DemoIdentityService);
  constructor() { effect(() => {this.identity.userId(); this.error.set(''); const dialog=this.dialog()?.nativeElement; if(dialog?.open) dialog.close();}); }

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private trigger: HTMLElement | null = null;
  label(): string { return this.action() === 'archive' ? 'Inventar archivieren' : this.action() === 'restore' ? 'Inventar wiederherstellen' : 'Inventar endgültig löschen'; }
  open(action: InventoryAction, event: Event): void {
    this.openFrom(action, event.currentTarget as HTMLElement);
  }
  openFrom(action: InventoryAction, trigger: HTMLElement): void {
    if (this.busy() || !this.source().inventoryManageable) return;
    this.trigger = trigger; this.action.set(action); this.error.set('');
    this.dialog()?.nativeElement.showModal();
  }
  cancel(event?: Event): void { if(this.busy()){event?.preventDefault();return;} this.dialog()?.nativeElement.close(); }
  restoreFocus(): void { this.trigger?.focus(); }
  confirm(): void {
    if (this.busy() || !this.source().inventoryManageable) return;
    this.busy.set(true); this.error.set('');
    const source = this.source(); const action = this.action();
    this.api.manageStructureInventory(source.id, source.revision, action).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {this.dialog()?.nativeElement.close();this.changed.emit({action, name: source.name});},
      error: (error: Error) => this.error.set(error.message),
    });
  }
}
