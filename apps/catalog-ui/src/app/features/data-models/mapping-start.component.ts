import { physicalCategoryKey } from './physical-representation-labels';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, ViewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { SearchIconComponent } from '../search/search-icon.component';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator.component';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModelSummary, PhysicalDomainState, PhysicalSnapshot, PhysicalTable, RecentMappingWorkspace } from './data-models.models';
import { DomainAssignmentChoice, ModelDomainDialogComponent } from './model-domain-dialog.component';
import { RepresentationPickerComponent } from './representation-picker.component';
import { MappingDraftFacade } from './mapping-draft.facade';
import { MappingGraphComponent } from './mapping-graph.component';

@Component({
  selector:'daca-mapping-start',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[RouterLink,DatePipe,SearchIconComponent,RepresentationPickerComponent,LoadingIndicatorComponent,MappingGraphComponent,ModelDomainDialogComponent],
  providers:[MappingDraftFacade],
  templateUrl:'./mapping-start.component.html',styleUrl:'./mapping-start.component.css',
})
export class MappingStartComponent {
  readonly i18n=inject(CatalogI18nService);
  readonly physicalCategoryKey=physicalCategoryKey;
  readonly canDeriveLogical=computed(()=>!!this.physical()&&this.identity.canEditModels()&&!this.physicalLoading()&&!this.opening()&&!this.checking());
  private readonly api=inject(DataModelsApiService);
  private readonly identity=inject(DemoIdentityService);
  private readonly router=inject(Router);
  private readonly route=inject(ActivatedRoute);
  private readonly destroyRef=inject(DestroyRef);
  readonly facade=inject(MappingDraftFacade);
  private readonly routeParams=toSignal(this.route.paramMap,{initialValue:this.route.snapshot.paramMap});
  readonly physicalRoute=computed(()=>!!this.routeParams().get('snapshotId'));
  @ViewChild('logicalQuery') private queryInput?:ElementRef<HTMLInputElement>;
  @ViewChild('logicalTrigger') private logicalTrigger?:ElementRef<HTMLButtonElement>;
  @ViewChild('physicalTrigger') private physicalTrigger?:ElementRef<HTMLButtonElement>;
  readonly models=signal<readonly LogicalModelSummary[]>([]);
  readonly recent=signal<readonly RecentMappingWorkspace[]>([]);
  readonly selectedModel=signal<LogicalModelSummary|null>(null);
  readonly physical=signal<{snapshot:PhysicalSnapshot;table:PhysicalTable}|null>(null);
  readonly logicalOpen=signal(false);
  readonly physicalOpen=signal(false);
  readonly initialPhysicalSnapshot=signal<PhysicalSnapshot|null>(null);
  readonly query=signal('');
  readonly limit=signal(8);
  readonly increaseLimit=(value:number)=>value+8;
  readonly showAllRecent=signal(false);
  readonly loading=signal(true);
  readonly historyLoading=signal(true);
  readonly physicalLoading=signal(false);
  readonly opening=signal(false);
  readonly checking=signal(false);
  readonly error=signal('');
  readonly historyError=signal(false);
  readonly selectionNotice=signal('');
  readonly domainOpen=signal(false);readonly domainBusy=signal(false);readonly domainError=signal<string|null>(null);
  readonly canManageDomains=computed(()=>this.identity.canEditModels()&&this.physical()?.table.domainAssignable!==false);
  openPhysicalDomainDialog():void{
    const item=this.physical();if(!item||!this.canManageDomains()||this.domainBusy())return;
    this.domainOpen.set(true);this.domainBusy.set(true);this.domainError.set(null);const generation=this.generation;
    this.api.loadPhysicalDomains(item.table.id).subscribe({next:state=>{if(generation!==this.generation)return;this.updateDomains(state);this.domainBusy.set(false);},error:(error:Error)=>{if(generation!==this.generation)return;this.domainBusy.set(false);this.domainError.set(error.message);}});
  }
  assignPhysicalDomain(choice:DomainAssignmentChoice):void{
    const item=this.physical(),target=choice.physicalDomainTargets.find(entry=>entry.physicalTableId===item?.table.id);
    if(!item||!target||!this.canManageDomains()||this.domainBusy())return;
    this.domainBusy.set(true);this.domainError.set(null);const generation=this.generation;
    this.api.assignPhysicalDomain(item.table.id,choice.domainId,target).subscribe({next:state=>{if(generation!==this.generation)return;this.updateDomains(state);this.domainBusy.set(false);this.domainOpen.set(false);},error:(error:Error)=>{if(generation!==this.generation)return;this.domainBusy.set(false);this.domainError.set(error.message);}});
  }
  removePhysicalDomain(tableId:string,domainId:string):void{
    const item=this.physical();if(!item||item.table.id!==tableId||!item.table.domainVersion||!this.canManageDomains()||this.domainBusy())return;
    this.domainBusy.set(true);this.error.set('');const generation=this.generation;
    this.api.removePhysicalDomain(tableId,domainId,{physicalTableId:tableId,physicalSnapshotId:item.snapshot.id,expectedDomainVersion:item.table.domainVersion}).subscribe({next:state=>{if(generation!==this.generation)return;this.updateDomains(state);this.domainBusy.set(false);this.facade.announcement.set('Domänenzuordnung entfernt.');},error:(error:Error)=>{if(generation!==this.generation)return;this.domainBusy.set(false);this.error.set(error.message+' Die Domänenzuordnung wurde nicht entfernt.');}});
  }
  private updateDomains(state:PhysicalDomainState):void{
    const item=this.physical();if(!item)return;
    this.facade.updatePhysicalDomains(item.snapshot.sourceId,item.table.stableKey,state);
    this.physical.set({...item,table:{...item.table,...state},snapshot:{...item.snapshot,tables:item.snapshot.tables.map(table=>table.stableKey===item.table.stableKey?{...table,...state}:table)}});
  }
  private generation=0;
  private compatibilityToken=0;
  private modelPickerTrigger:HTMLElement|null=null;
  readonly matches=computed(()=>{
    const query=this.query().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase().trim();
    return this.models().filter(model=>[...Object.values(model.title),...model.identifiers,model.office].join(' ').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase().includes(query));
  });
  readonly visibleRecent=computed(()=>this.recent().slice(0,this.showAllRecent()?10:5));
  readonly canStart=computed(()=>!!this.selectedModel()&&!this.checking()&&!this.selectionNotice());

  constructor(){
    const params=this.route.snapshot.queryParamMap;
    const modelId=params.get('logicalModelId');
    if(modelId){void this.router.navigate(['/models',modelId,'mappings'],{queryParams:{...this.route.snapshot.queryParams,logicalModelId:null},replaceUrl:true});return;}
    if(params.get('physicalSnapshotId')&&params.get('physicalTableId')){void this.router.navigate(['/mappings/physical',params.get('physicalSnapshotId'),params.get('physicalTableId')],{replaceUrl:true});return;}
    effect(()=>{this.identity.userId();this.routeParams();untracked(()=>this.load());});
  }
  load():void{
    const generation=++this.generation;++this.compatibilityToken;
    this.domainOpen.set(false);this.domainBusy.set(false);this.domainError.set(null);
    this.models.set([]);this.recent.set([]);this.selectedModel.set(null);this.physical.set(null);this.facade.clear();
    this.logicalOpen.set(false);this.physicalOpen.set(false);this.checking.set(false);this.selectionNotice.set('');
    this.initialPhysicalSnapshot.set(null);
    this.query.set('');this.limit.set(8);this.showAllRecent.set(false);this.loading.set(true);this.historyLoading.set(true);this.physicalLoading.set(false);this.opening.set(false);this.error.set('');this.historyError.set(false);
    this.api.listLogicalModels().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:models=>{
      if(generation!==this.generation)return;this.models.set(models.filter(model=>model.status!=='retired'));this.loading.set(false);
    },error:()=>{if(generation===this.generation){this.loading.set(false);this.error.set(this.i18n.t('mappingStartLoadError'));}}});
    this.api.recentMappingWorkspaces().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:recent=>{if(generation===this.generation){this.recent.set(recent);this.historyLoading.set(false);}},error:()=>{if(generation===this.generation){this.historyError.set(true);this.historyLoading.set(false);}}});
    const snapshotId=this.routeParams().get('snapshotId')||this.route.snapshot.queryParamMap.get('physicalSnapshotId');
    if(snapshotId){
      this.physicalLoading.set(true);
      this.api.loadPhysicalSnapshot(snapshotId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:snapshot=>{
        if(generation!==this.generation)return;this.physicalLoading.set(false);
        const tableId=this.routeParams().get('tableId'),table=snapshot.tables.find(item=>item.id===tableId);
        if(table){this.physical.set({snapshot,table});this.facade.openPhysicalSelection(snapshot,table);}
        else if(tableId)this.error.set(this.i18n.t('mappingStartPhysicalMissing'));
        else{this.initialPhysicalSnapshot.set(snapshot);this.physicalOpen.set(true);}
      },error:()=>{if(generation===this.generation){this.physicalLoading.set(false);this.error.set(this.i18n.t('mappingStartPhysicalMissing'));}}});
    }
  }
  title(model:{title:object}):string{const title=model.title as Record<string,string|null|undefined>;return title[this.i18n.language()]||title['de']||title['en']||Object.values(title).find(Boolean)||this.i18n.t('searchModel');}
  openLogical(trigger:EventTarget|null=null):void{this.modelPickerTrigger=trigger instanceof HTMLElement?trigger:this.logicalTrigger?.nativeElement??null;this.logicalOpen.set(true);setTimeout(()=>this.queryInput?.nativeElement.focus(),0);}
  closeLogical():void{this.logicalOpen.set(false);this.modelPickerTrigger?.focus({preventScroll:true});}
  chooseModel(model:LogicalModelSummary):void{if(this.checking()||this.opening())return;this.selectedModel.set(model);this.closeLogical();if(this.physical())this.checkCompatibility();else this.start();}
  choosePhysical(value:{snapshot:PhysicalSnapshot;table:PhysicalTable}):void{
    if(this.opening())return;this.physicalOpen.set(false);this.opening.set(true);const generation=this.generation;
    void this.router.navigate(['/mappings/physical',value.snapshot.id,value.table.id]).then(ok=>{if(generation===this.generation&&!ok){this.opening.set(false);this.selectionNotice.set(this.i18n.t('mappingStartOpenError'));}},()=>{if(generation===this.generation){this.opening.set(false);this.selectionNotice.set(this.i18n.t('mappingStartOpenError'));}});
  }
  deriveLogical(tableId=this.physical()?.table.id):void{
    const physical=this.physical();if(!physical||tableId!==physical.table.id||!this.canDeriveLogical())return;
    const generation=this.generation;this.logicalOpen.set(false);this.opening.set(true);this.selectionNotice.set('');
    void this.router.navigate(['/models/new'],{queryParams:{physicalSnapshotId:physical.snapshot.id,physicalTableId:physical.table.id}}).then(ok=>{
      if(generation===this.generation&&!ok){this.opening.set(false);this.selectionNotice.set(this.i18n.t('mappingStartOpenError'));}
    },()=>{if(generation===this.generation){this.opening.set(false);this.selectionNotice.set(this.i18n.t('mappingStartOpenError'));}});
  }
  closePhysical():void{this.physicalOpen.set(false);setTimeout(()=>this.physicalTrigger?.nativeElement.focus(),0);}
  search(event:Event):void{this.query.set((event.target as HTMLInputElement).value);this.limit.set(8);}
  private checkCompatibility():void{
    const model=this.selectedModel(),physical=this.physical(),token=++this.compatibilityToken;
    this.selectionNotice.set('');this.checking.set(false);if(!model||!physical)return;
    this.checking.set(true);
    this.api.listPhysicalSources(false,model.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:sources=>{
      if(token!==this.compatibilityToken)return;this.checking.set(false);
      const source=sources.find(item=>item.id===physical.snapshot.sourceId);
      if(!source||source.representationAttachable===false)this.selectionNotice.set(source?.representationDisabledReason||this.i18n.t('mappingStartIncompatible'));else this.start();
    },error:()=>{if(token===this.compatibilityToken){this.checking.set(false);this.selectionNotice.set(this.i18n.t('mappingStartCheckError'));}}});
  }
  start():void{
    const model=this.selectedModel(),physical=this.physical();if(!model||!this.canStart()||this.opening())return;
    const generation=this.generation;this.opening.set(true);
    void this.router.navigate(['/models',model.id,'mappings'],{queryParams:physical?{physicalSnapshotId:physical.snapshot.id,physicalTableId:physical.table.id,addRepresentation:'1'}:{}}).then(ok=>{if(generation===this.generation&&!ok){this.opening.set(false);this.selectionNotice.set(this.i18n.t('mappingStartOpenError'));}},()=>{if(generation===this.generation){this.opening.set(false);this.selectionNotice.set(this.i18n.t('mappingStartOpenError'));}});
  }
  recentParams(item:RecentMappingWorkspace):Record<string,string>{
    return{view:item.view,...(item.physicalSnapshotId&&item.physicalTableId?{physicalSnapshotId:item.physicalSnapshotId,physicalTableId:item.physicalTableId,addRepresentation:'1'}:{})};
  }
}
