import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, Injector, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TooltipDirective } from '../../shared/tooltip.directive';
import { RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin, Subscription } from 'rxjs';
import dagre from '@dagrejs/dagre';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DOMAIN_RELATION_TYPES, domainRelationLabel, domainRelationDescription } from './domain-relation-types';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainChangeRequest, DomainNetworkLink, DomainRelationType, DomainSummary, SemanticGraphState } from '../../core/catalog.models';
import { printMappingCanvas } from '../data-models/mapping-canvas-print';
import { CatalogObjectBrowserComponent, CatalogObjectKind, CatalogObjectResult } from './catalog-object-browser.component';
import { CanvasHoldGesture } from './canvas-hold-gesture';
import { SemanticCreateDialogComponent, SemanticCreation } from './semantic-create-dialog.component';

interface Point{x:number;y:number;}
interface DomainNode extends Point{domain:DomainSummary;id:string;}
interface LinkEdit{index:number|null;sourceId:string;targetId:string;relationType:DomainRelationType;}

@Component({selector:'daca-domain-network',standalone:true,imports:[RouterLink,FormsModule,TooltipDirective,CatalogObjectBrowserComponent,SemanticCreateDialogComponent],changeDetection:ChangeDetectionStrategy.OnPush,templateUrl:'./domain-network.component.html',styleUrls:['./concept-network-editor.component.css','./domain-network.component.css']})
export class DomainNetworkComponent {
  readonly embedded=input(false);
  private readonly api=inject(CatalogApiService);private readonly identity=inject(DemoIdentityService);private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);private readonly injector=inject(Injector);private request?:Subscription;
  readonly domains=signal<readonly DomainSummary[]>([]);readonly saved=signal<SemanticGraphState|null>(null);readonly positions=signal<Record<string,Point>>({});readonly links=signal<DomainNetworkLink[]>([]);
  readonly loading=signal(true);readonly saving=signal(false);readonly error=signal('');readonly notice=signal('');readonly zoom=signal(.8);readonly fullscreen=signal(false);readonly printing=signal(false);
  readonly layoutDirty=signal(false);readonly linksDirty=signal(false);readonly dirty=computed(()=>this.layoutDirty()||this.linksDirty());readonly canLayout=computed(()=>!!this.saved()?.canEditLayout&&!this.saving());readonly canRelations=computed(()=>!!this.saved()?.canEditRelations&&!this.saving());
  readonly connectionFeedback=signal('');readonly connecting=signal<string|null>(null);readonly pointer=signal<Point|null>(null);readonly selectedLink=signal<number|null>(null);readonly edit=signal<LinkEdit|null>(null);
  readonly menu=signal<{id:string|null;x:number;y:number}|null>(null);readonly objectBrowser=signal<CatalogObjectKind|null>(null);
  readonly objectKinds:readonly {id:CatalogObjectKind;label:string}[]=[{id:'term',label:'Term suchen und öffnen'},{id:'domain',label:'Domäne suchen und öffnen'},{id:'logical',label:'Logisches Modell suchen und öffnen'},{id:'physical',label:'Physisches Modell suchen und öffnen'}];
  private readonly i18n=inject(CatalogI18nService);
  readonly relationTypes=DOMAIN_RELATION_TYPES;
  readonly relationshipLegend=computed(()=>this.relationTypes.map(type=>this.domainLabel(type)).join(' · '));
  domainLabel(type:DomainRelationType):string{return domainRelationLabel(type,this.i18n);}
  domainDescription(type:DomainRelationType):string{return domainRelationDescription(type,this.i18n);}
  readonly hold=new CanvasHoldGesture();readonly hiddenIds=signal<string[]>([]);readonly showRetired=signal(false);
  readonly heldPermissionHint=computed(()=>{const held=this.hold.active();return held&&!this.canSource(held.id)?'Beziehungen bearbeiten Data Owner oder Stellvertretung der Ausgangsdomäne. Sie können diese Karte weiterhin verschieben.':'';});
  readonly dropMenu=signal<{sourceId:string;point:Point;x:number;y:number}|null>(null);readonly selectionOpen=signal(false);readonly creationOpen=signal(false);readonly creationBusy=signal(false);
  readonly pendingCards=signal<{id:string;label:string;definition:string;point:Point;sourceId:string}[]>([]);
  private dropContext:{sourceId:string;point:Point}|null=null;
  readonly heldPreview=computed(()=>{const hold=this.hold.active(),source=this.nodes().find(node=>node.id===hold?.id);if(!hold||!source||!this.canSource(source.id))return null;const end=this.point(hold),start={x:source.x+(end.x>=source.x+115?230:0),y:source.y+50};return{start,end,path:`M ${start.x} ${start.y} L ${end.x} ${end.y}`};});
  readonly hiddenDomains=computed(()=>this.domains().filter(domain=>this.hiddenIds().includes('domain:'+domain.id)));
  readonly nodes=computed<DomainNode[]>(()=>{
    const graph=new dagre.graphlib.Graph();graph.setGraph({rankdir:'LR',nodesep:45,ranksep:110,marginx:35,marginy:35});graph.setDefaultEdgeLabel(()=>({}));
    for(const domain of this.domains())graph.setNode(domain.id,{width:230,height:100});
    for(const link of this.links())if(graph.hasNode(link.sourceId)&&graph.hasNode(link.targetId))graph.setEdge(link.sourceId,link.targetId);
    dagre.layout(graph);
    return this.domains().map((domain,index)=>{const point=graph.node(domain.id) as Point,automatic=this.links().length?{x:point.x-115,y:point.y-50}:{x:35+(index%3)*340,y:35+Math.floor(index/3)*150};return{domain,id:domain.id,...(this.positions()['domain:'+domain.id]??automatic)};}).filter(node=>!this.hiddenIds().includes('domain:'+node.id)&&(this.showRetired()||node.domain.status==='active'));
  });
  readonly edges=computed(()=>this.links().flatMap((link,index)=>{
    const source=this.nodes().find(node=>node.id===link.sourceId),target=this.nodes().find(node=>node.id===link.targetId);if(!source||!target)return[];
    const right=target.x>=source.x,start={x:source.x+(right?230:0),y:source.y+50},end={x:target.x+(right?0:230),y:target.y+50};const moving=this.pointer();if(this.drag?.edge===index&&moving)Object.assign(this.drag.side==='source'?start:end,moving);const bend=Math.max(60,Math.abs(end.x-start.x)*.4),direction=right?1:-1;
    return[{...link,index,start,end,sourceSide:right?'right' as const:'left' as const,targetSide:right?'left' as const:'right' as const,x:(start.x+end.x)/2,y:(start.y+end.y)/2-8,path:`M ${start.x} ${start.y} C ${start.x+direction*bend} ${start.y}, ${end.x-direction*bend} ${end.y}, ${end.x} ${end.y}`}];
  }));
  readonly width=computed(()=>Math.max(1100,...this.nodes().map(node=>node.x+270),...this.pendingCards().map(node=>node.point.x+270)));readonly height=computed(()=>Math.max(550,...this.nodes().map(node=>node.y+145),...this.pendingCards().map(node=>node.point.y+145)));
  readonly preview=computed(()=>{const source=this.nodes().find(node=>node.id===this.connecting()),point=this.pointer();return source&&point?`M ${source.x+230} ${source.y+50} L ${point.x} ${point.y}`:'';});
  private drag:{node?:DomainNode;source?:string;edge?:number;side?:'source'|'target';pointerId:number;handle:Element|null;start:Point;positions:Record<string,Point>;moved:boolean}|null=null;
  private bodyOverflow='';private menuTrigger:HTMLElement|null=null;
  private suppressPortClick=false;private suppressNodeClick=false;
  constructor(){effect(()=>{this.identity.userId();this.load();});inject(DestroyRef).onDestroy(()=>{this.hold.cancel();this.releaseCapture();this.request?.unsubscribe();this.restoreFullscreen();});}
  load():void{
    this.hold.cancel();this.request?.unsubscribe();this.saving.set(false);this.loading.set(true);this.domains.set([]);this.saved.set(null);this.positions.set({});this.links.set([]);this.pendingCards.set([]);this.hiddenIds.set([]);this.layoutDirty.set(false);this.linksDirty.set(false);this.error.set('');this.connectionFeedback.set('');this.releaseCapture();this.drag=null;this.edit.set(null);this.menu.set(null);this.objectBrowser.set(null);this.dropMenu.set(null);this.creationOpen.set(false);this.selectionOpen.set(false);this.creationBusy.set(false);
    this.request=forkJoin({domains:this.api.loadDomains(true),graph:this.api.loadSemanticGraph('domains'),requests:this.api.loadDomainChangeRequests()}).subscribe({next:({domains,graph,requests})=>{this.domains.set(domains);this.applySaved(graph);this.restorePending(requests);this.loading.set(false);},error:()=>{this.error.set('Das Domänennetz konnte nicht geladen werden.');this.loading.set(false);}});
  }
  private applySaved(graph:SemanticGraphState):void{this.saved.set(graph);this.positions.set(graph.positions);this.links.set(graph.relations);this.hiddenIds.set(graph.hiddenNodeIds??[]);this.layoutDirty.set(false);this.linksDirty.set(false);}
  async save():Promise<void>{const base=this.saved(),actor=this.identity.userId();if(!base||!this.dirty()||!this.canLayout())return;this.saving.set(true);this.error.set('');try{
    const graph=await firstValueFrom(this.api.saveSemanticGraph('domains',{revision:base.revision,positions:this.positions(),hiddenNodeIds:this.hiddenIds(),...(this.linksDirty()?{relations:this.links()}:{})}));
    if(actor===this.identity.userId()){this.applySaved(graph);this.notice.set('Domänennetz für alle gespeichert.');}
  }catch(error){if(actor===this.identity.userId())this.error.set(`${error instanceof Error?error.message:'Nicht gespeichert.'} Der lokale Entwurf bleibt erhalten. Laden Sie bei einem Konflikt die Seite neu.`);}finally{if(actor===this.identity.userId())this.saving.set(false);}}
  discard():void{const saved=this.saved();if(saved)this.applySaved(saved);this.edit.set(null);this.connecting.set(null);this.notice.set('Lokalen Entwurf verworfen.');}
  autoLayout():void{if(!this.canLayout())return;this.positions.set({});this.layoutDirty.set(true);}
  private pin():void{this.positions.set(Object.fromEntries(this.nodes().map(node=>['domain:'+node.id,{x:node.x,y:node.y}])));}
  private point(event:Pick<PointerEvent,'clientX'|'clientY'>):Point{const rect=this.host.nativeElement.querySelector('.graph-canvas')!.getBoundingClientRect();return{x:(event.clientX-rect.left)/this.zoom(),y:(event.clientY-rect.top)/this.zoom()};}
  hasPort(id:string,side:'left'|'right'):boolean{return this.edges().some(edge=>(edge.sourceId===id&&edge.sourceSide===side)||(edge.targetId===id&&edge.targetSide===side));}
  private capture(event:PointerEvent):void{try{(event.currentTarget as Element)?.setPointerCapture(event.pointerId);}catch{/* Synthetic events may not have an active pointer. */}}
  private releaseCapture():void{try{if(this.drag)this.drag.handle?.releasePointerCapture(this.drag.pointerId);}catch{/* Capture can already have ended. */}}
  private hitNodes(event:PointerEvent):Element[]{return document.elementsFromPoint(event.clientX,event.clientY).filter(element=>this.host.nativeElement.contains(element));}
  private hitDomain(elements:Element[]):string|undefined{return elements.map(element=>element.closest<HTMLElement>('.graph-node[data-domain-id]')).find(Boolean)?.dataset['domainId'];}
  startNode(node:DomainNode,event:PointerEvent):void{
    if(event.button!==0||!this.canLayout()||(event.target as Element).closest('button,a'))return;
    // A target click must preserve a connection started through the context menu.
    if(this.connecting()){event.stopPropagation();return;}
    event.preventDefault();event.stopPropagation();this.suppressNodeClick=false;this.connectionFeedback.set('');this.menu.set(null);
    if(node.domain.status==='active')this.hold.start(node.id,event);
    this.drag={node,pointerId:event.pointerId,handle:event.currentTarget as Element|null,start:this.point(event),positions:this.positions(),moved:false};this.capture(event);
  }
  nodeClicked(id:string):void{if(this.suppressNodeClick){this.suppressNodeClick=false;return;}if(this.connecting())this.finish(id);}
  canSource(id:string):boolean{return this.canRelations()&&(this.saved()?.relationSourceNodeIds?.includes('domain:'+id)??true);}
  portClick(id:string):void{if(this.suppressPortClick){this.suppressPortClick=false;return;}this.begin(id);}
  begin(id:string,event?:PointerEvent):void{if(!this.canSource(id)||this.domains().find(domain=>domain.id===id)?.status!=='active')return;this.connectionFeedback.set('');this.menu.set(null);this.connecting.set(id);if(event){event.preventDefault();event.stopPropagation();this.drag={source:id,pointerId:event.pointerId,handle:event.currentTarget as Element|null,start:this.point(event),positions:this.positions(),moved:false};this.capture(event);}}
  finish(id:string):void{const source=this.connecting();if(!source||!this.canRelations())return;this.connecting.set(null);this.pointer.set(null);if(source!==id)this.openEdit({index:null,sourceId:source,targetId:id,relationType:'related'});}
  private completeHeldLink(sourceId: string, targetId: string): void {
    this.pointer.set(null);this.connecting.set(null);
    if (!this.canSource(sourceId)) { const message='Beziehungen bearbeiten Data Owner oder Stellvertretung der Ausgangsdomäne. Das Layout können Sie weiterhin ändern.';this.error.set(message);this.connectionFeedback.set(message);return; }
    if (this.domains().find(domain => domain.id === targetId)?.status !== 'active') { this.error.set('Beziehungen benötigen zwei aktive Domänen.');return; }
    this.edit.set({index:null,sourceId,targetId,relationType:'related'});
    this.applyLink();
    if (!this.edit()) this.notice.set('Verbindung «verwandt mit» im Entwurf ergänzt. Mit Rechtsklick ändern; mit «Netz speichern» für alle übernehmen.');
  }
  @HostListener('document:pointermove',['$event']) move(event:PointerEvent):void{if(this.hold.move(event)){event.preventDefault();return;}const drag=this.drag;if(!drag||drag.pointerId!==event.pointerId)return;const point=this.point(event),dx=point.x-drag.start.x,dy=point.y-drag.start.y;if(Math.hypot(dx,dy)>3)drag.moved=true;if(!drag.moved)return;event.preventDefault();this.pointer.set(point);if(drag.node)this.positions.update(positions=>({...positions,['domain:'+drag.node!.id]:{x:Math.min(100000,Math.max(15,drag.node!.x+dx)),y:Math.min(100000,Math.max(15,drag.node!.y+dy))}}));}
  @HostListener('document:pointerup',['$event']) up(event:PointerEvent):void{
    const drag=this.drag;if(!drag||drag.pointerId!==event.pointerId)return;
    // Resolve the actual card before removing the preview or releasing capture.
    // Pointer capture retargets event.target to the source, even over another card.
    const elements=this.hitNodes(event),id=this.hitDomain(elements),held=this.hold.finish(event);
    this.releaseCapture();this.drag=null;this.pointer.set(null);
    if(held){
      this.suppressNodeClick=true;
      if(id&&id!==held.id)this.completeHeldLink(held.id,id);
      else if(!id&&elements.some(element=>element.closest('.graph-canvas')))this.openDrop(held.id,this.point(event),event);
      return;
    }
    this.suppressNodeClick=!!drag.node&&drag.moved;
    if(drag.node&&drag.moved)this.layoutDirty.set(true);
    if(drag.edge!==undefined&&id){const link=this.links()[drag.edge];this.openEdit({index:drag.edge,...link,...(drag.side==='source'?{sourceId:id}:{targetId:id})});}
    else if(drag.source&&drag.moved&&id){this.suppressPortClick=true;this.finish(id);}
  }
  @HostListener('document:pointercancel',['$event']) cancel(event:PointerEvent):void{
    if(this.drag?.pointerId!==event.pointerId)return;
    this.hold.cancel();this.positions.set(this.drag.positions);this.releaseCapture();this.drag=null;this.pointer.set(null);this.connecting.set(null);
  }
  nodeKey(node:DomainNode,event:KeyboardEvent):void{if(event.shiftKey&&event.key==='F10'){this.openMenu(node.id,event);return;}const delta=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,number[]>)[event.key];if(delta&&this.canLayout()){event.preventDefault();event.stopPropagation();const step=event.shiftKey?40:10;this.positions.update(positions=>({...positions,['domain:'+node.id]:{x:Math.min(100000,Math.max(15,node.x+delta[0]*step)),y:Math.min(100000,Math.max(15,node.y+delta[1]*step))}}));this.layoutDirty.set(true);}}
  openEdit(edit:LinkEdit):void{if(!this.canSource(edit.sourceId)||(edit.index!==null&&!this.canSource(this.links()[edit.index].sourceId))){this.error.set('Für diese Ausgangsdomäne fehlt die Objektverantwortung.');return;}this.menu.set(null);this.error.set('');this.edit.set({...edit});afterNextRender(()=>this.host.nativeElement.querySelector<HTMLElement>('.relation-dialog select')?.focus(),{injector:this.injector});}
  editLink(index:number,event?:Event):void{event?.preventDefault();event?.stopPropagation();this.selectedLink.set(index);this.openEdit({index,...this.links()[index]});}
  linkMenu(index:number,event:Event):void{this.openMenu(null,event,index);}
  isDomain(id:string):(node:DomainNode)=>boolean{return node=>node.id===id;}
  startEndpoint(index:number,side:'source'|'target',event:PointerEvent):void{if(!this.canSource(this.links()[index].sourceId))return;event.preventDefault();event.stopPropagation();this.drag={edge:index,side,pointerId:event.pointerId,handle:event.currentTarget as Element|null,start:this.point(event),positions:this.positions(),moved:false};this.capture(event);}
  changeEdit(key:'sourceId'|'targetId'|'relationType',value:string):void{this.edit.update(edit=>edit?{...edit,[key]:value}:null);}
  applyLink():void{const edit=this.edit();if(!edit||!this.canSource(edit.sourceId))return;if(edit.sourceId===edit.targetId){this.error.set('Eine Domäne kann nicht mit sich selbst verbunden werden.');return;}const links=this.links().filter((_,index)=>index!==edit.index);if(links.some(link=>[link.sourceId,link.targetId].includes(edit.sourceId)&&[link.sourceId,link.targetId].includes(edit.targetId))){this.error.set('Zwischen diesen Domänen besteht bereits eine Beziehung.');return;}
    const link:DomainNetworkLink={sourceId:edit.sourceId,targetId:edit.targetId,relationType:edit.relationType};links.push(link);const hierarchy=new Map<string,string[]>();for(const item of links)if(item.relationType==='partOf')hierarchy.set(item.sourceId,[...(hierarchy.get(item.sourceId)??[]),item.targetId]);const visited=new Set<string>(),active=new Set<string>();const cycle=(id:string):boolean=>{if(active.has(id))return true;if(visited.has(id))return false;active.add(id);if((hierarchy.get(id)??[]).some(cycle))return true;active.delete(id);visited.add(id);return false;};if([...hierarchy.keys()].some(cycle)){this.error.set('Unterdomänen dürfen keinen Kreis bilden.');return;}
    this.pin();this.links.set(links);this.linksDirty.set(true);this.selectedLink.set(links.length-1);this.edit.set(null);this.error.set('');
  }
  deleteLink():void{const edit=this.edit();if(edit?.index==null||!this.canSource(this.links()[edit.index].sourceId))return;this.pin();this.links.update(links=>links.filter((_,index)=>index!==edit.index));this.linksDirty.set(true);this.edit.set(null);}
  removeLink(index:number):void{if(!this.canSource(this.links()[index].sourceId))return;this.edit.set({index,...this.links()[index]});this.deleteLink();this.menu.set(null);this.selectedLink.set(null);}
  hideDomain(id:string):void{if(!this.canLayout())return;this.hiddenIds.update(ids=>[...new Set([...ids,'domain:'+id])]);this.layoutDirty.set(true);this.menu.set(null);}
  showDomain(id:string):void{if(!this.canLayout())return;this.hiddenIds.update(ids=>ids.filter(key=>key!=='domain:'+id));this.layoutDirty.set(true);}
  canDelete(id:string):boolean{return !this.saving()&&!!this.saved()?.deletableNodeIds?.includes('domain:'+id);}
  async deleteDomain(id:string):Promise<void>{const domain=this.domains().find(item=>item.id===id);if(!domain||!this.canDelete(id)||!window.confirm(`«${domain.preferredLabel}» im Katalog löschen? Die Domäne wird stillgelegt und aus aktiven Ansichten entfernt. Historie und bestehende Referenzen bleiben erhalten. Diese Aktion wird sofort gespeichert.`))return;this.menu.set(null);this.saving.set(true);try{const updated=await firstValueFrom(this.api.retireDomainDirect(domain));this.domains.update(items=>items.map(item=>item.id===id?updated:item));this.notice.set('Domäne im Katalog stillgelegt.');}catch(error){this.error.set(error instanceof Error?error.message:'Die Domäne konnte nicht gelöscht werden.');}finally{this.saving.set(false);}}
  openDrop(sourceId:string,point:Point,event?:{clientX:number;clientY:number}):void{if(!this.canLayout())return;const rect=this.host.nativeElement.querySelector('.network-editor')!.getBoundingClientRect();this.menu.set(null);this.dropMenu.set({sourceId,point:{x:Math.max(15,point.x),y:Math.max(15,point.y)},x:Math.max(4,Math.min((event?.clientX??rect.left+point.x*this.zoom())-rect.left,rect.width-285)),y:Math.max(4,Math.min((event?.clientY??rect.top+point.y*this.zoom())-rect.top,Math.min(rect.height,innerHeight-rect.top)-120))});afterNextRender(()=>this.host.nativeElement.querySelector<HTMLElement>('.canvas-drop-menu button')?.focus(),{injector:this.injector});}
  dropFromDomain(id:string):void{const node=this.nodes().find(item=>item.id===id);if(node?.domain.status==='active')this.openDrop(id,{x:node.x+300,y:node.y+80});}
  dropAction(action:'create'|'search'):void{const context=this.dropMenu();if(!context||(action==='create'&&!this.saved()?.canCreateDomains))return;this.dropContext=context;this.dropMenu.set(null);if(action==='create')this.creationOpen.set(true);else this.selectionOpen.set(true);}
  async selectDomain(result:CatalogObjectResult):Promise<void>{const context=this.dropContext;if(!context)return;if(result.id===context.sourceId){this.error.set('Bitte eine andere Domäne auswählen.');return;}const domain=this.domains().find(item=>item.id===result.id)??await firstValueFrom(this.api.loadDomain(result.id));if(domain.status!=='active'){this.error.set('Die gewählte Domäne ist nicht mehr aktiv.');return;}const visible=this.nodes().some(node=>node.id===domain.id);if(!this.domains().some(item=>item.id===domain.id))this.domains.update(items=>[...items,domain]);this.hiddenIds.update(ids=>ids.filter(key=>key!=='domain:'+domain.id));if(!visible){this.positions.update(positions=>({...positions,['domain:'+domain.id]:context.point}));this.layoutDirty.set(true);}this.selectionOpen.set(false);if(this.canSource(context.sourceId))this.openEdit({index:null,sourceId:context.sourceId,targetId:domain.id,relationType:'related'});else this.notice.set('Domäne eingeblendet. Beziehungen bearbeiten Data Owner oder Stellvertretung der Ausgangsdomäne.');}
  async created(result:SemanticCreation):Promise<void>{this.creationBusy.set(false);this.creationOpen.set(false);const context=this.dropContext;if(!context)return;if(result.domain){this.domains.update(items=>[...items,result.domain!]);this.positions.update(positions=>({...positions,['domain:'+result.domain!.id]:context.point}));this.layoutDirty.set(true);await this.selectDomain({id:result.domain.id,label:result.label,description:result.definition,route:[]});}else if(result.request){this.pendingCards.update(items=>[...items,{id:result.request!.id,label:result.label,definition:result.definition,point:context.point,sourceId:context.sourceId}]);this.storePending();this.notice.set('Domänenantrag eingereicht. Die Vorschlagskarte bleibt bis zur Freigabe persönlich.');}}
  private pendingKey():string{return'daca.domain-network.pending.v1:'+this.identity.userId();}
  private storePending():void{try{sessionStorage.setItem(this.pendingKey(),JSON.stringify(this.pendingCards()));}catch{/* Requests remain durable even when browser storage is unavailable. */}}
  private restorePending(requests:readonly DomainChangeRequest[]):void{try{const parsed=JSON.parse(sessionStorage.getItem(this.pendingKey())??'[]');const cached=(Array.isArray(parsed)?parsed:[]).filter(card=>card&&typeof card.id==='string'&&typeof card.sourceId==='string'&&card.point&&Number.isFinite(card.point.x)&&Number.isFinite(card.point.y)&&card.point.x>=15&&card.point.y>=15&&card.point.x<=100000&&card.point.y<=100000) as ReturnType<typeof this.pendingCards>;this.pendingCards.set(cached.filter(card=>requests.some(request=>request.id===card.id&&request.requesterUserId===this.identity.userId()&&request.operation==='create'&&request.status==='submitted')));for(const request of requests){const card=cached.find(item=>item.id===request.id);if(card&&request.status==='approved'&&request.targetDomainId&&!this.positions()['domain:'+request.targetDomainId]){this.positions.update(positions=>({...positions,['domain:'+request.targetDomainId!]:card.point}));this.layoutDirty.set(true);}}}catch{this.pendingCards.set([]);}}
  openMenu(id:string|null,event:Event,linkIndex?:number):void{this.selectedLink.set(linkIndex??null);event.preventDefault();event.stopPropagation();this.menuTrigger=event.currentTarget as HTMLElement;const rect=this.host.nativeElement.querySelector('.network-editor')!.getBoundingClientRect(),target=this.menuTrigger.getBoundingClientRect();this.menu.set({id,x:Math.max(4,Math.min((event instanceof MouseEvent?event.clientX:target.left)-rect.left,rect.width-285)),y:Math.max(4,Math.min((event instanceof MouseEvent?event.clientY:target.bottom)-rect.top,Math.min(rect.height,innerHeight-rect.top)-420))});afterNextRender(()=>this.host.nativeElement.querySelector<HTMLElement>('.concept-context-menu button')?.focus(),{injector:this.injector});}
  openObject(kind:CatalogObjectKind):void{this.menu.set(null);this.objectBrowser.set(kind);}
  closeObject():void{this.objectBrowser.set(null);queueMicrotask(()=>{if(this.edit())this.host.nativeElement.querySelector<HTMLElement>('.relation-dialog select')?.focus();else this.menuTrigger?.focus();});}
  @HostListener('document:keydown.escape',['$event']) escape(event:Event):void{if(this.hold.active()||this.dropMenu()||this.edit()||this.menu()||this.connecting()){event.preventDefault();this.hold.cancel();if(this.drag?.node)this.positions.set(this.drag.positions);this.releaseCapture();this.drag=null;this.connectionFeedback.set('');this.dropMenu.set(null);this.edit.set(null);this.menu.set(null);this.connecting.set(null);this.pointer.set(null);this.menuTrigger?.focus();}}
  @HostListener('document:pointerdown',['$event']) outside(event:PointerEvent):void{if(!(event.target as Element).closest('.concept-context-menu')){this.menu.set(null);this.dropMenu.set(null);}}
  dialogKey(event:KeyboardEvent):void{if(event.key!=='Tab')return;const elements=[...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled),select')],first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  menuKey(event:KeyboardEvent):void{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const elements=[...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled),a')],index=elements.indexOf(document.activeElement as HTMLElement);elements[event.key==='Home'?0:event.key==='End'?elements.length-1:(index+(event.key==='ArrowDown'?1:-1)+elements.length)%elements.length]?.focus();}
  toggleFullscreen():void{if(this.fullscreen())this.restoreFullscreen();else{this.bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';this.fullscreen.set(true);}}
  private restoreFullscreen():void{if(this.fullscreen())document.body.style.overflow=this.bodyOverflow;this.fullscreen.set(false);}
  async print():Promise<void>{const canvas=this.host.nativeElement.querySelector<HTMLElement>('.graph-canvas');if(!canvas)return;this.printing.set(true);try{await printMappingCanvas(canvas,'Domänennetz',{modelUpdatedAt:this.domains().map(domain=>domain.updatedAt).sort().at(-1)??new Date().toISOString(),modelRevision:this.saved()?.revision??0});}finally{this.printing.set(false);}}
  @HostListener('window:beforeunload',['$event']) unload(event:BeforeUnloadEvent):void{if(this.dirty()||this.saving()||this.creationOpen()){event.preventDefault();event.returnValue='';}}
  canDeactivate():boolean{return !this.saving()&&!this.creationBusy()&&((!this.dirty()&&!this.creationOpen())||window.confirm('Ungespeicherte Änderungen am Domänennetz verwerfen und die Seite verlassen?'));}
}
