import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CatalogI18nService } from '../core/catalog-i18n.service';

/** Informational guidance is dismissed only for this mounted page, never persisted. */
@Component({
  selector: 'daca-info-notice', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {role: 'note', '[hidden]': 'dismissed()'},
  template: `<div class="info-notice-content"><ng-content /></div><button type="button" class="info-notice-close" [attr.aria-label]="i18n.t('dismissInfo')" (click)="dismissed.set(true)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>`,
  styles: [`:host{position:relative;display:block}:host([hidden]){display:none}.info-notice-content{padding-right:1.75rem}.info-notice-close{position:absolute;top:.35rem;right:.35rem;display:grid;place-items:center;width:30px;height:30px;border:0;background:transparent;color:inherit;cursor:pointer}.info-notice-close svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}.info-notice-close:hover{background:#31566d12}.info-notice-close:focus-visible{outline:2px solid var(--daca-blue);outline-offset:-2px}`],
})
export class InfoNoticeComponent {
  readonly i18n = inject(CatalogI18nService);
  readonly dismissed = signal(false);
}
