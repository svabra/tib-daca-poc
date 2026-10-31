import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The small blue loading indicator used by catalog lookups. */
@Component({selector:'daca-loading-indicator',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
  template:'<span class="loading-indicator" role="status"><svg class="small-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity=".28"/><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="3"/></svg><span>{{label()}}</span></span>',
  styles:[`:host{display:block}.loading-indicator{display:flex;align-items:center;gap:.65rem;min-height:24px;color:var(--daca-muted);font-size:.8rem}.small-spinner{display:block;width:20px;height:20px;flex:0 0 20px;color:var(--daca-blue,#176783);transform-origin:center;animation:catalog-loading-spin .8s linear infinite}@keyframes catalog-loading-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.small-spinner{animation:none}}`],
})
export class LoadingIndicatorComponent { readonly label=input.required<string>(); }
