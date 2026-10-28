import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DomainSummary } from '../../core/catalog.models';

@Component({selector:'daca-domain-metadata-dialog',standalone:true,imports:[FormsModule],changeDetection:ChangeDetectionStrategy.OnPush,template:`
  <dialog aria-labelledby="domain-metadata-title" (cancel)="$event.preventDefault();close()">
    <form #form="ngForm" (ngSubmit)="save()">
      <header><h2 id="domain-metadata-title">{{i18n.t('editDomainMetadata')}}</h2><button class="daca-button is-secondary" type="button" [disabled]="busy()" [attr.aria-label]="i18n.t('cancelDomainEdit')" (click)="close()">×</button></header>
      @if(error()){<p class="daca-alert is-error" role="alert">{{error()}}</p>}
      @for(label of labels();track label.language){<fieldset [disabled]="busy()"><legend>{{label.language.toUpperCase()}}</legend><label>{{i18n.t('domainName')}} *<input [name]="'name-'+label.language" [(ngModel)]="label.preferredLabel" required maxlength="255"></label><label>{{i18n.t('domainDescription')}} *<textarea [name]="'description-'+label.language" [(ngModel)]="label.definition" required rows="4"></textarea></label></fieldset>}
      <footer><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="close()">{{i18n.t('cancelDomainEdit')}}</button><button class="daca-button" type="submit" [disabled]="busy()||form.invalid">{{i18n.t('saveDomainEdit')}}</button></footer>
    </form>
  </dialog>`,styles:[`dialog{box-sizing:border-box;width:min(44rem,calc(100vw - 2rem));max-height:90vh;overflow:auto;border:1px solid var(--daca-border);padding:1.25rem;color:var(--daca-text);background:var(--daca-surface,#fff)}dialog::backdrop{background:#0007}header,footer{display:flex;align-items:center;justify-content:space-between;gap:1rem}h2{margin:0}fieldset{display:grid;gap:1rem;margin:1rem 0;padding:1rem;border:1px solid var(--daca-border)}legend{font-weight:700}label{display:grid;gap:.4rem;font-weight:700}input,textarea{box-sizing:border-box;width:100%;padding:.65rem;border:1px solid var(--daca-border-strong);font:inherit}footer{justify-content:flex-end}@media(max-width:500px){dialog{padding:1rem}footer{flex-wrap:wrap}}`]})
export class DomainMetadataDialogComponent {
  readonly domain=input.required<DomainSummary>();readonly saved=output<DomainSummary>();readonly closed=output<void>();
  readonly busy=signal(false);readonly error=signal('');readonly i18n=inject(CatalogI18nService);
  private readonly api=inject(CatalogApiService);private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);private request?:Subscription;private initial='';
  readonly labels=signal<Array<{language:string;preferredLabel:string;definition:string}>>([]);
  constructor(){afterNextRender(()=>{this.labels.set(this.domain().labels.length?this.domain().labels.map(label=>({language:label.language,preferredLabel:label.preferredLabel,definition:label.definition})):[{language:'de',preferredLabel:this.domain().preferredLabel,definition:this.domain().definition}]);this.initial=JSON.stringify(this.labels());this.host.nativeElement.querySelector('dialog')?.showModal();setTimeout(()=>this.host.nativeElement.querySelector('input')?.focus());});inject(DestroyRef).onDestroy(()=>this.request?.unsubscribe());}
  hasChanges():boolean{return !!this.initial&&JSON.stringify(this.labels())!==this.initial;}
  close():void{if(!this.busy()){this.host.nativeElement.querySelector('dialog')?.close();this.closed.emit();}}
  save():void{if(this.busy())return;const localizations=this.labels().map(label=>({...label,preferredLabel:label.preferredLabel.trim(),definition:label.definition.trim()}));if(!localizations.length||localizations.some(label=>!label.preferredLabel||!label.definition)){this.error.set(this.i18n.t('domainEditRequired'));return;}this.busy.set(true);this.error.set('');this.request=this.api.updateDomainDirect(this.domain(),{localizations}).subscribe({next:domain=>{this.busy.set(false);this.host.nativeElement.querySelector('dialog')?.close();this.saved.emit(domain);},error:error=>{this.busy.set(false);const detail=error?.error?.detail;this.error.set(typeof detail==='string'?detail:this.i18n.t('domainEditFailed'));}});}
}
