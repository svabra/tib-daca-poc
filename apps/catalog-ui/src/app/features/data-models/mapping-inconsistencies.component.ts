import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService, MappingInconsistency } from './data-models-api.service';

@Component({
  selector: 'daca-mapping-inconsistencies',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) { <p class="quality-state" aria-live="polite">Konsistenz wird geprüft …</p> }
    @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }} <button type="button" (click)="reload()">Erneut laden</button></p> }
    @if (!loading() && !error() && activeIssues().length) {
      <section class="quality-panel" aria-labelledby="mapping-quality-title" data-testid="mapping-inconsistencies">
        <header><div><p class="daca-eyebrow">Modellqualität · Fehler</p><h2 id="mapping-quality-title">Inkonsistenzfehler ({{ activeIssues().length }})</h2></div><strong>Speichern möglich</strong></header>
        <p>Diese logischen Felder haben in der verknüpften physischen Repräsentation keinen Counterpart. Das Modell bleibt als Entwurf speicherbar; die Bewertung enthält einen Fehler, bis das Feld verbunden oder entfernt wird.</p>
        <div class="issue-list">
          @for (issue of activeIssues(); track issue.id) {
            <article class="issue-row" [attr.data-testid]="'mapping-issue-'+issue.fieldName">
              <div><strong>{{ issue.fieldName }}</strong><span>{{ statusLabel(issue) }}</span>@if(issue.decisionComment){<small>{{ issue.decisionComment }}</small>}</div>
              @if (issue.ownerUserId === identity.userId() && (issue.status === 'open' || issue.status === 'assigned')) {
                <button class="daca-button is-secondary" type="button" (click)="select(issue.id)">Bearbeiten</button>
              }
              @if (selectedIssueId() === issue.id) {
                <div class="decision-form">
                  <label>Begründung<textarea rows="2" maxlength="4000" [value]="comment()" (input)="comment.set(inputValue($event))" placeholder="Entscheid oder Prüfauftrag begründen"></textarea></label>
                  <label>Data Steward<select [value]="stewardId()" (change)="stewardId.set(inputValue($event))"><option value="">Person wählen</option>@for(person of stewards();track person.id){<option [value]="person.id">{{ person.displayName }}</option>}</select></label>
                  <div><button class="daca-button is-secondary" type="button" [disabled]="saving() || !comment().trim()" (click)="decide(issue,'accept')">Inkonsistenz akzeptieren</button><button class="daca-button" type="button" [disabled]="saving() || !comment().trim() || !stewardId()" (click)="decide(issue,'dispatch')">Prüfung beauftragen</button><button type="button" (click)="selectedIssueId.set(null)">Abbrechen</button></div>
                </div>
              }
            </article>
          }
        </div>
      </section>
    }
  `,
  styles: [`
    .quality-state{padding:.65rem;color:var(--daca-muted);font-size:.72rem}.quality-panel{margin:.7rem 0;border:1px solid var(--daca-border);border-left:5px solid var(--daca-red);padding:.75rem 1rem;background:var(--daca-surface)}.quality-panel>header{display:flex;justify-content:space-between;align-items:center;gap:1rem}.quality-panel h2{margin:.1rem 0;font-size:1rem}.quality-panel>header>strong{color:var(--daca-red-dark);font-size:.65rem}.quality-panel>p{margin:.35rem 0 .65rem;color:var(--daca-muted);font-size:.7rem}.issue-list{display:grid;gap:.45rem}.issue-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;border:1px solid var(--daca-border);padding:.55rem .65rem;background:var(--daca-surface)}.issue-row>div:first-child{display:grid;gap:.1rem}.issue-row strong{font-size:.73rem}.issue-row span,.issue-row small{color:var(--daca-muted);font-size:.63rem}.issue-row .daca-button{min-height:34px;padding:.3rem .5rem;font-size:.65rem}.decision-form{display:grid;grid-template-columns:minmax(220px,1fr) minmax(180px,260px);gap:.6rem;width:100%;border-top:1px solid var(--daca-border);padding-top:.55rem}.decision-form label{display:grid;gap:.2rem;font-size:.65rem;font-weight:750}.decision-form textarea,.decision-form select{min-height:38px;border:1px solid var(--daca-border-strong);padding:.4rem;background:var(--daca-surface);color:var(--daca-ink);font:inherit}.decision-form>div{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.4rem}.decision-form>div>button:last-child{border:0;background:transparent;color:var(--daca-blue);cursor:pointer}@media(max-width:700px){.decision-form{grid-template-columns:1fr}}
  `],
})
export class MappingInconsistenciesComponent {
  readonly modelId = input.required<string>();
  readonly refreshKey = input(0);
  readonly identity = inject(DemoIdentityService);
  private readonly api = inject(DataModelsApiService);
  private readonly catalogApi = inject(CatalogApiService);
  readonly issues = signal<MappingInconsistency[]>([]);
  readonly stewards = signal<{ id: string; displayName: string }[]>([]);
  readonly activeIssues = () => this.issues().filter((item) => item.status !== 'resolved');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedIssueId = signal<string | null>(null);
  readonly comment = signal('');
  readonly stewardId = signal('');

  constructor() { effect(() => { this.modelId(); this.refreshKey(); this.identity.userId(); this.reload(); }); }
  reload(): void {
    const modelId = this.modelId();
    this.loading.set(true); this.error.set(null);
    this.api.listMappingInconsistencies(modelId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (result) => { if (modelId === this.modelId()) { this.issues.set(result.items); this.stewards.set(result.eligibleStewards); } },
      error: (error: Error) => this.error.set(error.message),
    });
  }
  select(id: string): void { this.selectedIssueId.set(id); this.comment.set(''); this.stewardId.set(''); }
  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  statusLabel(issue: MappingInconsistency): string {
    return ({ open: 'Entscheid des Data Owners offen', accepted: 'Vom Data Owner akzeptiert · Qualitätsfehler bleibt', assigned: 'An Data Steward zur Prüfung vergeben', resolved: 'Aufgelöst' })[issue.status];
  }
  decide(issue: MappingInconsistency, action: 'accept' | 'dispatch'): void {
    if (!this.comment().trim() || (action === 'dispatch' && !this.stewardId())) return;
    this.saving.set(true); this.error.set(null);
    this.api.decideMappingInconsistency(this.modelId(), issue.id, action, this.comment().trim(), this.stewardId()).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (saved) => { this.issues.update((items) => items.map((item) => item.id === saved.id ? saved : item)); this.selectedIssueId.set(null); this.catalogApi.refreshWorkflowTasks(); },
      error: (error: Error) => this.error.set(error.message),
    });
  }
}
