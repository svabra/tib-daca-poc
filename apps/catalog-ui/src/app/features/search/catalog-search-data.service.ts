import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, from, map, mergeMap, of, Subscription, toArray } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { CatalogSearchAsset, domainSearchAsset, logicalSearchAsset, physicalSearchAssets, productSearchAsset, sourceSearchAsset, termSearchAsset } from './catalog-search.models';
import type { OrganizationNetwork } from '../welcome/organization-canvas.component';
import { UserPreferencesService } from '../../core/user-preferences.service';

@Injectable()
export class CatalogSearchDataService {
  private readonly api=inject(CatalogApiService);
  private readonly models=inject(DataModelsApiService);
  private readonly identity=inject(DemoIdentityService);
  private readonly destroyRef=inject(DestroyRef);
  private readonly preferences=inject(UserPreferencesService);
  readonly network=signal<OrganizationNetwork|null>(null);
  private readonly metadata=signal<readonly CatalogSearchAsset[]>([]);
  private request?:Subscription;
  private generation=0;
  readonly loading=signal(false);
  readonly partial=signal(false);
  readonly organizationLabels=computed(()=>new Map([...this.identity.users().flatMap(user=>[
    ...(user.office?[[user.office,user.organization] as const]:[]),
    ...(user.modelingAssignments??[]).map(assignment=>[assignment.organizationId,assignment.organizationName] as const),
  ]),...(this.network()?.nodes??[]).map(node=>[node.id,node.localizations?.[this.preferences.language()]?.label??node.label] as const)]));
  readonly assets=computed<readonly CatalogSearchAsset[]>(()=>[...this.metadata().map(asset=>{
    if(asset.kind!=='term'&&asset.kind!=='domain')return asset;
    const nodes=this.network()?.nodes;if(!nodes)return asset;
    const assigned=nodes.filter(node=>node.objectKeys?.includes(asset.key));
    const ancestors=new Set<string>();
    for(const node of assigned){let parent=node.parentId;const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);ancestors.add(parent);parent=nodes.find(item=>item.id===parent)?.parentId??null;}}
    const direct=assigned.filter(node=>!ancestors.has(node.id));
    return {...asset,organization:direct[0]?.id??''};
  }),...(this.network()?.nodes??[]).filter(node=>node.kind!=='group').map(node=>{
    const localized=node.localizations?.[this.preferences.language()];
    return {key:'organization:'+node.id,id:node.id,kind:'organization' as const,label:localized?.label??node.label,
      description:localized?.description??node.description,context:[localized?.code??node.code],organization:node.id,
      domains:(this.network()?.domains??[]).filter(domain=>domain.objectKeys?.includes('organization:'+node.id)).map(domain=>({id:domain.id,label:domain.label})),
      status:'active',route:['/'],params:{organization:node.id},identifier:node.id,keywords:[node.code,node.label]};
  })]);
  private readonly organizationScopes=computed(()=>new Map(this.network()?.nodes.map(node=>[node.id,new Set(node.objectKeys??[])])??[]));
  private readonly domainScopes=computed(()=>new Map(this.network()?.domains.map(domain=>[domain.id,new Set(domain.objectKeys??[])])??[]));
  matchesOrganization(asset:CatalogSearchAsset,id:string):boolean {
    const keys=this.organizationScopes().get(id);
    return keys ? keys.has(asset.key)||!!asset.parent&&keys.has(asset.parent.key) : asset.organization===id;
  }
  matchesDomain(asset:CatalogSearchAsset,id:string):boolean {
    const keys=this.domainScopes().get(id);
    return keys ? keys.has(asset.key)||!!asset.parent&&keys.has(asset.parent.key) : asset.kind!=='domain'&&asset.domains.some(domain=>domain.id===id);
  }

  constructor(){effect(()=>{this.identity.userId();untracked(()=>this.reload());});this.destroyRef.onDestroy(()=>this.request?.unsubscribe());}
  reload():void{
    this.request?.unsubscribe();const generation=++this.generation,actor=this.identity.userId();
    this.metadata.set([]);this.network.set(null);this.partial.set(false);this.loading.set(true);
    const current=()=>generation===this.generation&&actor===this.identity.userId();
    const failed=()=>{if(current())this.partial.set(true);};
    this.request=forkJoin({
      products:this.api.loadSearchProducts().pipe(catchError(()=>{failed();return of([]);})),
      network:this.api.loadOrganizationNetwork().pipe(catchError(()=>{failed();return of(null);})),
      domains:this.api.loadDomains().pipe(catchError(()=>{failed();return of([]);})),
      terms:this.api.loadGlossaryTerms().pipe(catchError(()=>{failed();return of([]);})),
      logical:this.models.listLogicalModels().pipe(catchError(()=>{failed();return of([]);})),
      sources:this.models.listPhysicalSources().pipe(catchError(error=>{if(error.status!==403)failed();return of([]);})),
    }).pipe(mergeMap(({products,network,domains,terms,logical,sources})=>{
      if(current()){this.network.set(network);this.metadata.set([...products.map(productSearchAsset),...domains.map(domainSearchAsset),...terms.map(termSearchAsset),...logical.map(model=>logicalSearchAsset(model,domains)),...sources.map(sourceSearchAsset)]);}
      return from(sources.filter(source=>source.latestSnapshotId)).pipe(mergeMap(source=>this.models.loadPhysicalSnapshot(source.latestSnapshotId!).pipe(
        map(snapshot=>physicalSearchAssets(source,snapshot)),catchError(()=>{failed();return of([] as CatalogSearchAsset[]);}),
      ),4),toArray(),map(groups=>groups.flat()));
    }),takeUntilDestroyed(this.destroyRef),finalize(()=>{if(current())this.loading.set(false);})).subscribe({
      next:physical=>{if(current())this.metadata.update(items=>[...items,...physical]);},
      error:()=>failed(),
    });
  }
}
