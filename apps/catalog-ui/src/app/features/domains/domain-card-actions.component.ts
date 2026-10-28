import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, effect, HostListener, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DomainSummary } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { TooltipDirective } from '../../shared/tooltip.directive';

export type DomainCardAction = 'request-change' | 'request-retirement' | 'edit' | 'retire' | 'transfer';

@Component({
  selector: 'daca-domain-card-actions', standalone: true,
  imports: [RouterLink, TooltipDirective], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger class="domain-actions-trigger" type="button" aria-haspopup="menu"
      [attr.aria-expanded]="menuOpen()" [attr.aria-controls]="'domain-actions-'+domain().id"
      [attr.aria-label]="i18n.t('domainActions',{name:domain().preferredLabel})"
      [dacaTooltip]="i18n.t('domainActions',{name:domain().preferredLabel})"
      (click)="toggle()" (keydown)="triggerKeydown($event)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
    </button>
    @if(menuOpen()){
      <div #menu class="domain-actions-menu" role="menu" [id]="'domain-actions-'+domain().id"
        [attr.aria-label]="i18n.t('domainActions',{name:domain().preferredLabel})" (keydown)="menuKeydown($event)">
        <a role="menuitem" tabindex="-1" [routerLink]="['/domains',domain().id]" (click)="close()">{{i18n.t('openDomain')}}</a>
        @if(domain().canTransferOwnership){<button role="menuitem" tabindex="-1" type="button" [disabled]="busy()" data-domain-action="transfer" (click)="choose('transfer')">{{i18n.t('transferDomain')}}</button>}
        @if(domain().status==='active'&&canRequest()){
          <button role="menuitem" tabindex="-1" type="button" [disabled]="busy()" data-domain-action="request-change" (click)="choose('request-change')">{{i18n.t('requestDomainChange')}}</button>
          <button role="menuitem" tabindex="-1" type="button" [disabled]="busy()" data-domain-action="request-retirement" (click)="choose('request-retirement')">{{i18n.t('requestDomainRetirement')}}</button>
        }
        @if(domain().status==='active'&&canGovern()){
          <button role="menuitem" tabindex="-1" type="button" [disabled]="busy()" data-domain-action="edit" (click)="choose('edit')">{{i18n.t('editDomainDirectly')}}</button>
          <button role="menuitem" tabindex="-1" type="button" [disabled]="busy()" data-domain-action="retire" (click)="choose('retire')">{{i18n.t('retireDomainDirectly')}}</button>
        }
      </div>
    }
  `,
  styles: [`
    :host{position:relative;display:inline-block;margin-inline-start:auto}
    .domain-actions-trigger{display:grid;place-items:center;width:40px;height:40px;padding:0;border:1px solid var(--daca-border-strong);background:var(--daca-surface,#fff);color:var(--daca-blue);cursor:pointer}
    .domain-actions-trigger svg{width:22px;height:22px;fill:currentColor}
    .domain-actions-trigger:hover,.domain-actions-trigger[aria-expanded=true]{background:var(--daca-blue-soft)}
    .domain-actions-trigger:focus-visible{outline:2px solid var(--daca-blue);outline-offset:2px}
    .domain-actions-menu{position:absolute;z-index:30;right:0;bottom:calc(100% + .4rem);width:min(19rem,calc(100vw - 4rem));max-height:calc(100dvh - 2rem);overflow:auto}
    @media(pointer:coarse){.domain-actions-trigger{width:44px;height:44px}}
  `],
})
export class DomainCardActionsComponent {
  readonly domain=input.required<DomainSummary>();
  readonly canRequest=input(false);
  readonly canGovern=input(false);
  readonly busy=input(false);
  readonly action=output<DomainCardAction>();
  readonly menuOpen=signal(false);
  readonly i18n=inject(CatalogI18nService);
  private readonly identity=inject(DemoIdentityService);
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector=inject(Injector);
  private readonly trigger=viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu=viewChild<ElementRef<HTMLElement>>('menu');

  constructor(){effect(()=>{this.identity.userId();this.domain().id;this.menuOpen.set(false);});}
  toggle():void{if(this.menuOpen())this.close(true);else this.open();}
  private open(last=false):void{
    this.menuOpen.set(true);
    afterNextRender(()=>{const items=this.items();(last?items.at(-1):items[0])?.focus();},{injector:this.injector});
  }
  close(focus=false):void{this.menuOpen.set(false);if(focus)this.trigger().nativeElement.focus();}
  choose(action:DomainCardAction):void{
    const allowed=(action==='edit'||action==='retire')?this.canGovern():this.canRequest();
    if(this.busy()||this.domain().status!=='active'||!allowed)return;
    this.close(true);this.action.emit(action);
  }
  @HostListener('document:click',['$event'])
  outsideClick(event:MouseEvent):void{if(!this.host.nativeElement.contains(event.target as Node))this.close();}
  triggerKeydown(event:KeyboardEvent):void{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();this.open(event.key==='ArrowUp');}
    else if(event.key==='Escape'){event.preventDefault();this.close(true);}
  }
  menuKeydown(event:KeyboardEvent):void{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close(true);return;}
    if(event.key==='Tab'){this.close(true);return;}
    if(event.key===' '){event.preventDefault();const active=document.activeElement as HTMLElement;if(this.items().includes(active))active.click();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const items=this.items(),index=items.indexOf(document.activeElement as HTMLElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  }
  private items():HTMLElement[]{return[...(this.menu()?.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')??[])];}
}
