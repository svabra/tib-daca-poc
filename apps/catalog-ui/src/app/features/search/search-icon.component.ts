import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Tabler outline icons v3.50.0; original SVGs and MIT license live in public/assets/catalog-search. */
@Component({selector:'daca-search-icon',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
  template:'<span aria-hidden="true" [style.mask-image]="iconUrl()" [style.-webkit-mask-image]="iconUrl()"></span>',
  styles:[':host{display:inline-flex;flex:none;vertical-align:middle}span{display:block;width:1.35em;height:1.35em;background:currentColor;mask-size:contain;mask-repeat:no-repeat;mask-position:center;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}']})
export class SearchIconComponent{
  readonly name=input.required<string>();
  iconUrl():string{return`url("/assets/catalog-search/${this.name()}.svg")`;}
}
