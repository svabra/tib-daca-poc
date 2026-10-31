import { catalogCopy } from '../../core/catalog-localization';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { TooltipDirective } from '../../shared/tooltip.directive';
import { SearchIconComponent } from '../search/search-icon.component';

type Category = 'products'|'models'|'domains'|'terms';
export interface RecentWorkItem { id:string; kind:'product'|'logical'|'physical'|'domain'|'term'; title:Record<string,string>; editedAt:string; route:string; queryParams:Record<string,string> }
export interface RecentWork { categories:{id:Category;items:RecentWorkItem[]}[] }

@Component({selector:'daca-recent-work',standalone:true,imports:[RouterLink,TooltipDirective,SearchIconComponent],changeDetection:ChangeDetectionStrategy.OnPush,
  template:`<section class="recent-work" aria-labelledby="recent-work-title">
    <h2 id="recent-work-title">{{tr(['Meine letzten Arbeiten','Mes derniers travaux','I miei ultimi lavori','My recent work'])}}</h2>
    @if(loading()){<p class="recent-state" role="status">{{tr(['Letzte Arbeiten werden geladen …','Chargement des derniers travaux…','Caricamento degli ultimi lavori…','Loading recent work…'])}}</p>}
    @else if(failed()){<div class="recent-state" role="status"><p>{{tr(['Die letzten Arbeiten konnten nicht geladen werden.','Impossible de charger les derniers travaux.','Impossibile caricare gli ultimi lavori.','Recent work could not be loaded.'])}}</p><button class="daca-button is-secondary" type="button" (click)="load()">{{tr(['Erneut versuchen','Réessayer','Riprova','Retry'])}}</button></div>}
    @else {
      @for(group of groups();track group.id){<section class="recent-category" [attr.data-category]="group.id" [attr.aria-labelledby]="'recent-'+group.id">
        <h3 [id]="'recent-'+group.id"><daca-search-icon [name]="icons[group.id]"/>{{categoryLabel(group.id)}}</h3>
        <ul>@for(item of group.items;track item.kind+':'+item.id){<li [attr.data-work-id]="item.id">
          <a [routerLink]="item.route" [queryParams]="item.queryParams" [dacaTooltip]="title(item)" [attr.aria-label]="title(item)">{{title(item)}}</a>
          <small>@if(group.id==='models'){<span>{{modelKind(item.kind)}} · </span>}<time [attr.datetime]="item.editedAt">{{date(item.editedAt)}}</time></small>
        </li>}</ul>
      </section>} @empty {<p class="recent-state">{{tr(['Noch keine gespeicherten Bearbeitungen.','Aucune modification enregistrée pour le moment.','Ancora nessuna modifica salvata.','No saved edits yet.'])}}</p>}
    }
  </section>`,
  styles:[`:host{display:block;min-width:0;margin:4px 24px 28px}.recent-work{border-top:1px solid var(--daca-border);padding-top:22px;min-width:0}.recent-work h2{font-size:1.1rem;line-height:1.35;margin:0 0 18px}.recent-category{margin-top:18px;min-width:0}.recent-category h3{display:flex;align-items:center;gap:8px;font-size:.82rem;font-weight:700;margin:0 0 5px}.recent-category h3 daca-search-icon{color:var(--daca-muted)}ul{list-style:none;padding:0;margin:0}li{min-width:0;padding:5px 0}a{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--daca-blue);font-size:.84rem;line-height:1.4;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible{outline:2px solid var(--daca-blue);outline-offset:3px}small{display:block;font-size:.67rem;line-height:1.4;color:var(--daca-muted);margin-top:2px}.recent-state{font-size:.8rem;line-height:1.6;color:var(--daca-muted);margin:0}.recent-state p{margin:0 0 8px}.recent-state button{font-size:.75rem}`],
})
export class RecentWorkComponent {
  private readonly http=inject(HttpClient);
  private readonly identity=inject(DemoIdentityService);
  private readonly preferences=inject(UserPreferencesService);
  private readonly destroy=inject(DestroyRef);
  private request?:Subscription;
  private generation=0;
  readonly data=signal<RecentWork|null>(null);
  readonly loading=signal(true);
  readonly failed=signal(false);
  readonly groups=computed(()=>this.data()?.categories.filter(group=>group.items.length).map(group=>({...group,items:group.items.slice(0,3)}))??[]);
  readonly icons:Record<Category,string>={products:'box',models:'schema',domains:'hierarchy',terms:'book'};
  constructor(){effect(()=>{this.identity.userId();untracked(()=>this.load());});this.destroy.onDestroy(()=>this.request?.unsubscribe());}
  tr(values:readonly[string,string,string,string]):string{return catalogCopy(values, this.preferences.language());}
  categoryLabel(id:Category):string{return this.tr(({products:['Datenprodukte','Produits de données','Prodotti dati','Data products'],models:['Modelle','Modèles','Modelli','Models'],domains:['Domänen','Domaines','Domini','Domains'],terms:['Terminologie','Terminologie','Terminologia','Terminology']} as const)[id]);}
  modelKind(kind:RecentWorkItem['kind']):string{return kind==='physical'?this.tr(['Physisch','Physique','Fisico','Physical']):this.tr(['Logisch','Logique','Logico','Logical']);}
  title(item:RecentWorkItem):string{return item.title[this.preferences.language()]||item.title['de']||Object.values(item.title).find(Boolean)||item.id;}
  date(value:string):string{return new Intl.DateTimeFormat(this.preferences.language(),{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
  load():void{
    this.request?.unsubscribe();const generation=++this.generation;
    this.data.set(null);this.failed.set(false);this.loading.set(true);
    this.request=this.http.get<RecentWork>('/api/v1/me/recent-work',{headers:this.identity.headers()}).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next:data=>{if(generation!==this.generation)return;this.data.set(data);this.loading.set(false);},
      error:()=>{if(generation!==this.generation)return;this.loading.set(false);this.failed.set(true);},
    });
  }
}
