import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DidacaGlossaryTermComponent, StatusBadgeComponent } from '@bit-didaca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { StoredAccessRequest } from '../../core/catalog.models';

@Component({
  selector: 'didaca-owner-tasks',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent, DidacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="didaca-page-heading owner-tasks-heading">
      <div>
        <p class="didaca-eyebrow">Data Owner Workspace</p>
        <h1>Aufgaben</h1>
        <p>Hier finden Sie Zugriffsanfragen und weitere Aufgaben zu Ihren Datenprodukten.</p>
      </div>
      <didaca-status-badge [tone]="requests().length ? 'orange' : 'green'">
        {{ requests().length }} {{ requests().length === 1 ? 'offene Aufgabe' : 'offene Aufgaben' }}
      </didaca-status-badge>
    </section>

    @if (workflowTasks().length) {
      <section class="owner-workflow-section" aria-labelledby="workflow-title">
        <div class="owner-tasks-section-heading"><div><p class="didaca-eyebrow"><didaca-glossary-term term="DAAIF" /> → <didaca-glossary-term term="DaCa" /></p><h2 id="workflow-title">Qualität, Governance und Alerts</h2></div><span>{{ workflowTasks().length }}</span></div>
        <div class="owner-task-list">
          @for (task of workflowTasks(); track task.id) {
            <article class="didaca-card owner-task-card" [class.is-simulation-alert]="task.taskType.startsWith('simulation_')"><div class="owner-task-priority" aria-hidden="true"></div><div class="owner-task-main"><div><span>{{ taskLabel(task.taskType) }}</span><time>{{ task.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time></div><h3>{{ task.title }}</h3><p>{{ task.detail }}</p></div><a class="didaca-button" [routerLink]="taskRoute(task)">Aufgabe öffnen</a></article>
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
          <div><p class="didaca-eyebrow">Entscheid nötig</p><h2 id="access-task-title">Zugriffsanfragen</h2></div>
          <span>{{ requests().length }}</span>
        </div>
        @if (decisionError()) { <p class="didaca-alert is-error" role="alert">{{ decisionError() }}</p> }
        @if (decisionNotice()) { <p class="didaca-alert" role="status">{{ decisionNotice() }}</p> }
        @if (api.ownerAccessRequestLoading()) {
          <div class="didaca-card owner-task-empty">Aufgaben werden geladen…</div>
        } @else if (requests().length) {
          <div class="owner-task-list">
            @for (request of requests(); track request.id) {
              <article class="didaca-card owner-task-card">
                <div class="owner-task-priority" aria-hidden="true"></div>
                <div class="owner-task-main">
                  <div><span>Zugriffsanfrage</span><time [attr.datetime]="request.createdAt">{{ request.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time></div>
                  <h3>{{ request.requesterName }}</h3>
                  <p><strong>{{ request.requesterOrganization }}</strong> beantragt Zugriff auf «{{ productTitle(request.dataProductId) }}».</p>
                  <dl>
                    <div><dt>Identität</dt><dd>{{ request.consumerType === 'person' ? 'eIAM · ' + request.requesterId : 'M2M · ' + request.machineId }}</dd></div>
                    <div><dt>Protokoll</dt><dd>{{ protocolLabel(request.requestedProtocol) }}</dd></div>
                    <div><dt>Gültigkeit</dt><dd>{{ request.validFrom | date: 'dd.MM.yyyy' }}–{{ request.validUntil | date: 'dd.MM.yyyy' }}</dd></div>
                    <div><dt>Status</dt><dd>{{ statusLabel(request.status) }}</dd></div>
                  </dl>
                </div>
                <div class="owner-task-actions">
                  @if (draftFor(request.id); as draft) {
                    <a class="didaca-button is-secondary" [routerLink]="['/products', request.dataProductId, 'security']">Rego prüfen</a>
                    <button class="didaca-button" type="button" (click)="publish(request, draft)">Policy publizieren</button>
                  } @else if (request.status === 'approved_policy_pending') {
                    <a class="didaca-button" [routerLink]="['/products', request.dataProductId, 'security']">Policy-Entwurf öffnen</a>
                  } @else {
                    <button class="didaca-button" type="button" (click)="approve(request)">Genehmigen</button>
                    <button class="didaca-button is-secondary" type="button" (click)="reject(request)">Ablehnen</button>
                  }
                </div>
              </article>
            }
          </div>
        } @else {
          <div class="didaca-card owner-task-empty">Keine offenen Zugriffsanfragen für diese Auswahl.</div>
        }
      </section>

      <aside class="didaca-card owner-task-notices" aria-labelledby="owner-notices-title">
        <div class="didaca-card-header"><div><p class="didaca-eyebrow">Zur Kenntnis</p><h2 id="owner-notices-title">Weitere Aufgaben</h2></div></div>
        <div class="didaca-card-body">
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
  readonly workflowTasks = computed(() => this.api.workflowTasks().filter((task) => task.taskType !== 'access_request_review'));
  readonly decisionError = signal<string | null>(null);
  readonly decisionNotice = signal<string | null>(null);
  private readonly policyDrafts = signal<Record<string, { id: string; revision: number }>>({});

  productTitle(productId: string): string {
    return this.api.products().find((product) => product.id === productId)?.title ?? 'Unbekanntes Datenprodukt';
  }

  protocolLabel(value: StoredAccessRequest['requestedProtocol']): string {
    return ({ http: 'REST', postgresql: 'PostgreSQL', both: 'REST & PostgreSQL' })[value];
  }

  taskLabel(value: string): string {
    return ({
      metadata_quality: 'Qualität',
      access_governance: 'Governance',
      simulation_quality_alert: 'Qualitätsalarm',
      simulation_discoverability_alert: 'Auffindbarkeitsalarm',
      simulation_isbo_restriction: 'Dringender Sicherheitsalarm',
    } as Record<string, string>)[value] ?? 'Aufgabe';
  }

  taskRoute(task: { taskType: string; dataProductId: string }): unknown[] {
    if (task.taskType === 'metadata_quality' || task.taskType === 'simulation_quality_alert') return ['/products', task.dataProductId, 'quality'];
    if (task.taskType.startsWith('simulation_')) return ['/products', task.dataProductId, 'overview'];
    return ['/products', task.dataProductId, 'access', 'grant'];
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
    this.decisionError.set(null);
    this.decisionNotice.set(null);
    const variant = request.requestedVariant === 'original' ? 'original' : 'modified';
    this.api.decideAccessRequest(request.id, 'approve', variant).subscribe({
      next: (result) => {
        if (result.policy) {
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
    this.decisionError.set(null);
    this.decisionNotice.set(null);
    this.api.decideAccessRequest(request.id, 'reject').subscribe({ error: (error) => this.decisionError.set(error?.error?.detail ?? 'Die Anfrage konnte nicht abgelehnt werden.') });
  }
}
