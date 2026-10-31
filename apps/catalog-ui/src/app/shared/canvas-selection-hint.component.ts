import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CatalogI18nService } from '../core/catalog-i18n.service';

@Component({selector:'daca-canvas-selection-hint',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
  template:'{{i18n.t("canvasSelectionHint")}}',
  styles:[':host{display:block;margin:.35rem 0 .55rem;color:var(--daca-muted);font-size:.72rem;line-height:1.5}'],
})
export class CanvasSelectionHintComponent {readonly i18n=inject(CatalogI18nService);}
