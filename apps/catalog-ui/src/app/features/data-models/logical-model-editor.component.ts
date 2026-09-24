import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, finalize, forkJoin, take } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService, ModelingPersona } from '../../core/demo-identity.service';
import { I14yConceptsApiService } from '../domains/i14y-concepts-api.service';
import { I14yConcept } from '../domains/i14y-concepts.models';
import { DataModelWorkspaceNavComponent } from './data-model-workspace-nav.component';
import { DataModelsApiService, LogicalModelExportFile, LogicalModelExportRepresentation, ModelingApiError } from './data-models-api.service';
import { CreatorType, DataClassification, LogicalEntity, LogicalEntityWrite, LogicalField, LogicalFieldWrite, LogicalModel, LogicalModelAssistanceProvenance, LogicalModelCreator, LogicalModelWrite, PhysicalSnapshot, PhysicalSource, PhysicalTable } from './data-models.models';
import { DatasetSummaryComponent } from './dataset-summary.component';
import { LogicalModelGovernanceComponent } from './logical-model-governance.component';
import { BusinessObjectTerm, FederalOrganization, ModelingAssistanceService, ModelingScope, TermdatEntry } from './modeling-assistance.service';
import { LogicalModelFieldHelpDirective } from './logical-model-field-help.directive';
import { LogicalFieldCharacteristicsComponent } from './logical-field-characteristics.component';

export interface FieldConceptSelection {
  conceptIds: string[];
  primaryConceptId: string | null;
}

export interface LogicalModelValidationIssue {
  field: string;
  message: string;
}

const LOGICAL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,254}$/;
const LOGICAL_IDENTIFIER_PATTERN = /^\S+$/;

export function normalizeFieldConceptSelection(
  conceptIds: readonly string[],
  primaryConceptId: string | null | undefined,
  valueListConceptId: string | null | undefined,
): FieldConceptSelection {
  const normalized = [...new Set(conceptIds.map((id) => id.trim()).filter(Boolean))];
  const valueList = valueListConceptId?.trim();
  if (valueList && !normalized.includes(valueList)) normalized.push(valueList);
  const primary = primaryConceptId?.trim();
  return { conceptIds: normalized, primaryConceptId: primary && normalized.includes(primary) ? primary : null };
}

export function logicalModelVersionEtag(model: Pick<LogicalModel, 'lockVersion'>): string {
  return `"${model.lockVersion}"`;
}

@Component({
  selector: 'daca-logical-model-editor', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DataModelWorkspaceNavComponent, DatasetSummaryComponent, LogicalModelGovernanceComponent, LogicalModelFieldHelpDirective, LogicalFieldCharacteristicsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!embedded()) {
    @if (model(); as current) { <daca-data-model-workspace-nav [modelId]="current.id" [modelTitle]="current.title.de" activeSection="model" /> }
    <section class="daca-page-heading model-editor-heading">
      <div><p class="daca-eyebrow">{{ model() ? 'Logisches Datenmodell' : 'Neues logisches Datenmodell' }}</p><h1>{{ form.controls.dataset.controls.titleDe.value || model()?.title?.de || 'Modell erfassen' }}</h1><p>Modellmerkmale und SHACL-Feldmerkmale bleiben getrennt. Eine physische Quelle ist nicht erforderlich.</p></div>
      <div class="heading-tools"><label class="classification-hero" dacaFieldHelp="classification">Klassifizierung<select [formControl]="form.controls.dataset.controls.classification"><option value="unclassified">Nicht klassifiziert</option><option value="internal">Intern</option><option value="confidential">Vertraulich</option><option value="secret" disabled>Geheim</option></select></label></div>
    </section>
    <nav class="model-detail-tabs" role="tablist" aria-label="Bereiche des logischen Modells" (keydown)="onTabKeydown($event)">
      <button id="model-tab-status" type="button" role="tab" aria-controls="model-panel-status" [attr.aria-selected]="activeTab()==='status'" [attr.tabindex]="activeTab()==='status' ? 0 : -1" [class.is-active]="activeTab()==='status'" (click)="selectTab('status')">Status &amp; Klassifikation</button>
      <button id="model-tab-model" type="button" role="tab" aria-controls="model-panel-model" [attr.aria-selected]="activeTab()==='model'" [attr.tabindex]="activeTab()==='model' ? 0 : -1" [class.is-active]="activeTab()==='model'" (click)="selectTab('model')">Model Merkmale</button>
      <button id="model-tab-fields" type="button" role="tab" aria-controls="model-panel-fields" [attr.aria-selected]="activeTab()==='fields'" [attr.tabindex]="activeTab()==='fields' ? 0 : -1" [class.is-active]="activeTab()==='fields'" (click)="selectTab('fields')">Logische Entitäten und Felder</button>
    </nav>
    @if (derivedOrigin(); as origin) {
      <aside class="daca-card derived-origin" aria-label="Herkunft der Ableitung" [hidden]="activeTab()!=='model'">
        <div><p class="daca-eyebrow">Physical-first</p><h2>Aus physischer Repräsentation vorbereitet</h2><p>Alle fachlichen Angaben bleiben editierbar. Umbenannte Felder behalten ihre physische Bindung; entfernte Felder werden nicht gemappt.</p></div>
        <dl><div><dt>Quelle</dt><dd>{{ origin.source.name }}</dd></div><div><dt>Objekt</dt><dd><code>{{ origin.snapshot.databaseName }}.{{ origin.table.schemaName }}.{{ origin.table.name }}</code></dd></div><div><dt>Snapshot</dt><dd>{{ origin.snapshot.revision }} · <code>{{ origin.snapshot.id }}</code></dd></div></dl>
      </aside>
    } @else if (sourceSnapshotId()) { <p class="daca-alert" [hidden]="activeTab()!=='model'">Dieser Entwurf wurde aus dem physischen Snapshot <code>{{ sourceSnapshotId() }}</code> vorbereitet. Alle Vorschlagswerte bleiben editierbar.</p> }
    <section id="model-panel-status" role="tabpanel" aria-labelledby="model-tab-status" [hidden]="activeTab()!=='status'">
      @if (model(); as current) {
        <daca-dataset-summary [model]="current" />
        <daca-logical-model-governance [model]="current" />
        <section class="daca-card export-section"><div><p class="daca-eyebrow">Repräsentationen</p><h2>DCAT-AP-CH und SHACL</h2><p>Der Datensatz und seine logische Struktur bleiben getrennte, verlinkte Exporte.</p></div><div><button class="daca-button is-secondary" type="button" [disabled]="exporting()!==null" (click)="downloadExport(current,'dcat-ttl')">DCAT TTL herunterladen</button><button class="daca-button is-secondary" type="button" [disabled]="exporting()!==null" (click)="downloadExport(current,'dcat-jsonld')">DCAT JSON-LD herunterladen</button><button class="daca-button is-secondary" type="button" [disabled]="exporting()!==null" (click)="downloadExport(current,'shacl-ttl')">SHACL TTL herunterladen</button><button class="daca-button is-secondary" type="button" [disabled]="exporting()!==null" (click)="downloadExport(current,'shacl-jsonld')">SHACL JSON-LD herunterladen</button></div></section>
      } @else {
        <div class="daca-card editor-state">Status und Versionshistorie erscheinen nach dem ersten Speichern des Modells.</div>
      }
    </section>
    }
    @if (notice()) { <p class="daca-alert is-success" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }}</p> }
    @if (assistanceNotice()) { <p class="assistance-notice" role="status">{{ assistanceNotice() }}</p> }
    @if (termdatOpen()) { <div class="modal-backdrop" (click)="closeTermdat()"><section class="termdat-modal" role="dialog" aria-modal="true" aria-labelledby="termdat-title" (click)="$event.stopPropagation()"><header><div><p class="daca-eyebrow">Bundeskanzlei</p><h2 id="termdat-title">In TERMDAT suchen</h2></div><button type="button" aria-label="Dialog schliessen" (click)="closeTermdat()">×</button></header><p>Treffer für «{{ form.controls.dataset.controls.titleDe.value }}»</p>@if(termdatLoading()){<p class="termdat-loading"><span class="termdat-spinner" aria-hidden="true"></span><span>TERMDAT wird abgefragt …</span></p>}@else{<ul>@for(entry of termdatResults();track entry.entryId){<li><div><strong>{{ entry.preferredTerm }}</strong><span>{{ entry.definition || 'Keine Beschreibung verfügbar' }}</span><small>{{ descriptionLabel(entry) }} · {{ entry.collection }} · {{ entry.status }} · {{ entry.reliability }}</small></div><div class="termdat-result-actions"><button class="daca-button" type="button" [disabled]="!entry.definition" (click)="useTermdat(entry,'both')">Titel und Beschreibung übernehmen</button><button class="daca-button is-secondary" type="button" (click)="useTermdat(entry,'title')">Nur Titel übernehmen</button><button class="daca-button is-secondary" type="button" [disabled]="!entry.definition" (click)="useTermdat(entry,'definition')">{{ entry.definition ? 'Nur Beschreibung übernehmen' : 'Keine Beschreibung verfügbar' }}</button></div></li>}@empty{<li>Keine öffentlich publizierten TERMDAT-Einträge gefunden.</li>}</ul>}@if(termdatSelection();as selection){<aside #termdatAdoption class="termdat-adoption" tabindex="-1" aria-labelledby="termdat-adoption-title"><p class="daca-eyebrow">Übernahme prüfen</p><h3 id="termdat-adoption-title">Welche Angaben werden geändert?</h3>@if(termdatSelectionReplacesExisting(selection)){<p class="termdat-overwrite-warning" role="alert"><strong>Bestehende Inhalte vorhanden.</strong> Die bestätigten Felder werden durch die TERMDAT-Werte überschrieben.</p>}@for(target of selection.targets;track target){<div class="termdat-adoption-row"><strong>{{ termdatTargetLabel(target) }}</strong><span><small>Aktuell</small>{{ termdatCurrentValue(target) || 'Noch nicht erfasst' }}</span><span><small>Aus TERMDAT</small>{{ termdatIncomingValue(selection.entry,target) }}</span><em>{{ termdatCurrentValue(target) ? 'Wird überschrieben' : 'Wird ergänzt' }}</em></div>}<div class="termdat-adoption-actions"><button class="daca-button is-secondary" type="button" (click)="cancelTermdatSelection()">Abbrechen</button><button class="daca-button" type="button" (click)="confirmTermdatSelection()">{{ termdatSelectionReplacesExisting(selection) ? 'Bestehende Werte überschreiben' : 'Werte übernehmen' }}</button></div></aside>}<footer><button class="daca-button is-secondary" type="button" (click)="closeTermdat()">Schliessen</button></footer></section></div>}
    @if (loading()) { <div class="daca-card editor-state" aria-live="polite">Modell wird geladen …</div> }
    @if (!loading()) {
      @if (fieldPanelOnly()) {
        <form [formGroup]="form" (ngSubmit)="save(true)" class="field-panel-form" [class.validation-attempted]="validationAttempted()">
          @if (fields.at(selectedFieldIndex()); as selectedField) {
            <daca-logical-field-characteristics [field]="selectedField" [businessObjects]="businessObjects()" [concepts]="concepts()" [conceptReferences]="fieldConceptReferences()" [compact]="true" />
          }
          <button class="remove-field" type="button" [disabled]="fields.length===1 || !canRemoveFields()" (click)="removeSelectedField()">Logisches Feld entfernen</button>
          <footer class="field-panel-actions"><span>{{ form.dirty ? 'Ungespeicherte Änderungen' : 'Alle Änderungen gespeichert' }}</span><button class="daca-button" type="submit" [disabled]="saving() || !form.dirty || !canEditCurrentModel()">{{ saving() ? 'Wird gespeichert …' : 'Feldmerkmale speichern' }}</button></footer>
        </form>
      } @else {
      <form [formGroup]="form" (ngSubmit)="save()" class="model-editor-form" [class.is-embedded]="embedded()" [class.validation-attempted]="validationAttempted()">
        <section class="daca-card editor-section" formGroupName="dataset" [hidden]="!embedded() && activeTab()!=='model'" [attr.role]="embedded() ? null : 'tabpanel'" [attr.id]="embedded() ? null : 'model-panel-model'" [attr.aria-labelledby]="embedded() ? null : 'model-tab-model'">
          <header><div><span>02</span><div><p class="daca-eyebrow">Modellebene</p><h2>Model Merkmale</h2></div></div><small>DCAT-AP-CH und organisatorischer Kontext</small></header>
          <div class="editor-grid">
            <div class="is-wide termdat-title-field" dacaFieldHelp="titleDe"><label for="logical-model-title-de">Titel (Deutsch) *</label><div class="termdat-input-group"><input id="logical-model-title-de" formControlName="titleDe" (input)="resetTermdatSearch()" (blur)="assistTitle()"><button type="button" (click)="openTermdat()">In TERMDAT suchen</button></div></div>
            @if(termdatSearching() || termdatCount() !== null || termdatFeedback()){<div class="termdat-feedback is-wide" [class.has-hits]="(termdatCount() ?? 0) > 0" role="status" aria-live="polite">@if(termdatSearching()){<span class="termdat-loading"><span class="termdat-spinner" aria-hidden="true"></span><span>TERMDAT wird nach Verlassen des Titelfelds automatisch durchsucht …</span></span>}@else if((termdatCount() ?? 0) > 0){<strong>{{ termdatCount() }} öffentlich publizierte TERMDAT-Treffer gefunden.</strong><button type="button" (click)="openTermdat()">Treffer anzeigen</button>}@else{<span>{{ termdatFeedback() || 'Keine öffentlich publizierten TERMDAT-Treffer gefunden.' }}</span>}</div>}
            <label class="is-wide" dacaFieldHelp="descriptionDe">Beschreibung (Deutsch) *<textarea rows="3" formControlName="descriptionDe" (blur)="assistDescription()"></textarea></label>
            <details class="is-wide language-details"><summary>Weitere Sprachen</summary><div><label dacaFieldHelp="titleFr">Titel Französisch<input formControlName="titleFr"></label><label dacaFieldHelp="descriptionFr">Beschreibung Französisch<textarea rows="2" formControlName="descriptionFr"></textarea></label><label dacaFieldHelp="titleIt">Titel Italienisch<input formControlName="titleIt"></label><label dacaFieldHelp="descriptionIt">Beschreibung Italienisch<textarea rows="2" formControlName="descriptionIt"></textarea></label><label dacaFieldHelp="titleEn">Titel Englisch<input formControlName="titleEn"></label><label dacaFieldHelp="descriptionEn">Beschreibung Englisch<textarea rows="2" formControlName="descriptionEn"></textarea></label><label dacaFieldHelp="titleRm">Titel Rätoromanisch<input formControlName="titleRm"></label><label dacaFieldHelp="descriptionRm">Beschreibung Rätoromanisch<textarea rows="2" formControlName="descriptionRm"></textarea></label></div></details>
            @if(translationSuggestions().length){<aside class="translation-overlay is-wide" aria-label="Verfügbare Übersetzungsvorschläge"><h3>✨ Automatische Übersetzungen verfügbar</h3>@for(item of translationSuggestions();track item.field){<section><strong>{{ item.label }}</strong><div><span><small>Aktuell</small>{{ item.current }}</span><span><small>Vorschlag</small>{{ item.suggestion }}</span></div><button type="button" (click)="acceptTranslation(item.field)">Übernehmen</button><button type="button" (click)="discardTranslation(item.field)">Verwerfen</button></section>}</aside>}
            <label dacaFieldHelp="department">Departement *<select formControlName="department" (change)="departmentChanged()"><option value="">Bitte wählen</option>@for(org of departments();track org.id){<option [value]="org.id" [disabled]="!canNavigateOrganization(org)">{{ org.displayName }}</option>}</select></label>
            <label dacaFieldHelp="office">Amt / Verwaltungseinheit<select formControlName="office" (change)="officeChanged()"><option value="">Keine</option>@for(org of offices();track org.id){<option [value]="org.id" [disabled]="!canNavigateOrganization(org)">{{ org.displayName }}</option>}</select></label>
            <label dacaFieldHelp="division">Abteilung / Bereich<select formControlName="division" (change)="scopeChanged()"><option value="">Keine</option>@for(org of divisions();track org.id){<option [value]="org.id" [disabled]="!canNavigateOrganization(org)">{{ org.displayName }}</option>}</select></label>
            <label class="is-wide identifier-field" dacaFieldHelp="identifiers">Identifier *<span class="identifier-mode-control"><button type="button" class="identifier-mode-switch" role="switch" [attr.aria-checked]="form.controls.dataset.controls.identifierMode.value" aria-label="Organisations-abgeleiteten Identifier umschalten" (click)="toggleIdentifierMode()"><span class="identifier-mode-switch-thumb" aria-hidden="true"></span></button><span>Organisations-abgeleiteter Identifier</span></span><span class="identifier-input" [class.is-derived]="form.controls.dataset.controls.identifierMode.value">@if(form.controls.dataset.controls.identifierMode.value){<span class="identifier-prefix">{{ organizationIdentifierPrefix() }}</span>}<input formControlName="identifiers" (input)="identifierChanged()" placeholder="Eindeutiger Identifier ohne Leerzeichen"></span><small>@if(identifierAvailability()==='checking'){Identifier wird geprüft …}@else if(identifierAvailability()==='available'){Identifier ist katalogweit verfügbar.}@else if(identifierAvailability()==='taken'){Dieser Identifier ist bereits vergeben.}@else{Ein Identifier ist genau ein String ohne Leerzeichen.}</small></label>
            <label dacaFieldHelp="dataDomainId">DaCa-Domäne * <a class="new-domain-link" routerLink="/domains" target="_blank" title="Öffnet die Domain-Registrierung in einem neuen Tab">Neue Domäne erstellen</a><select formControlName="dataDomainId" (change)="domainChanged()"><option value="">Bitte wählen</option>@for(domain of catalogApi.domains();track domain.id){<option [value]="domain.id">{{ domain.preferredLabel }}</option>}</select></label>
            <label dacaFieldHelp="classification">Klassifizierung<select formControlName="classification"><option value="unclassified">Nicht klassifiziert</option><option value="internal">Intern</option><option value="confidential">Vertraulich</option><option value="secret">Geheim</option></select></label>
            <div class="role-assignment"><strong>Data Steward (Organisation)</strong><span>{{ organizationStewards() || 'Nicht zugewiesen' }}</span><small>Diese Rolle gilt organisationsweit und wird nicht am einzelnen Modell gespeichert.</small></div>
            <label dacaFieldHelp="creatorType">Ersteller-Typ<select formControlName="creatorType"><option value="">Nicht erfasst</option><option value="application">Applikation</option><option value="internal_organisation">Interne Verwaltungseinheit</option><option value="internal_person">Interne Person</option><option value="external_organisation_or_person">Externe Organisation/Person</option></select></label>
            @switch(form.controls.dataset.controls.creatorType.value){
              @case('application'){<label dacaFieldHelp="creatorName">Applikationsname<input formControlName="creatorName" placeholder="z. B. HR-Core"></label>}
              @case('internal_organisation'){<label dacaFieldHelp="creatorIdentifier">Organisations-ID *<input formControlName="creatorIdentifier" placeholder="z. B. vtg"></label><label dacaFieldHelp="creatorName">Englischer Name *<input formControlName="creatorName"></label>}
              @case('internal_person'){<label dacaFieldHelp="creatorName">User-ID *<input formControlName="creatorName" placeholder="vorname.nachname"></label>}
              @case('external_organisation_or_person'){<label dacaFieldHelp="creatorName">Organisationsname *<input formControlName="creatorName"></label><label dacaFieldHelp="creatorPersonName">Person (optional)<input formControlName="creatorPersonName"></label>}
            }
            <label dacaFieldHelp="dateCreated">Fachliches Erstelldatum *<input type="date" formControlName="dateCreated"></label>
            <div class="media-hint is-wide"><strong>Medienformat</strong><span>Nicht zugewiesen – Medienformate gehören an Distributionen. Dieses logische Modell kann eigenständig bleiben.</span></div>
          </div>
        </section>

        <section class="daca-card editor-section structure-section" [hidden]="!embedded() && activeTab()!=='fields'" [attr.role]="embedded() ? null : 'tabpanel'" [attr.id]="embedded() ? null : 'model-panel-fields'" [attr.aria-labelledby]="embedded() ? null : 'model-tab-fields'">
          <header><div><span>01</span><div><p class="daca-eyebrow">SHACL-Strukturebene</p><h2>Logische Entitäten und Felder</h2></div></div><div class="structure-actions"><button class="daca-button is-secondary" type="button" (click)="addEntity()">Entität hinzufügen</button><button class="daca-button" type="button" (click)="addField()">Feld hinzufügen</button></div></header>
          <div class="field-workbench field-list" formArrayName="fields">
            <section class="field-browser" aria-labelledby="field-browser-title">
              <header><div><p class="daca-eyebrow">Struktur</p><h3 id="field-browser-title">{{ fields.length }} Felder</h3></div><nav aria-label="Darstellung der Modellstruktur"><button type="button" [class.is-active]="structureView()==='table'" [attr.aria-pressed]="structureView()==='table'" (click)="structureView.set('table')">Tabelle</button><button type="button" [class.is-active]="structureView()==='relation'" [attr.aria-pressed]="structureView()==='relation'" (click)="structureView.set('relation')">Relation</button></nav></header>
              @if(structureView()==='table'){
                 <div class="field-table-wrap"><table class="field-table"><thead><tr><th>Feld</th><th>Entität</th><th>Datentyp</th><th>Kardinalität</th><th aria-label="Aktionen"></th></tr></thead><tbody>@for(field of fields.controls;track field;let index=$index){<tr [class.is-selected]="selectedFieldIndex()===index"><td><button class="field-select" type="button" (click)="selectField(index)"><strong>{{ field.controls.name.value || 'Unbenannt' }}</strong><small>Position {{ field.controls.order.value }}</small></button></td><td>{{ field.controls.entityName.value }}</td><td>{{ field.controls.dataType.value }}@if(field.controls.length.value){ · L {{ field.controls.length.value }}}</td><td>{{ field.controls.minCount.value }}..{{ field.controls.maxCount.value ?? '*' }}</td><td><button class="remove-field" type="button" [disabled]="fields.length===1 || !canRemoveFields()" [attr.aria-label]="(field.controls.name.value || 'Feld') + ' entfernen'" (click)="removeField(index)">Entfernen</button></td></tr>}</tbody></table></div>
              } @else {
                <div class="relation-list">@for(field of fields.controls;track field;let index=$index){<button type="button" [class.is-selected]="selectedFieldIndex()===index" (click)="selectField(index)"><span><small>Logisch</small><strong>{{ field.controls.entityName.value }}.{{ field.controls.name.value || 'Unbenannt' }}</strong></span><span><small>Physisch</small><strong>{{ field.controls.physicalColumnName.value || 'Keine Repräsentation' }}</strong></span></button>}</div>
              }
            </section>
            @if(fields.at(selectedFieldIndex());as selectedField){<daca-logical-field-characteristics [field]="selectedField" [businessObjects]="businessObjects()" [concepts]="concepts()" [conceptReferences]="fieldConceptReferences()" />}
          </div>
        </section>

        <footer class="editor-actions">
          <div class="editor-footer-context">@if(!embedded()){<a class="daca-button is-secondary" routerLink="/models">Zur Übersicht</a>}<span>{{ form.dirty ? 'Ungespeicherte Änderungen' : 'Alle Änderungen gespeichert' }}</span></div>
          <aside class="review-owner-info" aria-live="polite">
            @if(selectedDomain();as domain){<strong>Prüfung: {{ domain.ownerName }}</strong><span>{{ domain.preferredLabel }} · Stv. {{ domain.deputyOwnerName }}</span><small>Erst «Zur Domänenfreigabe einreichen» erzeugt den persönlichen Prüfauftrag beim primären Domain Owner.</small>}
            @else{<strong>Prüfung noch nicht zugewiesen</strong><span>Wählen Sie eine DaCa-Domäne.</span>}
          </aside>
          <div class="editor-primary-actions">
            <button class="daca-button is-secondary" type="button" [disabled]="!canSubmitForReview()" [attr.title]="submitBlockedReason()" (click)="submitForReview()">Zur Domänenfreigabe einreichen</button>
            @if(model()?.status === 'published'){<button class="daca-button is-secondary" type="button" [disabled]="!canPublishCurrentModel() || saving()" (click)="retire()">Modell stilllegen</button>}
            <div class="save-action"><button class="daca-button" type="submit" [disabled]="saving() || !canEditCurrentModel() || model()?.status === 'retired' || model()?.status === 'review_pending'">{{ saving() ? 'Wird gespeichert …' : 'Als Entwurf speichern' }}</button>@if(saveProblem();as problem){<section class="save-problem" role="alert" aria-live="assertive"><strong>{{ saveProblemTitle(problem) }}</strong><p>{{ problem.message }}</p>@if(problem.suggestedAction){<p class="save-problem-action">{{ problem.suggestedAction }}</p>}@if(validationIssues().length){<ul>@for(issue of validationIssues();track issue.field + issue.message){<li><button type="button" (click)="focusIssue(issue)"><span>{{ issue.field }}:</span> {{ issue.message }}</button></li>}</ul>}<div class="save-problem-technical"><small>Technische Details · Fehlercode {{ supportErrorCode(problem) }} · HTTP {{ problem.status }} · Request-ID {{ problem.requestId || 'nicht verfügbar' }}@if(problem.technicalDetails){ · {{ problem.technicalDetails.category }} · {{ problem.technicalDetails.sqlState }} · {{ problem.technicalDetails.constraint }} · {{ problem.technicalDetails.timestamp }}}</small><button type="button" class="daca-button is-secondary" (click)="copyErrorMessage(problem)">{{ errorCopied() ? 'Kopiert' : 'Copy Error Message' }}</button></div></section>}@else if(validationAttempted() && validationIssues().length){<section class="save-validation" role="alert" aria-live="assertive"><strong>Bitte korrigieren Sie folgende Angaben:</strong><ul>@for(issue of validationIssues();track issue.field + issue.message){<li><button type="button" (click)="focusIssue(issue)"><span>{{ issue.field }}:</span> {{ issue.message }}</button></li>}</ul></section>}</div>
          </div>
        </footer>
        @if (model()?.status === 'review_pending') { <p class="publish-note">Die Aufgabe liegt beim primären Domain Owner der gewählten Domäne. Der Entscheid erfolgt über den persönlichen Prüfauftrag.</p> }
      </form>
      }
    }
  `,
  styles: [`
    .model-editor-heading{align-items:center}.editor-state{padding:2rem;box-shadow:none}.model-editor-form{display:grid;gap:1.25rem}.editor-section{box-shadow:none}.editor-section>header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.1rem 1.25rem;border-bottom:1px solid var(--daca-border)}.editor-section>header>div{display:flex;align-items:center;gap:1rem}.editor-section>header>div>span{display:grid;place-items:center;width:38px;height:38px;background:var(--daca-federal-blue);color:#fff;font-weight:800}.editor-section h2{margin:0;font-size:1.12rem}.editor-section header small{color:var(--daca-muted)}.structure-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem}.editor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;padding:1.25rem}.editor-grid label{display:grid;align-content:start;gap:.4rem;color:#30363b;font-size:.72rem;font-weight:750}.editor-grid input,.editor-grid select,.editor-grid textarea{width:100%;min-height:42px;border:1px solid var(--daca-border-strong);border-radius:0;padding:.55rem .65rem;background:#fff;color:var(--daca-ink)}.validation-attempted input.ng-invalid,.validation-attempted select.ng-invalid,.validation-attempted textarea.ng-invalid{border-color:#b3162b!important;background:rgba(179,22,43,.10)!important}.editor-grid textarea{resize:vertical}.editor-grid label>small{color:var(--daca-muted);font-size:.64rem;font-weight:500}.editor-grid .is-wide{grid-column:1/-1}.termdat-feedback{display:flex;min-height:44px;align-items:center;justify-content:space-between;gap:.8rem;border-left:4px solid var(--daca-border-strong);padding:.7rem .85rem;background:#f4f6f7;color:var(--daca-muted);font-size:.72rem}.termdat-feedback.has-hits{border-left-color:#167347;background:#edf7f0;color:#174c32}.termdat-feedback button{min-height:40px;border:1px solid currentColor;padding:.45rem .75rem;background:#fff;color:inherit;font-weight:750;cursor:pointer}.termdat-loading{display:flex;align-items:center;gap:.65rem}.termdat-spinner{display:block;box-sizing:border-box;width:20px;height:20px;flex:0 0 20px;border:3px solid rgba(31,111,139,.34);border-top-color:#176783;border-radius:999px;animation:termdat-spinner-rotate .8s linear infinite;transform-origin:center}@keyframes termdat-spinner-rotate{to{transform:rotate(360deg)}}.termdat-modal{width:min(1040px,100%)}.termdat-modal li{grid-template-columns:minmax(0,1fr) minmax(390px,1.15fr);align-items:start}.termdat-result-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:.55rem;width:100%}.termdat-result-actions .daca-button{width:100%;min-height:48px;padding:.65rem .85rem;font-weight:800;line-height:1.25;text-align:center;white-space:normal}.termdat-result-actions .daca-button:first-child{grid-column:1/-1}.termdat-result-actions .daca-button:disabled{font-weight:800}.termdat-adoption{display:grid;scroll-margin-block:1rem;gap:.75rem;margin:1rem 0;border-left:4px solid var(--daca-federal-blue);padding:1rem;background:#eef5f8}.termdat-adoption h3,.termdat-adoption p{margin:0}.termdat-overwrite-warning{border-left:4px solid #b26a00;padding:.65rem .8rem;background:#fff1c7;color:#4f3d00}.termdat-adoption-row{display:grid;grid-template-columns:minmax(8rem,.7fr) 1fr 1fr auto;align-items:start;gap:.7rem;border-top:1px solid var(--daca-border);padding-top:.7rem}.termdat-adoption-row>span{display:grid;gap:.2rem;white-space:pre-wrap}.termdat-adoption-row small{color:var(--daca-muted);font-weight:700;text-transform:uppercase}.termdat-adoption-row em{padding:.2rem .4rem;background:#fff1c7;color:#634c00;font-size:.67rem;font-style:normal;font-weight:750}.termdat-adoption-actions{display:flex;justify-content:flex-end;gap:.5rem}.termdat-adoption-actions .daca-button{min-width:190px;font-weight:800}.role-assignment{display:grid;align-content:start;gap:.25rem;border-left:4px solid var(--daca-blue);padding:.65rem .8rem;background:var(--daca-blue-soft);font-size:.7rem}.role-assignment small{color:var(--daca-muted);font-size:.62rem}.language-details{border:1px solid var(--daca-border);padding:.85rem}.language-details summary{cursor:pointer;font-weight:750}.language-details>div{display:grid;grid-template-columns:1fr 2fr;gap:.8rem;margin-top:1rem}.media-hint{display:grid;gap:.25rem;border-left:4px solid var(--daca-blue);padding:.8rem 1rem;background:var(--daca-blue-soft);font-size:.72rem}.media-hint span{color:var(--daca-muted)}.field-workbench{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(360px,.75fr);align-items:start;gap:.9rem;padding:.9rem;background:#f6f8f9}.field-browser{min-width:0;border:1px solid var(--daca-border);background:#fff}.field-browser>header{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.7rem .8rem;border-bottom:1px solid var(--daca-border)}.field-browser h3,.field-browser p{margin:.1rem 0}.field-browser h3{font-size:.95rem}.field-browser nav{display:flex}.field-browser nav button{min-height:36px;border:0;border-bottom:3px solid transparent;padding:.35rem .65rem;background:#fff;font-weight:750;cursor:pointer}.field-browser nav button.is-active{border-color:var(--daca-red);color:var(--daca-red-dark)}.field-table-wrap{overflow:auto}.field-table{width:100%;border-collapse:collapse;font-size:.67rem}.field-table th{padding:.55rem .65rem;background:#f2f5f7;color:var(--daca-muted);font-size:.57rem;text-align:left;text-transform:uppercase}.field-table td{border-top:1px solid var(--daca-border);padding:.48rem .65rem;vertical-align:middle}.field-table tr.is-selected{background:var(--daca-blue-soft);box-shadow:inset 4px 0 var(--daca-blue)}.field-select{display:grid;gap:.12rem;width:100%;border:0;padding:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.field-select small{color:var(--daca-muted);font-size:.58rem}.remove-field{display:inline-flex;align-items:center;min-height:40px;border:0;padding:.5rem;background:transparent;color:var(--daca-red-dark);font-size:.61rem;font-weight:750;cursor:pointer}.remove-field:disabled{color:var(--daca-muted);cursor:not-allowed}.relation-list{display:grid;padding:.55rem}.relation-list>button{display:grid;grid-template-columns:1fr 1fr;gap:1rem;border:0;border-bottom:1px solid var(--daca-border);padding:.65rem;background:#fff;text-align:left;cursor:pointer}.relation-list>button.is-selected{background:var(--daca-blue-soft);box-shadow:inset 4px 0 var(--daca-blue)}.relation-list span{display:grid;gap:.2rem}.relation-list small{color:var(--daca-muted);font-size:.56rem;font-weight:800;text-transform:uppercase}.relation-list strong{overflow-wrap:anywhere;font-size:.68rem}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.field-panel-form{display:grid;gap:.6rem}.field-panel-actions{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:.5rem;border:1px solid var(--daca-border);border-top:4px solid var(--daca-red);padding:.65rem;background:#fff;box-shadow:0 -6px 16px #15293d18}.field-panel-actions span{color:var(--daca-muted);font-size:.62rem}.field-panel-actions .daca-button{min-height:40px;padding:.45rem .65rem;font-size:.66rem}.export-section{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.25rem;border-top:4px solid var(--daca-red);box-shadow:none}.export-section h2,.export-section p{margin:.25rem 0}.export-section>div:last-child{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem}.editor-actions{position:sticky;z-index:5;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:1rem;border:1px solid var(--daca-border);border-top:4px solid var(--daca-red);padding:.9rem 1rem;background:#fff;box-shadow:0 -8px 20px #15293d18}.editor-actions>div{display:flex;align-items:center;flex-wrap:wrap;gap:.6rem}.editor-actions .editor-primary-actions{align-items:flex-start;justify-content:flex-end}.save-action{display:grid;justify-items:stretch;gap:.45rem;min-width:250px}.save-validation,.save-problem{max-width:430px;margin:0;border-left:4px solid var(--daca-red);padding:.6rem .75rem;background:#fff0f0;color:var(--daca-red-dark);font-size:.7rem;text-align:left}.save-problem{display:grid;gap:.45rem}.save-problem p{margin:0}.save-problem-action{font-weight:700}.save-validation ul,.save-problem ul{display:grid;gap:.25rem;margin:.4rem 0 0;padding-left:1.1rem}.save-validation li span,.save-problem li span{color:inherit;font-size:inherit;font-weight:800}.save-validation li button,.save-problem li button{border:0;padding:0;background:transparent;color:inherit;text-align:left;cursor:pointer;text-decoration:underline}.save-problem-technical{display:flex;align-items:center;justify-content:space-between;gap:.5rem;border-top:1px solid #b3162b55;padding-top:.45rem;color:#5f6970}.save-problem-technical small{font-size:.58rem;overflow-wrap:anywhere}.save-problem-technical .daca-button{min-height:30px;padding:.25rem .45rem;font-size:.62rem;white-space:nowrap}.editor-actions span,.publish-note{color:var(--daca-muted);font-size:.7rem}.publish-note{margin:-.75rem 0 0;text-align:right}@media(prefers-reduced-motion:reduce){.termdat-spinner{animation:none}}@media(max-width:1100px){.field-workbench{grid-template-columns:1fr}}@media(max-width:980px){.editor-grid{grid-template-columns:1fr 1fr}.termdat-modal li{grid-template-columns:minmax(0,1fr) minmax(340px,1fr)}.termdat-adoption-row{grid-template-columns:1fr 1fr}.termdat-adoption-row>strong,.termdat-adoption-row>em{grid-column:1/-1}.export-section,.editor-actions{align-items:flex-start;flex-direction:column}.export-section>div:last-child{justify-content:flex-start}.editor-actions>div:last-child{width:100%}.save-action{width:100%}}@media(max-width:820px){.model-editor-heading{align-items:flex-start;flex-direction:column}.editor-grid,.language-details>div,.termdat-adoption-row,.termdat-modal li{grid-template-columns:1fr}.termdat-result-actions,.termdat-adoption-actions{width:100%}.termdat-adoption-actions .daca-button{min-width:0}.termdat-feedback{align-items:stretch;flex-direction:column}.editor-actions{position:static}.editor-actions>div,.editor-actions .daca-button{width:100%}.editor-section>header{align-items:flex-start;flex-direction:column}.structure-actions,.structure-actions .daca-button{width:100%}.field-workbench{padding:.55rem}.field-table{min-width:640px}.relation-list>button{grid-template-columns:1fr}.field-panel-actions{position:static;align-items:stretch;flex-direction:column}.field-panel-actions .daca-button{width:100%}}@media(max-width:560px){.termdat-result-actions{grid-template-columns:1fr}.termdat-result-actions .daca-button:first-child{grid-column:auto}.termdat-result-actions .daca-button{min-height:44px}.termdat-adoption-actions{display:grid;grid-template-columns:1fr}.termdat-adoption-actions .daca-button{width:100%}}
  `, `
    .model-editor-form.is-embedded .structure-section{order:-1}
    .model-detail-tabs{display:flex;gap:0;overflow-x:auto;margin:.35rem 0 1.25rem;border-bottom:1px solid var(--daca-border)}
    .model-detail-tabs button{flex:0 0 auto;min-height:48px;border:0;border-bottom:4px solid transparent;padding:.7rem 1.1rem;background:transparent;color:var(--daca-ink);font:inherit;font-size:.83rem;font-weight:750;cursor:pointer}
    .model-detail-tabs button.is-active{border-bottom-color:var(--daca-red);color:var(--daca-red-dark)}
    .model-detail-tabs button:hover{background:var(--daca-blue-soft)}
    .model-detail-tabs button:focus-visible{outline:3px solid var(--daca-blue);outline-offset:-3px}
    #model-panel-status{min-width:0}
    .model-editor-form:not(.is-embedded) .editor-actions{position:static}
    @media(max-width:700px){.model-detail-tabs button{min-height:44px;padding:.65rem .8rem;font-size:.72rem}}
    .derived-origin{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.7fr);gap:1.5rem;margin-bottom:1.25rem;border-left:5px solid var(--daca-blue);padding:1.1rem 1.25rem;box-shadow:none}
    .derived-origin h2,.derived-origin p{margin:.2rem 0}.derived-origin>div>p:last-child{color:var(--daca-muted);font-size:.75rem}.derived-origin dl{display:grid;gap:.45rem;margin:0}.derived-origin dl div{display:grid;grid-template-columns:72px minmax(0,1fr);gap:.6rem}.derived-origin dt{color:var(--daca-muted);font-size:.62rem;font-weight:800;text-transform:uppercase}.derived-origin dd{margin:0;overflow-wrap:anywhere;font-size:.7rem}.concept-decision{border-left:4px solid var(--daca-blue);padding:.75rem;background:var(--daca-blue-soft)}.editor-grid .is-hidden{display:none}@media(max-width:820px){.derived-origin{grid-template-columns:1fr}}
  `],
})
export class LogicalModelEditorComponent {
  readonly id = input<string>(); readonly sourceSnapshotId = input<string>();
  readonly physicalSnapshotId = input<string>(); readonly physicalTableId = input<string>();
  readonly embedded = input(false); readonly fieldPanelOnly = input(false); readonly selectedFieldId = input<string>(); readonly modelSaved = output<LogicalModel>();
  readonly identity = inject(DemoIdentityService); readonly catalogApi = inject(CatalogApiService);
  private readonly api = inject(DataModelsApiService); private readonly conceptsApi = inject(I14yConceptsApiService); private readonly assistance = inject(ModelingAssistanceService); private readonly router = inject(Router); private readonly fb = inject(FormBuilder); private readonly injector = inject(Injector);
  readonly model = signal<LogicalModel | null>(null); readonly concepts = signal<readonly I14yConcept[]>([]); readonly loading = signal(false); readonly saving = signal(false); readonly exporting = signal<LogicalModelExportRepresentation | null>(null); readonly error = signal<string | null>(null); readonly saveError = signal<string | null>(null); readonly saveProblem = signal<ModelingApiError | null>(null); readonly errorCopied = signal(false); readonly notice = signal<string | null>(null); readonly etag = signal('');
  readonly validationAttempted = signal(false);
  readonly activeTab = signal<'status' | 'model' | 'fields'>('model');
  readonly selectedFieldIndex = signal(0);
  readonly structureView = signal<'table' | 'relation'>('table');
  readonly canPublishCurrentModel = computed(() => this.identity.canPublishModel(this.model()));
  readonly canEditCurrentModel = computed(() => {
    const current = this.model();
    if (!current) return this.identity.canEditModels();
    return this.identity.canEditModels() && this.modelingScopes().some((scope) => scope.descendantOrganizationIds?.includes(current.office));
  });
  readonly canRemoveFields = computed(() => this.canEditCurrentModel()
    && this.identity.modelingRoles(this.identity.user()).some((role) => role === 'data_owner' || role === 'data_steward'));
  readonly codeLists = computed(() => this.concepts().filter((item) => item.conceptType === 'CodeList'));
  readonly modelingUsers = computed(() => this.identity.users().filter((user) => this.identity.modelingRoles(user).includes('data_owner')));
  readonly deputyUsers = computed(() => this.identity.users().filter((user) => this.identity.modelingRoles(user).includes('deputy_data_owner')));
  readonly departments = signal<readonly FederalOrganization[]>([]);
  readonly offices = signal<readonly FederalOrganization[]>([]);
  readonly divisions = signal<readonly FederalOrganization[]>([]);
  readonly modelingScopes = signal<readonly ModelingScope[]>([]);
  readonly ownerPersonas = signal<readonly ModelingPersona[]>([]);
  readonly deputyPersonas = signal<readonly ModelingPersona[]>([]);
  readonly businessObjects = signal<readonly BusinessObjectTerm[]>([]);
  readonly derivedOrigin = signal<{ source: PhysicalSource; snapshot: PhysicalSnapshot; table: PhysicalTable } | null>(null);
  readonly identifierAvailability = signal<'idle' | 'checking' | 'available' | 'taken'>('idle');
  private manualIdentifier = '';
  private identifierSuffixEdited = false;
  private derivedLoadKey = '';
  readonly termdatOpen = signal(false); readonly termdatLoading = signal(false); readonly termdatSearching = signal(false); readonly termdatResults = signal<readonly TermdatEntry[]>([]); readonly termdatCount = signal<number | null>(null); readonly termdatQuery = signal(''); readonly termdatFeedback = signal<string | null>(null);
  readonly termdatSelection = signal<{ entry: TermdatEntry; targets: readonly ('title' | 'definition')[] } | null>(null);
  readonly termdatAdoption = viewChild<ElementRef<HTMLElement>>('termdatAdoption');
  readonly assistanceNotice = signal<string | null>(null);
  readonly assistanceProvenance = signal<readonly LogicalModelAssistanceProvenance[]>([]);
  readonly translationSuggestions = signal<readonly { field: string; label: string; current: string; suggestion: string; provenance: LogicalModelAssistanceProvenance }[]>([]);
  readonly form = this.fb.group({
    dataset: this.fb.nonNullable.group({ titleDe: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)]], descriptionDe: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(8000)]], titleFr: ['', Validators.maxLength(500)], descriptionFr: ['', Validators.maxLength(8000)], titleIt: ['', Validators.maxLength(500)], descriptionIt: ['', Validators.maxLength(8000)], titleEn: ['', Validators.maxLength(500)], descriptionEn: ['', Validators.maxLength(8000)], titleRm: ['', Validators.maxLength(500)], descriptionRm: ['', Validators.maxLength(8000)], identifiers: ['', [Validators.required, Validators.pattern(LOGICAL_IDENTIFIER_PATTERN)]], identifierMode: false, department: ['vbs', Validators.required], office: 'vbs-armasuisse', division: 'vbs-armasuisse-immobilien', dataDomainId: ['', Validators.required], dataOwnerId: ['', Validators.required], deputyDataOwnerId: '', creatorType: this.fb.nonNullable.control<CreatorType | ''>(''), creatorName: ['', [Validators.pattern(/\S/), Validators.maxLength(255)]], creatorIdentifier: ['', Validators.maxLength(100)], creatorPersonName: ['', Validators.maxLength(255)], classification: this.fb.nonNullable.control<DataClassification>('unclassified'), dateCreated: [new Date().toISOString().slice(0,10), Validators.required] }),
    fields: this.fb.array([this.createField(1)]),
  });
  readonly organizationStewards = computed(() => this.identity.users()
    .filter((user) => user.office === this.selectedOrganizationId()
      && this.identity.modelingRoles(user).includes('data_steward'))
    .map((user) => user.displayName).join(', '));
  get fields(): FormArray<ReturnType<LogicalModelEditorComponent['createField']>> { return this.form.controls.fields; }

  selectedDomain() { return this.catalogApi.domains().find((domain) => domain.id === this.form.controls.dataset.controls.dataDomainId.value) ?? null; }
  fieldConceptReferences() { return this.model()?.fields.flatMap((field) => field.conceptReferences) ?? []; }

  canNavigateOrganization(organization: FederalOrganization): boolean {
    const breadcrumb = organization.breadcrumb.map((item) => item.id);
    return this.modelingScopes().some((scope) =>
      scope.organizationId === organization.id
      || breadcrumb.includes(scope.organizationId)
      || scope.breadcrumb.some((item) => item.id === organization.id),
    );
  }

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
      ['DaCa-Domäne', dataset.dataDomainId],
      ['Fachliches Erstelldatum', dataset.dateCreated],
    ];
    for (const [field, control] of datasetFields) this.addControlIssue(issues, field, control);
    if (dataset.creatorType.value && !dataset.creatorName.value.trim()) {
      issues.push({ field: this.creatorNameLabel(), message: 'Dieses Pflichtfeld ist leer.' });
    }
    if (dataset.creatorType.value === 'internal_organisation' && !dataset.creatorIdentifier.value.trim()) {
      issues.push({ field: 'Organisations-ID', message: 'Dieses Pflichtfeld ist leer.' });
    } else {
      this.addControlIssue(issues, 'Organisations-ID', dataset.creatorIdentifier);
    }

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
      if (controls.physicalColumnId.value && controls.conceptMode.value === 'unresolved') {
        issues.push({ field: `Feld ${number} – I14Y-Entscheid`, message: 'Verknüpfen Sie ein Concept oder bestätigen Sie bewusst, dass keines passt.' });
      }
      if (controls.physicalColumnId.value && controls.conceptMode.value === 'linked' && !controls.conceptIds.value.length) {
        issues.push({ field: `Feld ${number} – I14Y-Entscheid`, message: 'Wählen Sie mindestens ein I14Y-Concept aus.' });
      }
    });
    return issues;
  }

  constructor() {
    this.catalogApi.loadDomains().subscribe({ error: () => undefined });
    this.conceptsApi.search().subscribe({ next: (value) => this.concepts.set(value.items), error: () => undefined });
    this.assistance.organizations('ch-bundesverwaltung').subscribe({ next: (items) => { this.departments.set(items); this.departmentChanged(false); }, error: () => undefined });
    this.assistance.businessObjects().subscribe({ next: (value) => this.businessObjects.set(value.items), error: () => undefined });
    this.assistance.myScopes().subscribe({
      next: (scopes) => {
        this.modelingScopes.set(scopes);
        if (this.id() || this.physicalTableId()) return;
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
    effect(() => { const id = this.id(); if (id) { if (!this.embedded()) this.activeTab.set('status'); this.load(id); } });
    effect(() => {
      const snapshotId = this.physicalSnapshotId() || this.sourceSnapshotId();
      const tableId = this.physicalTableId();
      if (!this.id() && snapshotId && tableId) this.loadDerivedSource(snapshotId, tableId);
    });
    effect(() => {
      const fieldId = this.selectedFieldId();
      if (fieldId) queueMicrotask(() => this.selectFieldById(fieldId));
    });
    effect(() => { this.catalogApi.domains(); this.domainChanged(false); });
    effect(() => {
      if (!this.model()) return;
      if (this.canEditCurrentModel()) this.form.enable({ emitEvent: false });
      else this.form.disable({ emitEvent: false });
    });
    this.form.valueChanges.subscribe(() => {
      if (this.validationAttempted()) this.refreshCrossFieldErrors();
    });
    this.form.controls.dataset.controls.identifiers.valueChanges.pipe(debounceTime(250), distinctUntilChanged()).subscribe(() => this.checkIdentifierAvailability());
    this.form.controls.dataset.controls.titleDe.valueChanges.subscribe((title) => {
      if (this.form.controls.dataset.controls.identifierMode.value && !this.identifierSuffixEdited) {
        this.form.controls.dataset.controls.identifiers.setValue(this.identifierSuggestion(title), { emitEvent: false });
        this.checkIdentifierAvailability();
      }
    });
  }

  domainChanged(markDirty = true): void {
    const domain = this.selectedDomain();
    const controls = this.form.controls.dataset.controls;
    const owner = domain?.ownerUserId ?? '';
    const deputy = domain?.deputyOwnerUserId ?? '';
    if (controls.dataOwnerId.value !== owner) controls.dataOwnerId.setValue(owner, { emitEvent: false });
    if (controls.deputyDataOwnerId.value !== deputy) controls.deputyDataOwnerId.setValue(deputy, { emitEvent: false });
    if (markDirty) this.form.markAsDirty();
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
  identifierModeChanged(): void {
    const controls = this.form.controls.dataset.controls;
    if (controls.identifierMode.value) {
      this.manualIdentifier = controls.identifiers.value;
      this.identifierSuffixEdited = false;
      controls.identifiers.setValue(this.identifierSuggestion(controls.titleDe.value));
    } else {
      controls.identifiers.setValue(this.manualIdentifier);
      this.identifierSuffixEdited = false;
    }
    controls.identifiers.markAsDirty();
    this.checkIdentifierAvailability();
  }
  toggleIdentifierMode(): void {
    const control = this.form.controls.dataset.controls.identifierMode;
    control.setValue(!control.value);
    this.identifierModeChanged();
  }
  identifierChanged(): void {
    if (this.form.controls.dataset.controls.identifierMode.value) this.identifierSuffixEdited = true;
  }
  organizationIdentifierPrefix(): string {
    const controls = this.form.controls.dataset.controls;
    const department = this.departments().find((item) => item.id === controls.department.value);
    const office = this.offices().find((item) => item.id === controls.office.value);
    const division = this.divisions().find((item) => item.id === controls.division.value);
    const parts = [department?.departmentCode?.toLocaleLowerCase('de-CH') || controls.department.value.toLocaleLowerCase('de-CH')]
      .concat(office ? [this.organizationIdentifierPart(office)] : [])
      .concat(division ? [this.organizationIdentifierPart(division)] : [])
      .filter(Boolean);
    return parts.length ? `${parts.join('_')}_` : '';
  }
  private organizationIdentifierPart(organization: FederalOrganization): string {
    const code = (organization.officeCode || organization.displayName).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const parts = code.toLocaleLowerCase('de-CH').split(/[^a-z0-9]+/).filter(Boolean);
    return parts.length > 1 ? parts.map((part) => part[0]).join('') : (parts[0] || '').slice(0, 2);
  }
  private identifierSuggestion(title: string): string {
    return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de-CH').trim().replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
  }
  private effectiveIdentifier(): string {
    const controls = this.form.controls.dataset.controls;
    return `${controls.identifierMode.value ? this.organizationIdentifierPrefix() : ''}${controls.identifiers.value.trim()}`;
  }
  private checkIdentifierAvailability(): void {
    const identifier = this.effectiveIdentifier();
    if (!LOGICAL_IDENTIFIER_PATTERN.test(identifier)) { this.identifierAvailability.set('idle'); return; }
    const check = (this.api as unknown as { checkLogicalModelIdentifier?: (value: string, excludeModelId?: string) => import('rxjs').Observable<{ available: boolean }> }).checkLogicalModelIdentifier;
    if (!check) { this.identifierAvailability.set('idle'); return; }
    this.identifierAvailability.set('checking');
    check.call(this.api, identifier, this.model()?.id).subscribe({
      next: (result) => {
        this.identifierAvailability.set(result.available ? 'available' : 'taken');
        // The live check is an early hint only. PostgreSQL owns the atomic decision, including
        // simultaneous saves, and returns the structured duplicate error that the user can pass
        // to support if a reservation is actually rejected.
        this.setControlError(this.form.controls.dataset.controls.identifiers, 'duplicateIdentifier', false);
      },
      error: () => this.identifierAvailability.set('idle'),
    });
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
  createField(order: number, field?: LogicalField, entity?: LogicalEntity, entityName = 'Entitaet_1') {
    const selection=normalizeFieldConceptSelection(field?.conceptReferences.map((item)=>item.id)??[],field?.primaryConceptId,field?.valueListConcept?.id);
    return this.fb.group({
      id:field?.rootId??'',versionId:field?.versionId??'',entityId:entity?.rootId??'',entityName:[entity?.name??field?.entityName??entityName,[Validators.required,Validators.pattern(LOGICAL_NAME_PATTERN)]],entityBusinessObject:entity?.businessObject??field?.businessObject??'',entityBusinessObjectVersionId:[entity?.businessObjectVersionId??'',Validators.required],entityComment:[entity?.comment??'',Validators.maxLength(4000)],entityOrder:entity?.order??order,name:[field?.name??'',[Validators.required,Validators.pattern(LOGICAL_NAME_PATTERN)]],businessObject:field?.businessObject??'',businessObjectVersionId:[field?.businessObjectVersionId??'',Validators.required],dataType:[field?.dataType??'string',Validators.required],length:[field?.length??null as number|null,Validators.min(1)],precision:[field?.precision??null as number|null,Validators.min(0)],decimalPlaces:[field?.decimalPlaces??null as number|null,Validators.min(0)],order:[field?.order??order,[Validators.required,Validators.min(1)]],nullable:field?.nullable??true,minCount:[field?.minCount??0,Validators.min(0)],maxCount:[field?.maxCount??1 as number|null,Validators.min(1)],classification:this.fb.nonNullable.control<DataClassification>(field?.classification??'unclassified'),sourceSystem:[field?.sourceSystem??'',Validators.maxLength(255)],shortDescription:[field?.shortDescription??'',[Validators.required,Validators.pattern(/\S/),Validators.maxLength(4000)]],comment:[field?.comment??'',Validators.maxLength(4000)],
      conceptIds:this.fb.nonNullable.control<string[]>(selection.conceptIds),primaryConceptId:selection.primaryConceptId??'',valueListConceptId:field?.valueListConcept?.id??'',
      physicalColumnId:this.fb.nonNullable.control(''),physicalColumnName:this.fb.nonNullable.control(''),conceptMode:this.fb.nonNullable.control<'unresolved'|'none'|'linked'>(selection.conceptIds.length?'linked':'none'),
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
    this.selectedFieldIndex.set(this.fields.length - 1);
  }
  addEntity(): void { this.fields.push(this.createField(1, undefined, undefined, `Entitaet_${new Set(this.fields.controls.map((field) => field.controls.entityName.value)).size + 1}`)); this.selectedFieldIndex.set(this.fields.length - 1); }
  selectField(index: number): void { if (index >= 0 && index < this.fields.length) this.selectedFieldIndex.set(index); }
  removeField(index: number): void {
    if (this.fields.length <= 1 || !this.canRemoveFields()) return;
    this.fields.removeAt(index);
    this.selectedFieldIndex.set(Math.min(this.selectedFieldIndex() > index ? this.selectedFieldIndex() - 1 : this.selectedFieldIndex(), this.fields.length - 1));
    this.form.markAsDirty();
  }
  removeSelectedField(): void {
    const field = this.fields.at(this.selectedFieldIndex());
    if (!field || !this.canRemoveFields() || this.fields.length <= 1) return;
    if (!window.confirm(`Logisches Feld «${field.controls.name.value}» entfernen? Die Änderung wird erst mit «Feldmerkmale speichern» wirksam.`)) return;
    this.removeField(this.selectedFieldIndex());
  }
  removeFieldFromGraph(fieldId: string): boolean {
    const current = this.model();
    const index = this.fields.controls.findIndex((field) => field.controls.id.value === fieldId || field.controls.versionId.value === fieldId);
    if (!current || index < 0 || this.loading() || this.saving() || !this.canRemoveFields()
      || this.fields.length <= 1 || current.status === 'retired' || current.status === 'review_pending') return false;
    if (this.form.dirty) {
      this.error.set('Speichern Sie zuerst die ungespeicherten Feldmerkmale.');
      return false;
    }
    const fieldName = this.fields.at(index).controls.name.value;
    if (!window.confirm(`Logisches Feld «${fieldName}» entfernen? Die Änderung wird als neue Modellversion gespeichert.`)) return true;
    this.removeField(index);
    this.save(true);
    return true;
  }
  selectValue(event: Event): string { return (event.target as HTMLSelectElement).value; }
  selectValues(event:Event):string[]{return[...(event.target as HTMLSelectElement).selectedOptions].map((option)=>option.dataset['conceptId']??option.value);}
  conceptName(concept: I14yConcept): string { return concept.name.de || concept.name.fr || concept.identifiers[0] || concept.id; }
  conceptLabel(conceptId:string):string{const concept=this.concepts().find((item)=>item.id===conceptId);if(concept)return`${this.conceptName(concept)} · v${concept.version}`;const reference=this.model()?.fields.flatMap((field)=>field.conceptReferences).find((item)=>item.id===conceptId);return reference?`${reference.name} · v${reference.version}`:conceptId;}
  missingConceptIds(field:ReturnType<LogicalModelEditorComponent['createField']>):string[]{const available=new Set(this.concepts().map((item)=>item.id));return field.controls.conceptIds.value.filter((id)=>!available.has(id));}
  linkedConceptIds(field:ReturnType<LogicalModelEditorComponent['createField']>):string[]{return normalizeFieldConceptSelection(field.controls.conceptIds.value,field.controls.primaryConceptId.value,field.controls.valueListConceptId.value).conceptIds;}
  selectConcepts(index:number,conceptIds:string[]):void{const field=this.fields.at(index);const selection=normalizeFieldConceptSelection(conceptIds,field.controls.primaryConceptId.value,field.controls.valueListConceptId.value);field.controls.conceptIds.setValue(selection.conceptIds);field.controls.primaryConceptId.setValue(selection.primaryConceptId??'');if(field.controls.physicalColumnId.value&&selection.conceptIds.length)field.controls.conceptMode.setValue('linked');for(const conceptId of selection.conceptIds)this.loadCachedConcept(conceptId);field.markAsDirty();}
  selectConcept(index: number, conceptId: string, valueList: boolean): void { if (!conceptId) return; const concept = this.concepts().find((item) => item.id === conceptId); if (valueList && concept?.conceptType !== 'CodeList') return; const field=this.fields.at(index);if(valueList){const selection=normalizeFieldConceptSelection(field.controls.conceptIds.value,field.controls.primaryConceptId.value,conceptId);field.controls.conceptIds.setValue(selection.conceptIds);field.controls.primaryConceptId.setValue(selection.primaryConceptId??'');}this.loadCachedConcept(conceptId);field.markAsDirty(); }
  resetConceptLinks(index:number):void{const field=this.fields.at(index);field.controls.conceptIds.setValue([]);field.controls.primaryConceptId.setValue('');field.controls.valueListConceptId.setValue('');if(field.controls.physicalColumnId.value)field.controls.conceptMode.setValue('unresolved');field.markAsDirty();}
  setDerivedConceptMode(index:number,value:string):void{const field=this.fields.at(index);const mode=value==='linked'?'linked':value==='none'?'none':'unresolved';field.controls.conceptMode.setValue(mode);if(mode!=='linked'){field.controls.conceptIds.setValue([]);field.controls.primaryConceptId.setValue('');field.controls.valueListConceptId.setValue('');}field.markAsDirty();}
  resetPrimaryConcept(index:number):void{const field=this.fields.at(index);field.controls.primaryConceptId.setValue('');field.markAsDirty();}
  resetValueList(index:number):void{const field=this.fields.at(index);const valueList=field.controls.valueListConceptId.value;field.controls.valueListConceptId.setValue('');if(valueList){field.controls.conceptIds.setValue(field.controls.conceptIds.value.filter((id)=>id!==valueList));if(field.controls.primaryConceptId.value===valueList)field.controls.primaryConceptId.setValue('');}field.markAsDirty();}
  downloadExport(model:LogicalModel,representation:LogicalModelExportRepresentation):void{if(this.exporting())return;this.exporting.set(representation);this.error.set(null);this.api.downloadLogicalModelExport(model.id,model.versionId,representation).pipe(finalize(()=>this.exporting.set(null))).subscribe({next:(file)=>this.saveExport(file),error:(error:Error)=>this.error.set(error.message)});}

  selectTab(tab: 'status' | 'model' | 'fields'): void { this.activeTab.set(tab); }
  onTabKeydown(event: KeyboardEvent): void {
    const tabs: Array<'status' | 'model' | 'fields'> = ['status', 'model', 'fields'];
    const current = tabs.indexOf(this.activeTab());
    const next = event.key === 'ArrowRight' ? (current + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    this.selectTab(tabs[next]);
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  load(id: string): void { this.loading.set(true); this.error.set(null); this.api.loadLogicalModel(id).pipe(finalize(() => this.loading.set(false))).subscribe({ next: ({ body }) => { this.model.set(body); this.etag.set(logicalModelVersionEtag(body)); this.patch(body); if (!this.embedded()) this.activeTab.set('status'); }, error: (error: Error) => this.error.set(error.message) }); }
  private loadDerivedSource(snapshotId: string, tableId: string): void {
    const loadKey = `${snapshotId}:${tableId}`;
    if (this.derivedLoadKey === loadKey) return;
    this.derivedLoadKey = loadKey;
    this.loading.set(true);
    this.error.set(null);
    forkJoin({ sources: this.api.listPhysicalSources(), snapshot: this.api.loadPhysicalSnapshot(snapshotId) }).pipe(
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: ({ sources, snapshot }) => {
        const table = snapshot.tables.find((item) => item.id === tableId);
        const source = sources.find((item) => item.id === snapshot.sourceId);
        if (!table || !source) {
          this.error.set('Snapshot und physisches Objekt passen nicht zusammen oder sind in diesem Organisationsscope nicht verfügbar.');
          return;
        }
        this.derivedOrigin.set({ source, snapshot, table });
        const isRealEstate = source.office === 'vbs-armasuisse-immobilien';
        this.form.controls.dataset.patchValue({
          titleDe: this.tableTitle(table),
          descriptionDe: table.comment || `Fachlich zu prüfender Entwurf aus ${snapshot.databaseName}.${table.schemaName}.${table.name}.`,
          identifiers: `derived:${table.stableKey || `${snapshot.databaseName}.${table.schemaName}.${table.name}`}:${snapshot.id}`,
          identifierMode: false,
          department: source.office.startsWith('vbs-') ? 'vbs' : source.department.toLocaleLowerCase('de-CH'),
          office: isRealEstate ? 'vbs-armasuisse' : source.office,
          division: isRealEstate ? source.office : '',
          dataDomainId: '',
          dataOwnerId: '',
          deputyDataOwnerId: '',
          classification: 'internal',
        });
        this.manualIdentifier = this.form.controls.dataset.controls.identifiers.value;
        this.fields.clear();
        for (const [index, column] of table.columns.entries()) {
          const field = this.createField(index + 1, undefined, undefined, this.logicalName(table.name));
          field.patchValue({
            entityName: this.logicalName(table.name),
            entityBusinessObject: '',
            entityBusinessObjectVersionId: '',
            entityComment: table.comment || '',
            entityOrder: 1,
            name: this.logicalName(column.name),
            businessObject: '',
            businessObjectVersionId: '',
            dataType: column.dataType || 'string',
            length: column.length,
            precision: column.precision,
            decimalPlaces: column.scale,
            order: column.ordinalPosition || index + 1,
            nullable: column.nullable,
            minCount: column.nullable ? 0 : 1,
            maxCount: 1,
            classification: 'internal',
            sourceSystem: `${source.name} · ${snapshot.databaseName}.${table.schemaName}.${table.name}`,
            shortDescription: column.comment || `Technisches Feld ${column.name} aus ${table.name}.`,
            comment: column.comment || '',
            physicalColumnId: column.id,
            physicalColumnName: column.name,
            conceptMode: 'unresolved',
          });
          this.fields.push(field);
        }
        this.selectedFieldIndex.set(0);
        this.departmentChanged(false);
        this.form.markAsDirty();
      },
      error: (error: Error) => this.error.set(error.message),
    });
  }
  save(allowIncompleteDraft = false): void {
    if (this.saving() || (this.model() && !this.canEditCurrentModel())) return;
    this.clearServerErrors();
    this.refreshCrossFieldErrors();
    this.form.markAllAsTouched();
    this.validationAttempted.set(true);
    this.saveError.set(null);
    this.saveProblem.set(null);
    this.errorCopied.set(false);
    // The availability lookup is advisory. PostgreSQL remains the atomic authority for duplicate
    // identifiers and supplies the actionable, support-safe problem on a rejected save.
    if (allowIncompleteDraft) {
      const controls = this.fields.at(this.selectedFieldIndex())?.controls;
      if (!controls || [controls.entityName, controls.name, controls.dataType, controls.length, controls.precision, controls.decimalPlaces, controls.order, controls.minCount, controls.maxCount, controls.sourceSystem, controls.shortDescription, controls.comment].some((control) => control.invalid)) return;
    } else if (this.validationIssues().length) {
      if (!this.embedded()) this.activeTab.set(this.validationIssues()[0].field.startsWith('Feld ') ? 'fields' : 'model');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    const current = this.model();
    const value = this.value();
    const origin = this.derivedOrigin();
    const fieldMappings = this.fields.controls.flatMap((field) => field.controls.physicalColumnId.value ? [{
      physicalColumnId: field.controls.physicalColumnId.value,
      entityName: field.controls.entityName.value ?? '',
      logicalFieldName: field.controls.name.value ?? '',
    }] : []);
    const request = current
      ? this.api.updateLogicalModel(current.id, current.versionId, value, this.etag())
      : origin
        ? this.api.deriveLogicalModel(origin.table.id, { logicalModel: value, fieldMappings })
        : this.api.createLogicalModel(value);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: ({ body, etag }) => {
        this.model.set(body);
        this.etag.set(etag);
        this.patch(body);
        this.form.markAsPristine();
        this.validationAttempted.set(false);
        this.notice.set('Der unabhängige Modellentwurf wurde versioniert gespeichert.');
        this.modelSaved.emit(body);
        if (!current && origin) void this.router.navigate(['/models', body.id, 'mappings'], { queryParams: { physicalSnapshotId: origin.snapshot.id, physicalTableId: origin.table.id } });
        else if (!current) void this.router.navigate(['/models', body.id]);
      },
      error: (error: Error) => this.handleSaveError(error),
    });
  }
  canSubmitForReview(): boolean { const current=this.model();return Boolean(current?.status==='draft'&&!this.form.dirty&&!this.form.invalid&&!this.saving()&&this.selectedDomain()&&this.identity.modelingRoles(this.identity.user()).includes('data_steward')); }
  submitBlockedReason(): string | null { const current=this.model();if(!current)return'Zuerst den Entwurf speichern.';if(current.status!=='draft')return'Nur ein Entwurf kann eingereicht werden.';if(this.form.dirty)return'Zuerst die Änderungen als Entwurf speichern.';if(this.form.invalid)return'Zuerst die ungültigen Felder korrigieren und speichern.';if(!this.identity.modelingRoles(this.identity.user()).includes('data_steward'))return'Nur ein Data Steward kann das Modell einreichen.';return null; }
  submitForReview(): void { const current = this.model(); if (!current || !this.canSubmitForReview()) return; this.saving.set(true);this.error.set(null);this.saveError.set(null); this.api.submitLogicalModel(current.id, current.versionId, this.etag()).pipe(finalize(() => this.saving.set(false))).subscribe({ next: ({ body, etag }) => { this.model.set(body); this.etag.set(etag);this.patch(body);this.form.markAsPristine();this.catalogApi.refreshWorkflowTasks(); this.notice.set(`Der Prüfauftrag wurde an ${this.selectedDomain()?.ownerName ?? 'den primären Domain Owner'} übermittelt.`); }, error: (error: Error) => this.error.set(error.message) }); }
  retire(): void { const current = this.model(); if (!current || current.status !== 'published' || !this.canPublishCurrentModel() || !window.confirm(`«${current.title.de || current.identifiers[0]}» stilllegen? Die Versionshistorie bleibt erhalten.`)) return; this.saving.set(true); this.error.set(null); this.api.retireLogicalModel(current.id, current.versionId, this.etag()).pipe(finalize(() => this.saving.set(false))).subscribe({ next: ({ body, etag }) => { this.model.set(body); this.etag.set(etag); this.notice.set('Das Modell wurde stillgelegt; die Versionshistorie bleibt erhalten.'); }, error: (error: Error) => this.error.set(error.message) }); }
  private patch(model: LogicalModel): void {
    const persistedIdentifier = model.identifiers[0] ?? '';
    const knownPrefix = model.office === 'vbs-armasuisse-immobilien' ? 'vbs_ar_ai_' : model.office === 'vbs-armasuisse' ? 'vbs_ar_' : `${model.department.toLocaleLowerCase('de-CH')}_`;
    const identifierSuffix = model.identifierMode === 'organization_derived' && persistedIdentifier.startsWith(knownPrefix)
      ? persistedIdentifier.slice(knownPrefix.length) : persistedIdentifier;
    this.manualIdentifier = persistedIdentifier;
    this.identifierSuffixEdited = false;
    this.form.controls.dataset.patchValue({
      titleDe:model.title.de,descriptionDe:model.description.de,titleFr:model.title.fr,descriptionFr:model.description.fr,titleIt:model.title.it,descriptionIt:model.description.it,titleEn:model.title.en,descriptionEn:model.description.en,titleRm:model.title.rm??'',descriptionRm:model.description.rm??'',
      identifiers:identifierSuffix,identifierMode:model.identifierMode==='organization_derived',department:model.office.startsWith('vbs-armasuisse')?'vbs':model.department,office:model.office==='vbs-armasuisse-immobilien'?'vbs-armasuisse':model.office,division:model.office==='vbs-armasuisse-immobilien'?model.office:'',dataDomainId:model.dataDomain.id,dataOwnerId:model.dataOwner.id,deputyDataOwnerId:model.deputyDataOwner?.id??'',
      creatorType:model.creator?.type??'',...this.creatorFormValue(model.creator),classification:model.classification,dateCreated:model.dateCreated,
    });
    this.fields.clear();
    if (model.entities.length) {
      for (const entity of model.entities) for (const field of entity.fields) this.fields.push(this.createField(field.order, field, entity));
    } else {
      for (const field of model.fields) this.fields.push(this.createField(field.order, field));
    }
    if (!model.fields.length) this.fields.push(this.createField(1));
    this.selectFieldById(this.selectedFieldId());
    this.departmentChanged(false); this.scopeChanged();
    this.assistanceProvenance.set(model.assistanceProvenance ?? []);
    this.form.markAsPristine();
  }
  private selectFieldById(fieldId: string | undefined): void {
    if (!fieldId) { this.selectedFieldIndex.set(Math.min(this.selectedFieldIndex(), Math.max(0, this.fields.length - 1))); return; }
    const index = this.fields.controls.findIndex((field) => [field.controls.id.value, field.controls.versionId.value].includes(fieldId));
    if (index >= 0) this.selectedFieldIndex.set(index);
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
        dataType: field.dataType ?? 'string',
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
        conceptMatchExplicitlyNone: Boolean(field.physicalColumnId && field.conceptMode === 'none'),
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
      identifiers: [this.effectiveIdentifier()],
      identifierMode: dataset.identifierMode ? 'organization_derived' : 'manual',
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
      default: return 'Ersteller';
    }
  }
  private refreshCrossFieldErrors(): void {
    const namesByEntity = new Map<string, Array<ReturnType<LogicalModelEditorComponent['createField']>>>();
    for (const field of this.fields.controls) {
      const controls = field.controls;
      this.setControlError(controls.maxCount, 'countRange', controls.maxCount.value !== null && controls.maxCount.value < (controls.minCount.value ?? 0));
      this.setControlError(controls.name, 'duplicateFieldName', false);
      const entity = (controls.entityName.value ?? '').trim().toLocaleLowerCase();
      const name = (controls.name.value ?? '').trim().toLocaleLowerCase();
      if (entity && name) namesByEntity.set(`${entity}\u0000${name}`, [...(namesByEntity.get(`${entity}\u0000${name}`) ?? []), field]);
    }
    for (const duplicates of namesByEntity.values()) {
      if (duplicates.length > 1) for (const field of duplicates) this.setControlError(field.controls.name, 'duplicateFieldName', true);
    }
  }

  private setControlError(control: AbstractControl, key: string, active: boolean, value: unknown = true): void {
    const errors = { ...(control.errors ?? {}) };
    if (active) errors[key] = value; else delete errors[key];
    control.setErrors(Object.keys(errors).length ? errors : null, { emitEvent: false });
  }

  private clearServerErrors(): void {
    const clear = (control: AbstractControl): void => {
      this.setControlError(control, 'server', false);
      const children = (control as { controls?: AbstractControl[] | Record<string, AbstractControl> }).controls;
      if (Array.isArray(children)) children.forEach(clear);
      else if (children) Object.values(children).forEach(clear);
    };
    clear(this.form);
  }

  private handleSaveError(error: Error): void {
    this.saveError.set(error.message);
    if (!(error instanceof ModelingApiError)) return;
    this.saveProblem.set(error);
    this.errorCopied.set(false);
    if (!error.issues.length) return;
    this.validationAttempted.set(true);
    for (const issue of error.issues) {
      const control = this.controlForServerLocation(issue.location);
      if (control) {
        this.setControlError(control, 'server', true, issue.message);
        control.valueChanges.pipe(take(1)).subscribe(() => this.setControlError(control, 'server', false));
      }
    }
  }

  private controlForServerLocation(location: string): AbstractControl | null {
    const normalized = location.replace(/^body\./, '').replace(/^identifiers\.\d+$/, 'identifiers');
    const dataset = this.form.controls.dataset.controls;
    const direct: Record<string, AbstractControl> = {
      identifiers: dataset.identifiers,
      dataDomainId: dataset.dataDomainId,
      dataOwnerUserId: dataset.dataOwnerId,
      deputyOwnerUserId: dataset.deputyDataOwnerId,
      organizationUnitId: dataset.division.value ? dataset.division : dataset.office,
      dataClassification: dataset.classification,
      dateCreated: dataset.dateCreated,
      creator: dataset.creatorName,
    };
    if (direct[normalized]) return direct[normalized];
    const localization = /^localizations\.(\d+)\.(title|description)$/.exec(normalized);
    if (localization) {
      const index = Number(localization[1]);
      const language = ['De', 'Fr', 'It', 'En', 'Rm'][index] ?? 'De';
      return dataset[`${localization[2]}${language}` as keyof typeof dataset] ?? null;
    }
    const fieldMatch = /^entities\.\d+\.fields\.(\d+)\.(\w+)$/.exec(normalized);
    if (fieldMatch) {
      const field = this.fields.at(Number(fieldMatch[1]));
      const fieldKey = ({ position: 'order', valueListConceptId: 'valueListConceptId', conceptIds: 'conceptIds' } as Record<string,string>)[fieldMatch[2]] ?? fieldMatch[2];
      return field?.controls[fieldKey as keyof typeof field.controls] ?? null;
    }
    const entityMatch = /^entities\.(\d+)\.(name|businessObjectVersionId)$/.exec(normalized);
    if (entityMatch) {
      const field = this.fields.at(Number(entityMatch[1]));
      return entityMatch[2] === 'name' ? field?.controls.entityName ?? null : field?.controls.entityBusinessObjectVersionId ?? null;
    }
    return null;
  }

  private addControlIssue(issues: LogicalModelValidationIssue[], field: string, control: AbstractControl, patternMessage?: string): void {
    if (!control.invalid) return;
    const errors = control.errors ?? {};
    if (errors['server']) issues.push({ field, message: String(errors['server']) });
    else if (errors['duplicateIdentifier']) issues.push({ field, message: 'Jeder Identifier darf nur einmal vorkommen.' });
    else if (errors['duplicateFieldName']) issues.push({ field, message: 'Feldnamen müssen innerhalb der Entität eindeutig sein.' });
    else if (errors['countRange']) issues.push({ field, message: 'Der Wert muss grösser oder gleich minCount sein.' });
    else if (errors['required']) issues.push({ field, message: 'Dieses Pflichtfeld ist leer.' });
    else if (errors['maxlength']) issues.push({ field, message: `Der Wert darf höchstens ${errors['maxlength'].requiredLength} Zeichen lang sein.` });
    else if (errors['min']) issues.push({ field, message: `Der Wert muss mindestens ${errors['min'].min} sein.` });
    else if (errors['max']) issues.push({ field, message: `Der Wert darf höchstens ${errors['max'].max} sein.` });
    else if (errors['pattern']) issues.push({ field, message: patternMessage ?? 'Der Wert darf nicht leer sein oder nur aus Leerzeichen bestehen.' });
    else issues.push({ field, message: 'Der Wert ist ungültig.' });
  }
  saveProblemTitle(problem: ModelingApiError): string {
    if (problem.kind === 'validation') return 'Bitte Eingaben korrigieren';
    if (problem.status === 412 || problem.status === 428) return 'Aktualisierte Version vorhanden';
    if (problem.errorCode === 'DACA-LM-IDENTIFIER-DUPLICATE') return 'Identifier bereits vergeben';
    return 'Speichern nicht möglich';
  }
  supportErrorCode(problem: ModelingApiError): string { return problem.errorCode || (problem.kind === 'validation' ? 'DACA-LM-CLIENT-VALIDATION' : 'DACA-LM-UNCLASSIFIED'); }
  focusIssue(issue?: LogicalModelValidationIssue): void {
    const datasetControl: Record<string, string> = {
      'Titel (Deutsch)': 'titleDe', 'Beschreibung (Deutsch)': 'descriptionDe',
      'Titel (Französisch)': 'titleFr', 'Beschreibung (Französisch)': 'descriptionFr',
      'Titel (Italienisch)': 'titleIt', 'Beschreibung (Italienisch)': 'descriptionIt',
      'Titel (Englisch)': 'titleEn', 'Beschreibung (Englisch)': 'descriptionEn',
      'Titel (Rätoromanisch)': 'titleRm', 'Beschreibung (Rätoromanisch)': 'descriptionRm',
      'Identifier': 'identifiers', 'Departement': 'department', 'DaCa-Domäne': 'dataDomainId',
      'Fachliches Erstelldatum': 'dateCreated', 'Applikationsname': 'creatorName',
      'Englischer Name': 'creatorName', 'User-ID': 'creatorName', 'Organisationsname': 'creatorName',
      'Organisations-ID': 'creatorIdentifier',
    };
    const fieldControl: Record<string, string> = {
      'Entität': 'entityName', 'Geschäftsobjekt der Entität': 'entityBusinessObjectVersionId',
      'Entitätskommentar': 'entityComment', 'Feldname': 'name', 'Geschäftsobjekt': 'businessObjectVersionId',
      'Datentyp': 'dataType', 'Länge': 'length', 'Precision': 'precision',
      'Dezimalstellen / Scale': 'decimalPlaces', 'Reihenfolge': 'order', 'minCount': 'minCount',
      'maxCount': 'maxCount', 'System': 'sourceSystem', 'Kurzbeschreibung': 'shortDescription', 'Kommentar': 'comment',
    };
    const fieldMatch = /^Feld (\d+) [^A-Za-z0-9]+ (.+)$/.exec(issue?.field ?? '');
    const selector = issue && datasetControl[issue.field]
      ? `[formcontrolname="${datasetControl[issue.field]}"]`
      : fieldMatch && fieldControl[fieldMatch[2]]
        ? `.field-list fieldset:nth-of-type(${fieldMatch[1]}) [formcontrolname="${fieldControl[fieldMatch[2]]}"]`
        : '.model-editor-form .ng-invalid';
    const targetTab = fieldMatch ? 'fields' : 'model';
    const focus = () => {
      const target = document.querySelector<HTMLElement>(selector);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    };
    if (!this.embedded() && this.activeTab() !== targetTab) {
      this.activeTab.set(targetTab);
      afterNextRender(focus, { injector: this.injector });
    } else {
      focus();
    }
  }
  async copyErrorMessage(problem: ModelingApiError): Promise<void> {
    const technical = problem.technicalDetails;
    const message = [
      `Fehlercode: ${this.supportErrorCode(problem)}`,
      `HTTP-Status: ${problem.status}`,
      `Request-ID: ${problem.requestId || 'nicht verfügbar'}`,
      `Meldung: ${problem.message}`,
      problem.suggestedAction ? `Empfohlene Aktion: ${problem.suggestedAction}` : '',
      technical ? `Technik: ${technical.category}; SQLSTATE=${technical.sqlState}; Constraint=${technical.constraint}; Zeitpunkt=${technical.timestamp}` : '',
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard?.writeText(message);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    this.errorCopied.set(true);
  }
  private localizedValue(target: 'title' | 'description', language: string): string { const key = `${target}${language[0].toUpperCase()}${language.slice(1)}`; const c=this.form.controls.dataset.controls; switch(key){case'titleFr':return c.titleFr.value;case'titleIt':return c.titleIt.value;case'titleEn':return c.titleEn.value;case'titleRm':return c.titleRm.value;case'descriptionFr':return c.descriptionFr.value;case'descriptionIt':return c.descriptionIt.value;case'descriptionEn':return c.descriptionEn.value;case'descriptionRm':return c.descriptionRm.value;default:return'';} }
  private setLocalizedValue(field: string, value: string): void { const c=this.form.controls.dataset.controls; switch(field){case'titleFr':c.titleFr.setValue(value);c.titleFr.markAsDirty();break;case'titleIt':c.titleIt.setValue(value);c.titleIt.markAsDirty();break;case'titleEn':c.titleEn.setValue(value);c.titleEn.markAsDirty();break;case'titleRm':c.titleRm.setValue(value);c.titleRm.markAsDirty();break;case'descriptionFr':c.descriptionFr.setValue(value);c.descriptionFr.markAsDirty();break;case'descriptionIt':c.descriptionIt.setValue(value);c.descriptionIt.markAsDirty();break;case'descriptionEn':c.descriptionEn.setValue(value);c.descriptionEn.markAsDirty();break;case'descriptionRm':c.descriptionRm.setValue(value);c.descriptionRm.markAsDirty();break;} }
  private loadCachedConcept(conceptId:string):void{this.conceptsApi.load(conceptId).subscribe({next:(detail)=>this.concepts.update((items)=>items.some((item)=>item.id===detail.id)?items.map((item)=>item.id===detail.id?detail:item):[...items,detail]),error:()=>undefined});}
  knownDataType(value:string|null):boolean{return Boolean(value&&['string','integer','decimal','date','datetime','boolean','time','uuid','json','binary','array'].includes(value));}
  private tableTitle(table:PhysicalTable):string{return table.name.toLocaleUpperCase('de-CH')===table.name?table.name:table.name.split(/[_-]+/).map((part)=>part.charAt(0).toLocaleUpperCase('de-CH')+part.slice(1)).join(' ');}
  private logicalName(value:string):string{const normalized=value.trim().replace(/[^A-Za-z0-9_.-]+/g,'_');return /^[A-Za-z_]/.test(normalized)?normalized:`_${normalized}`;}
  private saveExport(file:LogicalModelExportFile):void{const objectUrl=URL.createObjectURL(file.blob);const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=file.filename;anchor.hidden=true;document.body.append(anchor);try{anchor.click();this.notice.set(`${file.filename} wurde heruntergeladen.`);}finally{anchor.remove();URL.revokeObjectURL(objectUrl);}}
  private creatorFormValue(creator:LogicalModelCreator|null):{creatorName:string;creatorIdentifier:string;creatorPersonName:string}{if(!creator)return{creatorName:'',creatorIdentifier:'',creatorPersonName:''};switch(creator.type){case'application':return{creatorName:creator.applicationName,creatorIdentifier:'',creatorPersonName:''};case'internal_organisation':return{creatorName:creator.englishName,creatorIdentifier:creator.organizationId,creatorPersonName:''};case'internal_person':return{creatorName:creator.userId,creatorIdentifier:'',creatorPersonName:''};case'external_organisation_or_person':return{creatorName:creator.organizationName,creatorIdentifier:'',creatorPersonName:creator.personName??''};}}
  private creatorValue(type:CreatorType|'',name:string,identifier:string,personName:string):LogicalModelCreator|null{switch(type){case'application':return{type,applicationName:name.trim()};case'internal_organisation':return{type,organizationId:identifier.trim(),englishName:name.trim()};case'internal_person':return{type,userId:name.trim()};case'external_organisation_or_person':return{type,organizationName:name.trim(),personName:personName.trim()||null};default:return null;}}
}
