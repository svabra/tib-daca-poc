import { StructureInventoryActionsComponent, InventoryAction } from './structure-inventory-actions.component';
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, effect, HostListener, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { PhysicalSource } from './data-models.models';
import { SourceAccessActionsComponent } from './source-access-actions.component';

@Component({
  selector: 'daca-source-card-actions', standalone: true,
  imports: [RouterLink, SourceAccessActionsComponent, StructureInventoryActionsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger class="source-actions-trigger" type="button" aria-haspopup="menu"
      [attr.aria-expanded]="menuOpen()" [attr.aria-controls]="'source-actions-' + source().id"
      [attr.aria-label]="i18n.t('sourceActions', {name: source().name})"
      (click)="toggle()" (keydown)="triggerKeydown($event)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
    </button>
    @if(menuOpen()){
      <div #menu class="source-actions-menu" role="menu" [id]="'source-actions-' + source().id"
        [attr.aria-label]="i18n.t('sourceActions', {name: source().name})" (keydown)="menuKeydown($event)">
        <a role="menuitem" tabindex="-1" [routerLink]="['/physical-models', source().id]"
          [queryParams]="logicalModelId() ? {logicalModelId: logicalModelId()} : {}" (click)="close()">{{ i18n.t(source().connectorType === 'csv' ? 'openInventory' : 'openSource') }}</a>
        @if(source().connectorType === 'csv'){
          @if(source().inventoryManageable){
            <button role="menuitem" tabindex="-1" type="button" (click)="inventoryAction(source().lifecycle === 'archived' ? 'restore' : 'archive')">{{ i18n.t(source().lifecycle === 'archived' ? 'restoreInventory' : 'archiveInventory') }}</button>
            <button role="menuitem" tabindex="-1" type="button" class="danger" (click)="inventoryAction('delete')">{{ i18n.t('deleteInventory') }}</button>
          }
        }@else{
          <button role="menuitem" tabindex="-1" type="button" [disabled]="importing() || !importAllowed()" (click)="importSource()">{{ i18n.t(importing() ? 'importing' : source().latestSnapshotId ? 'reimport' : 'importMetadata') }}</button>
          @if(source().canRelinquishAccess){<button role="menuitem" tabindex="-1" type="button" (click)="returnAccess()">{{ i18n.t('returnSourceAccess') }}</button>}
        }
      </div>
    }
    @if(source().connectorType === 'csv'){
      <daca-structure-inventory-actions [source]="source()" [showActions]="false" (changed)="inventoryChanged.emit($event)" />
    }@else{<daca-source-access-actions [source]="source()" [showTrigger]="false" (returned)="returned.emit()" />}
  `,
  styles: [`
    :host{position:relative;display:inline-block;margin-inline-start:auto;align-self:flex-end}
    .source-actions-trigger{display:grid;place-items:center;width:40px;height:40px;padding:0;border:1px solid var(--daca-border-strong);background:var(--daca-surface,#fff);color:var(--daca-blue);cursor:pointer}
    .source-actions-trigger svg{width:22px;height:22px;fill:currentColor}
    .source-actions-trigger:hover,.source-actions-trigger[aria-expanded=true]{background:var(--daca-blue-soft,#edf5fa)}
    .source-actions-trigger:focus-visible,.source-actions-menu :focus-visible{outline:2px solid var(--daca-blue);outline-offset:2px}
    .source-actions-menu{position:absolute;z-index:30;right:0;bottom:calc(100% + .4rem);width:min(19rem,calc(100vw - 4rem));padding:.25rem 0;border:1px solid var(--daca-border-strong);background:var(--daca-surface,#fff);box-shadow:0 8px 24px #102a3b33}
    .source-actions-menu a,.source-actions-menu button{box-sizing:border-box;display:flex;align-items:center;width:100%;min-height:40px;margin:0;border:0;padding:.65rem .8rem;background:transparent;color:var(--daca-blue);font-family:inherit;font-size:.66rem;font-weight:700;line-height:1.4;text-align:left;text-decoration:none;cursor:pointer}
    .source-actions-menu :is(a,button):not(:disabled):hover,.source-actions-menu :is(a,button):focus-visible{background:var(--daca-blue-soft,#edf5fa)}
    .source-actions-menu button.danger{color:var(--daca-red-dark)}
    .source-actions-menu button:disabled{color:var(--daca-muted);cursor:not-allowed}
  `],
})
export class SourceCardActionsComponent {
  readonly source = input.required<PhysicalSource>();
  readonly logicalModelId = input<string | null>(null);
  readonly importAllowed = input(false);
  readonly importing = input(false);
  readonly importRequested = output<void>();
  readonly returned = output<void>();
  readonly inventoryChanged = output<{action:InventoryAction;name:string}>();
  readonly menuOpen = signal(false);
  readonly i18n = inject(CatalogI18nService);
  private readonly identity = inject(DemoIdentityService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly access = viewChild(SourceAccessActionsComponent);
  private readonly inventory = viewChild(StructureInventoryActionsComponent);
  inventoryAction(action:InventoryAction):void{this.close();this.inventory()?.openFrom(action,this.trigger().nativeElement);}

  constructor() { effect(() => { this.identity.userId(); this.menuOpen.set(false); }); }

  toggle(): void { if(this.menuOpen())this.close(true);else this.open(); }
  private open(last = false): void {
    this.menuOpen.set(true);
    afterNextRender(() => { const items=this.items(); (last ? items.at(-1) : items[0])?.focus(); }, {injector:this.injector});
  }
  close(focus = false): void { this.menuOpen.set(false); if(focus)this.trigger().nativeElement.focus(); }
  importSource(): void { if(this.importing() || !this.importAllowed())return; this.close(true); this.importRequested.emit(); }
  returnAccess(): void { this.close(); this.access()?.openFrom(this.trigger().nativeElement); }

  @HostListener('document:click', ['$event'])
  outsideClick(event: MouseEvent): void { if(!this.host.nativeElement.contains(event.target as Node))this.close(); }

  triggerKeydown(event: KeyboardEvent): void {
    if(event.key==='ArrowDown' || event.key==='ArrowUp'){event.preventDefault();this.open(event.key==='ArrowUp');}
    else if(event.key==='Escape'){event.preventDefault();this.close(true);}
  }
  menuKeydown(event: KeyboardEvent): void {
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close(true);return;}
    if(event.key==='Tab'){this.close(true);return;}
    if(event.key===' '){event.preventDefault();const active=document.activeElement as HTMLElement;if(this.items().includes(active))active.click();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const items=this.items(),index=items.indexOf(document.activeElement as HTMLElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  }
  private items(): HTMLElement[] { return [...(this.menu()?.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? [])]; }
}
