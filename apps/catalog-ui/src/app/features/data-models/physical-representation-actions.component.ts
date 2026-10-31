import { SearchIconComponent } from '../search/search-icon.component';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CatalogObjectKind } from '../domains/catalog-object-browser.component';
import type { ModelDomainReference } from './data-models.models';
import type { PhysicalRepresentation } from './mapping-draft.facade';

/** Shared actions for a physical object, whether opened from its binding or its canvas card. */
@Component({selector:'daca-physical-representation-actions',standalone:true,imports:[RouterLink,SearchIconComponent],changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <a role="menuitem" [routerLink]="['/physical-models',representation().snapshot.sourceId]" [queryParams]="{snapshotId:representation().snapshot.id,tableId:representation().table.id}" target="_blank" rel="noopener" (click)="closed.emit()"><daca-search-icon name="server"/><span class="menu-label">Datenquelle öffnen</span><img src="/assets/catalog-search/external-link.svg" width="14" height="14" alt=""><span class="sr-only"> (neuer Tab)</span></a>
    <button role="menuitem" type="button" class="is-danger" (click)="hide.emit()"><daca-search-icon name="x"/><span class="menu-label">Darstellung dieser Physischen Repräsentation/Deklaration löschen</span></button>
    <span class="menu-hint">Bindungen und Mappings bleiben erhalten.</span>
    @if(canSelectLogical()){<button role="menuitem" type="button" (click)="selectLogical.emit()"><daca-search-icon name="schema"/><span class="menu-label">{{logicalSelectionLabel()}}</span></button>}
    @if(canDerive()){<button role="menuitem" type="button" (click)="derive.emit()"><daca-search-icon name="schema"/><span class="menu-label">{{deriveLabel()}}</span></button>}
    @if(canAssign()){
      @if(logicalDomain()?.id && !hasLogicalDomain()) {<button role="menuitem" type="button" (click)="assign.emit(true)"><daca-search-icon name="hierarchy"/><span class="menu-label">Domäne des logischen Modells zuordnen</span></button>}
      @if(!domains().length){<button role="menuitem" type="button" (click)="assign.emit(false)"><daca-search-icon name="hierarchy"/><span class="menu-label">Domäne zuordnen</span></button>}
    }
    @for(domain of domains();track domain.id){<a role="menuitem" [routerLink]="['/domains',domain.id]" target="_blank" rel="noopener" (click)="closed.emit()"><daca-search-icon name="hierarchy"/><span class="menu-label">Zugehörige Domäne anzeigen@if(domains().length>1){: {{domain.displayName}}}</span><img src="/assets/catalog-search/external-link.svg" width="14" height="14" alt=""><span class="sr-only"> (neuer Tab)</span></a>}
    @if(canAssign()){@for(domain of domains();track domain.id){<button role="menuitem" type="button" [disabled]="busy()||!representation().table.domainVersion" (click)="removeDomain.emit(domain.id)"><daca-search-icon name="x"/><span class="menu-label">Domänenzuordnung entfernen@if(domains().length>1){: {{domain.displayName}}}</span></button>}}
    @if(canSelectLogical()||canDerive()||domains().length||canAssign()){<hr role="separator">}
    <a role="menuitem" routerLink="/domains/terminology" [queryParams]="{q:representation().table.name}" target="_blank" rel="noopener" (click)="closed.emit()"><daca-search-icon name="book"/><span class="menu-label">Term suchen und öffnen</span><img src="/assets/catalog-search/external-link.svg" width="14" height="14" alt=""><span class="sr-only"> (neuer Tab)</span></a>
    <a role="menuitem" routerLink="/domains" [queryParams]="{q:representation().table.name}" target="_blank" rel="noopener" (click)="closed.emit()"><daca-search-icon name="hierarchy"/><span class="menu-label">Domäne suchen und öffnen</span><img src="/assets/catalog-search/external-link.svg" width="14" height="14" alt=""><span class="sr-only"> (neuer Tab)</span></a>
    <hr role="separator">
    <button role="menuitem" type="button" (click)="browse.emit('logical')"><daca-search-icon name="schema"/><span class="menu-label">Logisches Modell suchen und öffnen</span><img src="/assets/catalog-search/external-link.svg" width="14" height="14" alt=""><span class="sr-only"> (Treffer in neuem Tab)</span></button>
    <button role="menuitem" type="button" (click)="browse.emit('physical')"><daca-search-icon name="box"/><span class="menu-label">Physisches Modell suchen und öffnen</span><img src="/assets/catalog-search/external-link.svg" width="14" height="14" alt=""><span class="sr-only"> (Treffer in neuem Tab)</span></button>
  `,
  styles:[`:host{display:block}a,button{box-sizing:border-box;display:flex;align-items:center;gap:.5rem;width:100%;min-height:40px;border:0;padding:.55rem .75rem;background:transparent;color:var(--daca-ink);font:inherit;font-size:.67rem;line-height:1.4;text-align:left;text-decoration:none;cursor:pointer}a:hover,button:hover,a:focus-visible,button:focus-visible{background:var(--daca-blue-soft);outline:2px solid var(--daca-blue);outline-offset:-2px}.menu-label{flex:1;min-width:0}img{flex:none}.is-danger{color:var(--daca-red-dark);font-weight:700}hr{margin:.3rem 0;border:0;border-top:1px solid var(--daca-border)}.menu-hint{display:block;padding:.35rem .75rem .6rem;font-size:.62rem;color:var(--daca-muted)}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`],
})
export class PhysicalRepresentationActionsComponent {
  readonly representation=input.required<PhysicalRepresentation>();
  readonly logicalDomain=input<Pick<ModelDomainReference,'id'|'displayName'>|null>(null);
  readonly canManage=input(false);
  readonly busy=input(false);
  readonly canSelectLogical=input(false);readonly logicalSelectionLabel=input('Logisches Modell auswählen');readonly selectLogical=output<void>();
  readonly canDerive=input(false);readonly deriveLabel=input('Logisches Modell ableiten');readonly derive=output<void>();
  readonly domains=computed(()=>this.representation().table.dataDomains??[]);
  readonly hasLogicalDomain=computed(()=>this.domains().some(domain=>domain.id===this.logicalDomain()?.id));
  readonly canAssign=computed(()=>this.canManage()&&this.representation().table.domainAssignable!==false);
  readonly browse=output<CatalogObjectKind>();readonly assign=output<boolean>();readonly hide=output<void>();readonly closed=output<void>();
  readonly removeDomain=output<string>();
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  @HostListener('keydown',['$event']) keydown(event:KeyboardEvent):void{
    if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();event.stopPropagation();this.closed.emit();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const items=[...this.host.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLElement);
    items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }
}
