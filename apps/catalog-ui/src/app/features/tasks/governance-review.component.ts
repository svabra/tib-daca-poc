import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { map } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { AccessRenewalContext, GovernanceSubmission, WeeklyAvailability } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { GovernanceDeploymentPoller } from './governance-deployment-poller';

@Component({
  selector: 'daca-governance-review',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      @if (submission(); as item) {
        <div>
          <p class="daca-eyebrow">Vier-Augen-Prinzip · {{ isAccessRenewal(item) ? 'Zugriffsverlängerung' : 'Publikationsfreigabe' }}</p>
          <h1>{{ isAccessRenewal(item) ? 'Zugriffsverlängerung prüfen' : 'Governance-Snapshot prüfen' }}</h1>
          <p>Der Entscheid gilt exakt für die angezeigte Policy-Revision. Nachträgliche Änderungen erfordern eine neue Einreichung.</p>
        </div>
      } @else {
        <div><p class="daca-eyebrow">Vier-Augen-Prinzip</p><h1>Governance-Snapshot prüfen</h1><p>Der unveränderliche Prüfsnapshot wird geladen.</p></div>
      }
      @if (submission(); as item) { <daca-status-badge [tone]="item.status === 'approved' ? 'green' : item.status === 'rejected' || item.status === 'deployment_failed' ? 'red' : 'orange'">{{ statusLabel(item.status, isAccessRenewal(item)) }}</daca-status-badge> }
    </section>

    @if (loading()) { <section class="daca-card"><div class="daca-card-body">Prüfsnapshot wird geladen …</div></section> }
    @else if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }}</p> }
    @else if (submission(); as item) {
      <div class="exposure-layout">
        <section class="daca-card exposure-form">
          <div class="daca-card-header"><div><p class="daca-eyebrow">{{ isAccessRenewal(item) ? 'Unveränderliche Verlängerungsevidenz' : 'Unveränderliche Evidenz' }}</p><h2>{{ item.reviewSnapshot.dataProduct.title }}</h2></div><strong>Policy Rev. {{ item.policyRevision }}</strong></div>
          <div class="daca-card-body">
            <dl class="exposure-review-list">
              <div><dt>Data Owner</dt><dd>{{ ownerDisplayName(item) }}<small>{{ ownerOrganization(item) }}</small></dd></div>
              <div><dt>Kontrollperson</dt><dd>{{ item.reviewSnapshot.approver.displayName }}<small>{{ item.reviewSnapshot.approver.organization }}</small></dd></div>
              <div><dt>Klassifikation</dt><dd>{{ item.reviewSnapshot.dataProduct.classification }}</dd></div>
              <div><dt>Eingereicht</dt><dd>{{ item.submittedAt | date: 'dd.MM.yyyy, HH:mm' }}</dd></div>
              @if (!isAccessRenewal(item)) {
                <div><dt>Auffindbarkeit</dt><dd>{{ item.reviewSnapshot.discoverable ? 'Nach Deployment aktivieren' : 'Nicht aktivieren' }}</dd></div>
                <div><dt>BAR</dt><dd>{{ item.archiveEvidence['enabled'] ? 'Automatisch · 20 Jahre' : 'Deaktiviert' }}</dd></div>
              }
            </dl>

            @if (isAccessRenewal(item)) {
              @if (renewalEvidence(item); as renewal) {
                <section class="renewal-comparison" aria-labelledby="renewal-comparison-title">
                  <div class="renewal-section-heading">
                    <div><p class="daca-eyebrow">Geprüfte Änderung</p><h3 id="renewal-comparison-title">Bisherige und beantragte Freigabe</h3></div>
                    <span>Nur Zweck und Enddatum werden bestätigt</span>
                  </div>
                  <div class="renewal-table-wrap" role="region" aria-label="Vergleich der bisherigen und beantragten Freigabe" tabindex="0">
                    <table class="renewal-comparison-table">
                      <caption>Vergleich der veränderbaren Angaben</caption>
                      <thead><tr><th scope="col">Merkmal</th><th scope="col">Bisher</th><th scope="col">Beantragt</th></tr></thead>
                      <tbody>
                        <tr>
                          <th scope="row">Enddatum</th>
                          <td><time [attr.datetime]="renewal.originalGrant.validUntil">{{ formatDate(renewal.originalGrant.validUntil) }}</time></td>
                          <td class="is-new"><time [attr.datetime]="renewal.requestedValidUntil">{{ formatDate(renewal.requestedValidUntil) }}</time></td>
                        </tr>
                        <tr><th scope="row">Verwendungszweck</th><td>{{ renewal.originalGrant.purpose }}</td><td class="is-new">{{ renewal.requestedPurpose }}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                <section class="renewal-immutable" aria-labelledby="renewal-immutable-title">
                  <div class="renewal-section-heading"><div><p class="daca-eyebrow">Unveränderter Umfang</p><h3 id="renewal-immutable-title">Identität und Zugriffsbedingungen</h3></div><strong>Unverändert</strong></div>
                  <dl class="renewal-immutable-list">
                    <div><dt>Identität</dt><dd>{{ subjectTypeLabel(renewal.originalGrant.subject.type) }} · <code>{{ renewal.originalGrant.subject.id }}</code></dd></div>
                    <div><dt>Aktionen</dt><dd><code>{{ formatActions(renewal.originalGrant.actions) }}</code></dd></div>
                    <div><dt>Protokolle</dt><dd>{{ formatProtocols(renewal.originalGrant.protocols) }}</dd></div>
                    <div><dt>Datenvariante</dt><dd>{{ variantLabel(renewal.originalGrant.dataVariant) }}</dd></div>
                    <div><dt>Rechtsgrundlage</dt><dd>{{ renewal.originalGrant.legalBasis }}</dd></div>
                    <div><dt>Gültig ab</dt><dd><time [attr.datetime]="renewal.originalGrant.validFrom">{{ formatDate(renewal.originalGrant.validFrom) }}</time></dd></div>
                    <div class="is-wide"><dt>Nutzungszeit</dt><dd>{{ formatWeeklyAvailability(renewal.originalGrant.weeklyAvailability) }}</dd></div>
                  </dl>
                </section>

                <section class="renewal-continuity" aria-labelledby="renewal-continuity-title" data-testid="renewal-continuity">
                  <h3 id="renewal-continuity-title">Kontinuität der bestehenden Freigabe</h3>
                  @if (item.status === 'approved') {
                    <p>Die verlängerte Policy ist aktiv, nachdem OPA und PostgreSQL dieselbe neue Revision bestätigt haben.</p>
                  } @else if (item.status === 'rejected') {
                    <p>Die Verlängerung wurde abgelehnt. Die bestehende Policy bleibt aktiv und gilt unverändert bis zum bisherigen Enddatum.</p>
                  } @else if (item.status === 'deployment_failed') {
                    <p>Die technische Aktivierung ist nicht abgeschlossen. Die bestehende Policy bleibt aktiv und gilt unverändert bis zum bisherigen Enddatum.</p>
                  } @else {
                    <p>Die bestehende Policy bleibt aktiv und gilt unverändert bis zum bisherigen Enddatum. Die Verlängerung ersetzt sie erst nach der vollständigen technischen Aktivierung.</p>
                  }
                </section>

                <section class="renewal-deployment" aria-labelledby="renewal-deployment-title">
                  <div class="renewal-section-heading"><div><p class="daca-eyebrow">Stufenweise Aktivierung</p><h3 id="renewal-deployment-title">OPA vor PostgreSQL</h3></div><strong>{{ renewalDeploymentStatus(item.status) }}</strong></div>
                  <ol aria-label="Reihenfolge der technischen Aktivierung">
                    <li data-deployment-stage="opa"><span>1</span><div><strong>OPA</strong><p>Die neue Policy-Revision wird zuerst am Policy Decision Point bestätigt.</p></div></li>
                    <li data-deployment-stage="postgresql"><span>2</span><div><strong>PostgreSQL</strong><p>Danach wird dieselbe Revision auf die Datenbankberechtigungen projiziert.</p></div></li>
                  </ol>
                  <p>Die Verlängerung ist erst aktiv, wenn beide Ziele exakt Policy-Revision {{ item.policyRevision }} melden.</p>
                </section>
              } @else {
                <p class="daca-alert is-error" role="alert" data-testid="renewal-evidence-missing">Die unveränderliche Verlängerungsevidenz fehlt. Ein Entscheid ist nicht möglich.</p>
              }
            } @else {
              @if (item.reviewSnapshot.accessRequestFulfillments?.length) {
                <h3>Verknüpfte Zugriffsanfragen</h3>
                @for (fulfillment of item.reviewSnapshot.accessRequestFulfillments ?? []; track fulfillment.accessRequestId) {
                  <p class="daca-alert" data-testid="governance-request-fulfillment"><strong>{{ fulfillment.requestNumber }}</strong> · {{ fulfillment.requesterId }} über {{ fulfillment.fulfillmentSubject.id }} · Gruppenrevision {{ fulfillment.groupMembershipRevision }}</p>
                }
              }
              <h3>Geprüfte Empfänger und Bedingungen</h3>
              <div class="owner-task-list">
                @for (grant of item.reviewSnapshot.grants; track grant.subject.type + ':' + grant.subject.id) {
                  <article class="daca-card owner-task-card">
                    <div class="owner-task-priority" aria-hidden="true"></div>
                    <div class="owner-task-main">
                      <div><span>{{ subjectTypeLabel(grant.subject.type) }}</span><code>{{ grant.subject.id }}</code></div>
                      <h3>{{ grant.subject.id }}</h3>
                      <p>{{ formatProtocols(grant.protocols) }} · <code>{{ formatActions(grant.actions) }}</code> · Variante {{ variantLabel(grant.dataVariant) }} · {{ grant.validFrom }} bis {{ grant.validUntil }}</p>
                      <p><strong>Zeitfenster:</strong> {{ formatWeeklyAvailability(grant.weeklyAvailability ?? null) }}</p>
                      <p><strong>KOBY / MCP:</strong> {{ grant.metadataChannels?.kobyMcp ? 'aktiviert' : 'deaktiviert' }} <span aria-hidden="true">·</span> <strong>I14Y:</strong> {{ grant.metadataChannels?.i14y ? 'aktiviert' : 'deaktiviert' }} <span aria-hidden="true">·</span> <strong>Mitgliedersnapshot:</strong> {{ grant.groupSnapshot?.memberIds?.length ?? 'Nicht anwendbar' }}</p>
                    </div>
                  </article>
                }
              </div>
            }
          </div>
        </section>

        <aside class="daca-card exposure-review">
          <div class="daca-card-header"><div><p class="daca-eyebrow">Entscheid durch {{ item.reviewSnapshot.approver.displayName }}</p><h2>{{ isAccessRenewal(item) ? 'Verlängerung freigeben' : 'Publikation freigeben' }}</h2></div></div>
          <div class="daca-card-body">
            @if (isAccessRenewal(item)) {
              <div class="exposure-guardrail"><strong>{{ renewalGuardrailTitle(item.status) }}</strong><p>{{ renewalGuardrailText(item) }}</p></div>
            } @else {
              <div class="exposure-guardrail"><strong>Default deny bis zum Doppel-Deployment</strong><p>Auch nach Ihrer Genehmigung bleiben Auffindbarkeit und Zugriff gesperrt, bis PostgreSQL und OPA genau Revision {{ item.policyRevision }} bestätigt haben.</p></div>
            }
            <label>Kommentar<textarea rows="4" [value]="comment()" (input)="comment.set($any($event.target).value)" placeholder="Optional bei Genehmigung, empfohlen bei Ablehnung"></textarea></label>
            @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
            @if (decisionError()) { <p class="daca-alert is-error" role="alert">{{ decisionError() }}</p> }
            @if ((item.status === 'pending_approval' || item.status === 'deployment_failed') && (!isAccessRenewal(item) || renewalEvidence(item))) {
              <button class="daca-button exposure-primary-action" data-testid="governance-approve" type="button" [disabled]="deciding()" (click)="decide('approve')">{{ deciding() ? 'Entscheid wird verarbeitet …' : approveLabel(item) }}</button>
              <button class="daca-button is-secondary exposure-secondary-action" type="button" [disabled]="deciding()" (click)="decide('reject')">{{ isAccessRenewal(item) ? 'Verlängerung ablehnen' : 'Ablehnen' }}</button>
            }
            <a class="daca-button is-secondary exposure-secondary-action" routerLink="/tasks">Zurück zu den Aufgaben</a>
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    .exposure-review-list dd small { display: block; margin-top: 2px; color: var(--daca-muted); font-size: .67rem; font-weight: 500; }
    .renewal-comparison, .renewal-immutable, .renewal-continuity, .renewal-deployment { margin-top: 24px; }
    .renewal-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 10px; }
    .renewal-section-heading h3, .renewal-continuity h3 { margin: 2px 0 0; }
    .renewal-section-heading > span, .renewal-section-heading > strong { color: var(--daca-muted); font-size: .75rem; }
    .renewal-table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid var(--daca-border); }
    .renewal-table-wrap:focus-visible { outline: 3px solid var(--daca-focus, #006699); outline-offset: 2px; }
    .renewal-comparison-table { width: 100%; min-width: 520px; border-collapse: collapse; }
    .renewal-comparison-table caption { padding: 10px 12px; color: var(--daca-muted); font-size: .72rem; text-align: left; }
    .renewal-comparison-table th, .renewal-comparison-table td { padding: 12px; border-top: 1px solid var(--daca-border); text-align: left; vertical-align: top; }
    .renewal-comparison-table thead th { background: var(--daca-surface-muted, #f3f6f8); font-size: .7rem; text-transform: uppercase; }
    .renewal-comparison-table tbody th { width: 22%; font-size: .75rem; }
    .renewal-comparison-table td { font-size: .78rem; }
    .renewal-comparison-table .is-new { border-left: 3px solid var(--daca-red, #e1001a); background: #fff8f8; font-weight: 700; }
    .renewal-immutable-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border: 1px solid var(--daca-border); }
    .renewal-immutable-list div { min-width: 0; padding: 12px; border-bottom: 1px solid var(--daca-border); }
    .renewal-immutable-list div:nth-child(odd):not(.is-wide) { border-right: 1px solid var(--daca-border); }
    .renewal-immutable-list .is-wide { grid-column: 1 / -1; border-bottom: 0; }
    .renewal-immutable-list dt { margin-bottom: 4px; color: var(--daca-muted); font-size: .67rem; font-weight: 800; text-transform: uppercase; }
    .renewal-immutable-list dd { margin: 0; overflow-wrap: anywhere; font-size: .78rem; font-weight: 700; }
    .renewal-continuity { padding: 16px; border-left: 4px solid var(--daca-blue, #006699); background: #edf6fb; }
    .renewal-continuity p, .renewal-deployment > p, .renewal-deployment li p { margin: 6px 0 0; color: var(--daca-muted); font-size: .78rem; }
    .renewal-deployment ol { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
    .renewal-deployment li { display: flex; gap: 10px; padding: 12px; border: 1px solid var(--daca-border); }
    .renewal-deployment li > span { display: grid; width: 26px; height: 26px; flex: 0 0 26px; place-items: center; border-radius: 50%; background: var(--daca-blue, #006699); color: white; font-weight: 800; }
    .renewal-deployment li p { margin-top: 3px; }
    @media (max-width: 720px) {
      .renewal-section-heading { align-items: start; flex-direction: column; gap: 4px; }
      .renewal-immutable-list, .renewal-deployment ol { grid-template-columns: 1fr; }
      .renewal-immutable-list div:nth-child(odd):not(.is-wide) { border-right: 0; }
    }
    @media (forced-colors: active) {
      .renewal-comparison-table .is-new, .renewal-continuity { border-color: CanvasText; }
      .renewal-deployment li > span { border: 1px solid CanvasText; }
    }
  `],
})
export class GovernanceReviewComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CatalogApiService);
  private readonly identity = inject(DemoIdentityService);
  readonly submission = signal<GovernanceSubmission | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly decisionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly comment = signal('');
  readonly deciding = signal(false);
  private deploymentPoller: GovernanceDeploymentPoller<GovernanceSubmission> | null = null;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.loading.set(false); this.error.set('Governance-Submission fehlt.'); return; }
    this.api.loadGovernanceSubmission(id).subscribe({
      next: ({ submission }) => { this.submission.set(submission); this.loading.set(false); },
      error: (error) => { this.error.set(error?.error?.detail ?? 'Der Governance-Snapshot konnte nicht geladen werden.'); this.loading.set(false); },
    });
  }

  ngOnDestroy(): void {
    this.deploymentPoller?.stop();
  }

  statusLabel(status: GovernanceSubmission['status'], renewal = false): string {
    if (renewal) {
      return ({ pending_approval: 'Verlängerung zu prüfen', approved_deploying: 'Genehmigt · Aktivierung läuft', approved: 'Verlängerung aktiv', rejected: 'Verlängerung abgelehnt', deployment_failed: 'Aktivierung fehlgeschlagen' })[status];
    }
    return ({ pending_approval: 'Entscheid ausstehend', approved_deploying: 'Genehmigt · Deployment läuft', approved: 'Publiziert', rejected: 'Abgelehnt', deployment_failed: 'Deployment fehlgeschlagen' })[status];
  }

  isAccessRenewal(submission: GovernanceSubmission): boolean {
    return submission.reviewSnapshot.workflowKind === 'access_renewal';
  }

  renewalEvidence(submission: GovernanceSubmission): GovernanceSubmission['reviewSnapshot']['renewal'] | null {
    return this.isAccessRenewal(submission) ? submission.reviewSnapshot.renewal ?? null : null;
  }

  ownerDisplayName(submission: GovernanceSubmission): string {
    return this.identity.users().find((user) => user.id === submission.ownerUserId)?.displayName
      ?? submission.reviewSnapshot.dataProduct.owner;
  }

  ownerOrganization(submission: GovernanceSubmission): string {
    return this.identity.users().find((user) => user.id === submission.ownerUserId)?.organization
      ?? submission.reviewSnapshot.dataProduct.owner;
  }

  subjectTypeLabel(type: AccessRenewalContext['subject']['type']): string {
    return ({ person: 'Person', machine: 'Maschine', group: 'Gruppe' })[type];
  }

  variantLabel(variant: AccessRenewalContext['dataVariant']): string {
    return variant === 'original' ? 'Original' : 'Modifiziert';
  }

  formatActions(actions: string[]): string {
    return actions.length ? actions.join(', ') : 'Keine Aktion';
  }

  formatDate(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
  }

  formatProtocols(protocols: AccessRenewalContext['protocols']): string {
    const labels: Record<AccessRenewalContext['protocols'][number], string> = {
      http: 'HTTP/REST',
      postgresql: 'PostgreSQL',
    };
    return protocols.map((protocol) => labels[protocol]).join(', ') || 'Kein Protokoll';
  }

  formatWeeklyAvailability(availability: WeeklyAvailability | null): string {
    if (!availability) return 'Durchgehend · 24/7';
    const labels: Record<WeeklyAvailability['weekdays'][number], string> = {
      monday: 'Mo',
      tuesday: 'Di',
      wednesday: 'Mi',
      thursday: 'Do',
      friday: 'Fr',
      saturday: 'Sa',
      sunday: 'So',
    };
    return `${availability.weekdays.map((day) => labels[day]).join(', ')} · ${availability.startTime}–${availability.endTime} · ${availability.timeZone}`;
  }

  renewalDeploymentStatus(status: GovernanceSubmission['status']): string {
    return ({
      pending_approval: 'Noch nicht gestartet',
      approved_deploying: 'Aktivierung läuft',
      approved: 'Abgeschlossen',
      rejected: 'Nicht gestartet',
      deployment_failed: 'Nicht abgeschlossen',
    })[status];
  }

  renewalGuardrailTitle(status: GovernanceSubmission['status']): string {
    return status === 'approved'
      ? 'Verlängerung vollständig aktiviert'
      : 'Bestehende Policy bleibt aktiv';
  }

  renewalGuardrailText(submission: GovernanceSubmission): string {
    if (submission.status === 'approved') {
      return `OPA und PostgreSQL haben Policy-Revision ${submission.policyRevision} bestätigt.`;
    }
    if (submission.status === 'rejected') {
      return 'Die Ablehnung ersetzt die bestehende Freigabe nicht; ihr bisheriges Enddatum gilt weiter.';
    }
    if (submission.status === 'deployment_failed') {
      return 'Der technische Fehler ersetzt die bestehende Freigabe nicht. Eine erneute Aktivierung kann sicher gestartet werden.';
    }
    return `Die neue Revision ${submission.policyRevision} wird erst nach der OPA-Bestätigung und der anschliessenden PostgreSQL-Projektion wirksam.`;
  }

  approveLabel(submission: GovernanceSubmission): string {
    if (!this.isAccessRenewal(submission)) return 'Genehmigen und Deployment starten';
    return submission.status === 'deployment_failed'
      ? 'Aktivierung erneut starten'
      : 'Verlängerung genehmigen und Aktivierung starten';
  }

  decide(decision: 'approve' | 'reject'): void {
    const item = this.submission();
    if (!item || this.deciding()) return;
    this.deciding.set(true); this.decisionError.set(null); this.notice.set(null);
    this.api.decideGovernanceSubmission(item.id, item.revision, item.policyRevision, decision, this.comment().trim() || null).subscribe({
      next: (updated) => {
        this.submission.set(updated); this.deciding.set(false);
        if (updated.status === 'approved_deploying') {
          this.notice.set(this.isAccessRenewal(updated)
            ? 'Genehmigt. DaCa aktiviert zuerst OPA und danach PostgreSQL. Die bestehende Policy bleibt bis zur Bestätigung beider Ziele aktiv.'
            : 'Genehmigt. PostgreSQL ist bestätigt; DaCa wartet fail-closed auf die OPA-Bestätigung.');
          this.scheduleDeploymentPoll(updated.id);
        } else {
          this.finishTerminalStatus(updated);
        }
      },
      error: (error) => { this.deciding.set(false); this.decisionError.set(error?.error?.detail ?? 'Der Entscheid konnte nicht gespeichert werden.'); },
    });
  }

  private scheduleDeploymentPoll(submissionId: string): void {
    this.deploymentPoller?.stop();
    this.deploymentPoller = new GovernanceDeploymentPoller(
      () => this.api.loadGovernanceSubmission(submissionId).pipe(
        // Keep the polling helper independent from the response envelope.
        map(({ submission }) => submission),
      ),
      (submission) => this.submission.set(submission),
      (submission) => this.finishTerminalStatus(submission),
    );
    this.deploymentPoller.start();
  }

  private finishTerminalStatus(submission: GovernanceSubmission): void {
    if (submission.status === 'approved') {
      this.notice.set(this.isAccessRenewal(submission)
        ? 'Verlängerung aktiviert. OPA und PostgreSQL haben exakt diese neue Policy-Revision bestätigt.'
        : 'Publiziert. PostgreSQL und OPA haben exakt diese Policy-Revision bestätigt.');
    } else if (submission.status === 'deployment_failed') {
      this.notice.set(this.isAccessRenewal(submission)
        ? 'Die technische Aktivierung ist fehlgeschlagen. Die bestehende Policy bleibt aktiv und die Verlängerung ist nicht wirksam.'
        : `Das Deployment ist fehlgeschlagen. Produkt und Zugriff bleiben gesperrt; ${this.ownerDisplayName(submission)} erhält eine Korrekturaufgabe.`);
    } else if (submission.status === 'rejected') {
      this.notice.set(this.isAccessRenewal(submission)
        ? 'Verlängerung abgelehnt. Die bestehende Policy bleibt aktiv und gilt unverändert bis zum bisherigen Enddatum.'
        : `Abgelehnt. ${this.ownerDisplayName(submission)} hat eine Korrekturaufgabe erhalten.`);
    }
    this.api.refreshProducts();
    this.api.refreshWorkflowTasks();
  }
}
