import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, effect, HostListener, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { GlossaryTermSummary } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { TooltipDirective } from '../../shared/tooltip.directive';

export type TermCardAction = 'request-retirement';

@Component({
  selector: 'daca-term-card-actions', standalone: true,
  imports: [RouterLink, TooltipDirective], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger class="term-actions-trigger" type="button" aria-haspopup="menu"
      [attr.aria-expanded]="menuOpen()" [attr.aria-controls]="'term-actions-'+term().id"
      [attr.aria-label]="i18n.t('termActions',{name:term().preferredLabel})"
      [dacaTooltip]="i18n.t('termActions',{name:term().preferredLabel})"
      (click)="toggle()" (keydown)="triggerKeydown($event)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
    </button>
    @if(menuOpen()){
      <div #menu class="term-actions-menu" role="menu" [id]="'term-actions-'+term().id"
        [attr.aria-label]="i18n.t('termActions',{name:term().preferredLabel})" (keydown)="menuKeydown($event)">
        <a role="menuitem" tabindex="-1" routerLink="/glossary/proposals/new" [queryParams]="{termId:term().id}" (click)="close()">{{i18n.t('proposeTermChange')}}</a>
        <button role="menuitem" tabindex="-1" type="button" [disabled]="busy()" data-term-action="request-retirement" (click)="choose('request-retirement')">{{i18n.t('requestTermRetirement')}}</button>
        <button role="menuitem" tabindex="-1" type="button" data-term-action="termdat" disabled>{{i18n.t('requestTermdatIntake')}}</button>
      </div>
    }
  `,
  styles: [`
    :host{position:relative;display:inline-block;margin-inline-start:auto}
    .term-actions-trigger{display:grid;place-items:center;width:40px;height:40px;padding:0;border:1px solid var(--daca-border-strong);background:var(--daca-surface,#fff);color:var(--daca-blue);cursor:pointer}
    .term-actions-trigger svg{width:22px;height:22px;fill:currentColor}
    .term-actions-trigger:hover,.term-actions-trigger[aria-expanded=true]{background:var(--daca-blue-soft)}
    .term-actions-trigger:focus-visible{outline:2px solid var(--daca-blue);outline-offset:2px}
    .term-actions-menu{position:absolute;z-index:30;right:0;bottom:calc(100% + .4rem);width:min(19rem,calc(100vw - 4rem));max-height:calc(100dvh - 2rem);overflow:auto}
    @media(pointer:coarse){.term-actions-trigger{width:44px;height:44px}}
  `],
})
export class TermCardActionsComponent {
  readonly term=input.required<GlossaryTermSummary>();
  readonly busy=input(false);
  readonly action=output<TermCardAction>();
  readonly menuOpen=signal(false);
  readonly i18n=inject(CatalogI18nService);
  private readonly identity=inject(DemoIdentityService);
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector=inject(Injector);
  private readonly trigger=viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu=viewChild<ElementRef<HTMLElement>>('menu');

  constructor(){effect(()=>{this.identity.userId();this.term().id;this.menuOpen.set(false);});}
  toggle():void{if(this.menuOpen())this.close(true);else this.open();}
  private open(last=false):void{
    this.menuOpen.set(true);
    afterNextRender(()=>{const items=this.items();(last?items.at(-1):items[0])?.focus();},{injector:this.injector});
  }
  close(focus=false):void{this.menuOpen.set(false);if(focus)this.trigger().nativeElement.focus();}
  choose(action:TermCardAction):void{
    if(this.busy()||this.term().status!=='active')return;
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
