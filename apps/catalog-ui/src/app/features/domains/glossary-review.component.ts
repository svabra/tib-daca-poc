import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { GlossaryTermProposal, SemanticSuggestion } from '../../core/catalog.models';
import { canDecideGlossaryProposal, canEditGlossaryProposal, relatedConceptIsComplete } from './domain-review-policy';

@Component({selector:'daca-glossary-review',standalone:true,imports:[ReactiveFormsModule,RouterLink,StatusBadgeComponent],changeDetection:ChangeDetectionStrategy.OnPush,template:`
  <a routerLink="/domains/governance">← Domänen &amp; Konzepte</a>
  <section class="daca-page-heading"><div><p class="daca-eyebrow">Terminology-Governance</p><h1>Termvorschlag prüfen</h1><p>Bearbeitungen erzeugen eine neue Vorschlagsrevision und setzen frühere Freigaben zurück.</p></div></section>
  @if(message()){<p class="daca-alert" [class.is-error]="messageTone()==='error'" [attr.role]="messageTone()==='error'?'alert':'status'">{{message()}}</p>}
  @if(loading()){<div class="daca-card review-state">Vorschlag wird geladen …</div>}
  @else if(proposal();as item){
    <section class="daca-card similarity-panel" aria-labelledby="similarity-title"><div class="daca-card-header"><div><p class="daca-eyebrow">Regelbasiert · PoC</p><h2 id="similarity-title">Ähnlichkeitshinweise</h2></div></div><div class="daca-card-body">@if(suggestionsLoading()){<p>Ähnliche Domains und Terme werden gesucht …</p>}@else if(suggestions().length){<ul>@for(suggestion of suggestions();track suggestion.kind+suggestion.id){<li><strong>{{suggestion.label}}</strong><span>{{suggestion.score}} % · {{suggestion.reason}}</span></li>}</ul>}@else{<p>Keine ausreichend ähnlichen aktiven Konzepte gefunden.</p>}<small>Die Hinweise entscheiden nicht und verändern den Review-Entwurf nicht.</small></div></section>
    <div class="review-layout"><form class="daca-card" [formGroup]="form" (ngSubmit)="saveDraft()"><div class="daca-card-header"><div><p class="daca-eyebrow">Gemeinsamer Review-Entwurf</p><h2>Begriff & Bedeutung</h2></div><daca-status-badge tone="blue">Revision {{item.revision}}</daca-status-badge></div><div class="daca-card-body">@if(!isOpen()){<p id="review-readonly-hint" class="review-readonly-hint">Dieser Vorschlag ist abgeschlossen. Der geprüfte Review-Stand wird schreibgeschützt angezeigt.</p>}@else if(!canEdit()){<p id="review-readonly-hint" class="review-readonly-hint">Sie können diesen Review-Entwurf ansehen. Bearbeiten dürfen nur die zuständigen Data Owners und ihre Stellvertretungen.</p>}<fieldset class="review-form" [disabled]="!canEdit()||!isOpen()" [attr.aria-describedby]="!canEdit()||!isOpen()?'review-readonly-hint':null"><legend class="review-form-legend">Begriff und Bedeutung bearbeiten</legend><label>Deutscher Begriff *<input formControlName="labelDe" required aria-required="true"></label><label>Deutsche Synonyme & Abkürzungen<input formControlName="alternativeLabelsDe" placeholder="kommagetrennt"></label><label>Deutsche Definition *<textarea rows="4" formControlName="definitionDe" required aria-required="true"></textarea></label><label>Englischer Begriff<input formControlName="labelEn"></label><label>English synonyms & abbreviations<input formControlName="alternativeLabelsEn" placeholder="comma-separated"></label><label>Englische Definition<textarea rows="4" formControlName="definitionEn"></textarea></label><label>Semantische Zusatzrelation<select formControlName="semanticMode"><option value="same_concept">Keine externe Relation ändern</option><option value="related_concept">Externe SKOS-Relation ergänzen oder bearbeiten</option></select></label>@if(form.controls.semanticMode.value==='related_concept'){<label>SKOS-Relation<select formControlName="relationType"><option value="exactMatch">exactMatch</option><option value="closeMatch">closeMatch</option><option value="broader">broader</option><option value="narrower">narrower</option><option value="related">related</option></select></label><label>Ziel-URI *<input formControlName="relationTargetUri" placeholder="urn:daca:glossary-term:…">@if(!form.controls.relationTargetUri.value.trim()){<small>Für eine neue oder externe SKOS-Relation ist eine Ziel-URI erforderlich. Bereits verknüpfte Relationen bleiben erhalten.</small>}</label>}<button class="daca-button is-secondary" type="submit" [disabled]="!reviewFormValid()||saving()||!canEdit()||!isOpen()">Review-Entwurf speichern</button></fieldset></div></form>
    <aside class="daca-card"><div class="daca-card-header"><h2>Freigaben</h2><daca-status-badge [tone]="item.status==='accepted'?'green':item.status==='rejected'?'red':'orange'">{{item.status}}</daca-status-badge></div><div class="daca-card-body"><p>Nur der primäre Data Owner einer Domain darf für diese Domain entscheiden. Stellvertretungen können den Entwurf bearbeiten.</p><ol class="review-list">@for(review of item.reviews;track review.id){<li><div><strong>{{review.domainLabel}}</strong><span>{{review.ownerName}}</span></div><daca-status-badge [tone]="review.status==='approved'?'green':review.status==='rejected'?'red':'orange'">{{review.status}}</daca-status-badge></li>}</ol>@if(canDecide()&&isOpen()){<label class="decision-comment">Entscheidkommentar<textarea rows="3" [value]="decisionComment()" (input)="decisionComment.set(inputValue($event))"></textarea></label><div class="decision-actions"><button class="daca-button" type="button" [disabled]="saving()" (click)="decide('approve')">Für meine Domain genehmigen</button><button class="daca-button is-secondary" type="button" [disabled]="saving()||!decisionComment().trim()" (click)="decide('reject')">Ablehnen</button></div>}</div></aside></div>
  }
`,styles:[`.review-state{padding:2rem}.review-layout{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(18rem,.8fr);gap:1rem}.review-form{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:0;padding:0;border:0;min-inline-size:0}.review-form-legend{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.review-readonly-hint{margin:0 0 1rem;padding:.75rem;background:#f2f6f8;border-left:3px solid #006699}.review-form label,.decision-comment{display:grid;gap:.35rem;font-weight:700}.review-form label:nth-child(2),.review-form label:nth-child(4){grid-column:auto}.review-form button{justify-self:start}.review-list{list-style:none;padding:0}.review-list li{display:flex;justify-content:space-between;align-items:center;padding:.75rem 0;border-bottom:1px solid #d5d8dc}.review-list li div{display:grid}.review-list span{color:#606970}.decision-comment{margin-top:1rem}.decision-actions{display:grid;gap:.5rem;margin-top:1rem}@media(max-width:850px){.review-layout,.review-form{grid-template-columns:1fr}}`]})
export class GlossaryReviewComponent {
  private readonly api=inject(CatalogApiService); private readonly route=inject(ActivatedRoute); private readonly identity=inject(DemoIdentityService); private readonly fb=inject(FormBuilder);
  readonly proposal=signal<GlossaryTermProposal|null>(null);readonly loading=signal(true);readonly saving=signal(false);readonly message=signal('');readonly messageTone=signal<'info'|'error'>('info');readonly decisionComment=signal('');readonly suggestions=signal<readonly SemanticSuggestion[]>([]);readonly suggestionsLoading=signal(false);
  readonly form=this.fb.nonNullable.group({labelDe:['',Validators.required],alternativeLabelsDe:[''],definitionDe:['',Validators.required],labelEn:[''],alternativeLabelsEn:[''],definitionEn:[''],semanticMode:['same_concept' as 'same_concept'|'related_concept'],relationType:['broader'],relationTargetUri:['']});
  readonly canEdit=computed(()=>canEditGlossaryProposal(this.proposal(),this.api.domains(),this.identity.userId()));
  readonly canDecide=computed(()=>canDecideGlossaryProposal(this.proposal(),this.identity.userId()));
  constructor(){this.load();}
  load():void{this.loading.set(true);this.api.loadGlossaryTermProposal(this.route.snapshot.paramMap.get('id')??'').pipe(finalize(()=>this.loading.set(false))).subscribe({next:(item)=>{this.proposal.set(item);this.applyPayload(item);if(item.sourceProductId){this.suggestionsLoading.set(true);this.api.loadSemanticSuggestions(item.sourceProductId).pipe(finalize(()=>this.suggestionsLoading.set(false))).subscribe({next:(suggestions)=>this.suggestions.set(suggestions),error:()=>this.suggestions.set([])});}},error:()=>{this.messageTone.set('error');this.message.set('Der Termvorschlag konnte nicht geladen werden.');}});}
  isOpen():boolean{return ['submitted','in_review'].includes(this.proposal()?.status??'');}
  inputValue(event:Event):string{return(event.target as HTMLTextAreaElement).value;}
  reviewFormValid():boolean{const value=this.form.getRawValue();const englishComplete=Boolean(value.labelEn.trim())===Boolean(value.definitionEn.trim());return this.form.valid&&englishComplete&&relatedConceptIsComplete(value.semanticMode,value.relationTargetUri);}
  saveDraft():void{const item=this.proposal();if(!item||!this.isOpen()||!this.reviewFormValid()||!this.canEdit())return;this.saving.set(true);this.api.updateGlossaryTermProposal(item,this.payload()).pipe(finalize(()=>this.saving.set(false))).subscribe({next:(updated)=>{this.proposal.set(updated);this.form.markAsPristine();this.messageTone.set('info');this.message.set(`Review-Revision ${updated.revision} gespeichert. Vorherige Freigaben wurden zurückgesetzt.`);},error:(error)=>{this.messageTone.set('error');this.message.set(error?.error?.detail??'Der Review-Entwurf konnte nicht gespeichert werden.');}});}
  decide(decision:'approve'|'reject'):void{const item=this.proposal();const review=item?.reviews.find((candidate)=>candidate.ownerUserId===this.identity.userId()&&candidate.status==='pending');if(!item||!review||(decision==='reject'&&!this.decisionComment().trim()))return;this.saving.set(true);this.api.decideGlossaryTermProposal(item,review.domainId,decision,this.decisionComment().trim()||'Fachlich geprüft.').pipe(finalize(()=>this.saving.set(false))).subscribe({next:(updated)=>{this.proposal.set(updated);this.messageTone.set('info');this.message.set(decision==='approve'?(updated.status==='accepted'?'Alle Domain-Freigaben liegen vor. Der Term wurde akzeptiert.':updated.status==='stale'?'Der Vorschlag ist wegen einer inzwischen nicht mehr aktiven Domain veraltet. Der Antragsteller wurde über den manuellen nächsten Schritt informiert.':'Freigabe gespeichert. Der Term wird erst nach allen Domain-Freigaben akzeptiert.'):'Der Vorschlag wurde abgelehnt.');},error:(error)=>{this.messageTone.set('error');this.message.set(error?.error?.detail??'Der Entscheid konnte nicht gespeichert werden.');}});}
  private payload():Record<string,unknown>{const current=this.proposal();const currentPayload=current?(Object.keys(current.reviewPayload).length?current.reviewPayload:current.requestedPayload):{};return buildGlossaryReviewPayload(currentPayload,current?.reviews.map((review)=>review.domainId)??[],this.form.getRawValue());}
  private applyPayload(item:GlossaryTermProposal):void{const payload=Object.keys(item.reviewPayload).length?item.reviewPayload:item.requestedPayload;const labels=Array.isArray(payload['localizations'])?payload['localizations'] as Array<Record<string,unknown>>:[];const relations=Array.isArray(payload['relations'])?payload['relations'] as Array<Record<string,unknown>>:[];const relation=relations.find((item)=>typeof item['targetUri']==='string'&&Boolean(String(item['targetUri']).trim()));const de=labels.find((label)=>languageFamily(label)==='de');const en=labels.find((label)=>languageFamily(label)==='en');this.form.reset({labelDe:String(de?.['preferredLabel']??''),alternativeLabelsDe:alternativeLabels(de).join(', '),definitionDe:String(de?.['definition']??''),labelEn:String(en?.['preferredLabel']??''),alternativeLabelsEn:alternativeLabels(en).join(', '),definitionEn:String(en?.['definition']??''),semanticMode:relation?'related_concept':'same_concept',relationType:String(relation?.['relation']??'broader'),relationTargetUri:String(relation?.['targetUri']??'')});}
}

interface GlossaryReviewFormValue {
  labelDe: string;
  alternativeLabelsDe: string;
  definitionDe: string;
  labelEn: string;
  alternativeLabelsEn: string;
  definitionEn: string;
  semanticMode: 'same_concept' | 'related_concept';
  relationType: string;
  relationTargetUri: string;
}

export function buildGlossaryReviewPayload(
  currentPayload: Record<string, unknown>,
  reviewDomainIds: readonly string[],
  value: GlossaryReviewFormValue,
): Record<string, unknown> {
  const currentLocalizations = Array.isArray(currentPayload['localizations'])
    ? currentPayload['localizations'].filter(isRecord)
    : [];
  const localizations = currentLocalizations
    .filter((localization) => !(['de', 'en'].includes(languageFamily(localization)) && !localizationsComplete(languageFamily(localization), value)))
    .map((localization) => {
      const family = languageFamily(localization);
      if (family === 'de') return {
        ...localization,
        preferredLabel: value.labelDe.trim(),
        alternativeLabels: commaSeparatedValues(value.alternativeLabelsDe),
        definition: value.definitionDe.trim(),
      };
      if (family === 'en') return {
        ...localization,
        preferredLabel: value.labelEn.trim(),
        alternativeLabels: commaSeparatedValues(value.alternativeLabelsEn),
        definition: value.definitionEn.trim(),
      };
      return { ...localization };
    });
  if (!localizations.some((localization) => languageFamily(localization) === 'de')) {
    localizations.push({ language: 'de', preferredLabel: value.labelDe.trim(), alternativeLabels: commaSeparatedValues(value.alternativeLabelsDe), definition: value.definitionDe.trim() });
  }
  if (value.labelEn.trim() && value.definitionEn.trim() && !localizations.some((localization) => languageFamily(localization) === 'en')) {
    localizations.push({ language: 'en', preferredLabel: value.labelEn.trim(), alternativeLabels: commaSeparatedValues(value.alternativeLabelsEn), definition: value.definitionEn.trim() });
  }

  const relations = Array.isArray(currentPayload['relations'])
    ? currentPayload['relations'].filter(isRecord).map((relation) => ({ ...relation }))
    : [];
  if (value.semanticMode === 'related_concept' && value.relationTargetUri.trim()) {
    const externalIndex = relations.findIndex((relation) => typeof relation['targetUri'] === 'string' && Boolean(String(relation['targetUri']).trim()));
    const updatedRelation = {
      ...(externalIndex >= 0 ? relations[externalIndex] : {}),
      relation: value.relationType,
      targetUri: value.relationTargetUri.trim(),
    };
    if (externalIndex >= 0) relations[externalIndex] = updatedRelation;
    else relations.push(updatedRelation);
  }

  return {
    ...currentPayload,
    domainIds: Array.isArray(currentPayload['domainIds']) ? currentPayload['domainIds'] : [...reviewDomainIds],
    localizations,
    relations,
  };
}

function localizationsComplete(family: string, value: GlossaryReviewFormValue): boolean {
  if (family === 'de') return Boolean(value.labelDe.trim() && value.definitionDe.trim());
  if (family === 'en') return Boolean(value.labelEn.trim() && value.definitionEn.trim());
  return true;
}

function languageFamily(localization: Record<string, unknown>): string {
  return String(localization['language'] ?? '').toLocaleLowerCase().split('-')[0];
}

function alternativeLabels(localization: Record<string, unknown> | undefined): string[] {
  return Array.isArray(localization?.['alternativeLabels'])
    ? localization['alternativeLabels'].map(String)
    : [];
}

function commaSeparatedValues(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
