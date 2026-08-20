import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { SourceAccessRequest } from '../../core/catalog.models';

@Component({
  selector: 'daca-source-access-requests',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="source-access-owner" aria-labelledby="source-access-owner-title">
      <header class="owner-tasks-section-heading">
        <div>
          <p class="daca-eyebrow">Datenquellen erschliessen</p>
          <h2 id="source-access-owner-title">Datenquellen-Zugriffsanfragen</h2>
          <p>Direkte Owner-Entscheide für den Oracle-Sourcing-PoC – ohne Produkt-PBAC oder OPA-Projektion.</p>
        </div>
        <span>{{ api.sourceAccessRequestsLoading() || api.sourceAccessRequestsError() ? '–' : api.sourceAccessRequests().length }}</span>
      </header>

      @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
      @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }}</p> }

      @if (api.sourceAccessRequestsLoading()) {
        <div class="daca-card owner-task-empty" aria-live="polite">Datenquellen-Anfragen werden geladen…</div>
      } @else if (api.sourceAccessRequestsError(); as loadError) {
        <div class="daca-card owner-task-empty is-error" role="alert">
          <strong>Status unbekannt</strong><p>{{ loadError }}</p>
          <button class="daca-button is-secondary" type="button" (click)="api.refreshSourceAccessRequestInbox()">Erneut laden</button>
        </div>
      } @else if (api.sourceAccessRequests().length) {
        <div class="source-access-owner-list">
          @for (request of api.sourceAccessRequests(); track request.id) {
            <article class="daca-card source-access-owner-card" [attr.data-source-request-id]="request.id">
              <div class="source-access-owner-accent" aria-hidden="true"></div>
              <div class="source-access-owner-main">
                <div class="source-access-owner-kicker">
                  <span>{{ request.requestNumber }} · BIT Oracle RDBMS</span>
                  <time [attr.datetime]="request.createdAt">{{ request.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</time>
                </div>
                <h3>{{ request.source.displayName }}</h3>
                <p class="source-access-owner-db">{{ request.source.databaseName }} · {{ request.source.organization }} · {{ request.source.sites.join(' + ') }}</p>
                <p><strong>{{ request.requesterName }}</strong> aus {{ request.requesterOrganization }} beantragt den Zugriff für <strong>{{ request.subject.label }}</strong>.</p>
                <dl class="source-access-owner-facts">
                  <div><dt>Antragsname</dt><dd>{{ request.requestTitle }}</dd></div>
                  <div><dt>Subject</dt><dd>{{ request.subject.type === 'group' ? 'Gruppe' : 'Person' }} · {{ request.subject.label }}</dd></div>
                  @if (request.groupSnapshot; as snapshot) {
                    <div><dt>Gruppensnapshot</dt><dd>Revision {{ snapshot.membershipRevision }} · {{ snapshot.memberIds.length }} Personen</dd></div>
                  }
                  <div><dt>Verwendungszweck</dt><dd>{{ request.purpose }}</dd></div>
                  <div><dt>Rechtsgrundlage</dt><dd>{{ request.legalBasis }}</dd></div>
                  <div><dt>Gültigkeit</dt><dd>{{ request.validFrom | date: 'dd.MM.yyyy' }} – {{ request.validUntil ? (request.validUntil | date: 'dd.MM.yyyy') : 'Unbefristet' }}</dd></div>
                </dl>
                @if (rejectingId() === request.id) {
                  <div class="source-access-reject-panel">
                    <label [for]="'source-reject-' + request.id">Begründung der Ablehnung</label>
                    <textarea [id]="'source-reject-' + request.id" rows="3" [value]="rejectComment()" (input)="rejectComment.set($any($event.target).value)" placeholder="Konkrete Begründung für Joel Ruod"></textarea>
                    <div>
                      <button class="daca-button is-secondary" type="button" (click)="cancelReject()">Abbrechen</button>
                      <button class="daca-button" type="button" [disabled]="rejectComment().trim().length < 3 || decidingId() === request.id" (click)="decide(request, 'reject')">Ablehnung bestätigen</button>
                    </div>
                  </div>
                }
              </div>
              <aside class="source-access-owner-actions">
                <span class="source-access-owner-badge">Owner-Entscheid</span>
                <p>Keine zweite Kontrollperson. Der Entscheid erzeugt einen auditierbaren Source Grant.</p>
                <button class="daca-button" type="button" [disabled]="decidingId() === request.id" (click)="decide(request, 'approve')">
                  {{ decidingId() === request.id ? 'Wird verarbeitet…' : 'Zugriff genehmigen' }}
                </button>
                <button class="daca-button is-secondary" type="button" [disabled]="decidingId() === request.id" (click)="beginReject(request.id)">Ablehnen</button>
              </aside>
            </article>
          }
        </div>
      } @else {
        <div class="daca-card owner-task-empty">Keine offenen Datenquellen-Zugriffsanfragen.</div>
      }
    </section>
  `,
})
export class SourceAccessRequestsComponent {
  readonly api = inject(CatalogApiService);
  readonly decidingId = signal<string | null>(null);
  readonly rejectingId = signal<string | null>(null);
  readonly rejectComment = signal('');
  readonly notice = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  beginReject(requestId: string): void {
    this.rejectingId.set(requestId);
    this.rejectComment.set('');
    this.error.set(null);
  }

  cancelReject(): void {
    this.rejectingId.set(null);
    this.rejectComment.set('');
  }

  decide(request: SourceAccessRequest, decision: 'approve' | 'reject'): void {
    if (this.decidingId()) return;
    const comment = decision === 'reject' ? this.rejectComment().trim() : 'Für den Oracle-PoC freigegeben.';
    if (decision === 'reject' && comment.length < 3) return;
    this.decidingId.set(request.id);
    this.notice.set(null);
    this.error.set(null);
    this.api.decideSourceAccessRequest(request.id, decision, comment).pipe(
      finalize(() => this.decidingId.set(null)),
    ).subscribe({
      next: () => {
        this.rejectingId.set(null);
        this.rejectComment.set('');
        this.notice.set(decision === 'approve'
          ? `${request.requestNumber} wurde genehmigt. DAAIF kann den Grant jetzt aktivieren.`
          : `${request.requestNumber} wurde mit Begründung abgelehnt.`);
      },
      error: () => this.error.set('Der Entscheid konnte nicht gespeichert werden. Bitte erneut versuchen.'),
    });
  }
}
