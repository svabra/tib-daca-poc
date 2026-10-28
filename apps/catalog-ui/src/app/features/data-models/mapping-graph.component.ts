import { afterNextRender, Injector, ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';
import { MappingDraftFacade, CanvasNodePosition } from './mapping-draft.facade';
import { printMappingCanvas } from './mapping-canvas-print';
import { CatalogObjectBrowserComponent, CatalogObjectKind } from '../domains/catalog-object-browser.component';
import { AssetMapping, LogicalField, MappingStatus, MappingType, MAPPING_STATUS_LABELS } from './data-models.models';

import { MAPPING_TYPE_OPTIONS, mappingTypeDescription } from './mapping-types';

interface EdgeReference { mappingId:string; fieldId:string; columnId:string; }
interface EdgeMenu extends EdgeReference { x:number; y:number; }
interface EndpointPosition { left: number; right: number; y: number; }
interface FieldMenu { fieldId: string; x: number; y: number; }
interface FieldLink { mapping: AssetMapping; columnId: string; label: string; }
interface ConnectionHold { side: 'logical'|'physical'; id: string; pointerId: number; clientX: number; clientY: number; handle: HTMLElement; }

@Component({
  selector: 'daca-mapping-graph', standalone: true, imports:[CatalogObjectBrowserComponent],changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mapping-graph" [class.is-fullscreen]="fullscreen()" aria-labelledby="mapping-graph-title" (keydown.escape)="graphEscape($event)">
      <header><div><p class="daca-eyebrow">Grafischer Modus</p><h2 id="mapping-graph-title">{{ canvasTitle() }}</h2></div><div class="graph-legend" aria-label="Legende"><span><i class="is-valid"></i> Gültig</span><span><i class="is-review"></i> Prüfen</span><span><i class="is-broken"></i> Gebrochen</span></div></header>
      <p class="graph-instruction">Ein logisches oder physisches Feld kurz gedrückt halten, dann den roten Punkt mit Linie auf ein Feld der Gegenseite ziehen. Blaue Endpunkte zeigen die Verbindung. Alternativ Felder per Klick verbinden. Karten am Kopf ziehen oder mit Pfeiltasten verschieben. Linienenden lassen sich auf andere Felder desselben Modells ziehen. Rechtsklick oder Umschalt+F10 öffnet Aktionen für Karten und Linien. <strong>1:1 · wird repräsentiert durch</strong> (Gegenrichtung: „abgeleitet aus“).</p>
      <p class="graph-instruction canvas-save-hint">Kartenpositionen gelten für alle. Data Owner und Data Stewards übernehmen eine neue Anordnung mit «Entwurf speichern».</p>
      <div class="canvas-viewport">
      <div class="canvas-tools" role="group" aria-label="Canvas-Ansicht">
        <button class="canvas-print" type="button" aria-label="Canvas drucken" title="Canvas mit Titel drucken" [disabled]="printing()" (click)="printCanvas()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7zM16 11h1" /></svg></button>
        <button class="fullscreen-toggle" type="button" [attr.aria-label]="fullscreen()?'Vollbild verlassen':'Vollbild öffnen'" [attr.title]="fullscreen()?'Vollbild verlassen':'Vollbild öffnen'" [attr.aria-pressed]="fullscreen()" (click)="toggleFullscreen.emit($event.currentTarget)"><span aria-hidden="true">{{ fullscreen()?'−':'+' }}</span></button>
      </div>
      <div class="graph-scroll" (scroll)="connectionScroll()" role="region" tabindex="0" (contextmenu)="openCanvasMenu($event)" (keydown)="canvasKeydown($event)" aria-label="Grafische Zuordnung; tabellarische Alternative ist über die Ansichtsumschaltung verfügbar">
        <div class="graph-canvas" [style.width.px]="canvasSize().width" [style.height.px]="canvasSize().height">
          <svg class="edge-layer" role="group" aria-label="Mapping-Verbindungen">
            @for(edge of renderedEdges();track edge.key){@let mapping=edge.mapping;@let fieldId=edge.fieldId;@let columnId=edge.columnId;@let targetIndex=edge.targetIndex;
              <g class="mapping-edge" [class.is-hovered]="edgeMatches(hoveredEdge(),mapping.id,fieldId,columnId)" [attr.data-edge-mapping-id]="mapping.id" (click)="selectEdge(mapping.id,fieldId,columnId,$event)" (contextmenu)="openEdgeMenu(mapping.id,fieldId,columnId,$event)">
                <path class="edge-line" aria-hidden="true" [attr.data-edge-logical-field-id]="fieldId" [attr.data-edge-physical-column-id]="columnId" [attr.d]="edgePath(fieldId,columnId,targetIndex,mapping.id)" [attr.class]="'edge-line '+edgeClass(mapping)" />
                <path class="edge-hit" [attr.d]="edgePath(fieldId,columnId,targetIndex,mapping.id)" tabindex="0" role="button" aria-haspopup="dialog" aria-keyshortcuts="Shift+F10" [attr.aria-label]="edgeLabel(mapping,fieldId,columnId)+'. '+typeDescription(mapping.mappingType)" (keydown)="edgeKeydown(mapping.id,fieldId,columnId,$event)"><title>{{ edgeLabel(mapping,fieldId,columnId) }}. {{ typeDescription(mapping.mappingType) }}</title></path>
              </g>
            }
          </svg>
          @if(activeEdge();as edge){<svg class="edge-handles" aria-label="Linienenden verschieben">@for(side of edgeSides;track side){<circle r="7" tabindex="0" role="button" [attr.aria-label]="side==='logical'?'Logisches Linienende verschieben':'Physisches Linienende verschieben'" [attr.data-edge-handle]="side" [attr.cx]="edgeHandlePoint(edge,side).x" [attr.cy]="edgeHandlePoint(edge,side).y" (pointerdown)="startEndpointDrag(edge,side,$event)" (contextmenu)="openEdgeMenu(edge.mappingId,edge.fieldId,edge.columnId,$event)" (click)="$event.stopPropagation()" (keydown)="handleKeydown(edge,side,$event)" />}</svg>}

          @if(connectionPoints();as points){<svg class="connection-preview" aria-hidden="true"><path [attr.d]="'M '+points.start.x+' '+points.start.y+' L '+points.end.x+' '+points.end.y"/><circle r="7" [attr.cx]="points.start.x" [attr.cy]="points.start.y"/><circle r="7" [attr.cx]="points.end.x" [attr.cy]="points.end.y"/></svg>}
          <section class="logical-node" [style.left.px]="nodePosition('logical').x" [style.top.px]="nodePosition('logical').y"><header class="node-drag-handle" data-node-key="logical" tabindex="0" aria-label="Logisches Modell verschieben; Pfeiltasten oder ziehen, Umschalt+F10 öffnet Aktionen" (pointerdown)="startNodeDrag('logical',$event)" (keydown)="moveNodeByKeyboard('logical',$event)"><span>SHACL NodeShape</span><strong>{{ facade.model()?.entityName }}</strong><small>{{ facade.logicalFields().length }} PropertyShapes</small><small class="model-domain">Domäne: {{ facade.model()?.dataDomain?.id?facade.model()?.dataDomain?.displayName:'Keine Domäne zugeordnet' }}</small></header><div>
            @for(field of facade.logicalFields();track field.id){<button type="button" class="field-endpoint" [attr.data-logical-field-id]="field.id" [class.is-selected]="facade.selectedLogicalFieldId()===field.id" [class.is-pending]="facade.pendingLogicalFieldId()===field.id" [class.is-connecting]="connectionDrag()?.side==='logical' && connectionDrag()?.id===field.id" [class.has-left-port]="fieldHasPort(field.id,'left')" [class.has-right-port]="fieldHasPort(field.id,'right')" [attr.aria-pressed]="facade.selectedLogicalFieldId()===field.id" [attr.aria-label]="fieldAriaLabel(field)" [attr.aria-keyshortcuts]="canManage() ? 'Shift+F10' : null" (pointerdown)="fieldPointerDown(field.id,$event)" (click)="fieldClicked(field.id,$event.currentTarget)" (contextmenu)="openFieldMenu(field.id,$event)" (keydown)="fieldKeydown(field.id,$event)"><span><strong>{{ field.name }}</strong><small>{{ field.dataType }}{{ field.length ? ' · '+field.length : '' }}</small></span><b [class]="'status-'+facade.mappingStatusForField(field.id)">{{ fieldStatusLabel(field.id) }}</b></button>}
          </div></section>
          <section class="physical-nodes">@for(representation of facade.visibleRepresentations();track representation.table.id){<section class="physical-representation" tabindex="0" [attr.data-representation-table-id]="representation.table.id" [style.left.px]="nodePosition('physical:'+representation.table.id).x" [style.top.px]="nodePosition('physical:'+representation.table.id).y" [class.is-left-of-logical]="representationIsLeft(representation.table.id)" [class.is-dragging]="draggingNode() === 'physical:'+representation.table.id" (click)="representationClicked(representation.table.id,$event)" (contextmenu)="openRepresentationMenu(representation.table.id,$event)" (keydown)="representationKeydown(representation.table.id,$event)"><header class="node-drag-handle" [attr.data-node-key]="'physical:'+representation.table.id" tabindex="0" aria-label="Physische Repräsentation verschieben; Pfeiltasten oder ziehen" (pointerdown)="startNodeDrag('physical:'+representation.table.id,$event)" (keydown)="moveNodeByKeyboard('physical:'+representation.table.id,$event)"><span>Physischer Snapshot</span><div class="snapshot-source"><img [src]="sourceIcon(representation.snapshot.sourceType)" [alt]="sourceTypeLabel(representation.snapshot.sourceType)"><strong>{{ representation.snapshot.sourceName }}</strong></div><small>Data Ownerin: {{ representation.snapshot.dataOwnerName || 'Nicht zugewiesen' }}</small><code>{{ representation.snapshot.catalogPath }}</code><small>Revision {{ representation.snapshot.revision }}</small><small class="model-domain">Domäne: {{ physicalDomainLabel(representation.table.id) }}</small>@if(!representation.persisted){<b class="unsaved-representation">{{ representation.preview ? 'Drift-Vorschau' : 'Ungespeichert' }}</b>}</header>
            @for(table of [representation.table];track table.id){<article><div class="physical-table-title"><span>{{ table.kind==='parquet'?'Parquet':table.kind==='view'?'View':'Tabelle' }}</span><strong>{{ table.kind==='parquet' ? table.name : table.schemaName+'.'+table.name }}</strong></div>@for(column of table.columns;track column.id){<button type="button" class="column-endpoint" [attr.data-physical-column-id]="column.id" [class.is-selected]="isSelectedColumn(column.id)" [attr.aria-label]="'Physisches Feld '+(table.storageLocation||table.schemaName+'.'+table.name)+' '+column.name+', Datentyp '+column.dataType" (pointerdown)="startConnectionHold('physical',column.id,$event)" [class.is-connecting]="connectionDrag()?.side==='physical' && connectionDrag()?.id===column.id" (click)="columnClicked(column.id,$event.currentTarget)"><span><strong>{{ column.name }}</strong><small>{{ column.dataType }}{{ column.length ? ' · '+column.length : '' }}</small>@if(typeConflict(column.id)){<small class="type-conflict">Typkonflikt · Prüfung erforderlich</small>}</span><b>{{ column.importMetadata?.nullabilityKnown === false ? 'nicht angegeben' : column.nullable?'optional':'pflicht' }}</b></button>}</article>}
          </section>}</section>
        </div>
      </div>
      </div>
      @if(edgeMenu();as opened){@if(edgeMenuMapping();as mapping){<div class="field-context-menu edge-context-menu" role="dialog" aria-label="Beziehung bearbeiten" [style.left.px]="opened.x" [style.top.px]="opened.y" (keydown.escape)="closeEdgeMenu($event)">
        <strong [title]="typeDescription(mapping.mappingType)">{{ edgeLabel(mapping,opened.fieldId,opened.columnId) }}</strong>
        @if(!canManage()){<span class="menu-hint">Nur Data Owner und Data Stewards des Modells können diese Beziehung ändern.</span>}
        @if(mapping.logicalFieldVersionIds.length>1||mapping.physicalColumnIds.length>1){<span class="menu-hint">Gemeinsame Zuordnung: {{ mapping.logicalFieldVersionIds.length }} logische / {{ mapping.physicalColumnIds.length }} physische Felder. Typ und Regel gelten für die gesamte Zuordnung. Ein Endpunktwechsel ersetzt das gewählte Feld in dieser Zuordnung.@if(mapping.logicalFieldVersionIds.length>1){ Löschen entfernt die gesamte gemeinsame Zuordnung.}</span>}
        <label>Mapping-Typ<select [title]="typeDescription(mapping.mappingType)" aria-label="Mapping-Typ der Beziehung" [disabled]="!canManage()" [value]="mapping.mappingType" (change)="changeEdgeType($any($event.target).value)">@for(type of mappingTypes;track type.value){<option [value]="type.value" [selected]="type.value===mapping.mappingType" [title]="type.description">{{ type.value }} · {{ type.label }}</option>}</select><small>{{ typeDescription(mapping.mappingType) }}</small></label>
        @if(mapping.mappingType==='Derived'||mapping.mappingType==='Lookup'||mapping.mappingType==='Transformed'){<label>Transformations-/Lookup-Regel<textarea rows="2" aria-label="Regel der Beziehung" [disabled]="!canManage()" [value]="mapping.transformationRule||''" (change)="changeEdgeRule($any($event.target).value)"></textarea><small>Regel dokumentieren; DaCa führt sie nicht aus.</small></label>}
        <label>Logisches Linienende<select aria-label="Logisches Linienende" [disabled]="!canManage()" [value]="opened.fieldId" (change)="rewireFromMenu('logical',$any($event.target).value,$any($event.target))">@for(field of facade.logicalFields();track field.id){<option [value]="field.id" [selected]="field.id===opened.fieldId">{{ field.name }}</option>}</select></label>
        <label>Physisches Linienende<select aria-label="Physisches Linienende" [disabled]="!canManage()" [value]="opened.columnId" (change)="rewireFromMenu('physical',$any($event.target).value,$any($event.target))">@for(column of edgeMenuColumns();track column.id){<option [value]="column.id" [selected]="column.id===opened.columnId">{{ column.name }}</option>}</select></label>
        <button type="button" class="is-danger" [disabled]="!canManage()" (click)="deleteEdge()">Beziehung löschen</button>
        <span class="menu-hint">Änderungen an Typ, Regel und Linienenden mit „Entwurf speichern“ sichern. Sie werden nicht automatisch validiert.</span>
        @for(type of objectKinds;track type.id){<button type="button" (click)="openObjectBrowser(type.id)">{{type.label}}</button>}
      </div>}}
      @if(canvasMenu();as position){<div class="field-context-menu canvas-context-menu" role="menu" aria-label="Canvas-Aktionen" [style.left.px]="position.x" [style.top.px]="position.y">
        @for(type of objectKinds;track type.id){<button type="button" role="menuitem" (click)="openObjectBrowser(type.id)">{{type.label}}</button>}
        @if(canManage()){<button type="button" role="menuitem" (click)="requestRepresentation()">Neue physische Repräsentation</button>}
        @if(position.logical){
          @if(facade.model()?.dataDomain?.id){<a role="menuitem" [href]="'/domains/'+facade.model()!.dataDomain.id" target="_blank" rel="noopener" (click)="closeMenu()">Zugehörige Domäne anzeigen</a>}
          @else if(canManage()){<button type="button" role="menuitem" (click)="requestDomain(null)">Domäne zuordnen</button>}
        }
      </div>}
      @if(representationMenu();as position){<div class="field-context-menu representation-context-menu" role="menu" aria-label="Darstellungsaktionen der physischen Repräsentation" [style.left.px]="position.x" [style.top.px]="position.y">
        @for(type of objectKinds;track type.id){<button type="button" role="menuitem" (click)="openObjectBrowser(type.id)">{{type.label}}</button>}
        @for(domain of physicalDomains(position.tableId);track domain.id){<a role="menuitem" [href]="'/domains/'+domain.id" target="_blank" rel="noopener" (click)="closeMenu()">Zugehörige Domäne anzeigen@if(physicalDomains(position.tableId).length>1){: {{ domain.displayName }}}</a>}
        @if(!physicalDomains(position.tableId).length&&canManage()&&physicalDomainAssignable(position.tableId)){<button type="button" role="menuitem" (click)="requestDomain(position.tableId)">Domäne zuordnen</button>}
        <button type="button" role="menuitem" class="is-danger" (click)="hideRepresentation(position.tableId)">Darstellung der physischen Repräsentation entfernen</button><span class="menu-hint">Bindungen und Mappings bleiben erhalten.</span>
      </div>}
      @if(menu();as opened){<div class="field-context-menu" role="menu" [style.left.px]="opened.x" [style.top.px]="opened.y" [attr.aria-label]="'Aktionen für '+(menuField()?.name || 'logisches Feld')">
        <strong>{{ menuField()?.name }}</strong>
        <button type="button" role="menuitem" (click)="editField(opened.fieldId)">Feldmerkmale bearbeiten</button>
        <button type="button" role="menuitem" [disabled]="!canManage()" (click)="addConnection(opened.fieldId)">Verbindung hinzufügen</button>
        @for(link of menuLinks();track link.mapping.id+link.columnId){@if(link.mapping.logicalFieldVersionIds.length===1){<button type="button" role="menuitem" [disabled]="!canManage()" (click)="disconnect.emit({mappingId:link.mapping.id,columnId:link.columnId});closeMenu()">Verbindung zu {{ link.label }} entfernen</button>}@else{<button type="button" role="menuitem" [disabled]="!canManage()" (click)="facade.openEdit(link.mapping.id);closeMenu()">Gemeinsame Zuordnung bearbeiten</button>}}
        @if(menuLinks().length===0){<span class="menu-hint">Keine Verbindung vorhanden</span>}
        <button type="button" role="menuitem" class="is-danger" [disabled]="!canManage()||facade.logicalFields().length<=1" (click)="deleteField.emit(opened.fieldId);closeMenu()">Logisches Feld entfernen</button>
        @for(type of objectKinds;track type.id){<button type="button" role="menuitem" (click)="openObjectBrowser(type.id)">{{type.label}}</button>}
      </div>}
      @if(objectBrowser();as kind){<daca-catalog-object-browser [initialKind]="kind" (closed)="closeObjectBrowser()"/>}
    </section>
  `,
  styles: [`
    .mapping-graph{min-width:0}.mapping-graph>header{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:.6rem}.mapping-graph h2{margin:0;font-size:1.05rem}.graph-instruction{margin:0 0 .75rem;color:var(--daca-muted);font-size:.7rem}.graph-legend{display:flex;flex-wrap:wrap;gap:.8rem;color:var(--daca-muted);font-size:.65rem}.graph-legend span{display:flex;align-items:center;gap:.35rem}.graph-legend i{display:block;width:24px;border-top:1px solid #66737e}.graph-legend .is-review{border-top-style:dashed;border-color:var(--daca-orange)}.graph-legend .is-broken{border-top-style:dashed;border-color:var(--daca-red-dark)}.graph-scroll{max-height:700px;overflow:auto;border:1px solid var(--daca-border);background:#f5f7f8}.graph-scroll:focus-visible{outline-offset:-3px}.graph-canvas{position:relative;display:grid;grid-template-columns:340px 196px 360px;gap:40px;box-sizing:border-box;width:1040px;min-height:590px;padding:2rem}.graph-canvas>svg{position:absolute;z-index:0;inset:0;width:100%;height:100%;pointer-events:none}.graph-canvas path{fill:none;stroke:#66737e;stroke-width:1;vector-effect:non-scaling-stroke}.graph-canvas path.is-selected{stroke-width:1.5}.graph-canvas path.is-review{stroke:var(--daca-orange);stroke-dasharray:8 6}.graph-canvas path.is-broken{stroke:var(--daca-red-dark);stroke-width:1;stroke-dasharray:5 5}.logical-node,.physical-nodes{position:relative;z-index:1;align-self:start;border:1px solid var(--daca-border-strong);background:#fff;box-shadow:0 8px 18px #14202b14}.logical-node{grid-column:1}.physical-nodes{grid-column:3}.logical-node>header,.physical-representation>header{display:grid;gap:.15rem;border-top:4px solid var(--daca-red);padding:.8rem 1rem}.logical-node>header span,.physical-representation>header span,.physical-table-title span{color:var(--daca-red-dark);font-size:.58rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.logical-node>header small,.physical-representation>header small{color:var(--daca-muted);font-size:.63rem}.physical-representation>header code{overflow-wrap:anywhere;color:var(--daca-muted);font-size:.62rem}.snapshot-source{display:flex;align-items:center;gap:.45rem}.snapshot-source img{width:26px;height:26px;object-fit:contain}.field-endpoint,.column-endpoint{position:relative;display:flex;align-items:center;justify-content:space-between;gap:.5rem;width:100%;min-height:58px;border:0;border-top:1px solid var(--daca-border);padding:.55rem .7rem;background:#fff;color:var(--daca-ink);text-align:left;cursor:crosshair}.field-endpoint{padding-right:2rem}.column-endpoint{padding-left:2rem}.field-endpoint::before,.field-endpoint::after{position:absolute;right:-9px;width:16px;height:16px;border:3px solid #fff;border-radius:50%;background:var(--daca-blue);box-shadow:0 0 0 1px var(--daca-blue);content:''}.column-endpoint::before{position:absolute;left:-9px;width:16px;height:16px;border:3px solid #fff;border-radius:50%;background:var(--daca-blue);box-shadow:0 0 0 1px var(--daca-blue);content:''}.field-endpoint:hover,.column-endpoint:hover,.field-endpoint.is-selected,.column-endpoint.is-selected{z-index:2;background:var(--daca-blue-soft);box-shadow:inset 4px 0 0 var(--daca-blue)}.field-endpoint.is-pending{background:var(--daca-red-soft);box-shadow:inset 4px 0 0 var(--daca-red)}.field-endpoint>span,.column-endpoint>span{display:grid;min-width:0}.field-endpoint strong,.column-endpoint strong{overflow:hidden;font-size:.72rem;text-overflow:ellipsis}.field-endpoint small,.column-endpoint small{color:var(--daca-muted);font-size:.61rem}.field-endpoint b,.column-endpoint b{font-size:.57rem;font-weight:800;text-transform:uppercase}.status-validated{color:var(--daca-green)}.status-review_pending,.status-draft{color:var(--daca-orange)}.status-broken,.status-unmapped{color:var(--daca-red-dark)}.physical-nodes{display:grid;gap:1.5rem;background:transparent;border:0;box-shadow:none}.physical-representation>header,.physical-representation article{border:1px solid var(--daca-border-strong);background:#fff;box-shadow:0 8px 18px #14202b14}.physical-table-title{display:grid;gap:.1rem;padding:.65rem .8rem;background:#f3f5f6}.physical-table-title strong{font-size:.73rem}@media(forced-colors:active){.graph-canvas path{stroke:CanvasText}.graph-canvas path.is-review{stroke-dasharray:8 6}.graph-canvas path.is-broken{stroke-dasharray:3 3;stroke-width:1.5}.field-endpoint::before,.field-endpoint::after,.column-endpoint::before{background:ButtonText}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
  `, `
    .field-context-menu{position:fixed;z-index:1000;display:grid;width:min(290px,calc(100vw - 16px));max-height:min(420px,calc(100vh - 16px));overflow:auto;border:1px solid var(--daca-border-strong);border-top:4px solid var(--daca-blue);background:var(--daca-surface,#fff);box-shadow:0 12px 30px #14202b33}.field-context-menu>strong{padding:.55rem .75rem;font-size:.68rem}.field-context-menu button,.field-context-menu a{min-height:38px;border:0;border-top:1px solid var(--daca-border);padding:.55rem .75rem;background:transparent;color:var(--daca-ink);font:inherit;font-size:.67rem;text-align:left;cursor:pointer}.field-context-menu button:not(:disabled):hover,.field-context-menu button:not(:disabled):focus-visible,.field-context-menu a:hover,.field-context-menu a:focus-visible{background:var(--daca-red-soft,#fff0f1);color:var(--daca-red-dark,#b00020);box-shadow:inset 4px 0 0 var(--daca-red);text-decoration:underline;outline-offset:-2px}.field-context-menu a{display:block;text-decoration:none}.model-domain{overflow-wrap:anywhere}.field-context-menu button:disabled{color:var(--daca-muted);cursor:not-allowed}.field-context-menu button.is-danger{color:var(--daca-red-dark);font-weight:750}.menu-hint{padding:.5rem .75rem;color:var(--daca-muted);font-size:.62rem}
    .physical-representation{display:grid;gap:.4rem;outline-offset:4px}.physical-representation:focus{outline:2px solid var(--daca-blue)}.column-endpoint .type-conflict{color:var(--daca-red-dark);font-weight:750}.unsaved-representation{font-size:.55rem;color:var(--daca-orange)}.add-representation{font-size:.62rem!important;padding:.3rem!important}.mapping-graph>header{flex-wrap:wrap;gap:.5rem;margin-bottom:.35rem}.mapping-graph h2{font-size:.86rem}.graph-instruction{margin-bottom:.45rem;font-size:.62rem}.graph-legend{gap:.45rem;font-size:.57rem}.graph-legend i{width:15px;border-top-width:1px}
    .graph-canvas{grid-template-columns:220px 70px 220px;gap:15px;width:570px;min-height:380px;padding:15px}.logical-node>header,.physical-representation>header{gap:.1rem;border-top-width:3px;padding:.5rem .6rem}.logical-node>header span,.physical-representation>header span,.physical-table-title span{font-size:.49rem}.logical-node>header strong,.physical-representation>header strong{font-size:.68rem}.logical-node>header small,.physical-representation>header small,.physical-representation>header code{font-size:.51rem}.snapshot-source img{width:18px;height:18px}.field-endpoint,.column-endpoint{min-height:39px;gap:.25rem;padding:.3rem .4rem}.field-endpoint{padding-right:1rem}.column-endpoint{padding-left:1rem}.field-endpoint::before,.field-endpoint::after,.column-endpoint::before{width:10px;height:10px;border-width:2px}.field-endpoint::after{right:-6px}.column-endpoint::before{left:-6px}.field-endpoint strong,.column-endpoint strong{font-size:.62rem}.field-endpoint small,.column-endpoint small{font-size:.5rem}.field-endpoint b,.column-endpoint b{font-size:.48rem}.physical-nodes{gap:.4rem}.physical-table-title{padding:.4rem .5rem}.physical-table-title strong{font-size:.62rem}
    :host{display:block;min-width:0}.mapping-graph{display:flex;flex-direction:column;min-width:0}.graph-canvas{display:block;min-width:100%;padding:0}.logical-node,.physical-representation{position:absolute;width:220px;z-index:1}.physical-nodes{display:contents}.physical-representation{align-self:start}.node-drag-handle{cursor:grab;touch-action:none;user-select:none}.node-drag-handle:active,.physical-representation.is-dragging .node-drag-handle{cursor:grabbing}.physical-representation.is-dragging{z-index:3}.node-drag-handle:focus-visible{outline:2px solid var(--daca-blue);outline-offset:2px}.mapping-graph.is-fullscreen{height:100%;min-height:0}.canvas-viewport{position:relative;min-height:0}.canvas-tools{position:absolute;top:.65rem;right:1.2rem;z-index:10;display:flex;gap:.4rem}.canvas-tools button{display:grid;place-items:center;width:40px;height:40px;border:1px solid var(--daca-border-strong);background:#fff;color:var(--daca-blue);box-shadow:0 2px 5px #14202b14;cursor:pointer}.canvas-tools button:hover{background:var(--daca-blue-soft)}.canvas-tools button:disabled{opacity:.5;cursor:wait}.canvas-tools span{font-size:1.7rem;line-height:1}.canvas-tools svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}.mapping-graph.is-fullscreen .canvas-viewport{flex:1}.mapping-graph.is-fullscreen .graph-scroll{height:100%;max-height:none;min-height:0}
    .field-endpoint:not(.has-left-port)::before,.field-endpoint:not(.has-right-port)::after{display:none}.field-endpoint::before{left:-6px;right:auto}.is-left-of-logical .column-endpoint::before{left:auto;right:-6px}.is-left-of-logical .column-endpoint{padding-left:.7rem;padding-right:2rem}

    .field-endpoint,.column-endpoint{touch-action:none;user-select:none;-webkit-user-select:none}.field-endpoint.is-connecting::before,.field-endpoint.is-connecting::after,.column-endpoint.is-connecting::before{background:var(--daca-red);box-shadow:0 0 0 1px var(--daca-red)}.graph-canvas>svg.connection-preview{z-index:5;overflow:visible;pointer-events:none}.graph-canvas .connection-preview path{stroke:var(--daca-red);stroke-width:2;stroke-dasharray:none}.connection-preview circle{fill:var(--daca-red);stroke:#fff;stroke-width:2}
    .graph-canvas .edge-line{pointer-events:none}.graph-canvas path.edge-hit{stroke:transparent;stroke-width:14;stroke-dasharray:none;pointer-events:stroke;cursor:context-menu;outline:none}.graph-canvas .mapping-edge.is-hovered .edge-line{stroke-width:2.75}.graph-canvas .edge-hit:focus-visible{outline:1px dashed var(--daca-blue);outline-offset:3px}.graph-canvas>svg.edge-handles{z-index:4;overflow:visible}.edge-handles circle{pointer-events:all;fill:#fff;stroke:var(--daca-blue);stroke-width:1.5;cursor:grab;touch-action:none}.edge-handles circle:hover,.edge-handles circle:focus{fill:var(--daca-blue-soft);stroke-width:2.5;outline:none}.edge-handles circle:active{cursor:grabbing}.edge-context-menu{width:min(340px,calc(100vw - 16px));max-height:calc(100dvh - 16px);z-index:1100}.edge-context-menu label{display:grid;gap:.3rem;border-top:1px solid var(--daca-border);padding:.55rem .75rem;font-size:.65rem;font-weight:750}.edge-context-menu select,.edge-context-menu textarea{box-sizing:border-box;width:100%;min-height:38px;border:1px solid var(--daca-border-strong);padding:.35rem;background:var(--daca-surface,#fff);color:var(--daca-ink);font:inherit}.edge-context-menu label small{font-weight:400;color:var(--daca-muted)}
  `],
})
export class MappingGraphComponent {
  readonly objectBrowser=signal<CatalogObjectKind|null>(null);
  readonly objectKinds:readonly {id:CatalogObjectKind;label:string}[]=[{id:'term',label:'Term suchen und öffnen'},{id:'domain',label:'Domäne suchen und öffnen'},{id:'logical',label:'Logisches Modell suchen und öffnen'},{id:'physical',label:'Physisches Modell suchen und öffnen'}];
  openObjectBrowser(kind:CatalogObjectKind):void{this.closeMenu();this.objectBrowser.set(kind);}
  closeObjectBrowser():void{this.objectBrowser.set(null);queueMicrotask(()=>this.host.nativeElement.querySelector<HTMLElement>('.graph-scroll')?.focus());}
  readonly facade=inject(MappingDraftFacade);
  readonly canManage=input(false);
  readonly responsibleUserId=input('');
  readonly fullscreen=input(false);
  readonly toggleFullscreen=output<EventTarget|null>();
  readonly canvasTitle=computed(()=>`${this.facade.model()?.title.de||this.facade.model()?.entityName||'Modell'} · Felder und physische Spalten verbinden`);
  readonly printing=signal(false);
  async printCanvas():Promise<void>{
    const canvas=this.host.nativeElement.querySelector<HTMLElement>('.graph-canvas'),model=this.facade.model();if(!canvas||!model||this.printing())return;
    this.closeMenu();this.refreshEndpointPositions();this.printing.set(true);
    try{await printMappingCanvas(canvas,this.canvasTitle(),{modelUpdatedAt:model.updatedAt,modelRevision:model.revision});}catch{this.facade.announcement.set('Der Canvas konnte nicht gedruckt werden. Bitte erneut versuchen.');}finally{this.printing.set(false);}
  }
  readonly mappingTypes=MAPPING_TYPE_OPTIONS;
  readonly typeDescription=mappingTypeDescription;
  readonly edgeSides=['logical','physical'] as const;
  readonly hoveredEdge=signal<EdgeReference|null>(null);
  readonly selectedEdge=signal<EdgeReference|null>(null);
  readonly edgeMenu=signal<EdgeMenu|null>(null);
  readonly removeRelationship=output<string>();
  readonly edgeMenuMapping=computed(()=>this.facade.activeMappings().find((item)=>item.id===this.edgeMenu()?.mappingId)??null);
  readonly edgeMenuColumns=computed(()=>{const column=this.facade.physicalColumns().find((item)=>item.id===this.edgeMenu()?.columnId);return this.facade.physicalColumns().filter((item)=>item.tableId===column?.tableId);});
  readonly activeEdge=computed(()=>{const edge=this.selectedEdge();return this.canManage()&&edge&&this.facade.selectedMappingId()===edge.mappingId&&this.facade.activeMappings().some((mapping)=>mapping.id===edge.mappingId&&mapping.logicalFieldVersionIds.includes(edge.fieldId)&&mapping.physicalColumnIds.includes(edge.columnId))&&this.visibleColumnIds().has(edge.columnId)?edge:null;});
  readonly renderedEdges=computed(()=>{
    const selected=this.selectedEdge(),selectedId=this.facade.selectedMappingId();
    const edges=this.facade.activeMappings().flatMap((mapping)=>mapping.logicalFieldVersionIds.flatMap((fieldId)=>mapping.physicalColumnIds.flatMap((columnId,targetIndex)=>this.visibleColumnIds().has(columnId)?[{mapping,fieldId,columnId,targetIndex,key:`${mapping.id}:${fieldId}:${columnId}`}]:[])));
    const priority=(edge:typeof edges[number])=>this.edgeMatches(selected,edge.mapping.id,edge.fieldId,edge.columnId)?2:edge.mapping.id===selectedId?1:0;
    return edges.sort((left,right)=>priority(left)-priority(right));
  });
  readonly endpointDrag=signal<(EdgeReference&{side:'logical'|'physical';pointerId:number;point:{x:number;y:number};handle:SVGCircleElement})|null>(null);
  readonly connectionDrag=signal<ConnectionHold|null>(null);
  private connectionHold: ConnectionHold|null=null;
  private connectionTimer: ReturnType<typeof setTimeout>|undefined;
  private suppressConnectionClick=false;
  private suppressClickTimer: ReturnType<typeof setTimeout>|undefined;
  readonly connectionPoints=computed(()=>{
    const drag=this.connectionDrag();if(!drag)return null;
    const canvas=this.host.nativeElement.querySelector<HTMLElement>('.graph-canvas');if(!canvas)return null;
    const canvasRect=canvas.getBoundingClientRect(),rect=drag.handle.getBoundingClientRect();
    const right=drag.clientX>=rect.left+rect.width/2;
    return {start:{x:(right?rect.right:rect.left)-canvasRect.left,y:rect.top+rect.height/2-canvasRect.top},end:{x:drag.clientX-canvasRect.left,y:drag.clientY-canvasRect.top}};
  });
  startConnectionHold(side:'logical'|'physical',id:string,event:PointerEvent):void{
    if(!this.canManage()||event.button!==0||event.isPrimary===false)return;
    this.cancelConnectionDrag();
    const hold:ConnectionHold={side,id,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,handle:event.currentTarget as HTMLElement};
    this.connectionHold=hold;
    this.connectionTimer=setTimeout(()=>{
      this.connectionTimer=undefined;
      if(this.connectionHold!==hold||!this.canManage())return;
      this.closeMenu();this.facade.cancelConnection();this.connectionDrag.set(hold);
      hold.handle.focus({preventScroll:true});
      this.facade.announcement.set('Verbindung ziehen: Lassen Sie den roten Punkt auf einem Feld des anderen Modelltyps los. Escape bricht ab.');
    },350);
  }
  private moveConnection(event:PointerEvent):boolean{
    const hold=this.connectionHold;if(!hold||event.pointerId!==hold.pointerId)return false;
    if(!this.connectionDrag()){
      if(Math.hypot(event.clientX-hold.clientX,event.clientY-hold.clientY)>8)this.cancelConnectionDrag();
      return true;
    }
    event.preventDefault();this.connectionDrag.set({...hold,clientX:event.clientX,clientY:event.clientY});return true;
  }
  private finishConnection(event:PointerEvent):boolean{
    const hold=this.connectionHold;if(!hold||event.pointerId!==hold.pointerId)return false;
    const active=Boolean(this.connectionDrag());
    this.cancelConnectionDrag();if(!active)return true;
    event.preventDefault();this.suppressNextConnectionClick();
    if(!this.canManage())return true;
    const selector=hold.side==='logical'?'[data-physical-column-id]':'[data-logical-field-id]';
    const hits=document.elementsFromPoint?.(event.clientX,event.clientY)??[event.target as Element];
    const target=hits.map((item)=>item.closest?.<HTMLElement>(selector)).find((item)=>item&&this.host.nativeElement.contains(item));
    const id=target?.getAttribute(hold.side==='logical'?'data-physical-column-id':'data-logical-field-id');
    if(id)this.facade.createDirectConnection(hold.side==='logical'?hold.id:id,hold.side==='logical'?id:hold.id,this.responsibleUserId());
    else this.facade.announcement.set('Keine Verbindung erstellt: Das Ziel muss ein Feld des anderen Modelltyps sein.');
    return true;
  }
  private suppressNextConnectionClick():void{this.suppressConnectionClick=true;clearTimeout(this.suppressClickTimer);this.suppressClickTimer=setTimeout(()=>this.suppressConnectionClick=false,0);}
  cancelConnectionDrag():boolean{
    clearTimeout(this.connectionTimer);this.connectionTimer=undefined;
    const hold=this.connectionHold,active=Boolean(this.connectionDrag());this.connectionHold=null;this.connectionDrag.set(null);
    if(active){this.suppressNextConnectionClick();this.facade.announcement.set('Ziehen der Verbindung abgebrochen.');}
    return Boolean(hold);
  }
  connectionScroll():void{const drag=this.connectionDrag();if(drag)this.connectionDrag.set({...drag});else this.cancelConnectionDrag();}
  edgeMatches(edge:EdgeReference|null,mappingId:string,fieldId:string,columnId:string):boolean{return edge?.mappingId===mappingId&&edge.fieldId===fieldId&&edge.columnId===columnId;}
  private nearestEdge(event:MouseEvent):EdgeReference|null {
    if((event.target as Element|null)?.closest?.('.edge-handles'))return null;
    const hits=document.elementsFromPoint?.(event.clientX,event.clientY)??[];
    const groups=new Set(hits.map((item)=>item.closest<SVGGElement>('.mapping-edge')).filter((item):item is SVGGElement=>Boolean(item&&this.host.nativeElement.contains(item))));
    const canvas=this.host.nativeElement.querySelector<HTMLElement>('.graph-canvas');if(!canvas)return null;
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    let best=64,result:EdgeReference|null=null;
    for(const group of groups){
      const path=group.querySelector<SVGPathElement>('.edge-line');if(!path?.getTotalLength)continue;
      const length=path.getTotalLength();if(!length)continue;
      const distance=(at:number)=>{const point=path.getPointAtLength(at);return (point.x-x)**2+(point.y-y)**2;};
      let at=0,distanceSquared=Infinity;
      for(let step=0;step<=20;step++){const candidate=length*step/20,value=distance(candidate);if(value<distanceSquared){distanceSquared=value;at=candidate;}}
      let low=Math.max(0,at-length/20),high=Math.min(length,at+length/20);
      for(let step=0;step<10;step++){const first=low+(high-low)/3,second=high-(high-low)/3;if(distance(first)<distance(second))high=second;else low=first;}
      distanceSquared=distance((low+high)/2);
      if(distanceSquared<best){best=distanceSquared;result={mappingId:group.dataset['edgeMappingId']!,fieldId:path.dataset['edgeLogicalFieldId']!,columnId:path.dataset['edgePhysicalColumnId']!};}
    }
    return result;
  }
  private hoverEdge(event:PointerEvent):void{const edge=this.nearestEdge(event),old=this.hoveredEdge();if(!edge&&!old||edge&&this.edgeMatches(old,edge.mappingId,edge.fieldId,edge.columnId))return;this.hoveredEdge.set(edge);}
  @HostListener('document:pointerleave') clearEdgeHover():void{this.hoveredEdge.set(null);this.cancelConnectionDrag();}
  edgeLabel(mapping:AssetMapping,fieldId:string,columnId:string):string{return `${this.facade.logicalFields().find((item)=>item.id===fieldId)?.name??fieldId} ↔ ${this.facade.physicalColumns().find((item)=>item.id===columnId)?.name??columnId} · ${mapping.mappingType}`;}
  selectEdge(mappingId:string,fieldId:string,columnId:string,event:Event):void{event.stopPropagation();const edge=event instanceof MouseEvent?this.nearestEdge(event)??{mappingId,fieldId,columnId}:{mappingId,fieldId,columnId};this.facade.cancelConnection();this.facade.selectMapping(edge.mappingId);this.selectedEdge.set(edge);}
  openEdgeMenu(mappingId:string,fieldId:string,columnId:string,event:MouseEvent):void{
    event.preventDefault();event.stopPropagation();const nearest=event instanceof MouseEvent?this.nearestEdge(event):null;if(nearest){mappingId=nearest.mappingId;fieldId=nearest.fieldId;columnId=nearest.columnId;}this.closeMenu();this.selectEdge(mappingId,fieldId,columnId,event);this.menuTrigger=(event.currentTarget as Element).querySelector<SVGElement>('.edge-hit')??event.currentTarget as SVGElement;
    this.edgeMenu.set({mappingId,fieldId,columnId,x:Math.max(8,Math.min(event.clientX,window.innerWidth-348)),y:Math.max(8,Math.min(event.clientY,window.innerHeight-500))});
    afterNextRender(()=>{this.fitEdgeMenu();this.host.nativeElement.querySelector<HTMLSelectElement>('.edge-context-menu select:not(:disabled)')?.focus();},{injector:this.injector});
  }
  private fitEdgeMenu():void{const menu=this.host.nativeElement.querySelector<HTMLElement>('.edge-context-menu');if(!menu)return;const rect=menu.getBoundingClientRect();this.edgeMenu.update((edge)=>edge?{...edge,x:Math.max(8,Math.min(edge.x,window.innerWidth-rect.width-8)),y:Math.max(8,Math.min(edge.y,window.innerHeight-rect.height-8))}:null);}
  edgeKeydown(mappingId:string,fieldId:string,columnId:string,event:KeyboardEvent):void{if(event.key==='Enter'||event.key===' '||event.key==='F10'&&event.shiftKey){const rect=(event.currentTarget as SVGElement).getBoundingClientRect();this.openEdgeMenu(mappingId,fieldId,columnId,{preventDefault:()=>event.preventDefault(),stopPropagation:()=>event.stopPropagation(),clientX:rect.left,clientY:rect.top,currentTarget:event.currentTarget} as MouseEvent);}}
  closeEdgeMenu(event:Event):void{event.preventDefault();event.stopPropagation();this.closeMenu();}
  changeEdgeType(value:string):void{const mapping=this.edgeMenuMapping();if(this.canManage()&&mapping&&mapping.mappingType!==value&&this.mappingTypes.some((item)=>item.value===value)){this.facade.reviseMapping(mapping.id,{mappingType:value as MappingType});afterNextRender(()=>this.fitEdgeMenu(),{injector:this.injector});}}
  changeEdgeRule(value:string):void{const mapping=this.edgeMenuMapping();if(this.canManage()&&mapping&&(value.trim()||null)!==mapping.transformationRule)this.facade.reviseMapping(mapping.id,{transformationRule:value.trim()||null});}
  rewireFromMenu(side:'logical'|'physical',replacementId:string,control?:HTMLSelectElement):void{const edge=this.edgeMenu();if(!edge||!this.canManage())return;if(this.facade.rewireEndpoint(edge.mappingId,edge.fieldId,edge.columnId,side,replacementId)){const updated={...edge,...(side==='logical'?{fieldId:replacementId}:{columnId:replacementId})};this.edgeMenu.set(updated);this.selectedEdge.set(updated);}else if(control){control.value=side==='logical'?edge.fieldId:edge.columnId;}}
  deleteEdge():void{const edge=this.edgeMenu(),mapping=this.edgeMenuMapping();if(!edge||!mapping||!this.canManage())return;this.closeMenu();if(mapping.logicalFieldVersionIds.length===1&&mapping.physicalColumnIds.length>1)this.disconnect.emit({mappingId:mapping.id,columnId:edge.columnId});else this.removeRelationship.emit(mapping.id);}
  edgeHandlePoint(edge:EdgeReference,side:'logical'|'physical'):{x:number;y:number}{const path=this.edgePath(edge.fieldId,edge.columnId,0,edge.mappingId),numbers=path.match(/-?[0-9]+(?:[.][0-9]+)?/g)?.map(Number)??[];return side==='logical'?{x:numbers[0]??0,y:numbers[1]??0}:{x:numbers.at(-2)??0,y:numbers.at(-1)??0};}
  handleKeydown(edge:EdgeReference,side:'logical'|'physical',event:KeyboardEvent):void{this.edgeKeydown(edge.mappingId,edge.fieldId,edge.columnId,event);if(this.edgeMenu())afterNextRender(()=>this.host.nativeElement.querySelector<HTMLSelectElement>(side==='logical'?'select[aria-label="Logisches Linienende"]':'select[aria-label="Physisches Linienende"]')?.focus(),{injector:this.injector});}
  startEndpointDrag(edge:EdgeReference,side:'logical'|'physical',event:PointerEvent):void{
    if(!this.canManage()||event.button!==0)return;event.preventDefault();event.stopPropagation();this.closeMenu();this.facade.cancelConnection();
    const handle=event.currentTarget as SVGCircleElement;handle.focus({preventScroll:true});this.endpointDrag.set({...edge,side,pointerId:event.pointerId,point:this.edgeHandlePoint(edge,side),handle});
    try{handle.setPointerCapture?.(event.pointerId);}catch{}
  }
  dragEndpoint(event:PointerEvent):void{const drag=this.endpointDrag();if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();const canvas=this.host.nativeElement.querySelector<HTMLElement>('.graph-canvas')!,rect=canvas.getBoundingClientRect();this.endpointDrag.set({...drag,point:{x:event.clientX-rect.left,y:event.clientY-rect.top}});}
  finishEndpointDrag(event:PointerEvent):void{
    const drag=this.endpointDrag();if(!drag||drag.pointerId!==event.pointerId)return;this.endpointDrag.set(null);try{if(drag.handle.hasPointerCapture?.(event.pointerId))drag.handle.releasePointerCapture(event.pointerId);}catch{}
    const selector=drag.side==='logical'?'[data-logical-field-id]':'[data-physical-column-id]';
    const candidates=document.elementsFromPoint?.(event.clientX,event.clientY)??[event.target as Element];
    const target=candidates.map((item)=>item.closest?.<HTMLElement>(selector)).find((item)=>item&&this.host.nativeElement.contains(item));
    const replacementId=target?.getAttribute(drag.side==='logical'?'data-logical-field-id':'data-physical-column-id');
    if(!this.canManage())return;
    if(replacementId&&this.facade.rewireEndpoint(drag.mappingId,drag.fieldId,drag.columnId,drag.side,replacementId)){this.selectedEdge.set({...drag,...(drag.side==='logical'?{fieldId:replacementId}:{columnId:replacementId})});}
    else if(!replacementId)this.facade.announcement.set('Linienende unverändert: Ziehen Sie es auf ein Feld im gleichen Modell.');
  }
  cancelEndpointDrag():boolean{const drag=this.endpointDrag();if(!drag)return false;this.endpointDrag.set(null);try{if(drag.handle.hasPointerCapture?.(drag.pointerId))drag.handle.releasePointerCapture(drag.pointerId);}catch{}this.facade.announcement.set('Verschieben des Linienendes abgebrochen.');return true;}
  endpointPointerCancel(event:PointerEvent):void{if(this.endpointDrag()?.pointerId===event.pointerId)this.cancelEndpointDrag();}
  @HostListener('window:blur',['$event']) endpointBlur(event:FocusEvent):void{if(event.target===window){this.cancelEndpointDrag();this.cancelConnectionDrag();}}
  graphEscape(event:Event):void{if(this.edgeMenu()){this.closeEdgeMenu(event);return;}if(this.cancelConnectionDrag()||this.cancelEndpointDrag()){event.preventDefault();event.stopPropagation();}else this.facade.cancelConnection();}

  representationIsLeft(tableId:string):boolean{return this.nodePosition('physical:'+tableId).x<this.nodePosition('logical').x;}
  fieldHasPort(fieldId:string,side:'left'|'right'):boolean{
    const columns=new Map(this.facade.physicalColumns().map((column)=>[column.id,column]));
    const sides=this.facade.activeMappings().filter((mapping)=>mapping.logicalFieldVersionIds.includes(fieldId)).flatMap((mapping)=>mapping.physicalColumnIds).filter((id)=>this.visibleColumnIds().has(id)).map((id)=>this.representationIsLeft(columns.get(id)!.tableId)?'left':'right');
    return sides.length?sides.includes(side):side==='right';
  }
  readonly draggingNode=signal<string|null>(null);
  readonly representationMenu=signal<{tableId:string;x:number;y:number}|null>(null);
  private readonly nodeHeights=signal<ReadonlyMap<string,number>>(new Map());
  private drag:{key:string;pointerId:number;startX:number;startY:number;position:CanvasNodePosition;positions:ReadonlyMap<string,CanvasNodePosition>;scrollX:number;scrollY:number;handle:HTMLElement;moved:boolean}|null=null;
  private suppressedClickNode:string|null=null;
  readonly visibleColumnIds=computed(()=>new Set(this.facade.visibleRepresentations().flatMap((item)=>item.table.columns.map((column)=>column.id))));
  nodePosition(key:string):CanvasNodePosition{
    const manual=this.facade.canvasNodePositions().get(key);if(manual)return manual;
    if(key==='logical')return{x:15,y:15};
    let y=15;
    for(const item of this.facade.visibleRepresentations()){
      if(key==='physical:'+item.table.id)return{x:335,y};
      y+=(this.nodeHeights().get('physical:'+item.table.id)??(140+item.table.columns.length*39))+18;
    }
    return{x:335,y};
  }
  readonly canvasSize=computed(()=>{
    let width=570,height=Math.max(380,this.nodePosition('logical').y+(this.nodeHeights().get('logical')??(70+this.facade.logicalFields().length*39))+15);
    width=Math.max(width,this.nodePosition('logical').x+235);
    for(const item of this.facade.visibleRepresentations()){const key='physical:'+item.table.id,position=this.nodePosition(key);width=Math.max(width,position.x+235);height=Math.max(height,position.y+(this.nodeHeights().get(key)??(140+item.table.columns.length*39))+15);}
    return{width,height};
  });
  startNodeDrag(key:string,event:PointerEvent):void{
    if(event.button!==0||!this.canManage()||this.facade.representations().some((item)=>key==='physical:'+item.table.id&&item.preview))return;
    const handle=event.currentTarget as HTMLElement,scroll=this.host.nativeElement.querySelector('.graph-scroll')!;
    this.closeMenu();this.facade.cancelConnection();this.suppressedClickNode=null;handle.focus({preventScroll:true});event.preventDefault();event.stopPropagation();
    this.drag={key,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,position:this.nodePosition(key),positions:this.facade.canvasNodePositions(),scrollX:scroll.scrollLeft,scrollY:scroll.scrollTop,handle,moved:false};
    try{handle.setPointerCapture?.(event.pointerId);}catch{/* Synthetic events have no active pointer. */}
  }
  @HostListener('document:pointermove',['$event']) dragNode(event:PointerEvent):void{
    if(this.moveConnection(event))return;
    if(this.endpointDrag()){this.dragEndpoint(event);return;}
    if(!this.drag){this.hoverEdge(event);return;}
    const drag=this.drag;if(!drag||event.pointerId!==drag.pointerId)return;
    const scroll=this.host.nativeElement.querySelector('.graph-scroll')!;
    const dx=event.clientX-drag.startX+scroll.scrollLeft-drag.scrollX,dy=event.clientY-drag.startY+scroll.scrollTop-drag.scrollY;
    if(!drag.moved&&Math.hypot(dx,dy)<4)return;
    drag.moved=true;this.draggingNode.set(drag.key);event.preventDefault();
    this.facade.moveCanvasNode(drag.key,{x:drag.position.x+dx,y:drag.position.y+dy});
    // Rendering updates the endpoint rectangles; do not reuse the previous path.
    this.scheduleEndpointRefresh();
  }
  @HostListener('document:pointerup',['$event']) finishNodeDrag(event:PointerEvent):void{if(this.finishConnection(event))return;if(this.endpointDrag()){this.finishEndpointDrag(event);return;}if(!this.drag||event.pointerId!==this.drag.pointerId)return;const drag=this.drag;this.drag=null;this.draggingNode.set(null);if(drag.moved)this.suppressedClickNode=drag.key;try{if(drag.handle.hasPointerCapture?.(event.pointerId))drag.handle.releasePointerCapture(event.pointerId);}catch{}this.scheduleEndpointRefresh();}
  @HostListener('document:pointercancel',['$event']) cancelNodeDrag(event:PointerEvent):void{if(this.connectionHold?.pointerId===event.pointerId){this.cancelConnectionDrag();return;}if(this.endpointDrag()){this.endpointPointerCancel(event);return;}if(this.drag?.pointerId===event.pointerId){this.facade.canvasNodePositions.set(this.drag.positions);this.drag=null;this.draggingNode.set(null);this.scheduleEndpointRefresh();}}
  moveNodeByKeyboard(key:string,event:KeyboardEvent):void{
    if(!this.canManage()||this.facade.representations().some((item)=>key==='physical:'+item.table.id&&item.preview))return;
    const direction:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const delta=direction[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();const position=this.nodePosition(key),step=event.shiftKey?40:10;
    this.facade.moveCanvasNode(key,{x:position.x+delta[0]*step,y:position.y+delta[1]*step});this.scheduleEndpointRefresh();
  }
  representationClicked(tableId:string,event:MouseEvent):void{if((event.target as HTMLElement).closest('.column-endpoint'))return;if(this.suppressedClickNode==='physical:'+tableId){this.suppressedClickNode=null;return;}this.openRepresentationMenu(tableId,event);}
  openRepresentationMenu(tableId:string,event:MouseEvent):void{event.preventDefault();event.stopPropagation();this.closeMenu();const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();this.menuTrigger=event.currentTarget as HTMLElement;this.representationMenu.set({tableId,x:Math.max(8,Math.min(event.clientX||rect.left,window.innerWidth-298)),y:Math.max(8,Math.min(event.clientY||rect.top+30,window.innerHeight-420))});queueMicrotask(()=>this.host.nativeElement.querySelector<HTMLButtonElement>('.representation-context-menu [role="menuitem"]')?.focus());}
  representationKeydown(tableId:string,event:KeyboardEvent):void{if((event.target as HTMLElement).closest('.column-endpoint'))return;if((event.key==='F10'&&event.shiftKey)||event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();this.openRepresentationMenu(tableId,{preventDefault:()=>{},stopPropagation:()=>{},clientX:rect.left,clientY:rect.top+30,currentTarget:event.currentTarget} as MouseEvent);}}
  hideRepresentation(tableId:string):void{this.facade.hideRepresentation(tableId);this.closeMenu();this.host.nativeElement.querySelector<HTMLElement>('.graph-scroll')?.focus({preventScroll:true});}
  private scheduleEndpointRefresh():void{queueMicrotask(()=>this.refreshEndpointPositions());}

  readonly assignDomain=output<{tableId:string|null;trigger:EventTarget|null}>();
  requestDomain(tableId:string|null):void{const trigger=this.menuTrigger;this.closeMenu();this.assignDomain.emit({tableId,trigger});}
  physicalDomainAssignable(tableId:string):boolean{return this.facade.representations().find((item)=>item.table.id===tableId)?.table.domainAssignable!==false;}
  physicalDomains(tableId:string){return this.facade.representations().find((item)=>item.table.id===tableId)?.table.dataDomains??[];}
  physicalDomainLabel(tableId:string):string{return this.physicalDomains(tableId).map((domain)=>domain.displayName).join(', ')||'Keine Domäne zugeordnet';}
  readonly addRepresentation=output<EventTarget|null>();
  readonly canvasMenu=signal<{x:number;y:number;logical?:boolean}|null>(null);
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector=inject(Injector);
  private resizeObserver?:ResizeObserver;
  private menuTrigger:HTMLElement|SVGElement|null=null;
  ngAfterViewInit():void{if(typeof ResizeObserver!=='undefined'){this.resizeObserver=new ResizeObserver(()=>this.refreshEndpointPositions());this.observeLayout();}}
  ngOnDestroy():void{this.resizeObserver?.disconnect();this.drag=null;this.endpointDrag.set(null);this.cancelConnectionDrag();clearTimeout(this.suppressClickTimer);}
  openCanvasMenu(event:MouseEvent):void{
    const target=event.target as HTMLElement,logical=Boolean(target.closest('.logical-node>header'));
    if(target.closest('.mapping-edge,.edge-handles'))return;
    if((!logical&&target.closest('.logical-node,.physical-nodes'))||target.closest('.field-endpoint,.column-endpoint'))return;
    event.preventDefault();event.stopPropagation();this.closeMenu();this.menuTrigger=target.closest<HTMLElement>('[tabindex]');
    this.canvasMenu.set({logical,x:Math.max(8,Math.min(event.clientX,window.innerWidth-298)),y:Math.max(8,Math.min(event.clientY,window.innerHeight-420))});queueMicrotask(()=>this.host.nativeElement.querySelector<HTMLElement>('.canvas-context-menu [role="menuitem"]')?.focus());
  }
  canvasKeydown(event:KeyboardEvent):void{
    if(event.key!=='F10'||!event.shiftKey)return;
    const target=event.target as HTMLElement;if(target.closest('.field-endpoint,.column-endpoint,.mapping-edge,.edge-handles'))return;
    const logical=Boolean(target.closest('.logical-node>header'));
    event.preventDefault();this.closeMenu();const rect=target.getBoundingClientRect();this.menuTrigger=target;
    this.canvasMenu.set({logical,x:Math.max(8,Math.min(rect.left,window.innerWidth-298)),y:Math.max(8,Math.min(rect.bottom,window.innerHeight-420))});queueMicrotask(()=>this.host.nativeElement.querySelector<HTMLElement>('.canvas-context-menu [role="menuitem"]')?.focus());
  }
  requestRepresentation():void{const trigger=this.menuTrigger;this.closeMenu();this.addRepresentation.emit(trigger);}

  readonly fieldActivated=output<string>();
  readonly disconnect=output<{mappingId:string;columnId:string}>();
  readonly deleteField=output<string>();
  readonly menu=signal<FieldMenu|null>(null);
  readonly menuField=computed(()=>this.facade.logicalFields().find((field)=>field.id===this.menu()?.fieldId));
  readonly menuLinks=computed<readonly FieldLink[]>(()=>{
    const fieldId=this.menu()?.fieldId;if(!fieldId)return[];
    const columns=new Map(this.facade.physicalColumns().map((column)=>[column.id,column.qualifiedName]));
    return this.facade.activeMappings().filter((mapping)=>mapping.logicalFieldVersionIds.includes(fieldId)).flatMap((mapping)=>mapping.physicalColumnIds.map((columnId)=>({mapping,columnId,label:columns.get(columnId)??columnId})));
  });
  private readonly endpointPositions = signal<{logical: ReadonlyMap<string, EndpointPosition>; physical: ReadonlyMap<string, EndpointPosition>}>({logical:new Map(),physical:new Map()});
  private readonly endpointLayout = effect(() => { this.facade.snapshot(); this.facade.visibleRepresentations(); this.facade.canvasNodePositions(); this.facade.logicalFields(); queueMicrotask(() => {this.observeLayout();this.refreshEndpointPositions();}); });
  @HostListener('window:resize') onWindowResize(): void { this.closeMenu();this.refreshEndpointPositions(); }
  @HostListener('document:pointerdown',['$event']) onDocumentPointerDown(event:PointerEvent):void{if(!(event.target as HTMLElement).closest('.field-context-menu'))this.closeMenu();}
  @HostListener('document:keydown.escape',['$event']) closeMenu(event?:Event):void{const open=Boolean(this.menu()||this.canvasMenu()||this.representationMenu()||this.edgeMenu());if(open&&event)event.preventDefault();this.menu.set(null);this.canvasMenu.set(null);this.representationMenu.set(null);this.edgeMenu.set(null);if(open)this.menuTrigger?.focus();}
  sourceIcon(type=this.facade.snapshot()?.sourceType): string { return type === 'csv' ? '/assets/providers/csv-metadata.svg' : type === 's3' ? '/assets/providers/amazon-s3.svg' : '/assets/providers/postgresql.svg'; }
  sourceTypeLabel(type=this.facade.snapshot()?.sourceType): string { return type === 'csv' ? 'Strukturinventar' : type === 's3' ? 'Amazon S3' : 'PostgreSQL'; }
  fieldStatusLabel(fieldId:string):string{const status=this.facade.mappingStatusForField(fieldId);return status==='unmapped'?'Offen':MAPPING_STATUS_LABELS[status];}
  fieldAriaLabel(field:LogicalField):string{return `Logisches Feld ${field.name}, ${field.dataType}, Status ${this.fieldStatusLabel(field.id)}. ${this.canManage()?'Aktivieren, dann physische Spalte wählen. Umschalt+F10 öffnet Aktionen.':'Aktivieren, um Feldmerkmale anzuzeigen.'}`;}
  fieldPointerDown(fieldId:string,event:PointerEvent):void{this.startConnectionHold('logical',fieldId,event);}
  fieldClicked(fieldId:string,target:EventTarget|null):void{if(this.suppressConnectionClick)return;if(this.canManage())this.facade.beginConnection(fieldId,target);else this.facade.selectField(fieldId);this.fieldActivated.emit(fieldId);}
  fieldKeydown(fieldId:string,event:KeyboardEvent):void{if(!(event.key==='F10'&&event.shiftKey))return;event.preventDefault();const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();this.showMenu(fieldId,rect.left,rect.bottom);}
  openFieldMenu(fieldId:string,event:MouseEvent):void{this.cancelConnectionDrag();event.preventDefault();event.stopPropagation();this.facade.cancelConnection();this.facade.selectField(fieldId);this.showMenu(fieldId,event.clientX,event.clientY);}
  private showMenu(fieldId:string,x:number,y:number):void{this.closeMenu();this.menu.set({fieldId,x:Math.max(8,Math.min(x,window.innerWidth-298)),y:Math.max(8,Math.min(y,window.innerHeight-420))});}
  editField(fieldId:string):void{this.facade.selectField(fieldId);this.closeMenu();this.fieldActivated.emit(fieldId);}
  addConnection(fieldId:string):void{this.facade.beginConnection(fieldId);this.closeMenu();}
  typeConflict(columnId:string):boolean{return this.facade.activeMappings().some((mapping)=>mapping.physicalColumnIds.includes(columnId)&&mapping.validationResult?.issues.some((issue)=>issue.code==='type_mismatch'&&(!issue.physicalColumnId||issue.physicalColumnId===columnId)));}
  isSelectedColumn(columnId:string):boolean{return this.facade.selectedMapping()?.physicalColumnIds.includes(columnId)??false;}
  complete(columnId:string,target:EventTarget|null):void{if(this.canManage()&&this.facade.pendingLogicalFieldId())this.facade.completeConnection(columnId,target);}
  columnClicked(columnId:string,target:EventTarget|null):void{if(this.suppressConnectionClick)return;const fieldId=this.facade.pendingLogicalFieldId()??this.facade.selectedLogicalFieldId();const mapping=this.facade.activeMappings().find((item)=>fieldId&&item.logicalFieldVersionIds.includes(fieldId)&&item.physicalColumnIds.includes(columnId));if(!mapping){if(this.canManage())this.facade.completeConnection(columnId,target);return;}if(!this.canManage()){this.facade.selectMapping(mapping.id);return;}if(mapping.status==='draft')this.facade.openEdit(mapping.id,target);else if(mapping.status==='broken')this.facade.openBrokenResolution(mapping.id,target);else this.facade.selectMapping(mapping.id);}
  edgePath(fieldId:string,columnId:string,_targetIndex=0,mappingId?:string):string{
    const fieldIndex=this.facade.logicalFields().findIndex((field)=>field.id===fieldId),column=this.facade.physicalColumns().find((column)=>column.id===columnId);
    if(fieldIndex<0||!column||!this.visibleColumnIds().has(columnId))return '';
    const left=this.representationIsLeft(column.tableId),direction=left?-1:1,measured=this.endpointPositions();
    const logicalPosition=this.nodePosition('logical'),physicalPosition=this.nodePosition('physical:'+column.tableId);
    const columnIndex=this.facade.visibleRepresentations().find((item)=>item.table.id===column.tableId)!.table.columns.findIndex((item)=>item.id===columnId);
    const source=measured.logical.get(fieldId)??{left:logicalPosition.x-1,right:logicalPosition.x+221,y:logicalPosition.y+80+fieldIndex*39};
    const target=measured.physical.get(columnId)??{left:physicalPosition.x-1,right:physicalPosition.x+221,y:physicalPosition.y+130+columnIndex*39};
    let startX=left?source.left:source.right,endX=left?target.right:target.left,startY=source.y,endY=target.y;
    const drag=this.endpointDrag();
    if(drag&&this.edgeMatches(drag,mappingId??'',fieldId,columnId)){if(drag.side==='logical'){startX=drag.point.x;startY=drag.point.y;}else{endX=drag.point.x;endY=drag.point.y;}}
    return `M ${startX} ${startY} C ${startX+direction*35} ${startY}, ${endX-direction*35} ${endY}, ${endX} ${endY}`;
  }
  private observeLayout():void{if(!this.resizeObserver)return;this.resizeObserver.disconnect();for(const element of this.host.nativeElement.querySelectorAll('.graph-canvas,.physical-representation>header,.logical-node>header,.field-endpoint,.column-endpoint'))this.resizeObserver.observe(element);}
  private refreshEndpointPositions(): void { const canvas=this.host.nativeElement.querySelector<HTMLElement>('.graph-canvas');if(!canvas)return;const heights=new Map<string,number>();const logicalNode=canvas.querySelector<HTMLElement>('.logical-node');if(logicalNode?.offsetHeight)heights.set('logical',logicalNode.offsetHeight);for(const card of canvas.querySelectorAll<HTMLElement>('.physical-representation')){if(card.offsetHeight)heights.set('physical:'+card.dataset['representationTableId'],card.offsetHeight);}const oldHeights=this.nodeHeights();if(heights.size!==oldHeights.size||[...heights].some(([key,height])=>oldHeights.get(key)!==height))this.nodeHeights.set(heights);const canvasRect=canvas.getBoundingClientRect();if(!canvasRect.width||!canvasRect.height)return;const logical=new Map<string,EndpointPosition>();const physical=new Map<string,EndpointPosition>();for(const element of canvas.querySelectorAll<HTMLButtonElement>('.field-endpoint')){const id=element.dataset['logicalFieldId'];const rect=element.getBoundingClientRect();if(id)logical.set(id,{left:rect.left-canvasRect.left-1,right:rect.right-canvasRect.left+1,y:rect.top-canvasRect.top+rect.height/2});}for(const element of canvas.querySelectorAll<HTMLButtonElement>('.column-endpoint')){const id=element.dataset['physicalColumnId'];const rect=element.getBoundingClientRect();if(id)physical.set(id,{left:rect.left-canvasRect.left-1,right:rect.right-canvasRect.left+1,y:rect.top-canvasRect.top+rect.height/2});}if(logical.size||physical.size)this.endpointPositions.set({logical,physical}); }
  edgeClass(mapping:AssetMapping):string{const selected=this.facade.selectedMappingId()===mapping.id?' is-selected':'';const state=({validated:'is-valid',review_pending:'is-review',draft:'is-review',broken:'is-broken',superseded:'is-valid'} as Record<MappingStatus,string>)[mapping.status];return `${state}${selected}`;}
}
