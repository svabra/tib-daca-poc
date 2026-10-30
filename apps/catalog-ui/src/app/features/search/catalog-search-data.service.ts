import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, from, map, mergeMap, of, Subscription, toArray } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { CatalogSearchAsset, domainSearchAsset, logicalSearchAsset, physicalSearchAssets, productSearchAsset, sourceSearchAsset, termSearchAsset } from './catalog-search.models';

@Injectable()
export class CatalogSearchDataService {
  private readonly api=inject(CatalogApiService);
  private readonly models=inject(DataModelsApiService);
  private readonly identity=inject(DemoIdentityService);
  private readonly destroyRef=inject(DestroyRef);
  private readonly metadata=signal<readonly CatalogSearchAsset[]>([]);
  private request?:Subscription;
  private generation=0;
  readonly loading=signal(false);
  readonly partial=signal(false);
  readonly organizationLabels=computed(()=>new Map(this.identity.users().flatMap(user=>[
    ...(user.office?[[user.office,user.organization] as const]:[]),
    ...(user.modelingAssignments??[]).map(assignment=>[assignment.organizationId,assignment.organizationName] as const),
  ])));
  readonly assets=computed(()=>[...this.api.products().map(productSearchAsset),...this.metadata()]);

  constructor(){effect(()=>{this.identity.userId();untracked(()=>this.reload());});this.destroyRef.onDestroy(()=>this.request?.unsubscribe());}
  reload():void{
    this.request?.unsubscribe();const generation=++this.generation,actor=this.identity.userId();
    this.metadata.set([]);this.partial.set(false);this.loading.set(true);
    const current=()=>generation===this.generation&&actor===this.identity.userId();
    const failed=()=>{if(current())this.partial.set(true);};
    this.request=forkJoin({
      domains:this.api.loadDomains().pipe(catchError(()=>{failed();return of([]);})),
      terms:this.api.loadGlossaryTerms().pipe(catchError(()=>{failed();return of([]);})),
      logical:this.models.listLogicalModels().pipe(catchError(()=>{failed();return of([]);})),
      sources:this.models.listPhysicalSources().pipe(catchError(()=>{failed();return of([]);})),
    }).pipe(mergeMap(({domains,terms,logical,sources})=>{
      if(current())this.metadata.set([...domains.map(domainSearchAsset),...terms.map(termSearchAsset),...logical.map(model=>logicalSearchAsset(model,domains)),...sources.map(sourceSearchAsset)]);
      return from(sources.filter(source=>source.latestSnapshotId)).pipe(mergeMap(source=>this.models.loadPhysicalSnapshot(source.latestSnapshotId!).pipe(
        map(snapshot=>physicalSearchAssets(source,snapshot)),catchError(()=>{failed();return of([] as CatalogSearchAsset[]);}),
      ),4),toArray(),map(groups=>groups.flat()));
    }),takeUntilDestroyed(this.destroyRef),finalize(()=>{if(current())this.loading.set(false);})).subscribe({
      next:physical=>{if(current())this.metadata.update(items=>[...items,...physical]);},
      error:()=>failed(),
    });
  }
}
