import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { retry, Subscription, throwError, timer } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { AdministrativeOrganization, DomainNetworkLink, DomainSummary, GlossaryTermSummary, SemanticGraphState } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { ConceptNetworkEditorComponent } from './concept-network-editor.component';

@Component({
  selector:'daca-organization-term-network',standalone:true,imports:[FormsModule,ConceptNetworkEditorComponent],changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    @if(!ownOfficeOnly()){<label class="organization-choice">{{i18n.t('networkOrganization')}}
      <select [ngModel]="organizationId()" (change)="changeOrganization($event)"><option value="">{{i18n.t('chooseNetworkOrganization')}}</option>@for(item of organizations();track item.id){<option [value]="item.id">{{item.label}}</option>}</select>
    </label>}
    @if(error()){<p class="daca-alert is-error" role="alert">{{error()}} <button class="daca-button is-secondary" type="button" (click)="load(organizationId())">Erneut laden</button></p>}
    @if(loading()){<p role="status">{{i18n.t('loadingTermNetwork')}}</p>}@else if(context();as current){
      <p class="scope-description">{{i18n.t('termNetworkScope',{name:current.label,domains:scopedDomains().length,terms:scopedTerms().length})}} {{i18n.t('termNetworkScopeHint')}}</p>
      @if(!scopedDomains().length&&!scopedTerms().length){<p class="daca-alert" role="status">{{i18n.t('emptyOrganizationNetwork')}}</p>}
      <daca-concept-network-editor [organization]="current" [terms]="scopedTerms()" [visibleNodeIds]="visibleNodeIds()"/>
    }
  `,styles:[`.organization-choice{display:grid;gap:.4rem;max-width:38rem;font-weight:700;margin:0 0 1rem}.organization-choice select{font:inherit;min-height:44px;padding:.55rem;max-width:100%;border:1px solid var(--daca-border-strong)}.scope-description{font-size:.875rem;color:var(--daca-text-muted)}`],
})
export class OrganizationTermNetworkComponent {
  readonly ownOfficeOnly=input(false);
  readonly visibleNodeIds=input<readonly string[] | null>(null);
  readonly domains=input<readonly DomainSummary[]>([]);readonly terms=input<readonly GlossaryTermSummary[]>([]);
  readonly i18n=inject(CatalogI18nService);private readonly api=inject(CatalogApiService);private readonly identity=inject(DemoIdentityService);
  readonly organizations=signal<readonly AdministrativeOrganization[]>([]);readonly organizationId=signal('');readonly graph=signal<SemanticGraphState|null>(null);readonly links=signal<readonly DomainNetworkLink[]>([]);
  readonly loading=signal(false);readonly error=signal('');private request?:Subscription;private lastActor='';private lastOffice='';private manuallySelected=false;
  readonly editor=viewChild(ConceptNetworkEditorComponent);
  readonly scopedDomains=computed(()=>this.domains().filter(item=>item.status==='active'&&this.graph()?.scopeDomainIds?.includes(item.id)));
  readonly scopedTerms=computed(()=>this.terms().filter(item=>item.status==='active'&&this.graph()?.scopeTermIds?.includes(item.id)));
  readonly context=computed(()=>this.graph()?{id:this.organizationId(),label:this.graph()!.organizationName??this.organizationId(),domains:this.scopedDomains(),links:this.links()}:null);
  constructor(){
    const directory=this.api.loadAdministrativeOrganizations().subscribe({next:items=>this.organizations.set(items),error:()=>this.error.set('Die Organisationen konnten nicht geladen werden.')});
    effect(()=>{const user=this.identity.user(),actor=this.identity.userId(),office=user.office??'',ownOnly=this.ownOfficeOnly();untracked(()=>{
      const changedActor=this.lastActor!==actor,changedOffice=this.lastOffice!==office;
      if(changedActor)this.manuallySelected=false;
      this.lastActor=actor;this.lastOffice=office;
      if((ownOnly&&this.organizationId()!==office)||changedActor||(changedOffice&&!this.manuallySelected)||(!this.organizationId()&&office&&!this.manuallySelected))this.load(office);
    });});
    const linkRequest=this.api.loadSemanticGraph('domains').subscribe({next:graph=>this.links.set(graph.relations),error:()=>this.error.set('Domänenbeziehungen konnten nicht geladen werden.')});
    inject(DestroyRef).onDestroy(()=>{directory.unsubscribe();linkRequest.unsubscribe();this.request?.unsubscribe();});
  }
  load(id:string):void{
    this.request?.unsubscribe();this.organizationId.set(id);this.graph.set(null);this.error.set('');this.loading.set(!!id);if(!id)return;
    this.request=this.api.loadSemanticGraph('organizations',id).pipe(retry({count:2,delay:(error,attempt)=>[0,502,503,504].includes(error?.status)?timer(attempt*300):throwError(()=>error)})).subscribe({next:graph=>{this.graph.set(graph);this.loading.set(false);},error:()=>{this.error.set(this.i18n.t('organizationNetworkError'));this.loading.set(false);}});
  }
  changeOrganization(event:Event):void{const select=event.target as HTMLSelectElement;if(!this.canDeactivate()){select.value=this.organizationId();return;}this.manuallySelected=true;this.load(select.value);}
  canDeactivate():boolean{return this.editor()?.canDeactivate()??true;}
}
