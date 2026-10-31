import { physicalCategoryLabel, physicalObjectName } from '../data-models/physical-representation-labels';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { PhysicalSnapshot, PhysicalTable } from '../data-models/data-models.models';
import { TooltipDirective } from '../../shared/tooltip.directive';

export type CatalogObjectKind='term'|'domain'|'logical'|'physical';
export interface CatalogObjectResult {id:string;label:string;description:string;route:string[];params?:Record<string,string>;provenance?:string;searchText?:string;}
type Result=CatalogObjectResult;

@Component({selector:'daca-catalog-object-browser',standalone:true,imports:[TooltipDirective,RouterLink],changeDetection:ChangeDetectionStrategy.OnPush,template:`
  <div class="object-browser-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="catalog-browser-title" (keydown)="dialogKeydown($event)">
    <header><h2 id="catalog-browser-title">{{selectionMode()?'Karte suchen und auswählen':'Katalogobjekt suchen und öffnen'}}</h2><button class="daca-button is-secondary" type="button" aria-label="Suche schliessen" (click)="closed.emit()">×</button></header>
    <nav aria-label="Objekttyp">@for(type of kinds;track type.id){@if(!selectionMode()||type.id===initialKind()){<button class="daca-button is-secondary" type="button" [attr.aria-pressed]="kind()===type.id" (click)="kind.set(type.id)">{{type.label}}</button>}}</nav>
    <label>Suche<input type="search" [value]="query()" (input)="query.set($any($event.target).value)" placeholder="Name oder Beschreibung"></label>
    <p>{{selectionMode()?'Die Auswahl fügt eine Karte in dieses Netz ein. Eine Beziehung wird als lokaler Entwurf vorbereitet.':newTabResults()?'Suchtreffer öffnen in einem neuen Tab.': 'Das ausgewählte Objekt wird geöffnet. Es wird keine Karte und keine Beziehung hinzugefügt.'}}</p>
    @if(loading()){<p role="status">Objekte werden geladen …</p>}@else if(error()){<p role="alert">{{error()}}</p><button type="button" class="daca-button is-secondary" (click)="load()">Erneut laden</button>}@else{
      <p role="status">{{results().length}} Treffer</p><ul>@for(item of results();track item.id){<li [class.has-provenance]="!!item.provenance">@if(newTabResults()){<a class="object-result is-new-tab" [routerLink]="item.route" [queryParams]="item.params" target="_blank" rel="noopener" (click)="closed.emit()"><strong>{{item.label}}</strong><span>{{item.description}}</span><img src="/assets/catalog-search/external-link.svg" width="16" height="16" alt="Öffnet in einem neuen Tab"></a>}@else{<button class="object-result" type="button" (click)="open(item)"><strong>{{item.label}}</strong><span>{{item.description}}</span></button>}@if(item.provenance){<button class="provenance-info" type="button" [attr.aria-label]="'Herkunft von '+item.label+' aus '+item.description" [dacaTooltip]="item.provenance"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-10v1"/></svg></button>}</li>}@empty{<li>Keine passenden zugänglichen Objekte.</li>}</ul>
    }
    <footer><button class="daca-button is-secondary" type="button" (click)="closed.emit()">Schliessen</button></footer>
  </section></div>`,styles:[`
  .object-browser-backdrop{position:fixed;inset:0;z-index:2400;display:grid;place-items:center;background:#14202b66;padding:1rem}section{box-sizing:border-box;width:min(54rem,100%);max-height:calc(100dvh - 2rem);overflow:auto;background:#fff;border-top:4px solid #e1001a;padding:1.25rem;color:#14202b}header,nav,footer{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;justify-content:space-between}header h2{font-size:1.2rem;margin:0}nav{justify-content:flex-start;margin:1rem 0}nav [aria-pressed=true]{background:#e8f2fa;border-color:#145586}label{display:grid;gap:.4rem;font-weight:700}input{min-height:44px;padding:.6rem;font:inherit;border:1px solid #aeb7c0}p{font-size:.85rem}ul{list-style:none;padding:0;max-height:45dvh;overflow:auto}.object-result{display:grid;text-decoration:none;box-sizing:border-box;text-align:left;gap:.3rem;border:0;background:#fff;color:#145586;min-height:48px;width:100%;padding:.8rem;font:inherit;cursor:pointer}.object-result.is-new-tab{grid-template-columns:minmax(0,1fr) 18px;column-gap:.6rem}.object-result.is-new-tab>span{grid-column:1}.object-result.is-new-tab>img{grid-column:2;grid-row:1/3;align-self:center}.object-result:hover,.object-result:focus-visible{background:#e8f2fa}li{position:relative;border-bottom:1px solid #d6dade;min-width:0}li.has-provenance{display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:center}.object-result strong{overflow-wrap:anywhere}.provenance-info{display:grid;place-items:center;width:40px;height:40px;border:0;background:transparent;color:#145586;cursor:help}.provenance-info:hover,.provenance-info:focus-visible{background:#e8f2fa;outline:2px solid #145586;outline-offset:-2px}.provenance-info svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7}li span{color:#52606c;font-size:.8rem;overflow-wrap:anywhere}footer{justify-content:flex-end;margin-top:1rem}
  `]})
export class CatalogObjectBrowserComponent {
  readonly initialKind=input<CatalogObjectKind>('term');readonly closed=output<void>();
  readonly openInNewTab=input(false);
  readonly selectionMode=input(false);readonly selected=output<CatalogObjectResult>();
  readonly newTabResults=computed(()=>!this.selectionMode()&&(this.openInNewTab()||this.kind()==='logical'||this.kind()==='physical'));
  readonly kind=signal<CatalogObjectKind>('term');readonly query=signal('');readonly values=signal<readonly Result[]>([]);readonly loading=signal(true);readonly error=signal('');
  readonly kinds:readonly {id:CatalogObjectKind;label:string}[]=[{id:'term',label:'Terme'},{id:'domain',label:'Domänen'},{id:'logical',label:'Logische Modelle'},{id:'physical',label:'Physische Modelle'}];
  readonly results=computed(()=>this.values().filter(item=>(item.label+' '+item.description+' '+(item.searchText??'')).toLocaleLowerCase().includes(this.query().trim().toLocaleLowerCase())));
  private readonly api=inject(CatalogApiService);private readonly models=inject(DataModelsApiService);private readonly identity=inject(DemoIdentityService);private readonly router=inject(Router);private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);private readonly destroyRef=inject(DestroyRef);private request?:Subscription;
  constructor(){effect(()=>this.kind.set(this.initialKind()));effect(()=>{this.identity.userId();this.kind();this.load();});inject(DestroyRef).onDestroy(()=>this.request?.unsubscribe());afterNextRender(()=>this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus());}
  load():void{
    this.request?.unsubscribe();this.values.set([]);this.error.set('');this.loading.set(true);
    let request:Observable<readonly Result[]>;
    switch(this.kind()){
      case 'term':request=this.api.loadGlossaryTerms().pipe(map(items=>items.map(item=>({id:item.id,label:item.preferredLabel,description:item.definition,route:['/domains/terminology'],params:{q:item.preferredLabel,termId:item.id}}))));break;
      case 'domain':request=this.api.loadDomains().pipe(map(items=>items.map(item=>({id:item.id,label:item.preferredLabel,description:[...(item.departmentCodes??[]),...(item.officeCodes??[]),item.ownerName,item.definition].filter(Boolean).join(' \u00b7 '),route:['/domains',item.id]}))));break;
      case 'logical':request=this.models.listLogicalModels().pipe(map(items=>items.map(item=>({id:item.id,label:item.title.de||item.title.en,description:item.description.de||item.description.en,route:['/models',item.id]}))));break;
      case 'physical':request=this.models.listPhysicalSnapshots().pipe(switchMap(items=>{
        const latest=new Map<string,typeof items[number]>();for(const item of items)if(!latest.has(item.sourceId)||latest.get(item.sourceId)!.revision<item.revision)latest.set(item.sourceId,item);
        return latest.size?forkJoin([...latest.values()].map(item=>this.models.loadPhysicalSnapshot(item.id))):of([]);
      }),map(items=>items.flatMap(snapshot=>snapshot.tables.map(table=>this.physicalResult(snapshot,table)))));break;
    }
    this.request=request.subscribe({next:items=>{this.values.set(items);this.loading.set(false);},error:()=>{this.error.set('Die zugänglichen Objekte konnten nicht geladen werden.');this.loading.set(false);}});
  }
  private physicalResult(snapshot:PhysicalSnapshot,table:PhysicalTable):Result{
    const provider=snapshot.sourceType==='csv'?'CSV':snapshot.sourceType==='s3'?'S3':snapshot.sourceType==='fixture'?'Demo':'PostgreSQL';
    const category=physicalCategoryLabel(snapshot.sourceType);
    const imported=snapshot.importedAt?new Date(snapshot.importedAt):null;
    const details=[`${category} (${provider})`, `Quelle: ${snapshot.sourceName}`,
      `System: ${table.databaseName||snapshot.databaseName||snapshot.systemName||provider}`,
      snapshot.dataOwnerName?`Data Owner: ${snapshot.dataOwnerName}`:'',
      imported&&!Number.isNaN(imported.valueOf())?`Import: ${new Intl.DateTimeFormat('de-CH',{dateStyle:'short',timeStyle:'short'}).format(imported)}`:'',
      snapshot.importedBy?.displayName?`Importiert von: ${snapshot.importedBy.displayName}`:'',
      snapshot.revision?`Revision: ${snapshot.revision}`:'',
      snapshot.catalogPath?`Katalogpfad: ${snapshot.catalogPath}`:'',
      `Quellen-ID: ${snapshot.sourceId}`,`Objekt-ID: ${table.id}`].filter(Boolean);
    return{id:table.id,label:physicalObjectName(snapshot,table),
      description:`Quelle: ${snapshot.sourceName} \u00b7 ${category} (${provider})`,
      provenance:details.join(' \u00b7 '),searchText:details.join(' '),
      route:['/physical-models',snapshot.sourceId],params:{snapshotId:snapshot.id,tableId:table.id}};
  }
  async open(item:Result):Promise<void>{if(this.selectionMode()){this.selected.emit(item);return;}if(await this.router.navigate(item.route,{queryParams:item.params})&&!this.destroyRef.destroyed)this.closed.emit();}
  dialogKeydown(event:KeyboardEvent):void{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closed.emit();return;}
    if(event.key!=='Tab')return;const items=[...this.host.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]')],first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
}
