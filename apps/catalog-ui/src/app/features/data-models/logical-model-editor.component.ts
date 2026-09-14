import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, Injector, input, signal, viewChild } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService, ModelingPersona } from '../../core/demo-identity.service';
import { I14yConceptsApiService } from '../domains/i14y-concepts-api.service';
import { I14yConcept } from '../domains/i14y-concepts.models';
import { DataModelWorkspaceNavComponent } from './data-model-workspace-nav.component';
import { DataModelsApiService, LogicalModelExportFile, LogicalModelExportRepresentation } from './data-models-api.service';
import { CreatorType, DataClassification, LogicalEntity, LogicalEntityWrite, LogicalField, LogicalFieldWrite, LogicalModel, LogicalModelAssistanceProvenance, LogicalModelCreator, LogicalModelWrite } from './data-models.models';
import { DatasetSummaryComponent } from './dataset-summary.component';
import { LogicalModelGovernanceComponent } from './logical-model-governance.component';
import { BusinessObjectTerm, FederalOrganization, ModelingAssistanceService, TermdatEntry } from './modeling-assistance.service';
import { WorkContextComponent } from './work-context.component';

export interface FieldConceptSelection {
  conceptIds: string[];
  primaryConceptId: string | null;
}

export interface LogicalModelValidationIssue {
  field: string;
  message: string;
}

const LOGICAL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,254}$/;

export function normalizeFieldConceptSelection(
  conceptIds: readonly string[],
  primaryConceptId: string | null | undefined,
  valueListConceptId: string | null | undefined,
): FieldConceptSelection {
  const normalized = [...new Set(conceptIds.map((id) => id.trim()).filter(Boolean))];
  const valueList = valueListConceptId?.trim();
  if (valueList && !normalized.includes(valueList)) normalized.push(valueList);
  const primary = primaryConceptId?.trim();
  return { conceptIds: normalized, primaryConceptId: primary && normalized.includes(primary) ? primary : normalized[0] ?? null };
}

export function logicalModelVersionEtag(model: Pick<LogicalModel, 'lockVersion'>): string {
  return `"${model.lockVersion}"`;
}

@Component({
  selector: 'daca-logical-model-editor', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DataModelWorkspaceNavComponent, DatasetSummaryComponent, LogicalModelGovernanceComponent, WorkContextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (model(); as current) { <daca-data-model-workspace-nav [modelId]="current.id" [modelTitle]="current.title.de" activeSection="model" /> }
    <section class="daca-page-heading model-editor-heading">
      <div><p class="daca-eyebrow">{{ model() ? 'Logisches Datenmodell' : 'Neues logisches Datenmodell' }}</p><h1>{{ model()?.title?.de || 'Modell erfassen' }}</h1><p>Datensatzattribute und SHACL-Feldattribute bleiben getrennt. Eine physische Quelle ist nicht erforderlich.</p></div>
      <div class="heading-tools"><label class="classification-hero">Klassifizierung<select [formControl]="form.controls.dataset.controls.classification"><option value="unclassified">Nicht klassifiziert</option><option value="internal">Intern</option><option value="confidential">Vertraulich</option><option value="secret">Geheim</option></select></label><daca-work-context [user]="identity.user()" /></div>
    </section>
    @if (sourceSnapshotId()) { <p class="daca-alert">Dieser Entwurf wurde aus dem physischen Snapshot <code>{{ sourceSnapshotId() }}</code> vorbereitet. Alle Vorschlagswerte bleiben editierbar.</p> }
    @if (model(); as current) { <daca-dataset-summary [model]="current" /><daca-logical-model-governance [model]="current" /> }
    @if (notice()) { <p class="daca-alert is-success" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }}</p> }
    @if (assistanceNotice()) { <p class="assistance-notice" role="status">{{ assistanceNotice() }}</p> }
    @if (termdatOpen()) { <div class="modal-backdrop" (click)="closeTermdat()"><section class="termdat-modal" role="dialog" aria-modal="true" aria-labelledby="termdat-title" (click)="$event.stopPropagation()"><header><div><p class="daca-eyebrow">Bundeskanzlei</p><h2 id="termdat-title">In TERMDAT suchen</h2></div><button type="button" aria-label="Dialog schliessen" (click)="closeTermdat()">×</button></header><p>Treffer für «{{ form.controls.dataset.controls.titleDe.value }}»</p>@if(termdatLoading()){<p class="termdat-loading"><span class="termdat-spinner" aria-hidden="true"></span><span>TERMDAT wird abgefragt …</span></p>}@else{<ul>@for(entry of termdatResults();track entry.entryId){<li><div><strong>{{ entry.preferredTerm }}</strong><span>{{ entry.definition || 'Keine Beschreibung verfügbar' }}</span><small>{{ descriptionLabel(entry) }} · {{ entry.collection }} · {{ entry.status }} · {{ entry.reliability }}</small></div><div class="termdat-result-actions"><button class="daca-button" type="button" [disabled]="!entry.definition" (click)="useTermdat(entry,'both')">Titel und Beschreibung übernehmen</button><button class="daca-button is-secondary" type="button" (click)="useTermdat(entry,'title')">Nur Titel übernehmen</button><button class="daca-button is-secondary" type="button" [disabled]="!entry.definition" (click)="useTermdat(entry,'definition')">{{ entry.definition ? 'Nur Beschreibung übernehmen' : 'Keine Beschreibung verfügbar' }}</button></div></li>}@empty{<li>Keine öffentlich publizierten TERMDAT-Einträge gefunden.</li>}</ul>}@if(termdatSelection();as selection){<aside #termdatAdoption class="termdat-adoption" tabindex="-1" aria-labelledby="termdat-adoption-title"><p class="daca-eyebrow">Übernahme prüfen</p><h3 id="termdat-adoption-title">Welche Angaben werden geändert?</h3>@if(termdatSelectionReplacesExisting(selection)){<p class="termdat-overwrite-warning" role="alert"><strong>Bestehende Inhalte vorhanden.</strong> Die bestätigten Felder werden durch die TERMDAT-Werte überschrieben.</p>}@for(target of selection.targets;track target){<div class="termdat-adoption-row"><strong>{{ termdatTargetLabel(target) }}</strong><span><small>Aktuell</small>{{ termdatCurrentValue(target) || 'Noch nicht erfasst' }}</span><span><small>Aus TERMDAT</small>{{ termdatIncomingValue(selection.entry,target) }}</span><em>{{ termdatCurrentValue(target) ? 'Wird überschrieben' : 'Wird ergänzt' }}</em></div>}<div class="termdat-adoption-actions"><button class="daca-button is-secondary" type="button" (click)="cancelTermdatSelection()">Abbrechen</button><button class="daca-button" type="button" (click)="confirmTermdatSelection()">{{ termdatSelectionReplacesExisting(selection) ? 'Bestehende Werte überschreiben' : 'Werte übernehmen' }}</button></div></aside>}<footer><button class="daca-button is-secondary" type="button" (click)="closeTermdat()">Schliessen</button></footer></section></div>}
    @if (loading()) { <div class="daca-card editor-state" aria-live="polite">Modell wird geladen …</div> }
    @if (!loading()) {
      <form [formGroup]="form" (ngSubmit)="save()" class="model-editor-form">
        <section class="daca-card editor-section" formGroupName="dataset">
          <header><div><span>01</span><div><p class="daca-eyebrow">Datensatzebene</p><h2>Datensatz- und Tabellenattribute</h2></div></div><small>DCAT-AP-CH und organisatorischer Kontext</small></header>
          <div class="editor-grid">
            <div class="is-wide termdat-title-field"><label for="logical-model-title-de">Titel (Deutsch) *</label><div class="termdat-input-group"><input id="logical-model-title-de" formControlName="titleDe" (input)="resetTermdatSearch()" (blur)="assistTitle()"><button type="button" (click)="openTermdat()">In TERMDAT suchen</button></div></div>
            @if(termdatSearching() || termdatCount() !== null || termdatFeedback()){<div class="termdat-feedback is-wide" [class.has-hits]="(termdatCount() ?? 0) > 0" role="status" aria-live="polite">@if(termdatSearching()){<span class="termdat-loading"><span class="termdat-spinner" aria-hidden="true"></span><span>TERMDAT wird nach Verlassen des Titelfelds automatisch durchsucht …</span></span>}@else if((termdatCount() ?? 0) > 0){<strong>{{ termdatCount() }} öffentlich publizierte TERMDAT-Treffer gefunden.</strong><button type="button" (click)="openTermdat()">Treffer anzeigen</button>}@else{<span>{{ termdatFeedback() || 'Keine öffentlich publizierten TERMDAT-Treffer gefunden.' }}</span>}</div>}
            <label class="is-wide">Beschreibung (Deutsch) *<textarea rows="3" formControlName="descriptionDe" (blur)="assistDescription()"></textarea></label>
            <details class="is-wide language-details"><summary>Weitere Sprachen</summary><div><label>Titel Französisch<input formControlName="titleFr"></label><label>Beschreibung Französisch<textarea rows="2" formControlName="descriptionFr"></textarea></label><label>Titel Italienisch<input formControlName="titleIt"></label><label>Beschreibung Italienisch<textarea rows="2" formControlName="descriptionIt"></textarea></label><label>Titel Englisch<input formControlName="titleEn"></label><label>Beschreibung Englisch<textarea rows="2" formControlName="descriptionEn"></textarea></label><label>Titel Rätoromanisch<input formControlName="titleRm"></label><label>Beschreibung Rätoromanisch<textarea rows="2" formControlName="descriptionRm"></textarea></label></div></details>
            @if(translationSuggestions().length){<aside class="translation-overlay is-wide" aria-label="Verfügbare Übersetzungsvorschläge"><h3>✨ Automatische Übersetzungen verfügbar</h3>@for(item of translationSuggestions();track item.field){<section><strong>{{ item.label }}</strong><div><span><small>Aktuell</small>{{ item.current }}</span><span><small>Vorschlag</small>{{ item.suggestion }}</span></div><button type="button" (click)="acceptTranslation(item.field)">Übernehmen</button><button type="button" (click)="discardTranslation(item.field)">Verwerfen</button></section>}</aside>}
            <label class="is-wide">Identifier (kommagetrennt) *<input formControlName="identifiers" placeholder="urn:… oder fachlicher Identifier"></label>
            <label>Departement *<select formControlName="department" (change)="departmentChanged()"><option value="">Bitte wählen</option>@for(org of departments();track org.id){<option [value]="org.id">{{ org.displayName }}</option>}</select></label>
            <label>Amt / Verwaltungseinheit *<select formControlName="office" (change)="officeChanged()"><option value="">Bitte wählen</option>@for(org of offices();track org.id){<option [value]="org.id">{{ org.displayName }}</option>}</select></label>
            <label>Abteilung / Bereich<select formControlName="division" (change)="scopeChanged()"><option value="">Keine</option>@for(org of divisions();track org.id){<option [value]="org.id">{{ org.displayName }}</option>}</select></label>
            <label>DaCa-Domäne *<select formControlName="dataDomainId"><option value="">Bitte wählen</option>@for(domain of catalogApi.domains();track domain.id){<option [value]="domain.id">{{ domain.preferredLabel }}</option>}@if(!catalogApi.domains().length){<option value="domain-personal">Personal</option><option value="domain-mobilitaet-logistik">Mobilität & Logistik</option>}</select></label>
            <label>Data Owner *<select formControlName="dataOwnerId" (change)="ownerChanged()"><option value="">Bundesweit suchen …</option>@for(persona of ownerPersonas();track persona.id){<option [value]="persona.userId">{{ persona.displayName }} · {{ persona.organizationName }}</option>}</select><small>Gleiches Amt wird zuerst angezeigt.</small></label>
            <label>Stv. Data Owner<select formControlName="deputyDataOwnerId"><option value="">Keine</option>@for(persona of deputyPersonas();track persona.id){<option [value]="persona.userId">{{ persona.displayName }} · {{ persona.organizationName }}</option>}</select></label>
            <div class="role-assignment"><strong>Data Steward (Organisation)</strong><span>{{ organizationStewards() || 'Nicht zugewiesen' }}</span><small>Diese Rolle gilt organisationsweit und wird nicht am einzelnen Modell gespeichert.</small></div>
            <label>Ersteller-Typ *<select formControlName="creatorType"><option value="application">Applikation</option><option value="internal_organisation">Interne Verwaltungseinheit</option><option value="internal_person">Interne Person</option><option value="external_organisation_or_person">Externe Organisation/Person</option></select></label>
            @switch(form.controls.dataset.controls.creatorType.value){
              @case('application'){<label>Applikationsname *<input formControlName="creatorName" placeholder="z. B. HR-Core"></label>}
              @case('internal_organisation'){<label>Organisations-ID *<input formControlName="creatorIdentifier" placeholder="z. B. vtg"></label><label>Englischer Name *<input formControlName="creatorName"></label>}
              @case('internal_person'){<label>User-ID *<input formControlName="creatorName" placeholder="vorname.nachname"></label>}
              @case('external_organisation_or_person'){<label>Organisationsname *<input formControlName="creatorName"></label><label>Person (optional)<input formControlName="creatorPersonName"></label>}
            }
            <label>Fachliches Erstelldatum *<input type="date" formControlName="dateCreated"></label>
            <div class="media-hint is-wide"><strong>Medienformat</strong><span>Nicht zugewiesen – Medienformate gehören an Distributionen. Dieses logische Modell kann eigenständig bleiben.</span></div>
          </div>
        </section>

        <section class="daca-card editor-section">
          <header><div><span>02</span><div><p class="daca-eyebrow">SHACL-Strukturebene</p><h2>Logische Entitäten und Felder</h2></div></div><div class="structure-actions"><button class="daca-button is-secondary" type="button" (click)="addEntity()">Entität hinzufügen</button><button class="daca-button is-secondary" type="button" (click)="addField()">Feld hinzufügen</button></div></header>
          <div class="field-list" formArrayName="fields">
            @for (field of fields.controls; track field; let index = $index) {
              <fieldset [formGroupName]="index"><legend>Feld {{ index + 1 }} · {{ field.controls.name.value || 'Unbenannt' }}</legend><button class="remove-field" type="button" [disabled]="fields.length === 1" (click)="removeField(index)">Feld entfernen</button>
                <div class="editor-grid">
                  <label>Entität *<input formControlName="entityName" placeholder="z. B. Mitarbeitende"></label><label>Geschäftsobjekt der Entität *<select formControlName="entityBusinessObjectVersionId"><option value="">Bitte wählen</option>@for(term of businessObjects();track term.versionId){<option [value]="term.versionId">{{ businessObjectLabel(term) }} · v{{ term.revision }}</option>}</select></label><label>Feldname *<input formControlName="name"></label><label>Geschäftsobjekt des Felds *<select formControlName="businessObjectVersionId"><option value="">Bitte wählen</option>@for(term of businessObjects();track term.versionId){<option [value]="term.versionId">{{ businessObjectLabel(term) }} · v{{ term.revision }}</option>}</select></label>
                  <label>Datentyp *<select formControlName="dataType"><option value="xsd:string">Text (xsd:string)</option><option value="xsd:integer">Ganzzahl</option><option value="xsd:decimal">Dezimalzahl</option><option value="xsd:date">Datum</option><option value="xsd:dateTime">Datum/Zeit</option><option value="xsd:boolean">Ja/Nein</option></select></label>
                  <label>Länge<input type="number" min="1" formControlName="length"></label><label>Precision<input type="number" min="0" formControlName="precision"></label><label>Dezimalstellen / Scale<input type="number" min="0" formControlName="decimalPlaces"></label><label>Reihenfolge *<input type="number" min="1" formControlName="order"></label>
                  <label>Nullability<select formControlName="nullable"><option [ngValue]="true">Null erlaubt</option><option [ngValue]="false">Pflichtfeld</option></select></label><label>minCount<input type="number" min="0" formControlName="minCount"></label><label>maxCount<input type="number" min="1" formControlName="maxCount"></label>
                  <label>Klassifizierung<select formControlName="classification"><option value="unclassified">Nicht klassifiziert</option><option value="internal">Intern</option><option value="confidential">Vertraulich</option><option value="secret">Geheim</option></select></label><label>System<input formControlName="sourceSystem"></label>
                  <label class="is-wide">Kurzbeschreibung *<textarea rows="2" formControlName="shortDescription"></textarea></label><label class="is-wide">Kommentar<textarea rows="2" formControlName="comment"></textarea></label>
                  <label class="is-wide">I14Y-Concept-Links (optional)<select class="concept-multi" multiple size="5" formControlName="conceptIds" (change)="selectConcepts(index, selectValues($event))">@for(concept of concepts();track concept.id){<option [value]="concept.id" [attr.data-concept-id]="concept.id">{{ conceptName(concept) }} · {{ concept.conceptType }} · v{{ concept.version }}</option>}@for(conceptId of missingConceptIds(field);track conceptId){<option [value]="conceptId" [attr.data-concept-id]="conceptId">{{ conceptLabel(conceptId) }}</option>}</select><small>Keine Auswahl ist erforderlich. Mehrere Concepts können mit Strg/⌘ oder Umschalt ausgewählt werden.</small></label>
                  <label class="is-wide">Primär für I14Y (optional)<select formControlName="primaryConceptId" [required]="linkedConceptIds(field).length > 0">@if(!linkedConceptIds(field).length){<option value="">Kein Concept verknüpft</option>}@for(conceptId of linkedConceptIds(field);track conceptId){<option [value]="conceptId">{{ conceptLabel(conceptId) }}</option>}</select><small>Nur bei einer Concept-Verknüpfung wird das primäre Concept als <code>dcterms:conformsTo</code> exportiert.</small></label>
                  <label class="is-wide">Werteliste (I14Y CodeList, optional)<select formControlName="valueListConceptId" (change)="selectConcept(index, selectValue($event), true)"><option value="">Keine Werteliste</option>@for(concept of codeLists();track concept.id){<option [value]="concept.id">{{ conceptName(concept) }} · {{ concept.identifiers[0] }}</option>}</select></label>
                </div>
              </fieldset>
            }
          </div>
        </section>

        @if (model(); as current) {
          <section class="daca-card export-section"><div><p class="daca-eyebrow">Repräsentationen</p><h2>DCAT-AP-CH und SHACL</h2><p>Der Datensatz und seine logische Struktur bleiben getrennte, verlinkte Exporte.</p></div><div><button class="daca-button is-secondary" type="button" [disabled]="exporting()!==null" (click)="downloadExport(current,'dcat-ttl')">DCAT TTL herunterladen</button><button class="daca-button is-secondary" type="button" [disabled]="exporting()!==null" (click)="downloadExport(current,'dcat-jsonld')">DCAT JSON-LD herunterladen</button><button class="daca-button is-secondary" type="button" [disabled]="exporting()!==null" (click)="downloadExport(current,'shacl-ttl')">SHACL TTL herunterladen</button><button class="daca-button is-secondary" type="button" [disabled]="exporting()!==null" (click)="downloadExport(current,'shacl-jsonld')">SHACL JSON-LD herunterladen</button></div></section>
        }

        <footer class="editor-actions"><div><a class="daca-button is-secondary" routerLink="/models">Zur Übersicht</a><span>{{ form.dirty ? 'Ungespeicherte Änderungen' : 'Alle Änderungen gespeichert' }}</span></div><div class="editor-primary-actions"><button class="daca-button is-secondary" type="button" [disabled]="model()?.status !== 'draft' || saving()" (click)="submitForReview()">Zur Domänenfreigabe einreichen</button>@if(model()?.status === 'review_pending' && model()?.reviewId && canDecideReview()){<button class="daca-button" type="button" [disabled]="saving()" (click)="acceptReview()">Annehmen und publizieren</button><button class="daca-button is-secondary" type="button" [disabled]="saving()" (click)="rejectReview()">Rückweisen</button>}@if(model()?.status === 'published'){<button class="daca-button is-secondary" type="button" [disabled]="!canPublishCurrentModel() || saving()" (click)="retire()">Modell stilllegen</button>}<div class="save-action"><button class="daca-button" type="submit" [disabled]="saving() || !identity.canEditModels() || model()?.status === 'retired' || model()?.status === 'review_pending'">{{ saving() ? 'Wird gespeichert …' : 'Als Entwurf speichern' }}</button>@if(validationAttempted() && validationIssues().length){<section class="save-validation" role="alert" aria-live="assertive"><strong>Bitte korrigieren Sie folgende Angaben:</strong><ul>@for(issue of validationIssues();track issue.field + issue.message){<li><span>{{ issue.field }}:</span> {{ issue.message }}</li>}</ul></section>}@else if(saveError()){<p class="save-validation" role="alert">{{ saveError() }}</p>}</div></div></footer>
        @if (model()?.status === 'review_pending' && !canDecideReview()) { <p class="publish-note">Die Aufgabe liegt beim primären Data Owner der gewählten Domäne. Seine Annahme publiziert das Modell unmittelbar.</p> }
      </form>
    }
  `,
  styles: [`
    .model-editor-heading{align-items:center}.editor-state{padding:2rem;box-shadow:none}.model-editor-form{display:grid;gap:1.25rem}.editor-section{box-shadow:none}.editor-section>header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.1rem 1.25rem;border-bottom:1px solid var(--daca-border)}.editor-section>header>div{display:flex;align-items:center;gap:1rem}.editor-section>header>div>span{display:grid;place-items:center;width:38px;height:38px;background:var(--daca-federal-blue);color:#fff;font-weight:800}.editor-section h2{margin:0;font-size:1.12rem}.editor-section header small{color:var(--daca-muted)}.structure-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem}.editor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;padding:1.25rem}.editor-grid label{display:grid;align-content:start;gap:.4rem;color:#30363b;font-size:.72rem;font-weight:750}.editor-grid input,.editor-grid select,.editor-grid textarea{width:100%;min-height:42px;border:1px solid var(--daca-border-strong);border-radius:0;padding:.55rem .65rem;background:#fff;color:var(--daca-ink)}.editor-grid textarea{resize:vertical}.editor-grid select.concept-multi{min-height:8rem}.editor-grid label>small{color:var(--daca-muted);font-size:.64rem;font-weight:500}.editor-grid .is-wide{grid-column:1/-1}.termdat-feedback{display:flex;min-height:44px;align-items:center;justify-content:space-between;gap:.8rem;border-left:4px solid var(--daca-border-strong);padding:.7rem .85rem;background:#f4f6f7;color:var(--daca-muted);font-size:.72rem}.termdat-feedback.has-hits{border-left-color:#167347;background:#edf7f0;color:#174c32}.termdat-feedback button{min-height:40px;border:1px solid currentColor;padding:.45rem .75rem;background:#fff;color:inherit;font-weight:750;cursor:pointer}.termdat-loading{display:flex;align-items:center;gap:.65rem}.termdat-spinner{display:block;box-sizing:border-box;width:20px;height:20px;flex:0 0 20px;border:3px solid rgba(31,111,139,.34);border-top-color:#176783;border-radius:999px;animation:termdat-spinner-rotate .8s linear infinite;transform-origin:center}@keyframes termdat-spinner-rotate{to{transform:rotate(360deg)}}.termdat-modal{width:min(1040px,100%)}.termdat-modal li{grid-template-columns:minmax(0,1fr) minmax(390px,1.15fr);align-items:start}.termdat-result-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:.55rem;width:100%}.termdat-result-actions .daca-button{width:100%;min-height:48px;padding:.65rem .85rem;font-weight:800;line-height:1.25;text-align:center;white-space:normal}.termdat-result-actions .daca-button:first-child{grid-column:1/-1}.termdat-result-actions .daca-button:disabled{font-weight:800}.termdat-adoption{display:grid;scroll-margin-block:1rem;gap:.75rem;margin:1rem 0;border-left:4px solid var(--daca-federal-blue);padding:1rem;background:#eef5f8}.termdat-adoption h3,.termdat-adoption p{margin:0}.termdat-overwrite-warning{border-left:4px solid #b26a00;padding:.65rem .8rem;background:#fff1c7;color:#4f3d00}.termdat-adoption-row{display:grid;grid-template-columns:minmax(8rem,.7fr) 1fr 1fr auto;align-items:start;gap:.7rem;border-top:1px solid var(--daca-border);padding-top:.7rem}.termdat-adoption-row>span{display:grid;gap:.2rem;white-space:pre-wrap}.termdat-adoption-row small{color:var(--daca-muted);font-weight:700;text-transform:uppercase}.termdat-adoption-row em{padding:.2rem .4rem;background:#fff1c7;color:#634c00;font-size:.67rem;font-style:normal;font-weight:750}.termdat-adoption-actions{display:flex;justify-content:flex-end;gap:.5rem}.termdat-adoption-actions .daca-button{min-width:190px;font-weight:800}.role-assignment{display:grid;align-content:start;gap:.25rem;border-left:4px solid var(--daca-blue);padding:.65rem .8rem;background:var(--daca-blue-soft);font-size:.7rem}.role-assignment small{color:var(--daca-muted);font-size:.62rem}.language-details{border:1px solid var(--daca-border);padding:.85rem}.language-details summary{cursor:pointer;font-weight:750}.language-details>div{display:grid;grid-template-columns:1fr 2fr;gap:.8rem;margin-top:1rem}.media-hint{display:grid;gap:.25rem;border-left:4px solid var(--daca-blue);padding:.8rem 1rem;background:var(--daca-blue-soft);font-size:.72rem}.media-hint span{color:var(--daca-muted)}.field-list{display:grid;gap:1rem;padding:1.25rem}.field-list fieldset{position:relative;margin:0;border:1px solid var(--daca-border);padding:0}.field-list legend{margin-left:1rem;padding:.35rem .65rem;background:#f2f5f7;font-size:.76rem;font-weight:800}.remove-field{position:absolute;top:.35rem;right:.7rem;min-height:32px;border:0;background:transparent;color:var(--daca-red-dark);font-size:.68rem;font-weight:750;cursor:pointer}.export-section{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.25rem;border-top:4px solid var(--daca-red);box-shadow:none}.export-section h2,.export-section p{margin:.25rem 0}.export-section>div:last-child{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem}.editor-actions{position:sticky;z-index:5;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:1rem;border:1px solid var(--daca-border);border-top:4px solid var(--daca-red);padding:.9rem 1rem;background:#fff;box-shadow:0 -8px 20px #15293d18}.editor-actions>div{display:flex;align-items:center;flex-wrap:wrap;gap:.6rem}.editor-actions .editor-primary-actions{align-items:flex-start;justify-content:flex-end}.save-action{display:grid;justify-items:stretch;gap:.45rem;min-width:250px}.save-validation{max-width:430px;margin:0;border-left:4px solid var(--daca-red);padding:.6rem .75rem;background:#fff0f0;color:var(--daca-red-dark);font-size:.7rem;text-align:left}.save-validation ul{display:grid;gap:.25rem;margin:.4rem 0 0;padding-left:1.1rem}.save-validation li span{color:inherit;font-size:inherit;font-weight:800}.editor-actions span,.publish-note{color:var(--daca-muted);font-size:.7rem}.publish-note{margin:-.75rem 0 0;text-align:right}@media(prefers-reduced-motion:reduce){.termdat-spinner{animation:none}}@media(max-width:980px){.editor-grid{grid-template-columns:1fr 1fr}.termdat-modal li{grid-template-columns:minmax(0,1fr) minmax(340px,1fr)}.termdat-adoption-row{grid-template-columns:1fr 1fr}.termdat-adoption-row>strong,.termdat-adoption-row>em{grid-column:1/-1}.export-section,.editor-actions{align-items:flex-start;flex-direction:column}.export-section>div:last-child{justify-content:flex-start}.editor-actions>div:last-child{width:100%}.save-action{width:100%}}@media(max-width:820px){.model-editor-heading{align-items:flex-start;flex-direction:column}.editor-grid,.language-details>div,.termdat-adoption-row,.termdat-modal li{grid-template-columns:1fr}.termdat-result-actions,.termdat-adoption-actions{width:100%}.termdat-adoption-actions .daca-button{min-width:0}.termdat-feedback{align-items:stretch;flex-direction:column}.editor-actions{position:static}.editor-actions>div,.editor-actions .daca-button{width:100%}.editor-section>header{align-items:flex-start;flex-direction:column}.structure-actions,.structure-actions .daca-button{width:100%}}@media(max-width:560px){.termdat-result-actions{grid-template-columns:1fr}.termdat-result-actions .daca-button:first-child{grid-column:auto}.termdat-result-actions .daca-button{min-height:44px}.termdat-adoption-actions{display:grid;grid-template-columns:1fr}.termdat-adoption-actions .daca-button{width:100%}}
    .termdat-title-field{display:grid;gap:.4rem;color:#30363b;font-size:.72rem;font-weight:750}.termdat-title-field>label{display:block}.termdat-input-group{display:grid;grid-template-columns:minmax(0,1fr) auto;border:1px solid var(--daca-border-strong);background:#fff}.editor-grid .termdat-input-group>input{min-width:0;border:0}.termdat-input-group>button{min-width:190px;border:0;border-left:1px solid var(--daca-border-strong);padding:.55rem 1rem;background:#fff;color:var(--daca-blue);font-weight:800;cursor:pointer}.termdat-input-group>button:hover{background:var(--daca-blue-soft)}.termdat-input-group:focus-within{border-color:var(--daca-blue);outline:3px solid rgba(11,68,121,.18);outline-offset:2px}.termdat-input-group>input:focus,.termdat-input-group>button:focus{outline:0}@media(max-width:560px){.termdat-input-group{grid-template-columns:1fr}.termdat-input-group>button{min-width:0;border-top:1px solid var(--daca-border-strong);border-left:0}}
  `],
})
export class LogicalModelEditorComponent {
  readonly id = input<string>(); readonly sourceSnapshotId = input<string>();
  readonly identity = inject(DemoIdentityService); readonly catalogApi = inject(CatalogApiService);
  private readonly api = inject(DataModelsApiService); private readonly conceptsApi = inject(I14yConceptsApiService); private readonly assistance = inject(ModelingAssistanceService); private readonly router = inject(Router); private readonly fb = inject(FormBuilder); private readonly injector = inject(Injector);
  readonly model = signal<LogicalModel | null>(null); readonly concepts = signal<readonly I14yConcept[]>([]); readonly loading = signal(false); readonly saving = signal(false); readonly exporting = signal<LogicalModelExportRepresentation | null>(null); readonly error = signal<string | null>(null); readonly saveError = signal<string | null>(null); readonly notice = signal<string | null>(null); readonly etag = signal('');
  readonly validationAttempted = signal(false);
  readonly canPublishCurrentModel = computed(() => this.identity.canPublishModel(this.model()));
  readonly codeLists = computed(() => this.concepts().filter((item) => item.conceptType === 'CodeList'));
  readonly modelingUsers = computed(() => this.identity.users().filter((user) => this.identity.modelingRoles(user).includes('data_owner')));
  readonly deputyUsers = computed(() => this.identity.users().filter((user) => this.identity.modelingRoles(user).includes('deputy_data_owner')));
  readonly departments = signal<readonly FederalOrganization[]>([]);
  readonly offices = signal<readonly FederalOrganization[]>([]);
  readonly divisions = signal<readonly FederalOrganization[]>([]);
  readonly ownerPersonas = signal<readonly ModelingPersona[]>([]);
  readonly deputyPersonas = signal<readonly ModelingPersona[]>([]);
  readonly businessObjects = signal<readonly BusinessObjectTerm[]>([]);
  readonly termdatOpen = signal(false); readonly termdatLoading = signal(false); readonly termdatSearching = signal(false); readonly termdatResults = signal<readonly TermdatEntry[]>([]); readonly termdatCount = signal<number | null>(null); readonly termdatQuery = signal(''); readonly termdatFeedback = signal<string | null>(null);
  readonly termdatSelection = signal<{ entry: TermdatEntry; targets: readonly ('title' | 'definition')[] } | null>(null);
  readonly termdatAdoption = viewChild<ElementRef<HTMLElement>>('termdatAdoption');
  readonly assistanceNotice = signal<string | null>(null);
  readonly assistanceProvenance = signal<readonly LogicalModelAssistanceProvenance[]>([]);
  readonly translationSuggestions = signal<readonly { field: string; label: string; current: string; suggestion: string; provenance: LogicalModelAssistanceProvenance }[]>([]);
  readonly form = this.fb.group({
    dataset: this.fb.nonNullable.group({ titleDe: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)]], descriptionDe: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(8000)]], titleFr: ['', Validators.maxLength(500)], descriptionFr: ['', Validators.maxLength(8000)], titleIt: ['', Validators.maxLength(500)], descriptionIt: ['', Validators.maxLength(8000)], titleEn: ['', Validators.maxLength(500)], descriptionEn: ['', Validators.maxLength(8000)], titleRm: ['', Validators.maxLength(500)], descriptionRm: ['', Validators.maxLength(8000)], identifiers: ['', [Validators.required, Validators.pattern(/\S/)]], department: ['vbs', Validators.required], office: ['vbs-armasuisse', Validators.required], division: 'vbs-armasuisse-immobilien', dataDomainId: ['', Validators.required], dataOwnerId: ['', Validators.required], deputyDataOwnerId: '', creatorType: this.fb.nonNullable.control<CreatorType>('application'), creatorName: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]], creatorIdentifier: ['', Validators.maxLength(100)], creatorPersonName: ['', Validators.maxLength(255)], classification: this.fb.nonNullable.control<DataClassification>('unclassified'), dateCreated: [new Date().toISOString().slice(0,10), Validators.required] }),
    fields: this.fb.array([this.createField(1)]),
  });
  readonly organizationStewards = computed(() => this.identity.users()
    .filter((user) => user.office === this.selectedOrganizationId()
      && this.identity.modelingRoles(user).includes('data_steward'))
    .map((user) => user.displayName).join(', '));
  get fields(): FormArray<ReturnType<LogicalModelEditorComponent['createField']>> { return this.form.controls.fields; }

  validationIssues(): LogicalModelValidationIssue[] {
    const issues: LogicalModelValidationIssue[] = [];
    const dataset = this.form.controls.dataset.controls;
    const datasetFields: Array<[string, AbstractControl]> = [
      ['Titel (Deutsch)', dataset.titleDe],
      ['Beschreibung (Deutsch)', dataset.descriptionDe],
      ['Titel (Französisch)', dataset.titleFr],
      ['Beschreibung (Französisch)', dataset.descriptionFr],
      ['Titel (Italienisch)', dataset.titleIt],
      ['Beschreibung (Italienisch)', dataset.descriptionIt],
      ['Titel (Englisch)', dataset.titleEn],
      ['Beschreibung (Englisch)', dataset.descriptionEn],
      ['Titel (Rätoromanisch)', dataset.titleRm],
      ['Beschreibung (Rätoromanisch)', dataset.descriptionRm],
      ['Identifier', dataset.identifiers],
      ['Departement', dataset.department],
      ['Amt / Verwaltungseinheit', dataset.office],
      ['DaCa-Domäne', dataset.dataDomainId],
      ['Data Owner', dataset.dataOwnerId],
      [this.creatorNameLabel(), dataset.creatorName],
      ['Person des Erstellers', dataset.creatorPersonName],
      ['Fachliches Erstelldatum', dataset.dateCreated],
    ];
    for (const [field, control] of datasetFields) this.addControlIssue(issues, field, control);
    if (dataset.creatorType.value === 'internal_organisation' && !dataset.creatorIdentifier.value.trim()) {
      issues.push({ field: 'Organisations-ID', message: 'Dieses Pflichtfeld ist leer.' });
    } else {
      this.addControlIssue(issues, 'Organisations-ID', dataset.creatorIdentifier);
    }

    const identifiers = dataset.identifiers.value.split(',').map((item) => item.trim()).filter(Boolean);
    if (identifiers.length !== new Set(identifiers).size) {
      issues.push({ field: 'Identifier', message: 'Jeder Identifier darf nur einmal vorkommen.' });
    }

    const namesByEntity = new Map<string, string[]>();
    this.fields.controls.forEach((field, index) => {
      const number = index + 1;
      const controls = field.controls;
      const fieldControls: Array<[string, AbstractControl, string?]> = [
        [`Feld ${number} – Entität`, controls.entityName, 'Verwenden Sie einen technischen Namen, der mit einem Buchstaben oder Unterstrich beginnt. Erlaubt sind Buchstaben A–Z, Zahlen, Punkt, Bindestrich und Unterstrich.'],
        [`Feld ${number} – Geschäftsobjekt der Entität`, controls.entityBusinessObjectVersionId],
        [`Feld ${number} – Entitätskommentar`, controls.entityComment],
        [`Feld ${number} – Feldname`, controls.name, 'Verwenden Sie einen technischen Namen, der mit einem Buchstaben oder Unterstrich beginnt. Erlaubt sind Buchstaben A–Z, Zahlen, Punkt, Bindestrich und Unterstrich.'],
        [`Feld ${number} – Geschäftsobjekt`, controls.businessObjectVersionId],
        [`Feld ${number} – Datentyp`, controls.dataType],
        [`Feld ${number} – Länge`, controls.length],
        [`Feld ${number} – Precision`, controls.precision],
        [`Feld ${number} – Dezimalstellen / Scale`, controls.decimalPlaces],
        [`Feld ${number} – Reihenfolge`, controls.order],
        [`Feld ${number} – minCount`, controls.minCount],
        [`Feld ${number} – maxCount`, controls.maxCount],
        [`Feld ${number} – System`, controls.sourceSystem],
        [`Feld ${number} – Kurzbeschreibung`, controls.shortDescription],
        [`Feld ${number} – Kommentar`, controls.comment],
        [`Feld ${number} – Primär für I14Y`, controls.primaryConceptId],
      ];
      for (const [label, control, patternMessage] of fieldControls) this.addControlIssue(issues, label, control, patternMessage);
      if (controls.maxCount.value !== null && controls.maxCount.value < (controls.minCount.value ?? 0)) {
        issues.push({ field: `Feld ${number} – maxCount`, message: 'Der Wert muss grösser oder gleich minCount sein.' });
      }
      const entityKey = (controls.entityName.value ?? '').trim().toLocaleLowerCase();
      const fieldName = (controls.name.value ?? '').trim().toLocaleLowerCase();
      if (entityKey && fieldName) namesByEntity.set(entityKey, [...(namesByEntity.get(entityKey) ?? []), fieldName]);
    });
    for (const [entity, names] of namesByEntity) {
      if (names.length !== new Set(names).size) issues.push({ field: `Entität ${entity}`, message: 'Feldnamen müssen innerhalb der Entität eindeutig sein.' });
    }
    return issues;
  }

  constructor() {
    this.catalogApi.loadDomains().subscribe({ error: () => undefined });
    this.conceptsApi.search().subscribe({ next: (value) => this.concepts.set(value.items), error: () => undefined });
    this.assistance.organizations('ch-bundesverwaltung').subscribe({ next: (items) => { this.departments.set(items); this.departmentChanged(false); }, error: () => undefined });
    this.assistance.businessObjects().subscribe({ next: (value) => this.businessObjects.set(value.items), error: () => undefined });
    this.assistance.myScopes().subscribe({
      next: (scopes) => {
        if (this.id()) return;
        const scope = scopes.find((item) => item.role === 'data_steward') ?? scopes[0];
        if (!scope) { this.scopeChanged(); return; }
        const path = scope.breadcrumb.map((item) => item.id);
        this.form.controls.dataset.patchValue({
          department: path[1] ?? '',
          office: path[2] ?? scope.organizationId,
          division: path[3] ?? '',
        });
        this.departmentChanged(false);
      },
      error: () => this.scopeChanged(),
    });
    effect(() => { const id = this.id(); if (id) this.load(id); });
  }
  departmentChanged(clear = true): void {
    const id = this.form.controls.dataset.controls.department.value;
    if (clear) this.form.controls.dataset.patchValue({ office: '', division: '', dataOwnerId: '', deputyDataOwnerId: '' });
    if (!id) { this.offices.set([]); this.divisions.set([]); return; }
    this.assistance.organizations(id).subscribe({ next: (items) => { this.offices.set(items); if (!clear && items.some((item) => item.id === this.form.controls.dataset.controls.office.value)) this.officeChanged(false); }, error: () => this.offices.set([]) });
  }
  officeChanged(clear = true): void {
    const id = this.form.controls.dataset.controls.office.value;
    if (clear) this.form.controls.dataset.patchValue({ division: '', dataOwnerId: '', deputyDataOwnerId: '' });
    if (!id) { this.divisions.set([]); return; }
    this.assistance.organizations(id).subscribe({ next: (items) => { this.divisions.set(items); this.scopeChanged(); }, error: () => { this.divisions.set([]); this.scopeChanged(); } });
  }
  scopeChanged(): void {
    const scope = this.selectedOrganizationId();
    if (!scope) return;
    this.assistance.personas('data_owner', scope).subscribe({ next: (items) => this.ownerPersonas.set(items), error: () => this.ownerPersonas.set([]) });
    this.ownerChanged();
  }
  ownerChanged(): void {
    const owner = this.form.controls.dataset.controls.dataOwnerId.value;
    const scope = this.selectedOrganizationId();
    this.form.controls.dataset.controls.deputyDataOwnerId.setValue('');
    if (!owner || !scope) { this.deputyPersonas.set([]); return; }
    this.assistance.personas('deputy_data_owner', scope, owner).subscribe({ next: (items) => this.deputyPersonas.set(items), error: () => this.deputyPersonas.set([]) });
  }
  businessObjectLabel(term: BusinessObjectTerm): string { return term.labels.find((item) => item.language === 'de')?.preferredLabel ?? term.urn; }
  assistTitle(): void {
    const source = this.form.controls.dataset.controls.titleDe.value.trim();
    if (this.form.controls.dataset.controls.classification.value !== 'unclassified') { this.resetTermdatSearch(); return; }
    if (source.length >= 3) this.prefetchTermdat(source);
    this.translateField('title', source);
  }
  assistDescription(): void { this.translateField('description', this.form.controls.dataset.controls.descriptionDe.value.trim()); }
  openTermdat(): void {
    if (this.form.controls.dataset.controls.classification.value !== 'unclassified') { this.assistanceNotice.set('TERMDAT wird nur für nicht klassifizierte Inhalte abgefragt.'); return; }
    const query = this.form.controls.dataset.controls.titleDe.value.trim();
    if (query.length < 3) { this.assistanceNotice.set('Für die TERMDAT-Suche sind mindestens drei Zeichen nötig.'); return; }
    this.termdatOpen.set(true);
    if (this.termdatQuery() === query && this.termdatCount() !== null) return;
    this.termdatLoading.set(true);
    this.assistance.searchTermdat(query).pipe(finalize(() => this.termdatLoading.set(false))).subscribe({ next: (value) => { if (query === this.form.controls.dataset.controls.titleDe.value.trim()) { this.termdatResults.set(value.items); this.termdatCount.set(value.total); this.termdatQuery.set(query); this.termdatFeedback.set(value.total ? null : 'Keine öffentlich publizierten TERMDAT-Treffer gefunden.'); } }, error: () => this.termdatFeedback.set('TERMDAT ist momentan nicht erreichbar; das Formular bleibt vollständig manuell nutzbar.') });
  }
  closeTermdat(): void { this.termdatOpen.set(false); this.termdatSelection.set(null); }
  resetTermdatSearch(): void { this.termdatSearching.set(false); this.termdatResults.set([]); this.termdatCount.set(null); this.termdatQuery.set(''); this.termdatFeedback.set(null); }
  descriptionLabel(entry: TermdatEntry): string { return entry.descriptionType === 'definition' ? 'Definition' : entry.descriptionType === 'note' ? 'TERMDAT-Notiz' : entry.descriptionType === 'context' ? 'Verwendungskontext' : 'Ohne Beschreibung'; }
  useTermdat(entry: TermdatEntry, target: 'title' | 'definition' | 'both'): void {
    const targets: readonly ('title' | 'definition')[] = target === 'both' ? ['title', 'definition'] : [target];
    if (targets.some((item) => !this.termdatIncomingValue(entry, item))) return;
    this.termdatSelection.set({ entry, targets });
    afterNextRender(() => {
      const adoption = this.termdatAdoption()?.nativeElement;
      if (!adoption) return;
      const behavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      adoption.scrollIntoView({ behavior, block: 'start' });
      adoption.focus({ preventScroll: true });
    }, { injector: this.injector });
  }
  cancelTermdatSelection(): void { this.termdatSelection.set(null); }
  termdatTargetLabel(target: 'title' | 'definition'): string { return target === 'title' ? 'Titel (Deutsch)' : 'Beschreibung (Deutsch)'; }
  termdatCurrentValue(target: 'title' | 'definition'): string { return (target === 'title' ? this.form.controls.dataset.controls.titleDe.value : this.form.controls.dataset.controls.descriptionDe.value).trim(); }
  termdatIncomingValue(entry: TermdatEntry, target: 'title' | 'definition'): string { return target === 'title' ? entry.preferredTerm : entry.definition; }
  termdatSelectionReplacesExisting(selection: { targets: readonly ('title' | 'definition')[] }): boolean { return selection.targets.some((target) => Boolean(this.termdatCurrentValue(target))); }
  confirmTermdatSelection(): void {
    const selection = this.termdatSelection();
    if (!selection) return;
    for (const target of selection.targets) this.applyTermdatValue(selection.entry, target);
    const imported = selection.targets.length === 2 ? 'Titel und Beschreibung wurden' : `${this.termdatTargetLabel(selection.targets[0])} wurde`;
    this.assistanceNotice.set(`${imported} aus TERMDAT-Eintrag ${selection.entry.entryId} mit Quellenhinweis übernommen.`);
    this.closeTermdat();
  }
  private applyTermdatValue(entry: TermdatEntry, target: 'title' | 'definition'): void {
    const control = target === 'title' ? this.form.controls.dataset.controls.titleDe : this.form.controls.dataset.controls.descriptionDe;
    const value = this.termdatIncomingValue(entry, target);
    if (!value) return;
    control.setValue(value); control.markAsDirty();
    const localizedTarget: 'title' | 'description' = target === 'title' ? 'title' : 'description';
    const baseProvenance: LogicalModelAssistanceProvenance = { fieldPath: localizedTarget, language: 'de', provider: 'termdat', sourceTextHash: entry.payloadHash, sourceIdentifier: entry.entryId, sourceUri: entry.uri, sourceModifiedAt: entry.sourceModifiedAt, retrievedAt: entry.retrievedAt, payloadHash: entry.payloadHash, origin: 'source_import' };
    this.upsertProvenance(baseProvenance);
    for (const language of ['fr', 'it', 'en', 'rm']) {
      const candidate = entry.languages[language]?.[target === 'title' ? 'term' : 'definition'];
      if (candidate) this.offerTranslation(`${localizedTarget}${language[0].toUpperCase()}${language.slice(1)}`, this.localizedValue(localizedTarget, language), candidate, { ...baseProvenance, fieldPath: localizedTarget, language: language as 'fr'|'it'|'en'|'rm' });
    }
  }
  acceptTranslation(field: string): void {
    const item = this.translationSuggestions().find((candidate) => candidate.field === field);
    if (item) { this.setLocalizedValue(field, item.suggestion); this.upsertProvenance({ ...item.provenance, origin: 'accepted_suggestion' }); }
    this.discardTranslation(field);
  }
  discardTranslation(field: string): void { this.translationSuggestions.update((items) => items.filter((item) => item.field !== field)); }
  canDecideReview(): boolean { const current = this.model(); return Boolean(current?.reviewId && this.identity.userId() === current.dataOwner.id && this.identity.modelingRoles(this.identity.user()).includes('data_owner')); }
  acceptReview(): void { this.decideReview('accept', null); }
  rejectReview(): void { const comment = window.prompt('Begründung für die Rückweisung (Pflichtfeld)'); if (comment?.trim()) this.decideReview('reject', comment.trim()); }
  createField(order: number, field?: LogicalField, entity?: LogicalEntity, entityName = 'Entitaet_1') {
    const selection=normalizeFieldConceptSelection(field?.conceptReferences.map((item)=>item.id)??[],field?.primaryConceptId,field?.valueListConcept?.id);
    return this.fb.group({
      id:field?.rootId??'',entityId:entity?.rootId??'',entityName:[entity?.name??field?.entityName??entityName,[Validators.required,Validators.pattern(LOGICAL_NAME_PATTERN)]],entityBusinessObject:entity?.businessObject??field?.businessObject??'',entityBusinessObjectVersionId:[entity?.businessObjectVersionId??'',Validators.required],entityComment:[entity?.comment??'',Validators.maxLength(4000)],entityOrder:entity?.order??order,name:[field?.name??'',[Validators.required,Validators.pattern(LOGICAL_NAME_PATTERN)]],businessObject:field?.businessObject??'',businessObjectVersionId:[field?.businessObjectVersionId??'',Validators.required],dataType:[field?.dataType??'xsd:string',Validators.required],length:[field?.length??null as number|null,Validators.min(1)],precision:[field?.precision??null as number|null,Validators.min(0)],decimalPlaces:[field?.decimalPlaces??null as number|null,Validators.min(0)],order:[field?.order??order,[Validators.required,Validators.min(1)]],nullable:field?.nullable??true,minCount:[field?.minCount??0,Validators.min(0)],maxCount:[field?.maxCount??1 as number|null,Validators.min(1)],classification:this.fb.nonNullable.control<DataClassification>(field?.classification??'unclassified'),sourceSystem:[field?.sourceSystem??'',Validators.maxLength(255)],shortDescription:[field?.shortDescription??'',[Validators.required,Validators.pattern(/\S/),Validators.maxLength(4000)]],comment:[field?.comment??'',Validators.maxLength(4000)],
      conceptIds:this.fb.nonNullable.control<string[]>(selection.conceptIds),primaryConceptId:selection.primaryConceptId??'',valueListConceptId:field?.valueListConcept?.id??'',
    });
  }
  addField(): void {
    const previous = this.fields.at(this.fields.length - 1);
    const entity = previous ? {
      id: previous.controls.entityId.value ?? '', rootId: previous.controls.entityId.value ?? '', versionId: previous.controls.entityId.value ?? '',
      name: previous.controls.entityName.value ?? 'Entitaet_1', businessObject: previous.controls.entityBusinessObject.value ?? '',
      comment: previous.controls.entityComment.value || null, order: previous.controls.entityOrder.value ?? 1, fields: [],
    } : undefined;
    this.fields.push(this.createField(this.fields.length + 1, undefined, entity));
  }
  addEntity(): void { this.fields.push(this.createField(1, undefined, undefined, `Entitaet_${new Set(this.fields.controls.map((field) => field.controls.entityName.value)).size + 1}`)); }
  removeField(index: number): void { if (this.fields.length > 1) this.fields.removeAt(index); }
  selectValue(event: Event): string { return (event.target as HTMLSelectElement).value; }
  selectValues(event:Event):string[]{return[...(event.target as HTMLSelectElement).selectedOptions].map((option)=>option.dataset['conceptId']??option.value);}
  conceptName(concept: I14yConcept): string { return concept.name.de || concept.name.fr || concept.identifiers[0] || concept.id; }
  conceptLabel(conceptId:string):string{const concept=this.concepts().find((item)=>item.id===conceptId);if(concept)return`${this.conceptName(concept)} · v${concept.version}`;const reference=this.model()?.fields.flatMap((field)=>field.conceptReferences).find((item)=>item.id===conceptId);return reference?`${reference.name} · v${reference.version}`:conceptId;}
  missingConceptIds(field:ReturnType<LogicalModelEditorComponent['createField']>):string[]{const available=new Set(this.concepts().map((item)=>item.id));return field.controls.conceptIds.value.filter((id)=>!available.has(id));}
  linkedConceptIds(field:ReturnType<LogicalModelEditorComponent['createField']>):string[]{return normalizeFieldConceptSelection(field.controls.conceptIds.value,field.controls.primaryConceptId.value,field.controls.valueListConceptId.value).conceptIds;}
  selectConcepts(index:number,conceptIds:string[]):void{const field=this.fields.at(index);const selection=normalizeFieldConceptSelection(conceptIds,field.controls.primaryConceptId.value,field.controls.valueListConceptId.value);field.controls.conceptIds.setValue(selection.conceptIds);field.controls.primaryConceptId.setValue(selection.primaryConceptId??'');for(const conceptId of selection.conceptIds)this.loadCachedConcept(conceptId);field.markAsDirty();}
  selectConcept(index: number, conceptId: string, valueList: boolean): void { if (!conceptId) return; const concept = this.concepts().find((item) => item.id === conceptId); if (valueList && concept?.conceptType !== 'CodeList') return; const field=this.fields.at(index);if(valueList){const selection=normalizeFieldConceptSelection(field.controls.conceptIds.value,field.controls.primaryConceptId.value,conceptId);field.controls.conceptIds.setValue(selection.conceptIds);field.controls.primaryConceptId.setValue(selection.primaryConceptId??'');}this.loadCachedConcept(conceptId);field.markAsDirty(); }
  downloadExport(model:LogicalModel,representation:LogicalModelExportRepresentation):void{if(this.exporting())return;this.exporting.set(representation);this.error.set(null);this.api.downloadLogicalModelExport(model.id,model.versionId,representation).pipe(finalize(()=>this.exporting.set(null))).subscribe({next:(file)=>this.saveExport(file),error:(error:Error)=>this.error.set(error.message)});}

  load(id: string): void { this.loading.set(true); this.error.set(null); this.api.loadLogicalModel(id).pipe(finalize(() => this.loading.set(false))).subscribe({ next: ({ body }) => { this.model.set(body); this.etag.set(logicalModelVersionEtag(body)); this.patch(body); }, error: (error: Error) => this.error.set(error.message) }); }
  save(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.validationAttempted.set(true);
    this.saveError.set(null);
    if (this.validationIssues().length) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    const current = this.model();
    const value = this.value();
    const request = current ? this.api.updateLogicalModel(current.id, current.versionId, value, this.etag()) : this.api.createLogicalModel(value);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: ({ body, etag }) => {
        this.model.set(body);
        this.etag.set(etag);
        this.form.markAsPristine();
        this.validationAttempted.set(false);
        this.notice.set('Der unabhängige Modellentwurf wurde versioniert gespeichert.');
        if (!current) void this.router.navigate(['/models', body.id]);
      },
      error: (error: Error) => this.saveError.set(error.message),
    });
  }
  submitForReview(): void { const current = this.model(); if (!current) return; this.saving.set(true); this.api.submitLogicalModel(current.id, current.versionId, this.etag()).pipe(finalize(() => this.saving.set(false))).subscribe({ next: ({ body, etag }) => { this.model.set(body); this.etag.set(etag); this.notice.set('Die Freigabe wurde vorgeschlagen.'); }, error: (error: Error) => this.error.set(error.message) }); }
  retire(): void { const current = this.model(); if (!current || current.status !== 'published' || !this.canPublishCurrentModel() || !window.confirm(`«${current.title.de || current.identifiers[0]}» stilllegen? Die Versionshistorie bleibt erhalten.`)) return; this.saving.set(true); this.error.set(null); this.api.retireLogicalModel(current.id, current.versionId, this.etag()).pipe(finalize(() => this.saving.set(false))).subscribe({ next: ({ body, etag }) => { this.model.set(body); this.etag.set(etag); this.notice.set('Das Modell wurde stillgelegt; die Versionshistorie bleibt erhalten.'); }, error: (error: Error) => this.error.set(error.message) }); }
  private patch(model: LogicalModel): void {
    this.form.controls.dataset.patchValue({
      titleDe:model.title.de,descriptionDe:model.description.de,titleFr:model.title.fr,descriptionFr:model.description.fr,titleIt:model.title.it,descriptionIt:model.description.it,titleEn:model.title.en,descriptionEn:model.description.en,titleRm:model.title.rm??'',descriptionRm:model.description.rm??'',
      identifiers:model.identifiers.join(', '),department:model.office.startsWith('vbs-armasuisse')?'vbs':model.department,office:model.office==='vbs-armasuisse-immobilien'?'vbs-armasuisse':model.office,division:model.office==='vbs-armasuisse-immobilien'?model.office:'',dataDomainId:model.dataDomain.id,dataOwnerId:model.dataOwner.id,deputyDataOwnerId:model.deputyDataOwner?.id??'',
      creatorType:model.creator.type,...this.creatorFormValue(model.creator),classification:model.classification,dateCreated:model.dateCreated,
    });
    this.fields.clear();
    if (model.entities.length) {
      for (const entity of model.entities) for (const field of entity.fields) this.fields.push(this.createField(field.order, field, entity));
    } else {
      for (const field of model.fields) this.fields.push(this.createField(field.order, field));
    }
    if (!model.fields.length) this.fields.push(this.createField(1));
    this.departmentChanged(false); this.scopeChanged();
    this.assistanceProvenance.set(model.assistanceProvenance ?? []);
    this.form.markAsPristine();
  }
  private value(): LogicalModelWrite {
    const dataset = this.form.controls.dataset.getRawValue();
    const current = this.model();
    const fieldRows = this.fields.controls.map((control, index) => {
      const field = control.getRawValue();
      const valueListConceptId = field.valueListConceptId || null;
      const selection = normalizeFieldConceptSelection(field.conceptIds, field.primaryConceptId, valueListConceptId);
      const write: LogicalFieldWrite = {
        id: field.id || undefined,
        businessObject: this.businessObjectName(field.businessObjectVersionId) || field.businessObject || '',
        businessObjectVersionId: field.businessObjectVersionId || null,
        entityName: field.entityName ?? 'Entitaet_1',
        name: field.name ?? '',
        dataType: field.dataType ?? 'xsd:string',
        length: field.length || null,
        shortDescription: field.shortDescription ?? '',
        comment: field.comment || null,
        sourceSystem: field.sourceSystem || null,
        classification: field.classification,
        precision: field.precision ?? null,
        decimalPlaces: field.decimalPlaces ?? null,
        nullable: field.nullable ?? true,
        minCount: field.minCount ?? 0,
        maxCount: field.maxCount ?? null,
        order: field.order || index + 1,
        valueListConceptId,
        conceptIds: selection.conceptIds,
        primaryConceptId: selection.primaryConceptId,
      };
      return { write, entityId: field.entityId ?? '', entityName: field.entityName ?? 'Entitaet_1', entityBusinessObject: this.businessObjectName(field.entityBusinessObjectVersionId) || field.entityBusinessObject || '', entityBusinessObjectVersionId: field.entityBusinessObjectVersionId || null, entityComment: field.entityComment ?? '', entityOrder: field.entityOrder ?? index + 1 };
    });
    const fields = fieldRows.map((row) => row.write);
    const groupedFields = new Map<string, typeof fieldRows>();
    for (const row of fieldRows) {
      const key = row.entityId || `new:${row.entityName}`;
      groupedFields.set(key, [...(groupedFields.get(key) ?? []), row]);
    }
    const entities: LogicalEntityWrite[] = [...groupedFields.values()].map((rows, index) => {
      const first = rows[0];
      return {
        id: first.entityId || undefined,
        name: first.entityName,
        businessObject: first.entityBusinessObject || first.write.businessObject || first.entityName,
        businessObjectVersionId: first.entityBusinessObjectVersionId,
        comment: first.entityComment || null,
        order: first.entityOrder || index + 1,
        fields: rows.map((row) => row.write),
      };
    });
    return {
      title: { de: dataset.titleDe, fr: dataset.titleFr, it: dataset.titleIt, en: dataset.titleEn, rm: dataset.titleRm || null },
      description: { de: dataset.descriptionDe, fr: dataset.descriptionFr, it: dataset.descriptionIt, en: dataset.descriptionEn, rm: dataset.descriptionRm || null },
      identifiers: dataset.identifiers.split(',').map((item) => item.trim()).filter(Boolean),
      department: dataset.department,
      office: dataset.office,
      organizationUnitId: this.selectedOrganizationId(),
      dataDomainId: dataset.dataDomainId,
      dataOwnerId: dataset.dataOwnerId,
      deputyDataOwnerId: dataset.deputyDataOwnerId || null,
      creator: this.creatorValue(dataset.creatorType, dataset.creatorName, dataset.creatorIdentifier, dataset.creatorPersonName),
      classification: dataset.classification,
      dateCreated: dataset.dateCreated,
      entityName: entities[0]?.name ?? 'Entitaet_1',
      entities,
      conceptIds: current?.conceptReferences.map((item) => item.id) ?? [],
      sourceSnapshotId: this.sourceSnapshotId() ?? null,
      contactPoints: current?.contactPoints,
      publisher: current?.publisher,
      accessRights: current?.accessRights,
      themes: current?.themes,
      mediaFormatHint: current?.mediaFormatHint,
      comment: current?.comment,
      distributions: current?.distributions,
      dataServices: current?.dataServices,
      assistanceProvenance: this.assistanceProvenance(),
      fields,
    };
  }
  private selectedOrganizationId(): string { const dataset = this.form.controls.dataset.controls; return dataset.division.value || dataset.office.value || dataset.department.value; }
  private businessObjectName(versionId: string | null | undefined): string { const term = this.businessObjects().find((item) => item.versionId === versionId); return term ? this.businessObjectLabel(term) : ''; }
  private prefetchTermdat(query: string): void { this.termdatSearching.set(true); this.termdatCount.set(null); this.termdatFeedback.set(null); this.assistance.searchTermdat(query).subscribe({ next: (value) => { if (query !== this.form.controls.dataset.controls.titleDe.value.trim()) return; this.termdatResults.set(value.items); this.termdatCount.set(value.total); this.termdatQuery.set(query); this.termdatSearching.set(false); this.termdatFeedback.set(value.total ? null : 'Keine öffentlich publizierten TERMDAT-Treffer gefunden.'); }, error: () => { if (query !== this.form.controls.dataset.controls.titleDe.value.trim()) return; this.termdatSearching.set(false); this.termdatCount.set(null); this.termdatFeedback.set('TERMDAT ist momentan nicht erreichbar; das Formular bleibt vollständig manuell nutzbar.'); } }); }
  private translateField(target: 'title' | 'description', source: string): void {
    if (!source || this.form.controls.dataset.controls.classification.value !== 'unclassified') return;
    this.assistance.translate(source, 'unclassified').subscribe({ next: (value) => {
      const currentSource = target === 'title' ? this.form.controls.dataset.controls.titleDe.value.trim() : this.form.controls.dataset.controls.descriptionDe.value.trim();
      if (currentSource !== source) return;
      for (const language of ['fr', 'it', 'en']) { const suggestion = value.translations[language]; if (suggestion) this.offerTranslation(`${target}${language[0].toUpperCase()}${language.slice(1)}`, this.localizedValue(target, language), suggestion, { fieldPath: target, language: language as 'fr'|'it'|'en', provider: 'deepl', sourceTextHash: value.sourceTextHash, sourceIdentifier: null, sourceUri: 'https://api-free.deepl.com/v2/translate', sourceModifiedAt: null, retrievedAt: value.retrievedAt, payloadHash: value.payloadHash, origin: 'machine_translated' }); }
      this.assistanceNotice.set('Maschinelle Übersetzungen wurden bereitgestellt. Vorhandene Texte bleiben unverändert.');
    }, error: () => this.assistanceNotice.set('Die Übersetzungsassistenz ist nicht konfiguriert oder momentan nicht erreichbar; manuelle Eingaben bleiben möglich.') });
  }
  private offerTranslation(field: string, current: string, suggestion: string, provenance: LogicalModelAssistanceProvenance): void {
    if (!current) { this.setLocalizedValue(field, suggestion); this.upsertProvenance(provenance); return; }
    if (current === suggestion) return;
    const labels: Record<string,string> = { titleFr:'Titel Französisch',titleIt:'Titel Italienisch',titleEn:'Titel Englisch',titleRm:'Titel Rätoromanisch',descriptionFr:'Beschreibung Französisch',descriptionIt:'Beschreibung Italienisch',descriptionEn:'Beschreibung Englisch',descriptionRm:'Beschreibung Rätoromanisch' };
    this.translationSuggestions.update((items) => [...items.filter((item) => item.field !== field), { field, label: labels[field] ?? field, current, suggestion, provenance }]);
  }
  private upsertProvenance(value: LogicalModelAssistanceProvenance): void { this.assistanceProvenance.update((items) => [...items.filter((item) => item.fieldPath !== value.fieldPath || item.language !== value.language || item.provider !== value.provider), value]); }
  private creatorNameLabel(): string {
    switch (this.form.controls.dataset.controls.creatorType.value) {
      case 'application': return 'Applikationsname';
      case 'internal_organisation': return 'Englischer Name';
      case 'internal_person': return 'User-ID';
      case 'external_organisation_or_person': return 'Organisationsname';
    }
  }
  private addControlIssue(issues: LogicalModelValidationIssue[], field: string, control: AbstractControl, patternMessage?: string): void {
    if (!control.invalid) return;
    const errors = control.errors ?? {};
    if (errors['required']) issues.push({ field, message: 'Dieses Pflichtfeld ist leer.' });
    else if (errors['maxlength']) issues.push({ field, message: `Der Wert darf höchstens ${errors['maxlength'].requiredLength} Zeichen lang sein.` });
    else if (errors['min']) issues.push({ field, message: `Der Wert muss mindestens ${errors['min'].min} sein.` });
    else if (errors['max']) issues.push({ field, message: `Der Wert darf höchstens ${errors['max'].max} sein.` });
    else if (errors['pattern']) issues.push({ field, message: patternMessage ?? 'Der Wert darf nicht leer sein oder nur aus Leerzeichen bestehen.' });
    else issues.push({ field, message: 'Der Wert ist ungültig.' });
  }
  private localizedValue(target: 'title' | 'description', language: string): string { const key = `${target}${language[0].toUpperCase()}${language.slice(1)}`; const c=this.form.controls.dataset.controls; switch(key){case'titleFr':return c.titleFr.value;case'titleIt':return c.titleIt.value;case'titleEn':return c.titleEn.value;case'titleRm':return c.titleRm.value;case'descriptionFr':return c.descriptionFr.value;case'descriptionIt':return c.descriptionIt.value;case'descriptionEn':return c.descriptionEn.value;case'descriptionRm':return c.descriptionRm.value;default:return'';} }
  private setLocalizedValue(field: string, value: string): void { const c=this.form.controls.dataset.controls; switch(field){case'titleFr':c.titleFr.setValue(value);c.titleFr.markAsDirty();break;case'titleIt':c.titleIt.setValue(value);c.titleIt.markAsDirty();break;case'titleEn':c.titleEn.setValue(value);c.titleEn.markAsDirty();break;case'titleRm':c.titleRm.setValue(value);c.titleRm.markAsDirty();break;case'descriptionFr':c.descriptionFr.setValue(value);c.descriptionFr.markAsDirty();break;case'descriptionIt':c.descriptionIt.setValue(value);c.descriptionIt.markAsDirty();break;case'descriptionEn':c.descriptionEn.setValue(value);c.descriptionEn.markAsDirty();break;case'descriptionRm':c.descriptionRm.setValue(value);c.descriptionRm.markAsDirty();break;} }
  private decideReview(decision:'accept'|'reject',comment:string|null):void{const current=this.model();if(!current?.reviewId)return;this.saving.set(true);this.error.set(null);this.api.decideLogicalModelReview(current.reviewId,decision,comment,this.etag()).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body,etag})=>{this.model.set(body);this.etag.set(etag);this.patch(body);this.notice.set(decision==='accept'?'Das Modell wurde durch den Domänen-Owner angenommen und publiziert.':'Das Modell wurde mit Änderungsauftrag an den Data Steward zurückgegeben.');},error:(error:Error)=>this.error.set(error.message)});}
  private loadCachedConcept(conceptId:string):void{this.conceptsApi.load(conceptId).subscribe({next:(detail)=>this.concepts.update((items)=>items.some((item)=>item.id===detail.id)?items.map((item)=>item.id===detail.id?detail:item):[...items,detail]),error:()=>undefined});}
  private saveExport(file:LogicalModelExportFile):void{const objectUrl=URL.createObjectURL(file.blob);const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=file.filename;anchor.hidden=true;document.body.append(anchor);try{anchor.click();this.notice.set(`${file.filename} wurde heruntergeladen.`);}finally{anchor.remove();URL.revokeObjectURL(objectUrl);}}
  private creatorFormValue(creator:LogicalModelCreator):{creatorName:string;creatorIdentifier:string;creatorPersonName:string}{switch(creator.type){case'application':return{creatorName:creator.applicationName,creatorIdentifier:'',creatorPersonName:''};case'internal_organisation':return{creatorName:creator.englishName,creatorIdentifier:creator.organizationId,creatorPersonName:''};case'internal_person':return{creatorName:creator.userId,creatorIdentifier:'',creatorPersonName:''};case'external_organisation_or_person':return{creatorName:creator.organizationName,creatorIdentifier:'',creatorPersonName:creator.personName??''};}}
  private creatorValue(type:CreatorType,name:string,identifier:string,personName:string):LogicalModelCreator{switch(type){case'application':return{type,applicationName:name.trim()};case'internal_organisation':return{type,organizationId:identifier.trim(),englishName:name.trim()};case'internal_person':return{type,userId:name.trim()};case'external_organisation_or_person':return{type,organizationName:name.trim(),personName:personName.trim()||null};}}
}
