import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { finalize } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DataModelsApiService } from './data-models-api.service';
import { PhysicalSource } from './data-models.models';

@Component({
  selector: 'daca-source-access-actions', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if(source().canRelinquishAccess && showTrigger()){<button class="daca-button is-secondary return-access" type="button" (click)="open($event)">{{ i18n.t('returnSourceAccess') }}</button>}
    <dialog #dialog [attr.aria-labelledby]="'return-access-title-' + source().id" (cancel)="cancel($event)" (close)="restoreFocus()">
      <h2 [id]="'return-access-title-' + source().id">{{ i18n.t('returnSourceAccess') }}</h2>
      <p><strong>{{ source().name }}</strong></p><p>{{ i18n.t('returnSourceAccessExplanation') }}</p>
      @if(error()){<p class="daca-alert is-error" role="alert">{{ i18n.t('sourceAccessActionFailed') }} {{ error() }}</p>}
      <footer><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="cancel()">{{ i18n.t('cancelSourceAccess') }}</button><button class="daca-button" type="button" [disabled]="busy()" (click)="confirm()">{{ i18n.t(busy() ? 'sourceAccessSaving' : 'returnSourceAccess') }}</button></footer>
    </dialog>
  `,
  styles: [`:host{display:block}.return-access{margin-top:.8rem}dialog{box-sizing:border-box;width:min(620px,calc(100vw - 2rem));border:1px solid var(--daca-border);padding:1.4rem;background:var(--daca-surface,#fff);color:var(--daca-ink)}dialog::backdrop{background:#13253688}p{line-height:1.5;overflow-wrap:anywhere}footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.6rem}`],
})
export class SourceAccessActionsComponent {
  readonly source = input.required<PhysicalSource>();
  readonly showTrigger = input(true);
  readonly returned = output<void>();
  readonly i18n = inject(CatalogI18nService);
  private readonly api = inject(DataModelsApiService);
  private readonly identity = inject(DemoIdentityService);
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private trigger: HTMLElement | null = null;
  constructor() { effect((cleanup) => { this.identity.userId(); this.error.set(''); const dialog=this.dialog()?.nativeElement; if(dialog?.open)dialog.close(); cleanup(() => {if(dialog?.open)dialog.close();}); }); }
  open(event: Event): void { this.openFrom(event.currentTarget as HTMLElement); }
  openFrom(trigger: HTMLElement): void { if(!this.source().canRelinquishAccess)return; this.trigger=trigger; this.error.set(''); this.dialog()?.nativeElement.showModal(); }
  cancel(event?: Event): void { if(this.busy()){event?.preventDefault();return;} this.dialog()?.nativeElement.close(); }
  restoreFocus(): void { this.trigger?.focus(); }
  confirm(): void {
    if(this.busy() || !this.source().canRelinquishAccess)return;
    this.busy.set(true); this.error.set('');
    this.api.relinquishSourceAccess(this.source().id).pipe(finalize(()=>this.busy.set(false))).subscribe({
      next:()=>{this.dialog()?.nativeElement.close();this.returned.emit();}, error:(error:Error)=>this.error.set(error.message),
    });
  }
}
