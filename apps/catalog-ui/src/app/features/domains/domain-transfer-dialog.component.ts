import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DomainSummary } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';

@Component({selector:'daca-domain-transfer-dialog',standalone:true,imports:[FormsModule],changeDetection:ChangeDetectionStrategy.OnPush,template:`
  <dialog aria-labelledby="domain-transfer-title" (cancel)="$event.preventDefault();close()">
    <form #form="ngForm" (ngSubmit)="transfer()">
      <header><h2 id="domain-transfer-title">{{i18n.t('transferDomain')}}</h2><button class="daca-button is-secondary" type="button" [disabled]="busy()" [attr.aria-label]="i18n.t('cancelDomainEdit')" (click)="close()">×</button></header>
      <p><strong>{{domain().preferredLabel}}</strong> · {{i18n.t('currentDomainOwner')}}: {{domain().ownerName}}</p>
      <p class="daca-alert">{{i18n.t('domainTransferWarning')}}</p>
      @if(error()){<p class="daca-alert is-error" role="alert">{{error()}}</p>}
      <label>{{i18n.t('searchTransferPerson')}}<input name="query" type="search" [disabled]="busy()" [ngModel]="query()" (ngModelChange)="query.set($event)"></label>
      <label>{{i18n.t('newDomainOwner')}} *<select name="owner" [(ngModel)]="owner" [disabled]="busy()" required><option value="">{{i18n.t('selectTransferPerson')}}</option>@for(person of ownerChoices();track person.id){<option [value]="person.id">{{person.displayName}} · {{person.organization}}</option>}</select></label>
      <label>{{i18n.t('newDomainDeputy')}} *<select name="deputy" [(ngModel)]="deputy" [disabled]="busy()" required><option value="">{{i18n.t('selectTransferPerson')}}</option>@for(person of deputyChoices();track person.id){<option [value]="person.id">{{person.displayName}} · {{person.organization}}</option>}</select></label>
      <label>{{i18n.t('domainTransferReason')}} *<textarea name="reason" [(ngModel)]="reason" [disabled]="busy()" required minlength="3" maxlength="2000" rows="3"></textarea></label>
      <label class="confirmation"><input type="checkbox" name="confirmed" [(ngModel)]="confirmed" [disabled]="busy()" required>{{i18n.t('confirmDomainTransfer')}}</label>
      <footer><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="close()">{{i18n.t('cancelDomainEdit')}}</button><button class="daca-button" type="submit" [disabled]="busy()||form.invalid||!confirmed||owner===deputy||reason.trim().length<3">{{i18n.t('submitDomainTransfer')}}</button></footer>
    </form>
  </dialog>`,styles:[`dialog{box-sizing:border-box;width:min(42rem,calc(100vw - 2rem));max-height:90vh;overflow:auto;padding:1.25rem;border:1px solid var(--daca-border);background:var(--daca-surface,#fff)}dialog::backdrop{background:#0007}form{display:grid;gap:1rem}header,footer{display:flex;align-items:center;justify-content:space-between;gap:1rem}h2,p{margin:0}label{display:grid;gap:.4rem;font-weight:700}input,select,textarea{box-sizing:border-box;width:100%;padding:.65rem;border:1px solid var(--daca-border-strong);font:inherit;font-weight:400}.confirmation{display:flex;align-items:flex-start;font-weight:400}.confirmation input{width:auto;margin-top:.25rem}footer{justify-content:flex-end;flex-wrap:wrap}`]})
export class DomainTransferDialogComponent {
  readonly domain=input.required<DomainSummary>();readonly saved=output<DomainSummary>();readonly closed=output<void>();
  readonly i18n=inject(CatalogI18nService);private readonly identity=inject(DemoIdentityService);private readonly api=inject(CatalogApiService);private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);private request?:Subscription;
  readonly query=signal('');readonly busy=signal(false);readonly error=signal('');owner='';deputy='';reason='';confirmed=false;
  private readonly matching=computed(()=>{const text=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();const q=text(this.query().trim());return this.identity.users().filter(person=>!q||text([person.displayName,person.organization,person.id].join(' ')).includes(q));});
  readonly ownerChoices=computed(()=>this.identity.users().filter(person=>person.id!==this.domain().ownerUserId&&(this.matching().some(match=>match.id===person.id)||person.id===this.owner)));
  readonly deputyChoices=computed(()=>this.identity.users().filter(person=>this.matching().some(match=>match.id===person.id)||person.id===this.deputy));
  constructor(){afterNextRender(()=>{this.host.nativeElement.querySelector('dialog')?.showModal();this.host.nativeElement.querySelector('input')?.focus();});inject(DestroyRef).onDestroy(()=>this.request?.unsubscribe());}
  hasChanges():boolean{return !!(this.owner||this.deputy||this.reason||this.confirmed);}
  close():void{if(!this.busy()){this.host.nativeElement.querySelector('dialog')?.close();this.closed.emit();}}
  transfer():void{if(this.busy()||!this.confirmed||!this.owner||!this.deputy||this.owner===this.deputy||this.reason.trim().length<3)return;this.busy.set(true);this.error.set('');this.request=this.api.transferDomainOwnership(this.domain(),{ownerUserId:this.owner,deputyOwnerUserId:this.deputy,reason:this.reason.trim()}).subscribe({next:domain=>{this.busy.set(false);this.host.nativeElement.querySelector('dialog')?.close();this.saved.emit(domain);},error:error=>{this.busy.set(false);const detail=error?.error?.detail;this.error.set(typeof detail==='string'?detail:this.i18n.t('domainTransferFailed'));}});}
}
