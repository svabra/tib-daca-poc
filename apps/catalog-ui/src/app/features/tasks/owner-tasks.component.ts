import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DacaGlossaryTermComponent, StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { AccessRenewalContext, StoredAccessRequest } from '../../core/catalog.models';
import { SourceAccessRequestsComponent } from './source-access-requests.component';

@Component({
  selector: 'daca-owner-tasks',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent, DacaGlossaryTermComponent, SourceAccessRequestsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading owner-tasks-heading">
      <div>
        <p class="daca-eyebrow">Data Owner Workspace</p>
        <h1>Aufgaben</h1>
        <p>Hier finden Sie Zugriffsanfragen und weitere Aufgaben zu Ihren Datenprodukten.</p>
      </div>
      @if (taskStatusUnknown()) {
        <daca-status-badge tone="red">Aufgabenstatus unbekannt</daca-status-badge>
      } @else if (taskStatusLoading()) {
        <daca-status-badge tone="neutral">Aufgabenstatus wird geladen</daca-status-badge>
      } @else {
        <daca-status-badge [tone]="openTaskCount() ? 'orange' : 'green'">
          {{ openTaskCount() }} {{ openTaskCount() === 1 ? 'offene Aufgabe' : 'offene Aufgaben' }}
        </daca-status-badge>
      }
    </section>

    <daca-source-access-requests />

    @if (api.workflowTasksLoading()) {
      <section class="owner-workflow-section" aria-labelledby="workflow-title">
        <div class="owner-tasks-section-heading"><div><p class="daca-eyebrow"><daca-glossary-term term="DAAIF" /> → <daca-glossary-term term="DaCa" /></p><h2 id="workflow-title">Qualität, Governance und Alerts</h2></div><span>–</span></div>
        <div class="daca-card owner-task-empty" aria-live="polite">Weitere Aufgaben werden geladen…</div>
      </section>
    } @else if (api.workflowTasksError(); as taskError) {
      <section class="owner-workflow-section" aria-labelledby="workflow-title">
        <div class="owner-tasks-section-heading"><div><p class="daca-eyebrow"><daca-glossary-term term="DAAIF" /> → <daca-glossary-term term="DaCa" /></p><h2 id="workflow-title">Qualität, Governance und Alerts</h2></div><span>–</span></div>
        <div class="daca-card owner-task-empty is-error" role="alert">
          <strong>Status unbekannt</strong><p>{{ taskError }}</p>
          <button class="daca-button is-secondary" data-testid="retry-workflow-tasks" type="button" (click)="api.refreshWorkflowTasks()">Erneut laden</button>
        </div>
      </section>
    } @else if (workflowTasks().length) {
      <section class="owner-workflow-section" aria-labelledby="workflow-title">
        <div class="owner-tasks-section-heading"><div><p class="daca-eyebrow"><daca-glossary-term term="DAAIF" /> → <daca-glossary-term term="DaCa" /></p><h2 id="workflow-title">Qualität, Governance und Alerts</h2></div><span>{{ workflowTasks().length }}</span></div>
        <div class="owner-task-list">
          @for (task of workflowTasks(); track task.id) {
            <article class="daca-card owner-task-card" [class.is-simulation-alert]="task.taskType.startsWith('simulation_')"><div class="owner-task-priority" aria-hidden="true"></div><div class="owner-task-main"><div><span>{{ taskLabel(task.taskType) }}</span><time>{{ task.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time></div><h3>{{ task.title }}</h3><p>{{ task.detail }}</p></div><a class="daca-button" [routerLink]="taskRoute(task)" [queryParams]="taskQueryParams(task)">Aufgabe öffnen</a></article>
          }
        </div>
      </section>
    }

    @if (filteredProductId()) {
      <div class="owner-tasks-filter">
        <span>Gefiltert nach Datenprodukt: <strong>{{ filteredProductTitle() }}</strong></span>
        <a routerLink="/tasks">Alle Aufgaben anzeigen</a>
      </div>
    }

    <div class="owner-tasks-layout">
      <section aria-labelledby="access-task-title">
        <div class="owner-tasks-section-heading">
          <div><p class="daca-eyebrow">Entscheid nötig</p><h2 id="access-task-title">Zugriffsanfragen</h2></div>
          <span>{{ api.ownerAccessRequestLoading() || api.ownerAccessRequestError() ? '–' : requests().length }}</span>
        </div>
        @if (decisionError()) { <p class="daca-alert is-error" role="alert">{{ decisionError() }}</p> }
        @if (decisionNotice()) { <p class="daca-alert" role="status">{{ decisionNotice() }}</p> }
        @if (api.ownerAccessRequestLoading()) {
          <div class="daca-card owner-task-empty" aria-live="polite">Zugriffsanfragen werden geladen…</div>
        } @else if (api.ownerAccessRequestError(); as inboxError) {
          <div class="daca-card owner-task-empty is-error" role="alert">
            <strong>Status unbekannt</strong><p>{{ inboxError }}</p>
            <button class="daca-button is-secondary" data-testid="retry-owner-inbox" type="button" (click)="api.refreshOwnerAccessRequestInbox()">Erneut laden</button>
          </div>
        } @else if (requests().length) {
          <div class="owner-task-list">
            @for (request of requests(); track request.id) {
              <article class="daca-card owner-task-card">
                <div class="owner-task-priority" aria-hidden="true"></div>
                <div class="owner-task-main">
                  <div><span>{{ request.requestKind === 'renewal' ? 'Verlängerungsantrag' : 'Zugriffsanfrage' }}</span><time [attr.datetime]="request.createdAt">{{ request.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time></div>
                  <h3>{{ request.requesterName }}</h3>
                  <p><strong>{{ request.requesterOrganization }}</strong> beantragt {{ request.requestKind === 'renewal' ? 'die Verlängerung der bestehenden Freigabe' : 'Zugriff' }} auf «{{ productTitle(request.dataProductId) }}».</p>
                  <dl>
                    <div><dt>Identität</dt><dd>{{ request.consumerType === 'person' ? 'eIAM · ' + request.requesterId : 'M2M · ' + request.machineId }}</dd></div>
                    <div><dt>Protokoll</dt><dd>{{ protocolLabel(request.requestedProtocol) }}</dd></div>
                    <div><dt>Gültigkeit</dt><dd>{{ request.validFrom | date: 'dd.MM.yyyy' }}–{{ request.validUntil | date: 'dd.MM.yyyy' }}</dd></div>
                    <div><dt>Status</dt><dd>{{ statusLabel(request.status) }}</dd></div>
                  </dl>
                  @if (renewalContext(request); as previous) {
                    <section class="owner-renewal-review" aria-labelledby="renewal-diff-{{ request.id }}">
                      <div class="owner-renewal-review-heading">
                        <h4 id="renewal-diff-{{ request.id }}">Bisher / Beantragt</h4>
                        <span>Freigabeumfang unverändert</span>
                      </div>
                      <div class="owner-renewal-diff" role="region" aria-label="Vergleich der bestehenden und beantragten Freigabe" tabindex="0">
                        <table>
                          <thead><tr><th scope="col">Merkmal</th><th scope="col">Bisher</th><th scope="col">Beantragt</th></tr></thead>
                          <tbody>
                            <tr><th scope="row">Identität</th><td>{{ subjectLabel(previous) }}</td><td class="is-unchanged">Unverändert</td></tr>
                            <tr><th scope="row">Protokoll</th><td>{{ protocolsLabel(previous.protocols) }}</td><td class="is-unchanged">Unverändert</td></tr>
                            <tr><th scope="row">Datenvariante</th><td>{{ variantLabel(previous.dataVariant) }}</td><td class="is-unchanged">Unverändert</td></tr>
                            <tr><th scope="row">Rechtsgrundlage</th><td>{{ previous.legalBasis }}</td><td class="is-unchanged">Unverändert</td></tr>
                            <tr><th scope="row">Gültig ab</th><td>{{ previous.validFrom | date: 'dd.MM.yyyy' }}</td><td class="is-unchanged">Unverändert</td></tr>
                            <tr><th scope="row">Zeitfenster</th><td>{{ availabilityLabel(previous.weeklyAvailability) }}</td><td class="is-unchanged">Unverändert</td></tr>
                            <tr><th scope="row">Verwendungszweck</th><td>{{ previous.purpose || 'Nicht dokumentiert' }}</td><td>{{ request.purpose }}</td></tr>
                            <tr><th scope="row">Gültig bis</th><td>{{ previous.validUntil | date: 'dd.MM.yyyy' }}</td><td class="is-new">{{ request.validUntil | date: 'dd.MM.yyyy' }}</td></tr>
                          </tbody>
                        </table>
                      </div>
                      <p class="owner-renewal-continuity"><strong>Kein Unterbruch:</strong> Die bisherige Policy bleibt bis zu ihrem Enddatum wirksam. Das neue Enddatum gilt erst, wenn die Kontrollperson freigegeben und OPA sowie PostgreSQL dieselbe neue Revision bestätigt haben.</p>
                    </section>
                  }
                </div>
                <div class="owner-task-actions">
                  @if (governanceFor(request.id); as governance) {
                    <a class="daca-button" [routerLink]="['/governance-submissions', governance.id]">Vier-Augen-Aufgabe öffnen</a>
                  } @else if (request.requestKind === 'renewal') {
                    @if (request.status === 'approved_policy_pending') {
                      <span class="owner-renewal-waiting">Wartet auf Vier-Augen-Freigabe</span>
                    } @else {
                      <button class="daca-button" type="button" [disabled]="isDeciding(request.id)" (click)="approve(request)">{{ decisionFor(request.id) === 'approve' ? 'Genehmigung wird verarbeitet…' : 'Verlängerung genehmigen' }}</button>
                      <button class="daca-button is-secondary" type="button" [disabled]="isDeciding(request.id)" (click)="reject(request)">{{ decisionFor(request.id) === 'reject' ? 'Ablehnung wird verarbeitet…' : 'Ablehnen' }}</button>
                      @if (decisionFor(request.id); as pendingDecision) {
                        <span class="owner-renewal-waiting" role="status">{{ pendingDecision === 'approve' ? 'Genehmigung wird verarbeitet…' : 'Ablehnung wird verarbeitet…' }}</span>
                      }
                    }
                  } @else if (draftFor(request.id); as draft) {
                    <a class="daca-button is-secondary" [routerLink]="['/products', request.dataProductId, 'security']">Rego prüfen</a>
                    <button class="daca-button" type="button" (click)="publish(request, draft)">Policy publizieren</button>
                  } @else if (request.status === 'approved_policy_pending') {
                    <a class="daca-button" [routerLink]="['/products', request.dataProductId, 'security']">Policy-Entwurf öffnen</a>
                  } @else {
                    <a class="daca-button" data-testid="access-request-to-setting" [routerLink]="['/products', request.dataProductId, 'access', 'grant']" [queryParams]="{ request: request.id }">In Zugriffseinstellung übernehmen</a>
                    <button class="daca-button is-secondary" type="button" [disabled]="isDeciding(request.id)" (click)="approve(request)">{{ decisionFor(request.id) === 'approve' ? 'Genehmigung wird verarbeitet…' : 'Direkt genehmigen' }}</button>
                    <button class="daca-button is-secondary" type="button" [disabled]="isDeciding(request.id)" (click)="reject(request)">{{ decisionFor(request.id) === 'reject' ? 'Ablehnung wird verarbeitet…' : 'Ablehnen' }}</button>
                  }
                </div>
              </article>
            }
          </div>
        } @else {
          <div class="daca-card owner-task-empty">Keine offenen Zugriffsanfragen für diese Auswahl.</div>
        }
      </section>

      <aside class="daca-card owner-task-notices" aria-labelledby="owner-notices-title">
        <div class="daca-card-header"><div><p class="daca-eyebrow">Zur Kenntnis</p><h2 id="owner-notices-title">Weitere Aufgaben</h2></div></div>
        <div class="daca-card-body">
          <article><strong>Neue Datenkonsumenten</strong><p>Änderungen bei aktiven Freigaben erscheinen künftig hier.</p></article>
          <article><strong>Auslaufende Freigaben</strong><p>Vor Ablauf einer Berechtigung wird eine Aufgabe erzeugt.</p></article>
        </div>
      </aside>
    </div>
  `,
})
export class OwnerTasksComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly filteredProductId = computed(() => this.queryParamMap().get('product'));
  readonly requests = computed(() => {
    const productId = this.filteredProductId();
    return this.api.ownerAccessRequests().filter((request) => !productId || request.dataProductId === productId);
  });
  readonly filteredProductTitle = computed(() => this.productTitle(this.filteredProductId() ?? ''));
  readonly workflowTasks = computed(() => this.api.workflowTasks().filter((task) => task.taskType !== 'access_request_review' && task.taskType !== 'source_access_review'));
  readonly openTaskCount = computed(() => this.requests().length + this.api.sourceAccessRequests().length + this.workflowTasks().length);
  readonly taskStatusUnknown = computed(() => Boolean(this.api.ownerAccessRequestError() || this.api.workflowTasksError() || this.api.sourceAccessRequestsError()));
  readonly taskStatusLoading = computed(() => this.api.ownerAccessRequestLoading() || this.api.workflowTasksLoading() || this.api.sourceAccessRequestsLoading());
  readonly decisionError = signal<string | null>(null);
  readonly decisionNotice = signal<string | null>(null);
  private readonly decisionsInFlight = signal<Record<string, 'approve' | 'reject'>>({});
  private readonly policyDrafts = signal<Record<string, { id: string; revision: number }>>({});
  private readonly renewalGovernance = signal<Record<string, { id: string }>>({});

  constructor() {
    this.api.refreshSourceAccessRequestInbox();
  }

  productTitle(productId: string): string {
    return this.api.products().find((product) => product.id === productId)?.title ?? 'Unbekanntes Datenprodukt';
  }

  protocolLabel(value: StoredAccessRequest['requestedProtocol']): string {
    return ({ http: 'REST', postgresql: 'PostgreSQL', both: 'REST & PostgreSQL' })[value];
  }

  protocolsLabel(protocols: readonly ('http' | 'postgresql')[]): string {
    return protocols.map((protocol) => protocol === 'http' ? 'REST' : 'PostgreSQL').join(' & ');
  }

  variantLabel(value: 'original' | 'modified'): string {
    return value === 'original' ? 'Originaldaten' : 'Modifiziert / minimiert';
  }

  availabilityLabel(availability: AccessRenewalContext['weeklyAvailability']): string {
    if (!availability) return 'Durchgehend · 24/7';
    const dayLabels: Record<(typeof availability.weekdays)[number], string> = {
      monday: 'Mo',
      tuesday: 'Di',
      wednesday: 'Mi',
      thursday: 'Do',
      friday: 'Fr',
      saturday: 'Sa',
      sunday: 'So',
    };
    return `${availability.weekdays.map((day) => dayLabels[day]).join(', ')} · ${availability.startTime}–${availability.endTime} · ${availability.timeZone}`;
  }

  renewalContext(request: StoredAccessRequest): AccessRenewalContext | null {
    return request.requestKind === 'renewal' ? request.renewalContext : null;
  }

  subjectLabel(context: AccessRenewalContext): string {
    const kind = context.subject.type === 'person' ? 'eIAM' : context.subject.type === 'machine' ? 'M2M' : 'Gruppe';
    return `${kind} · ${context.subject.id}`;
  }

  taskLabel(value: string): string {
    return ({
      metadata_quality: 'Qualität',
      access_governance: 'Governance',
      simulation_quality_alert: 'Qualitätsalarm',
      simulation_discoverability_alert: 'Auffindbarkeitsalarm',
      simulation_isbo_restriction: 'Dringender Sicherheitsalarm',
      publication_approval: 'Vier-Augen-Freigabe',
      governance_correction: 'Korrektur erforderlich',
      service_level_approval: 'SLA-Kontrolle',
    } as Record<string, string>)[value] ?? 'Aufgabe';
  }

  taskRoute(task: { taskType: string; dataProductId: string | null; governanceSubmissionId?: string | null }): unknown[] {
    if (!task.dataProductId) return ['/tasks'];
    if (task.taskType === 'publication_approval' && task.governanceSubmissionId) return ['/governance-submissions', task.governanceSubmissionId];
    if (task.taskType === 'service_level_approval') return ['/products', task.dataProductId, 'sla'];
    if (task.taskType === 'metadata_quality' || task.taskType === 'simulation_quality_alert') return ['/products', task.dataProductId, 'quality'];
    if (task.taskType.startsWith('simulation_')) return ['/products', task.dataProductId, 'overview'];
    return ['/products', task.dataProductId, 'access', 'grant'];
  }

  taskQueryParams(task: { taskType: string; serviceLevelRevisionId?: string | null }): Record<string, string> | null {
    return task.taskType === 'service_level_approval' && task.serviceLevelRevisionId
      ? { review: task.serviceLevelRevisionId }
      : null;
  }

  statusLabel(value: StoredAccessRequest['status']): string {
    return ({
      submitted: 'Anfrage eingegangen',
      identity_review: 'Identität wird geprüft',
      legal_review: 'Rechtslage wird geprüft',
      conditions_review: 'Zugriffskonditionen werden geprüft',
      approved_policy_pending: 'Genehmigt · Policy wird publiziert',
      granted_modified: 'Zugriff gewährt (modifiziert)',
      granted_original: 'Zugriff gewährt (original)',
      rejected: 'Abgelehnt',
      withdrawn: 'Zurückgezogen',
    })[value];
  }

  approve(request: StoredAccessRequest): void {
    if (this.isDeciding(request.id)) return;
    this.decisionError.set(null);
    this.decisionNotice.set(null);
    const renewal = this.renewalContext(request);
    if (request.requestKind === 'renewal' && !renewal) {
      this.decisionError.set('Der unveränderliche Ausgangskontext fehlt. Die Verlängerung wurde nicht genehmigt.');
      return;
    }
    const variant = renewal?.dataVariant ?? (request.requestedVariant === 'original' ? 'original' : 'modified');
    this.startDecision(request.id, 'approve');
    this.api.decideAccessRequest(request.id, 'approve', variant).pipe(finalize(() => this.finishDecision(request.id))).subscribe({
      next: (result) => {
        if (request.requestKind === 'renewal') {
          if (!result.policy || !result.governanceSubmission) {
            this.decisionError.set('Die Governance-Evidenz ist unvollständig. Die neue Policy wird nicht als freigegeben angezeigt.');
            return;
          }
          this.renewalGovernance.update((items) => ({
            ...items,
            [request.id]: { id: result.governanceSubmission!.id },
          }));
          const approver = result.governanceSubmission.reviewSnapshot?.approver?.displayName?.trim();
          this.decisionNotice.set(`Verlängerung genehmigt und ${approver || 'der Kontrollperson'} zur Vier-Augen-Prüfung übermittelt. Die bestehende Freigabe bleibt bis zum bestätigten Doppel-Deployment wirksam.`);
        } else if (result.policy) {
          this.policyDrafts.update((drafts) => ({ ...drafts, [request.id]: { id: result.policy!.id, revision: result.policy!.revision } }));
          this.decisionNotice.set('Anfrage genehmigt. Prüfen Sie den Rego-Entwurf und publizieren Sie die Policy bewusst.');
        }
      },
      error: (error) => this.decisionError.set(error?.error?.detail ?? 'Die Anfrage konnte nicht genehmigt werden.'),
    });
  }

  draftFor(requestId: string): { id: string; revision: number } | null {
    return this.policyDrafts()[requestId] ?? null;
  }

  governanceFor(requestId: string): { id: string } | null {
    return this.renewalGovernance()[requestId] ?? null;
  }

  decisionFor(requestId: string): 'approve' | 'reject' | null {
    return this.decisionsInFlight()[requestId] ?? null;
  }

  isDeciding(requestId: string): boolean {
    return Boolean(this.decisionFor(requestId));
  }

  publish(request: StoredAccessRequest, draft: { id: string; revision: number }): void {
    this.decisionError.set(null);
    this.api.publishPolicy(request.dataProductId, draft.id, draft.revision).subscribe({
      next: () => {
        this.policyDrafts.update((drafts) => {
          const next = { ...drafts };
          delete next[request.id];
          return next;
        });
        this.decisionNotice.set('Policy publiziert. Der zeitlich begrenzte Zugriff ist jetzt aktiv.');
      },
      error: (error) => this.decisionError.set(error?.error?.detail ?? 'Policy-Publikation fehlgeschlagen.'),
    });
  }

  reject(request: StoredAccessRequest): void {
    if (this.isDeciding(request.id)) return;
    this.decisionError.set(null);
    this.decisionNotice.set(null);
    this.startDecision(request.id, 'reject');
    this.api.decideAccessRequest(request.id, 'reject').pipe(finalize(() => this.finishDecision(request.id))).subscribe({ error: (error) => this.decisionError.set(error?.error?.detail ?? 'Die Anfrage konnte nicht abgelehnt werden.') });
  }

  private startDecision(requestId: string, decision: 'approve' | 'reject'): void {
    this.decisionsInFlight.update((current) => ({ ...current, [requestId]: decision }));
  }

  private finishDecision(requestId: string): void {
    this.decisionsInFlight.update((current) => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });
  }
}
