import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogI18nService } from '../core/catalog-i18n.service';
import { SearchIconComponent } from '../features/search/search-icon.component';

/** The compact object-card content shared by inner and outer organizations. */
@Component({selector:'daca-organization-card-content',standalone:true,imports:[SearchIconComponent],changeDetection:ChangeDetectionStrategy.OnPush,
  template:`<span class="org-card-kind"><daca-search-icon name="hierarchy"/>{{i18n.t('organization')}}</span>
    <span class="org-card-title">@if(canton()){<span class="org-canton-prefix">{{i18n.t('canvasCanton')}}</span>}<strong>{{name()}}</strong></span>
    <dl class="org-product-counts"><div class="org-offered-count"><dt>{{i18n.t('canvasOfferedProducts')}}</dt><dd>{{offered()}}</dd></div><div class="org-consumed-count"><dt>{{i18n.t('canvasConsumedProducts')}}</dt><dd>{{consumed()}}</dd></div></dl>`,
  styles:[`:host{container-type:inline-size;display:grid;gap:3px;min-width:0;width:100%;color:inherit}.org-card-kind{display:flex;align-items:center;gap:5px;font-size:clamp(.48rem,5.5cqw,.6rem);color:var(--daca-muted);line-height:1.2}.org-card-kind daca-search-icon{font-size:.62rem;flex:none}.org-card-title{display:flex;align-items:baseline;gap:3px;min-width:0;line-height:1.25}.org-card-title strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(.68rem,9cqw,1rem);font-weight:700}.org-canton-prefix{font-size:clamp(.48rem,5.5cqw,.6rem);white-space:nowrap}.org-product-counts{display:grid;gap:2px;margin:0;color:var(--daca-muted);font-size:clamp(.48rem,6cqw,.65rem);line-height:1.2}.org-product-counts>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:5px}.org-product-counts dt{font-weight:400;overflow-wrap:anywhere}.org-product-counts dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums}`],
})
export class OrganizationCardContentComponent {
  readonly i18n=inject(CatalogI18nService);
  readonly name=input.required<string>();readonly offered=input.required<number>();readonly consumed=input.required<number>();readonly canton=input(false);
}
