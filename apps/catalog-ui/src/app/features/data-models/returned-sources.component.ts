import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DataModelsApiService } from './data-models-api.service';
import { ReturnedPhysicalSource } from './data-models.models';

@Component({
  selector:'daca-returned-sources', standalone:true, imports:[FormsModule],
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    @if(items().length || error()){
      <section class="daca-card returned-sources"><h2>{{ i18n.t('restoreSourceAccess') }}</h2><p>{{ i18n.t('restoreSourceAccessExplanation') }}</p>
        @if(error()){<p class="daca-alert is-error" role="alert">{{ i18n.t('sourceAccessActionFailed') }} {{ error() }}</p>}
        @for(item of items();track item.sourceId){
          <article><h3>{{ item.sourceName }}</h3><p>{{ item.organization }}</p>
            <p role="status">{{ i18n.t(item.request?.status === 'submitted' ? 'sourceAccessPending' : item.request?.status === 'rejected' ? 'sourceAccessRejected' : 'sourceAccessReturned') }}</p>
            @if(item.request?.decisionComment){<p>{{ item.request?.decisionComment }}</p>}
            @if(item.request?.status !== 'submitted'){
              <form (ngSubmit)="submit(item)"><label [for]="'restore-reason-' + item.sourceId">{{ i18n.t('sourceAccessReason') }}</label><textarea [id]="'restore-reason-' + item.sourceId" [name]="item.sourceId" [ngModel]="reasons[item.sourceId] || ''" (ngModelChange)="reasons[item.sourceId]=$event" required minlength="3" maxlength="2000"></textarea><button class="daca-button is-secondary" type="submit" [disabled]="busy() !== null || (reasons[item.sourceId] || '').trim().length < 3">{{ i18n.t(busy() === item.sourceId ? 'sourceAccessSaving' : 'restoreSourceAccess') }}</button></form>
            }
          </article>
        }
      </section>
    }
  `,
  styles:[`.returned-sources{margin-top:1.5rem;padding:1.2rem}article{border-top:1px solid var(--daca-border);padding:1rem 0}h3{margin:.2rem 0}label,textarea{display:block}textarea{box-sizing:border-box;width:100%;max-width:45rem;min-height:5rem;margin:.5rem 0;font:inherit}`],
})
export class ReturnedSourcesComponent {
  readonly refresh = input(0);
  readonly i18n=inject(CatalogI18nService);
  private readonly api=inject(DataModelsApiService);
  private readonly identity=inject(DemoIdentityService);
  readonly items=signal<ReturnedPhysicalSource[]>([]);
  readonly error=signal(''); readonly busy=signal<string|null>(null);
  reasons:Record<string,string>={};
  constructor(){effect((cleanup)=>{this.identity.userId();this.refresh();this.items.set([]);this.reasons={};this.error.set('');const subscription=this.api.returnedSources().subscribe({next:items=>this.items.set(items),error:(error:Error)=>this.error.set(error.message)});cleanup(()=>subscription.unsubscribe());});}
  submit(item:ReturnedPhysicalSource):void{
    const reason=(this.reasons[item.sourceId]||'').trim();if(this.busy() || reason.length<3)return;
    this.error.set('');this.busy.set(item.sourceId);
    this.api.requestSourceRestoration(item.sourceId,reason).pipe(finalize(()=>this.busy.set(null))).subscribe({
      next:request=>this.items.update(items=>items.map(value=>value.sourceId===item.sourceId?{...value,request}:value)),
      error:(error:Error)=>this.error.set(error.message),
    });
  }
}
