import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { PhysicalSourceRestorationRequest } from '../data-models/data-models.models';

@Component({
  selector:'daca-source-restoration-requests', standalone:true, imports:[FormsModule],
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`<section class="daca-card restoration-inbox"><h2>{{ i18n.t('sourceRestorationReviews') }}</h2>
    @if(error()){<p class="daca-alert is-error" role="alert">{{ i18n.t('sourceAccessActionFailed') }} {{ error() }}</p>}
    @for(item of items();track item.id){<article><h3>{{ item.sourceName }}</h3><p>{{ item.organization }} · {{ item.requesterName }}</p><p>{{ item.reason }}</p>
      <label [for]="'restoration-comment-' + item.id">{{ i18n.t('sourceAccessDecisionComment') }}</label><textarea [id]="'restoration-comment-' + item.id" [ngModel]="comments[item.id] || ''" (ngModelChange)="comments[item.id]=$event" maxlength="2000"></textarea>
      <div><button class="daca-button" type="button" [disabled]="busy()!==null" (click)="decide(item,'approve')">{{ i18n.t('approveSourceRestoration') }}</button><button class="daca-button is-secondary" type="button" [disabled]="busy()!==null || (comments[item.id] || '').trim().length<3" (click)="decide(item,'reject')">{{ i18n.t('rejectSourceRestoration') }}</button></div>
    </article>} @empty {<p>{{ i18n.t('noSourceRestorationReviews') }}</p>}
  </section>`,
  styles:[`.restoration-inbox{padding:1.2rem;margin:1rem 0}article{border-top:1px solid var(--daca-border);padding:1rem 0}label,textarea{display:block}textarea{box-sizing:border-box;width:100%;min-height:4rem;margin:.5rem 0;font:inherit}article>div{display:flex;flex-wrap:wrap;gap:.6rem}`],
})
export class SourceRestorationRequestsComponent {
  readonly i18n=inject(CatalogI18nService);
  private readonly api=inject(DataModelsApiService);
  private readonly catalog=inject(CatalogApiService);
  private readonly identity=inject(DemoIdentityService);
  readonly items=signal<PhysicalSourceRestorationRequest[]>([]);
  readonly busy=signal<string|null>(null);readonly error=signal('');
  comments:Record<string,string>={};
  constructor(){effect((cleanup)=>{this.identity.userId();this.items.set([]);this.comments={};this.error.set('');const subscription=this.api.sourceRestorationInbox().subscribe({next:items=>this.items.set(items),error:(error:Error)=>this.error.set(error.message)});cleanup(()=>subscription.unsubscribe());});}
  decide(item:PhysicalSourceRestorationRequest,decision:'approve'|'reject'):void{
    const comment=(this.comments[item.id]||'').trim();if(this.busy() || (decision==='reject' && comment.length<3))return;
    this.busy.set(item.id);this.error.set('');
    this.api.decideSourceRestoration(item.id,decision,comment).pipe(finalize(()=>this.busy.set(null))).subscribe({
      next:()=>{this.items.update(items=>items.filter(value=>value.id!==item.id));this.catalog.refreshWorkflowTasks();},error:(error:Error)=>this.error.set(error.message),
    });
  }
}
