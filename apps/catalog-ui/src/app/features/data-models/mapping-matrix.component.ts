import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AssetMapping, MappingStatus, MAPPING_STATUS_LABELS } from './data-models.models';
import { MappingDraftFacade } from './mapping-draft.facade';

@Component({
  selector: 'daca-mapping-matrix',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mapping-matrix" aria-labelledby="mapping-matrix-title">
      <header>
        <div>
          <p class="daca-eyebrow">Barrierefreier Tabellenmodus</p>
          <h2 id="mapping-matrix-title">Feldzuordnung</h2>
          <p>{{ facade.logicalFields().length }} logische Felder · {{ facade.activeMappings().length }} aktive Zuordnungen · {{ openCount() }} offen</p>
        </div>
        <button class="daca-button" type="button" (click)="facade.openCreate($event.currentTarget)">Zuordnung hinzufügen</button>
      </header>
      <div class="matrix-region" role="region" tabindex="0" aria-label="Zuordnungsmatrix; horizontal scrollbar">
        <table>
          <thead><tr><th>Logisches Feld</th><th>Feldattribute</th><th>Zuordnung</th><th>Physische Ziele</th><th>Status</th><th><span class="visually-hidden">Aktionen</span></th></tr></thead>
          <tbody>
            @for (field of facade.logicalFields(); track field.id) {
              @if (mappingsFor(field.id).length) {
                @for (mapping of mappingsFor(field.id); track mapping.id; let first = $first) {
                  <tr [class.is-selected]="facade.selectedMappingId()===mapping.id" (click)="facade.selectMapping(mapping.id)">
                    @if (first) {
                      <th scope="row" [attr.rowspan]="mappingsFor(field.id).length"><strong>{{ field.name }}</strong><small>{{ field.entityName }}</small></th>
                      <td [attr.rowspan]="mappingsFor(field.id).length">
                        <span>{{ field.dataType }}{{ field.length ? ' · L '+field.length : '' }}{{ field.precision!==null ? ' · P '+field.precision : '' }}{{ field.decimalPlaces!==null ? ' / S '+field.decimalPlaces : '' }}</span>
                        <small>{{ field.nullable ? 'Optional' : 'Pflichtfeld' }} · Position {{ field.order }}</small>
                      </td>
                    }
                    <td><strong>{{ mapping.mappingType }}</strong><small>{{ mapping.classification }}</small>@if (mapping.logicalFieldVersionIds.length > 1) {<small>{{ mapping.logicalFieldVersionIds.length }} logische Quellen</small>}</td>
                    <td><div class="target-chips">@for (columnId of mapping.physicalColumnIds; track columnId) {<span>{{ columnLabel(columnId) }}</span>}</div></td>
                    <td><span [class]="'mapping-status is-'+mapping.status">{{ statusLabel(mapping.status) }}</span>@if (mapping.validationResult?.issues?.length) {<small>{{ mapping.validationResult!.issues[0].message }}</small>}</td>
                    <td><button class="row-action" type="button" [attr.aria-label]="actionAriaLabel(mapping.status,field.name)" (click)="$event.stopPropagation();activateMapping(mapping,$event.currentTarget)">{{ actionLabel(mapping.status) }}</button></td>
                  </tr>
                }
              } @else {
                <tr [class.is-selected]="facade.selectedLogicalFieldId()===field.id" (click)="facade.selectField(field.id)">
                  <th scope="row"><strong>{{ field.name }}</strong><small>{{ field.entityName }}</small></th>
                  <td><span>{{ field.dataType }}{{ field.length ? ' · L '+field.length : '' }}{{ field.precision!==null ? ' · P '+field.precision : '' }}{{ field.decimalPlaces!==null ? ' / S '+field.decimalPlaces : '' }}</span><small>{{ field.nullable ? 'Optional' : 'Pflichtfeld' }} · Position {{ field.order }}</small></td>
                  <td><span class="empty-arrow" aria-hidden="true">—</span><span class="visually-hidden">Noch nicht zugeordnet</span></td>
                  <td><button class="empty-target" type="button" (click)="$event.stopPropagation();facade.openCreate($event.currentTarget,field.id)">Physisches Feld auswählen</button></td>
                  <td><span class="mapping-status is-broken">Nicht zugeordnet</span></td>
                  <td><button class="row-action" type="button" (click)="$event.stopPropagation();facade.openCreate($event.currentTarget,field.id)">Zuordnen</button></td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;max-width:100%}.mapping-matrix{min-width:0;max-width:100%}.mapping-matrix>header{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.mapping-matrix h2{margin:0;font-size:1.08rem}.mapping-matrix header p:last-child{margin:.25rem 0 0;color:var(--daca-muted);font-size:.7rem}.matrix-region{position:relative;max-width:100%;overflow:auto;border:1px solid var(--daca-border)}.matrix-region:focus-visible{outline-offset:-3px}table{width:100%;min-width:1050px;border-collapse:collapse;background:#fff}th,td{border-bottom:1px solid var(--daca-border);padding:.75rem;text-align:left;vertical-align:middle;font-size:.7rem}thead th{background:#f2f5f7;color:#46515a;font-size:.62rem;letter-spacing:.05em;text-transform:uppercase}tbody th{min-width:190px}tbody th strong,tbody th small,td>span,td>small{display:block}tbody th small,td>small{margin-top:.2rem;color:var(--daca-muted);font-size:.61rem}tbody tr:hover,tbody tr.is-selected{background:var(--daca-blue-soft)}tbody tr.is-selected{box-shadow:inset 4px 0 0 var(--daca-blue)}.target-chips{display:flex;flex-wrap:wrap;gap:.35rem;max-width:360px}.target-chips span{border:1px solid var(--daca-border-strong);padding:.3rem .45rem;background:#fff;font-family:var(--daca-mono);font-size:.59rem}.mapping-status{display:inline-block;width:fit-content;border:1px solid var(--daca-border);padding:.25rem .45rem;background:#f6f7f8;font-size:.61rem;font-weight:800}.mapping-status.is-validated{border-color:#b8dbc9;background:var(--daca-green-soft);color:var(--daca-green)}.mapping-status.is-review_pending,.mapping-status.is-draft{border-color:#ead4a4;background:var(--daca-orange-soft);color:var(--daca-orange)}.mapping-status.is-broken{border-color:#edbdc2;background:var(--daca-red-soft);color:var(--daca-red-dark)}.row-action,.empty-target{min-height:40px;border:1px solid var(--daca-border-strong);padding:.4rem .65rem;background:#fff;color:var(--daca-blue);font-weight:750;cursor:pointer}.empty-target{width:100%;border-style:dashed}.empty-arrow{font-size:1.2rem}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}@media(max-width:820px){.mapping-matrix>header{align-items:flex-start;flex-direction:column}.mapping-matrix>header .daca-button{width:100%}}
  `],
})
export class MappingMatrixComponent {
  readonly facade=inject(MappingDraftFacade);
  mappingsFor(fieldId:string):readonly AssetMapping[]{return this.facade.activeMappings().filter((mapping)=>mapping.logicalFieldVersionIds.includes(fieldId));}
  openCount():number{return this.facade.logicalFields().filter((field)=>!this.facade.mappedFieldIds().has(field.id)).length;}
  columnLabel(id:string):string{return this.facade.physicalColumns().find((column)=>column.id===id)?.qualifiedName??`Nicht im aktuellen Snapshot (${id})`;}
  statusLabel(status:MappingStatus):string{return MAPPING_STATUS_LABELS[status];}
  actionLabel(status:MappingStatus):string{return status==='draft'?'Bearbeiten':status==='broken'?'Auflösen':'Details';}
  actionAriaLabel(status:MappingStatus,fieldName:string):string{return `${this.actionLabel(status)} der Zuordnung für ${fieldName}`;}
  activateMapping(mapping:AssetMapping,target:EventTarget|null):void{if(mapping.status==='draft')this.facade.openEdit(mapping.id,target);else if(mapping.status==='broken')this.facade.openBrokenResolution(mapping.id,target);else this.facade.selectMapping(mapping.id);}
}
