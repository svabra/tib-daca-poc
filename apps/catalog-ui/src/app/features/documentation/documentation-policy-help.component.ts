import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';

@Component({
  selector: 'daca-policy-help',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="policy-help" (mouseenter)="dismissed.set(false)" (mouseleave)="dismissed.set(false)">
    <a routerLink="/documentation/animated/data-consumers/access-request" [attr.aria-label]="label()"
      (focus)="dismissed.set(false)" (keydown.escape)="dismissed.set(true)" aria-describedby="policy-help-tooltip">?</a>
    <span id="policy-help-tooltip" class="policy-tooltip" role="tooltip" [class.dismissed]="dismissed()">{{ label() }}</span>
  </span>`,
  styles: [`:host{display:inline-flex;vertical-align:middle}.policy-help{position:relative;display:inline-flex}
    a{display:grid;place-items:center;width:30px;height:30px;border:1px solid var(--daca-border-strong);border-radius:50%;color:var(--daca-blue);background:var(--daca-surface);font:700 .8rem var(--daca-font,sans-serif);text-decoration:none}
    a:hover{border-color:var(--daca-blue)}a:focus-visible{outline:3px solid var(--daca-blue);outline-offset:3px}
    .policy-tooltip{display:none;position:absolute;z-index:5;top:calc(100% + 9px);right:0;width:245px;max-width:70vw;padding:12px 15px;border:1px solid var(--daca-border-strong);border-radius:5px;background:var(--daca-surface);box-shadow:0 4px 18px #0002;color:var(--daca-ink);font-size:.76rem;line-height:1.5;font-weight:400}
    .policy-help:hover .policy-tooltip,.policy-help:focus-within .policy-tooltip{display:block}.policy-help .policy-tooltip.dismissed{display:none}
    @media(pointer:coarse){a{width:44px;height:44px}}`],
})
export class DocumentationPolicyHelpComponent {
  private readonly preferences = inject(UserPreferencesService);
  readonly dismissed = signal(false);
  label(): string { return catalogCopy(['Möchtest du wissen wie man Daten freigeben kann?', 'Souhaitez-vous savoir comment autoriser l’accès aux données ?', 'Vuoi sapere come concedere l’accesso ai dati?', 'Would you like to know how to grant access to data?'], this.preferences.language()); }
}
