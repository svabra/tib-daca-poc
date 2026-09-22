import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { I14yConcept } from '../domains/i14y-concepts.models';
import { I14yConceptReference } from './data-models.models';
import { LogicalModelFieldHelpDirective } from './logical-model-field-help.directive';
import { BusinessObjectTerm } from './modeling-assistance.service';

@Component({
  selector: 'daca-logical-field-characteristics',
  standalone: true,
  imports: [ReactiveFormsModule, LogicalModelFieldHelpDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="field-characteristics" [class.is-compact]="compact()" [formGroup]="field()" aria-labelledby="field-characteristics-title">
      <header>
        <div><p class="daca-eyebrow">Feldmerkmale</p><h3 id="field-characteristics-title">{{ value('name') || 'Unbenanntes Feld' }}</h3></div>
        <span class="field-position">Position {{ value('order') ?? '–' }}</span>
      </header>
      <div class="field-editor-grid">
        <label dacaFieldHelp="entityName">Entität *<input formControlName="entityName" placeholder="z. B. Mitarbeitende"></label>
        <label dacaFieldHelp="entityBusinessObject">Geschäftsobjekt der Entität *<select formControlName="entityBusinessObjectVersionId"><option value="">Bitte wählen</option>@for(term of businessObjects();track term.versionId){<option [value]="term.versionId">{{ businessObjectLabel(term) }} · v{{ term.revision }}</option>}</select></label>
        <label dacaFieldHelp="fieldName">Feldname *<input formControlName="name"></label>
        <label dacaFieldHelp="fieldBusinessObject">Geschäftsobjekt des Felds *<select formControlName="businessObjectVersionId"><option value="">Bitte wählen</option>@for(term of businessObjects();track term.versionId){<option [value]="term.versionId">{{ businessObjectLabel(term) }} · v{{ term.revision }}</option>}</select></label>
        <label dacaFieldHelp="dataType">Datentyp *<select formControlName="dataType">@if(!knownDataType(value('dataType'))){<option [value]="value('dataType')">{{ value('dataType') }} (technisch)</option>}<option value="string">Text</option><option value="integer">Ganzzahl</option><option value="decimal">Dezimalzahl</option><option value="date">Datum</option><option value="datetime">Datum/Zeit</option><option value="boolean">Ja/Nein</option><option value="time">Zeit</option><option value="uuid">UUID</option><option value="json">JSON</option><option value="binary">Binär</option><option value="array">Liste / Array</option></select></label>
        <label dacaFieldHelp="length">Länge<input type="number" min="1" formControlName="length"></label>
        <label dacaFieldHelp="precision">Precision<input type="number" min="0" formControlName="precision"></label>
        <label dacaFieldHelp="scale">Dezimalstellen / Scale<input type="number" min="0" formControlName="decimalPlaces"></label>
        <label dacaFieldHelp="order">Reihenfolge *<input type="number" min="1" formControlName="order"></label>
        <label dacaFieldHelp="nullable">Nullability<select formControlName="nullable"><option [ngValue]="true">Null erlaubt</option><option [ngValue]="false">Pflichtfeld</option></select></label>
        <label dacaFieldHelp="minCount">minCount<input type="number" min="0" formControlName="minCount"></label>
        <label dacaFieldHelp="maxCount">maxCount<input type="number" min="1" formControlName="maxCount"></label>
        <label dacaFieldHelp="fieldClassification">Klassifizierung<select formControlName="classification"><option value="unclassified">Nicht klassifiziert</option><option value="internal">Intern</option><option value="confidential">Vertraulich</option><option value="secret">Geheim</option></select></label>
        <label dacaFieldHelp="sourceSystem">System<input formControlName="sourceSystem"></label>
        <label class="is-wide" dacaFieldHelp="shortDescription">Kurzbeschreibung *<textarea rows="3" formControlName="shortDescription"></textarea></label>
        <label class="is-wide" dacaFieldHelp="comment">Kommentar<textarea rows="3" formControlName="comment"></textarea></label>
        @if(value('physicalColumnId')){
          <aside class="physical-binding is-wide"><strong>Physische Bindung</strong><span>{{ value('physicalColumnName') }}</span><small>Umbenennen behält diese Bindung; Löschen entfernt den initialen Mapping-Kandidaten.</small></aside>
          <label class="is-wide concept-decision">I14Y-Entscheid für abgeleitetes Feld *<select formControlName="conceptMode" (change)="setDerivedConceptMode(selectValue($event))"><option value="unresolved">Bitte entscheiden</option><option value="linked">I14Y-Concept verknüpfen</option><option value="none">Bewusst kein passendes Concept</option></select><small>Dieser Entscheid wird beim Speichern explizit festgehalten.</small></label>
        }
        <label class="is-wide" [class.is-hidden]="value('physicalColumnId') && value('conceptMode') !== 'linked'" dacaFieldHelp="conceptIds">I14Y-Concept-Links (optional)<button type="button" class="i14y-reset" (click)="resetConceptLinks()">Zurücksetzen</button><select class="concept-multi" multiple size="5" formControlName="conceptIds" (change)="selectConcepts(selectValues($event))">@for(concept of concepts();track concept.id){<option [value]="concept.id" [attr.data-concept-id]="concept.id">{{ conceptName(concept) }} · {{ concept.conceptType }} · v{{ concept.version }}</option>}@for(conceptId of missingConceptIds();track conceptId){<option [value]="conceptId" [attr.data-concept-id]="conceptId">{{ conceptLabel(conceptId) }}</option>}</select><small>Mehrere Concepts können mit Strg/⌘ oder Umschalt ausgewählt werden.</small></label>
        <label class="is-wide" [class.is-hidden]="value('physicalColumnId') && value('conceptMode') !== 'linked'" dacaFieldHelp="primaryConceptId">Primär für I14Y (optional)<button type="button" class="i14y-reset" (click)="resetPrimaryConcept()">Zurücksetzen</button><select formControlName="primaryConceptId"><option value="">Kein primäres Concept</option>@for(conceptId of linkedConceptIds();track conceptId){<option [value]="conceptId">{{ conceptLabel(conceptId) }}</option>}</select><small>Nur eine gewählte primäre Verknüpfung wird als <code>dcterms:conformsTo</code> exportiert.</small></label>
        <label class="is-wide" [class.is-hidden]="value('physicalColumnId') && value('conceptMode') !== 'linked'" dacaFieldHelp="valueListConceptId">Werteliste (I14Y CodeList, optional)<button type="button" class="i14y-reset" (click)="resetValueList()">Zurücksetzen</button><select formControlName="valueListConceptId" (change)="selectValueList(selectValue($event))"><option value="">Keine Werteliste</option>@for(concept of codeLists();track concept.id){<option [value]="concept.id">{{ conceptName(concept) }} · {{ concept.identifiers[0] }}</option>}</select></label>
      </div>
    </section>
  `,
  styles: [`
    .field-characteristics{min-width:0;border:1px solid var(--daca-border);border-top:4px solid var(--daca-red);background:#fff}.field-characteristics>header{display:flex;align-items:start;justify-content:space-between;gap:.75rem;padding:.8rem .9rem;border-bottom:1px solid var(--daca-border)}.field-characteristics h3,.field-characteristics p{margin:.1rem 0}.field-characteristics h3{overflow-wrap:anywhere;font-size:1rem}.field-position{color:var(--daca-muted);font-size:.62rem;font-weight:750;white-space:nowrap}.field-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;padding:.9rem}.field-characteristics.is-compact .field-editor-grid{grid-template-columns:1fr;padding:.75rem}.field-editor-grid label{display:grid;align-content:start;gap:.35rem;min-width:0;color:#30363b;font-size:.68rem;font-weight:750}.field-editor-grid input,.field-editor-grid select,.field-editor-grid textarea{box-sizing:border-box;width:100%;min-height:40px;border:1px solid var(--daca-border-strong);border-radius:0;padding:.5rem .55rem;background:#fff;color:var(--daca-ink)}.field-editor-grid textarea{resize:vertical}.field-editor-grid .concept-multi{min-height:8rem}.field-editor-grid label>small{color:var(--daca-muted);font-size:.61rem;font-weight:500}.field-editor-grid .is-wide{grid-column:1/-1}.field-editor-grid .is-hidden{display:none}.i14y-reset{display:inline-flex;align-items:center;width:max-content;min-height:40px;border:0;padding:0;background:transparent;color:var(--daca-blue);font-size:.62rem;font-weight:750;text-decoration:underline;cursor:pointer}.concept-decision{border-left:4px solid var(--daca-blue);padding:.7rem;background:var(--daca-blue-soft)}.physical-binding{display:grid;gap:.2rem;border-left:4px solid var(--daca-blue);padding:.65rem .75rem;background:#f2f7f9;font-size:.66rem}.physical-binding span{font-family:monospace;font-weight:750}.physical-binding small{color:var(--daca-muted)}@media(max-width:560px){.field-editor-grid{grid-template-columns:1fr}}
  `],
})
export class LogicalFieldCharacteristicsComponent {
  readonly field = input.required<FormGroup>();
  readonly businessObjects = input<readonly BusinessObjectTerm[]>([]);
  readonly concepts = input<readonly I14yConcept[]>([]);
  readonly conceptReferences = input<readonly I14yConceptReference[]>([]);
  readonly compact = input(false);

  value(name: string): any { return this.field().get(name)?.value; }
  businessObjectLabel(term: BusinessObjectTerm): string { return term.labels.find((item) => item.language === 'de')?.preferredLabel ?? term.urn; }
  conceptName(concept: I14yConcept): string { return concept.name.de || concept.name.fr || concept.identifiers[0] || concept.id; }
  conceptLabel(conceptId: string): string {
    const concept = this.concepts().find((item) => item.id === conceptId);
    if (concept) return `${this.conceptName(concept)} · v${concept.version}`;
    const reference = this.conceptReferences().find((item) => item.id === conceptId);
    return reference ? `${reference.name} · v${reference.version}` : conceptId;
  }
  knownDataType(value: string | null): boolean { return Boolean(value && ['string','integer','decimal','date','datetime','boolean','time','uuid','json','binary','array'].includes(value)); }
  codeLists(): readonly I14yConcept[] { return this.concepts().filter((item) => item.conceptType === 'CodeList'); }
  linkedConceptIds(): string[] { return this.normalize(this.value('conceptIds') ?? [], this.value('primaryConceptId'), this.value('valueListConceptId')).conceptIds; }
  missingConceptIds(): string[] { const available = new Set(this.concepts().map((item) => item.id)); return this.linkedConceptIds().filter((id) => !available.has(id)); }
  selectValue(event: Event): string { return (event.target as HTMLSelectElement).value; }
  selectValues(event: Event): string[] { return [...(event.target as HTMLSelectElement).selectedOptions].map((option) => option.dataset['conceptId'] ?? option.value); }
  selectConcepts(ids: string[]): void {
    const selection = this.normalize(ids, this.value('primaryConceptId'), this.value('valueListConceptId'));
    this.set('conceptIds', selection.conceptIds); this.set('primaryConceptId', selection.primaryConceptId ?? '');
    if (this.value('physicalColumnId') && selection.conceptIds.length) this.set('conceptMode', 'linked');
    this.field().markAsDirty();
  }
  selectValueList(conceptId: string): void {
    const selection = this.normalize(this.value('conceptIds') ?? [], this.value('primaryConceptId'), conceptId);
    this.set('conceptIds', selection.conceptIds); this.set('primaryConceptId', selection.primaryConceptId ?? ''); this.field().markAsDirty();
  }
  resetConceptLinks(): void { this.set('conceptIds', []); this.set('primaryConceptId', ''); this.set('valueListConceptId', ''); if (this.value('physicalColumnId')) this.set('conceptMode', 'unresolved'); this.field().markAsDirty(); }
  resetPrimaryConcept(): void { this.set('primaryConceptId', ''); this.field().markAsDirty(); }
  resetValueList(): void { const id = this.value('valueListConceptId'); this.set('valueListConceptId', ''); if (id) { this.set('conceptIds', (this.value('conceptIds') ?? []).filter((item: string) => item !== id)); if (this.value('primaryConceptId') === id) this.set('primaryConceptId', ''); } this.field().markAsDirty(); }
  setDerivedConceptMode(mode: string): void { const value = mode === 'linked' ? 'linked' : mode === 'none' ? 'none' : 'unresolved'; this.set('conceptMode', value); if (value !== 'linked') { this.set('conceptIds', []); this.set('primaryConceptId', ''); this.set('valueListConceptId', ''); } this.field().markAsDirty(); }
  private set(name: string, value: unknown): void { this.field().get(name)?.setValue(value); }
  private normalize(ids: readonly string[], primary: string | null | undefined, valueList: string | null | undefined): { conceptIds: string[]; primaryConceptId: string | null } {
    const conceptIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const list = valueList?.trim(); if (list && !conceptIds.includes(list)) conceptIds.push(list);
    const candidate = primary?.trim(); return { conceptIds, primaryConceptId: candidate && conceptIds.includes(candidate) ? candidate : null };
  }
}
