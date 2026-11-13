import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AccessEndDatePipe } from '../../shared/access-end-date.pipe';
import { ProductPersonalAccessService, grantAvailabilityLabel } from './product-personal-access.service';

@Component({
  selector: 'daca-product-endpoint-access', standalone: true, imports: [DatePipe, AccessEndDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="personal-access" aria-label="Ihre Berechtigungen für diese Schnittstelle">
      <h3>Ihre Berechtigungen</h3>
      @if (access.loading()) { <p role="status">Berechtigungen werden geprüft …</p> }
      @else if (access.error()) {
        <p role="alert">Ihre Berechtigungen sind derzeit nicht verfügbar.</p>
        <button class="daca-button is-secondary" type="button" (click)="access.retry()">Erneut prüfen</button>
      } @else if (access.ready()) {
        @for (grant of grants(); track grant.grantId) {
          <div class="personal-grant" [attr.data-subject-type]="grant.subjectType">
            <p class="personal-grant-origin"><strong>{{ grant.subjectType === 'group' ? 'Über Gruppe' : 'Individuell berechtigt' }}</strong> · {{ grant.subjectDisplayName }}</p>
            @if (grant.subjectOrganization) { <small>{{ grant.subjectOrganization }}</small> }
            <dl>
              <div><dt>Zugriff</dt><dd>Lesen · {{ grant.dataVariant === 'original' ? 'Originaldaten' : 'Modifiziert / minimiert' }}</dd></div>
              <div><dt>Gültigkeit</dt><dd>{{ grant.validFrom | date:'dd.MM.yyyy' }} – {{ grant.validUntil | accessEndDate }}</dd></div>
              <div><dt>Zeitfenster</dt><dd>{{ availabilityLabel(grant) }}</dd></div>
            </dl>
          </div>
        } @empty { <p>Für Sie ist keine gültige persönliche oder Gruppenfreigabe für diese Schnittstelle hinterlegt.</p> }
        @if (grants().length) { <p class="personal-access-note">Veröffentlichte Freigabe · Revision {{ access.status()?.policyRevision }}. Das Zielsystem prüft die Zugriffsbedingungen beim Datenbezug.</p> }
      }
    </section>
  `,
  styles: `
    :host { display:block; min-width:0; width:100%; }
    .personal-access { border-top:1px solid var(--daca-border); margin-top:14px; padding-top:14px; }
    h3 { margin:0 0 10px; font-size:.8rem; }
    p { margin:6px 0; font-size:.75rem; overflow-wrap:anywhere; }
    .personal-grant { padding:10px 0; }
    .personal-grant+.personal-grant { border-top:1px solid var(--daca-border); }
    .personal-grant-origin { margin:0 0 4px; }
    small,.personal-access-note { color:var(--daca-muted); font-size:.68rem; }
    dl { margin:10px 0 0; display:grid; gap:7px; font-size:.72rem; }
    dl>div { display:grid; grid-template-columns:90px minmax(0,1fr); gap:10px; }
    dt { color:var(--daca-muted); } dd { margin:0; overflow-wrap:anywhere; }
    .daca-button { font-size:.72rem; padding:7px 10px; min-height:36px; }
    @media(max-width:400px) { dl>div { grid-template-columns:1fr; gap:3px; } }
  `,
})
export class ProductEndpointAccessComponent {
  readonly protocol = input.required<'http-rest' | 'postgresql'>();
  readonly access = inject(ProductPersonalAccessService);
  readonly grants = computed(() => this.access.status()?.grants.filter(grant =>
    grant.protocols.includes(this.protocol() === 'http-rest' ? 'http' : 'postgresql')) ?? []);
  readonly availabilityLabel = grantAvailabilityLabel;
}
