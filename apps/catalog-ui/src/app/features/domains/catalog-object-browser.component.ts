import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';

export type CatalogObjectKind='term'|'domain'|'logical'|'physical';
export interface CatalogObjectResult {id:string;label:string;description:string;route:string[];params?:Record<string,string>;}
type Result=CatalogObjectResult;

@Component({selector:'daca-catalog-object-browser',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,template:`
  <div class="object-browser-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="catalog-browser-title" (keydown)="dialogKeydown($event)">
    <header><h2 id="catalog-browser-title">{{selectionMode()?'Karte suchen und auswählen':'Katalogobjekt suchen und öffnen'}}</h2><button class="daca-button is-secondary" type="button" aria-label="Suche schliessen" (click)="closed.emit()">×</button></header>
    <nav aria-label="Objekttyp">@for(type of kinds;track type.id){@if(!selectionMode()||type.id===initialKind()){<button class="daca-button is-secondary" type="button" [attr.aria-pressed]="kind()===type.id" (click)="kind.set(type.id)">{{type.label}}</button>}}</nav>
    <label>Suche<input type="search" [value]="query()" (input)="query.set($any($event.target).value)" placeholder="Name oder Beschreibung"></label>
    <p>{{selectionMode()?'Die Auswahl fügt eine Karte in dieses Netz ein. Eine Beziehung wird als lokaler Entwurf vorbereitet.':'Das ausgewählte Objekt wird geöffnet. Es wird keine Karte und keine Beziehung hinzugefügt.'}}</p>
    @if(loading()){<p role="status">Objekte werden geladen …</p>}@else if(error()){<p role="alert">{{error()}}</p><button type="button" class="daca-button is-secondary" (click)="load()">Erneut laden</button>}@else{
      <p role="status">{{results().length}} Treffer</p><ul>@for(item of results();track item.id){<li><button type="button" (click)="open(item)"><strong>{{item.label}}</strong><span>{{item.description}}</span></button></li>}@empty{<li>Keine passenden zugänglichen Objekte.</li>}</ul>
    }
    <footer><button class="daca-button is-secondary" type="button" (click)="closed.emit()">Schliessen</button></footer>
  </section></div>`,styles:[`
  .object-browser-backdrop{position:fixed;inset:0;z-index:2400;display:grid;place-items:center;background:#14202b66;padding:1rem}section{box-sizing:border-box;width:min(54rem,100%);max-height:calc(100dvh - 2rem);overflow:auto;background:#fff;border-top:4px solid #e1001a;padding:1.25rem;color:#14202b}header,nav,footer{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;justify-content:space-between}header h2{font-size:1.2rem;margin:0}nav{justify-content:flex-start;margin:1rem 0}nav [aria-pressed=true]{background:#e8f2fa;border-color:#145586}label{display:grid;gap:.4rem;font-weight:700}input{min-height:44px;padding:.6rem;font:inherit;border:1px solid #aeb7c0}p{font-size:.85rem}ul{list-style:none;padding:0;max-height:45dvh;overflow:auto}li>button{display:grid;text-align:left;gap:.3rem;border:0;border-bottom:1px solid #d6dade;background:#fff;color:#145586;min-height:48px;width:100%;padding:.8rem;font:inherit;cursor:pointer}li>button:hover,li>button:focus-visible{background:#e8f2fa}li span{color:#52606c;font-size:.8rem;overflow-wrap:anywhere}footer{justify-content:flex-end;margin-top:1rem}
  `]})
export class CatalogObjectBrowserComponent {
  readonly initialKind=input<CatalogObjectKind>('term');readonly closed=output<void>();
  readonly selectionMode=input(false);readonly selected=output<CatalogObjectResult>();
  readonly kind=signal<CatalogObjectKind>('term');readonly query=signal('');readonly values=signal<readonly Result[]>([]);readonly loading=signal(true);readonly error=signal('');
  readonly kinds:readonly {id:CatalogObjectKind;label:string}[]=[{id:'term',label:'Terme'},{id:'domain',label:'Domänen'},{id:'logical',label:'Logische Modelle'},{id:'physical',label:'Physische Modelle'}];
  readonly results=computed(()=>this.values().filter(item=>(item.label+' '+item.description).toLocaleLowerCase().includes(this.query().trim().toLocaleLowerCase())));
  private readonly api=inject(CatalogApiService);private readonly models=inject(DataModelsApiService);private readonly identity=inject(DemoIdentityService);private readonly router=inject(Router);private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);private readonly destroyRef=inject(DestroyRef);private request?:Subscription;
  constructor(){effect(()=>this.kind.set(this.initialKind()));effect(()=>{this.identity.userId();this.kind();this.load();});inject(DestroyRef).onDestroy(()=>this.request?.unsubscribe());afterNextRender(()=>this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus());}
  load():void{
    this.request?.unsubscribe();this.values.set([]);this.error.set('');this.loading.set(true);
    let request:Observable<readonly Result[]>;
    switch(this.kind()){
      case 'term':request=this.api.loadGlossaryTerms().pipe(map(items=>items.map(item=>({id:item.id,label:item.preferredLabel,description:item.definition,route:['/domains/terminology'],params:{q:item.preferredLabel,termId:item.id}}))));break;
      case 'domain':request=this.api.loadDomains().pipe(map(items=>items.map(item=>({id:item.id,label:item.preferredLabel,description:item.definition,route:['/domains',item.id]}))));break;
      case 'logical':request=this.models.listLogicalModels().pipe(map(items=>items.map(item=>({id:item.id,label:item.title.de||item.title.en,description:item.description.de||item.description.en,route:['/models',item.id]}))));break;
      case 'physical':request=this.models.listPhysicalSnapshots().pipe(switchMap(items=>{
        const latest=new Map<string,typeof items[number]>();for(const item of items)if(!latest.has(item.sourceId)||latest.get(item.sourceId)!.revision<item.revision)latest.set(item.sourceId,item);
        return latest.size?forkJoin([...latest.values()].map(item=>this.models.loadPhysicalSnapshot(item.id))):of([]);
      }),map(items=>items.flatMap(snapshot=>snapshot.tables.map(table=>({id:table.id,label:table.schemaName+'.'+table.name,description:snapshot.sourceName+' · '+snapshot.catalogPath,route:['/physical-models',snapshot.sourceId],params:{snapshotId:snapshot.id,tableId:table.id}})))));break;
    }
    this.request=request.subscribe({next:items=>{this.values.set(items);this.loading.set(false);},error:()=>{this.error.set('Die zugänglichen Objekte konnten nicht geladen werden.');this.loading.set(false);}});
  }
  async open(item:Result):Promise<void>{if(this.selectionMode()){this.selected.emit(item);return;}if(await this.router.navigate(item.route,{queryParams:item.params})&&!this.destroyRef.destroyed)this.closed.emit();}
  dialogKeydown(event:KeyboardEvent):void{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closed.emit();return;}
    if(event.key!=='Tab')return;const items=[...this.host.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled),input')],first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
}
