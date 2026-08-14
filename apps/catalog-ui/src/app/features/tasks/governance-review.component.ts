import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { map } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { GovernanceSubmission } from '../../core/catalog.models';
import { GovernanceDeploymentPoller } from './governance-deployment-poller';

@Component({
  selector: 'daca-governance-review',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div><p class="daca-eyebrow">Vier-Augen-Prinzip · Publikationsfreigabe</p><h1>Governance-Snapshot prüfen</h1><p>Der Entscheid gilt exakt für die angezeigte Policy-Revision. Nachträgliche Änderungen erfordern eine neue Einreichung.</p></div>
      @if (submission(); as item) { <daca-status-badge [tone]="item.status === 'approved' ? 'green' : item.status === 'rejected' || item.status === 'deployment_failed' ? 'red' : 'orange'">{{ statusLabel(item.status) }}</daca-status-badge> }
    </section>

    @if (loading()) { <section class="daca-card"><div class="daca-card-body">Prüfsnapshot wird geladen …</div></section> }
    @else if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }}</p> }
    @else if (submission(); as item) {
      <div class="exposure-layout">
        <section class="daca-card exposure-form">
          <div class="daca-card-header"><div><p class="daca-eyebrow">Unveränderliche Evidenz</p><h2>{{ item.reviewSnapshot.dataProduct.title }}</h2></div><strong>Policy Rev. {{ item.policyRevision }}</strong></div>
          <div class="daca-card-body">
            <dl class="exposure-review-list">
              <div><dt>Data Owner</dt><dd>{{ item.ownerUserId }}</dd></div>
              <div><dt>Approver</dt><dd>{{ item.reviewSnapshot.approver.displayName }}</dd></div>
              <div><dt>Klassifikation</dt><dd>{{ item.reviewSnapshot.dataProduct.classification }}</dd></div>
              <div><dt>Auffindbarkeit</dt><dd>{{ item.reviewSnapshot.discoverable ? 'Nach Deployment aktivieren' : 'Nicht aktivieren' }}</dd></div>
              <div><dt>Eingereicht</dt><dd>{{ item.submittedAt | date: 'dd.MM.yyyy, HH:mm' }}</dd></div>
              <div><dt>BAR</dt><dd>{{ item.archiveEvidence['enabled'] ? 'Automatisch · 20 Jahre' : 'Deaktiviert' }}</dd></div>
            </dl>
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
                    <div><span>{{ grant.subject.type === 'group' ? 'Gruppe' : 'Person' }}</span><code>{{ grant.subject.id }}</code></div>
                    <h3>{{ grant.subject.id }}</h3>
                    <p>REST · <code>data.read</code> · Variante {{ grant.dataVariant }} · {{ grant.validFrom }} bis {{ grant.validUntil }}</p>
                    @if (grant.weeklyAvailability; as hours) { <p><strong>Bürozeiten:</strong> Montag–Freitag, {{ hours.startTime }}–{{ hours.endTime }} · {{ hours.timeZone }}</p> } @else { <p><strong>Zeitfenster:</strong> durchgehend · 24/7</p> }
                    <p><strong>KOBY / MCP:</strong> {{ grant.metadataChannels?.kobyMcp ? 'aktiviert' : 'deaktiviert' }} <span aria-hidden="true">·</span> <strong>I14Y:</strong> {{ grant.metadataChannels?.i14y ? 'aktiviert' : 'deaktiviert' }} <span aria-hidden="true">·</span> <strong>Mitgliedersnapshot:</strong> {{ grant.groupSnapshot?.memberIds?.length ?? 'Person' }}</p>
                  </div>
                </article>
              }
            </div>
          </div>
        </section>

        <aside class="daca-card exposure-review">
          <div class="daca-card-header"><div><p class="daca-eyebrow">Entscheid durch Thomas Kriegli</p><h2>Publikation freigeben</h2></div></div>
          <div class="daca-card-body">
            <div class="exposure-guardrail"><strong>Default deny bis zum Doppel-Deployment</strong><p>Auch nach Ihrer Genehmigung bleiben Auffindbarkeit und Zugriff gesperrt, bis PostgreSQL und OPA genau Revision {{ item.policyRevision }} bestätigt haben.</p></div>
            <label>Kommentar<textarea rows="4" [value]="comment()" (input)="comment.set($any($event.target).value)" placeholder="Optional bei Genehmigung, empfohlen bei Ablehnung"></textarea></label>
            @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
            @if (decisionError()) { <p class="daca-alert is-error" role="alert">{{ decisionError() }}</p> }
            @if (item.status === 'pending_approval' || item.status === 'deployment_failed') {
              <button class="daca-button exposure-primary-action" data-testid="governance-approve" type="button" [disabled]="deciding()" (click)="decide('approve')">{{ deciding() ? 'Entscheid wird verarbeitet …' : 'Genehmigen und Deployment starten' }}</button>
              <button class="daca-button is-secondary exposure-secondary-action" type="button" [disabled]="deciding()" (click)="decide('reject')">Ablehnen</button>
            }
            <a class="daca-button is-secondary exposure-secondary-action" routerLink="/tasks">Zurück zu den Aufgaben</a>
          </div>
        </aside>
      </div>
    }
  `,
})
export class GovernanceReviewComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CatalogApiService);
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

  statusLabel(status: GovernanceSubmission['status']): string {
    return ({ pending_approval: 'Entscheid ausstehend', approved_deploying: 'Genehmigt · Deployment läuft', approved: 'Publiziert', rejected: 'Abgelehnt', deployment_failed: 'Deployment fehlgeschlagen' })[status];
  }

  decide(decision: 'approve' | 'reject'): void {
    const item = this.submission();
    if (!item || this.deciding()) return;
    this.deciding.set(true); this.decisionError.set(null); this.notice.set(null);
    this.api.decideGovernanceSubmission(item.id, item.revision, item.policyRevision, decision, this.comment().trim() || null).subscribe({
      next: (updated) => {
        this.submission.set(updated); this.deciding.set(false);
        if (updated.status === 'approved_deploying') {
          this.notice.set('Genehmigt. PostgreSQL ist bestätigt; DaCa wartet fail-closed auf die OPA-Bestätigung.');
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
      this.notice.set('Publiziert. PostgreSQL und OPA haben exakt diese Policy-Revision bestätigt.');
    } else if (submission.status === 'deployment_failed') {
      this.notice.set('Das Deployment ist fehlgeschlagen. Produkt und Zugriff bleiben gesperrt; Joel Ruod erhält eine Korrekturaufgabe.');
    } else if (submission.status === 'rejected') {
      this.notice.set('Abgelehnt. Joel Ruod hat eine Korrekturaufgabe erhalten.');
    }
    this.api.refreshProducts();
    this.api.refreshWorkflowTasks();
  }
}
