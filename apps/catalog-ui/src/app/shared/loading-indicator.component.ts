import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The small blue loading indicator used by catalog lookups. */
@Component({selector:'daca-loading-indicator',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
  template:'<span class="loading-indicator" role="status"><span class="small-spinner" aria-hidden="true"></span><span>{{label()}}</span></span>',
  styles:[`:host{display:block}.loading-indicator{display:flex;align-items:center;gap:.65rem;min-height:24px;color:var(--daca-muted);font-size:.8rem}.small-spinner{display:block;box-sizing:border-box;width:20px;height:20px;flex:0 0 20px;border:3px solid #1f6f8b57;border-top-color:#176783;border-radius:50%;animation:catalog-loading-spin .8s linear infinite}@keyframes catalog-loading-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.small-spinner{animation:none}}`],
})
export class LoadingIndicatorComponent { readonly label=input.required<string>(); }
