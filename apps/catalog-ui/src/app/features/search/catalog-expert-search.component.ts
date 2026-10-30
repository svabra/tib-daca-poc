import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, linkedSignal, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { QualityMedalComponent } from '../../shared/quality-medal.component';
import { TooltipDirective } from '../../shared/tooltip.directive';
import { deliveryProtocols } from '../products/my-data-products';
import { catalogSearchIsReady, normalizeCatalogSearch } from '../welcome/welcome-search';
import { CatalogSearchDataService } from './catalog-search-data.service';
import { CatalogSearchAsset, groupSearchAssets, SEARCH_ICONS, SEARCH_KINDS, searchAssetIcon, searchAssetMatches, SearchKind, SearchMode } from './catalog-search.models';
import { SearchIconComponent } from './search-icon.component';

@Component({selector:'daca-catalog-expert-search',standalone:true,
  imports:[DatePipe,NgTemplateOutlet,RouterLink,QualityMedalComponent,SearchIconComponent,TooltipDirective],
  providers:[CatalogSearchDataService],changeDetection:ChangeDetectionStrategy.OnPush,
  templateUrl:'./catalog-expert-search.component.html',styleUrl:'./catalog-expert-search.component.css',
})
export class CatalogExpertSearchComponent {
  readonly api=inject(CatalogApiService);
  readonly data=inject(CatalogSearchDataService);
  readonly i18n=inject(CatalogI18nService);
  private readonly route=inject(ActivatedRoute);
  private readonly router=inject(Router);
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly params=toSignal(this.route.queryParamMap,{initialValue:this.route.snapshot.queryParamMap});
  readonly query=linkedSignal(()=>this.params().get('q')??'');
  readonly mode=linkedSignal<SearchMode>(()=>this.params().get('mode')==='focus'?'focus':'context');
  readonly selectedKind=linkedSignal<SearchKind|'all'>(()=>{const value=this.params().get('kind');return value==='table'?'structure':SEARCH_KINDS.includes(value as SearchKind)?value as SearchKind:'all';});
  readonly selectedDomain=linkedSignal(()=>this.params().get('domain')??'all');
  readonly selectedOwner=linkedSignal(()=>this.params().get('organization')??'all');
  readonly selectedStatus=linkedSignal(()=>this.params().get('status')==='active'?'active':'all');
  readonly selectedConnection=linkedSignal(()=>['connected','metadata'].includes(this.params().get('connection')??'')?this.params().get('connection')!:'all');
  readonly filterOpen=signal(false);
  readonly limit=signal(30);
  readonly sort=signal<'relevance'|'name'>('relevance');
  readonly kinds=SEARCH_KINDS;
  readonly icons=SEARCH_ICONS;
  readonly collapsedGroups=signal<ReadonlySet<string>>(new Set());
  readonly searchReady=computed(()=>catalogSearchIsReady(this.query()));
  readonly organizations=computed(()=>[...new Set(this.data.assets().map(item=>item.organization).filter(Boolean))].sort((a,b)=>a.localeCompare(b)));
  readonly domains=computed(()=>[...new Map(this.data.assets().flatMap(item=>item.domains).map(item=>[item.id,item])).values()].sort((a,b)=>a.label.localeCompare(b.label)));
  readonly filterCount=computed(()=>[this.selectedOwner(),this.selectedDomain(),this.selectedStatus(),this.selectedConnection()].filter(value=>value!=='all').length);
  readonly matches=computed(()=>{
    if(!this.searchReady())return[];
    return this.data.assets().filter(item=>searchAssetMatches(item,this.query()))
      .filter(item=>this.selectedOwner()==='all'||item.organization===this.selectedOwner())
      .filter(item=>this.selectedDomain()==='all'||item.domains.some(domain=>domain.id===this.selectedDomain()))
      .filter(item=>this.selectedStatus()==='all'||['active','published','validated'].includes(item.status))
      .filter(item=>this.selectedConnection()==='all'||item.connection?.configured===(this.selectedConnection()==='connected'));
  });
  readonly counts=computed(()=>Object.fromEntries(SEARCH_KINDS.map(kind=>[kind,this.matches().filter(item=>item.kind===kind).length])) as Record<SearchKind,number>);
  readonly results=computed(()=>{
    const query=normalizeCatalogSearch(this.query());
    return this.matches().filter(item=>this.selectedKind()==='all'||item.kind===this.selectedKind()).sort((a,b)=>{
      if(this.sort()==='relevance'){const score=(item:CatalogSearchAsset)=>normalizeCatalogSearch(item.label)===query?2:normalizeCatalogSearch(item.label).startsWith(query)?1:0;const difference=score(b)-score(a);if(difference)return difference;}
      return a.label.localeCompare(b.label,this.i18n.language());
    });
  });
  readonly visibleResults=computed(()=>this.results().slice(0,this.limit()));
  readonly groups=computed(()=>groupSearchAssets(this.visibleResults()));
  private readonly hoveredKey=signal<string|null>(null);
  readonly pinnedKey=signal<string|null>(null);
  readonly previewOpen=signal(false);
  readonly preview=computed(()=>{
    if(!this.previewOpen())return null;
    const key=this.pinnedKey()??this.hoveredKey();
    return this.results().find(item=>item.key===key)??this.groups().find(group=>group.parent.key===key)?.parent??null;
  });
  private hoverTimer?:ReturnType<typeof setTimeout>;
  private closeTimer?:ReturnType<typeof setTimeout>;
  private previewTrigger:HTMLElement|null=null;
  private restoringPreviewFocus=false;
  readonly protocolLabel=(asset:CatalogSearchAsset)=>asset.product?[...new Set(deliveryProtocols(asset.product))].join(' · '):'';

  constructor(){
    effect(()=>{this.query();this.selectedKind();this.selectedOwner();this.selectedDomain();this.selectedStatus();this.selectedConnection();untracked(()=>{this.limit.set(30);this.collapsedGroups.set(new Set());});});
    effect(()=>{const key=this.pinnedKey()??this.hoveredKey();const available=this.results().some(item=>item.key===key)||this.groups().some(group=>group.parent.key===key);if(key&&!available)untracked(()=>this.closePreview(false));});
    inject(DestroyRef).onDestroy(()=>{clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);});
  }
  private updateUrl():void{
    void this.router.navigate([],{relativeTo:this.route,queryParamsHandling:'merge',replaceUrl:true,queryParams:{
      q:this.query().trim()||null,mode:this.mode()==='context'?null:this.mode(),kind:this.selectedKind()==='all'?null:this.selectedKind(),
      domain:this.selectedDomain()==='all'?null:this.selectedDomain(),organization:this.selectedOwner()==='all'?null:this.selectedOwner(),
      status:this.selectedStatus()==='all'?null:this.selectedStatus(),connection:this.selectedConnection()==='all'?null:this.selectedConnection(),
    }});
  }
  updateQuery(value:string):void{this.query.set(value);this.updateUrl();}
  clearQuery():void{this.updateQuery('');this.host.nativeElement.querySelector<HTMLInputElement>('#expert-search-input')?.focus();}
  setMode(mode:SearchMode):void{this.mode.set(mode);this.updateUrl();}
  selectKind(kind:SearchKind|'all'):void{this.selectedKind.set(kind);this.updateUrl();}
  loadMore():void{this.limit.update(value=>value+30);}
  readonly assetIcon=searchAssetIcon;
  organizationLabel(value:string):string{return this.data.organizationLabels().get(value)??value;}
  contextLabel(asset:CatalogSearchAsset):string{return asset.context.map(value=>this.organizationLabel(value)).join(' › ');}
  setFilter(name:'domain'|'organization'|'status'|'connection',value:string):void{
    if(name==='domain')this.selectedDomain.set(value);else if(name==='organization')this.selectedOwner.set(value);
    else if(name==='status')this.selectedStatus.set(value==='active'?'active':'all');else this.selectedConnection.set(value);
    this.updateUrl();
  }
  resetFilters():void{this.selectedDomain.set('all');this.selectedOwner.set('all');this.selectedStatus.set('all');this.selectedConnection.set('all');this.updateUrl();}
  toggleGroup(key:string):void{this.collapsedGroups.update(values=>{const next=new Set(values);if(next.has(key))next.delete(key);else next.add(key);return next;});}
  domainLabel():string{return this.domains().find(item=>item.id===this.selectedDomain())?.label??this.selectedDomain();}
  kindLabel(kind:SearchKind,plural=false):string{return this.i18n.t(({product:plural?'searchProducts':'searchProduct',logical:plural?'searchLogicalModels':'searchModel',structure:plural?'searchStructures':'searchStructure',field:plural?'searchFields':'searchField',term:plural?'searchTerms':'searchObjectTerm',domain:plural?'domains':'searchDomain',source:plural?'sourcePlural':'searchSource'} as const)[kind]);}
  kindExplanation(kind:SearchKind|'all'):string{return this.i18n.t(({all:'searchAllExplanation',product:'searchProductExplanation',logical:'searchLogicalExplanation',structure:'searchStructureExplanation',field:'searchFieldExplanation',term:'searchTermExplanation',domain:'searchDomainExplanation',source:'searchSourceExplanation'} as const)[kind]);}
  assetTypeLabel(asset:CatalogSearchAsset):string{
    if(asset.kind!=='structure')return this.kindLabel(asset.kind);
    if(asset.sourceType==='s3')return this.i18n.t(asset.physicalType==='parquet'?'searchS3ParquetObject':'searchS3Object');
    if(asset.physicalType==='parquet')return this.i18n.t('searchParquetObject');
    if(asset.physicalType==='view')return this.i18n.t('searchView');
    if(asset.physicalType==='materialized_view')return this.i18n.t('searchMaterializedView');
    return asset.physicalType==='table'?this.i18n.t('searchTable'):this.kindLabel('structure');
  }
  schedulePreview(asset:CatalogSearchAsset,trigger:EventTarget|null):void{
    if(this.restoringPreviewFocus)return;
    clearTimeout(this.closeTimer);clearTimeout(this.hoverTimer);if(this.pinnedKey())return;
    this.hoverTimer=setTimeout(()=>{this.hoveredKey.set(asset.key);this.previewTrigger=trigger instanceof HTMLElement?trigger:null;this.previewOpen.set(true);},180);
  }
  pinPreview(asset:CatalogSearchAsset,trigger:EventTarget|null):void{
    clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);this.previewTrigger=trigger instanceof HTMLElement?trigger:null;
    this.hoveredKey.set(asset.key);this.pinnedKey.set(asset.key);this.previewOpen.set(true);
    setTimeout(()=>this.host.nativeElement.querySelector<HTMLElement>('.search-preview h2')?.focus({preventScroll:true}),0);
  }
  togglePin():void{const item=this.preview();if(item)this.pinnedKey.set(this.pinnedKey()?null:item.key);}
  keepPreview():void{clearTimeout(this.closeTimer);}
  closePreviewSoon():void{
    clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);if(this.pinnedKey())return;
    this.closeTimer=setTimeout(()=>{if(!this.host.nativeElement.querySelector('.search-preview')?.contains(document.activeElement))this.closePreview(false);},250);
  }
  closePreview(restoreFocus=true):void{
    clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);this.previewOpen.set(false);this.pinnedKey.set(null);this.hoveredKey.set(null);
    if(restoreFocus){this.restoringPreviewFocus=true;try{this.previewTrigger?.focus({preventScroll:true});}finally{this.restoringPreviewFocus=false;}}
  }
}
