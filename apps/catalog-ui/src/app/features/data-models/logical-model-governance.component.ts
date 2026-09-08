import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModel, LogicalModelReadiness, LOGICAL_MODEL_STATUS_LABELS } from './data-models.models';

@Component({
  selector: 'daca-logical-model-governance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="governance-grid">
      <section class="daca-card readiness-card" aria-labelledby="readiness-title">
        <header><div><p class="daca-eyebrow">Validierung</p><h2 id="readiness-title">Publikationsbereitschaft</h2></div>@if(loading()){<span aria-live="polite">Wird geprüft …</span>}</header>
        @if(readiness();as result){
          <div class="readiness-results">
            <article [class.is-ready]="result.dcatReady"><strong>DCAT-AP-CH · {{ result.dcatReady ? 'Bereit' : 'Offen' }}</strong><p>{{ result.dcatReady ? 'Pflichtfelder sind publikationsbereit.' : 'Pflichtfelder müssen ergänzt werden.' }}</p>@if(result.dcatIssues.length){<ul>@for(issue of result.dcatIssues;track issue){<li>{{ issueLabel(issue) }}</li>}</ul>}</article>
            <article [class.is-ready]="result.i14yReady"><strong>I14Y · {{ result.i14yReady ? 'Bereit' : 'Offen' }}</strong><p>{{ result.i14yReady ? 'Eine Distribution oder ein Data Service ist vorhanden.' : 'Die zusätzliche I14Y-Bereitschaft ist noch nicht erfüllt.' }}</p>@if(result.i14yIssues.length){<ul>@for(issue of result.i14yIssues;track issue){<li>{{ issueLabel(issue) }}</li>}</ul>}</article>
          </div>
        } @else if(!loading()) { <p class="panel-error" role="status">{{ error() || 'Die Bereitschaft konnte nicht ermittelt werden.' }}</p> }
      </section>

      <section class="daca-card history-card" aria-labelledby="history-title">
        <header><div><p class="daca-eyebrow">Unveränderliche Nachfolger</p><h2 id="history-title">Versionshistorie</h2></div><span>{{ versions().length }} Version{{ versions().length === 1 ? '' : 'en' }}</span></header>
        @if(versions().length){<ol>@for(version of versions();track version.versionId){<li [class.is-current]="version.versionId===model().versionId"><div><strong>Version {{ version.revision }}</strong><span>{{ statusLabel(version) }}</span></div><p>{{ dateLabel(version.createdAt) }} · {{ version.createdBy.displayName || 'System' }}</p><code>{{ version.versionId }}</code></li>}</ol>}
        @else if(!loading()){<p class="panel-error" role="status">{{ error() || 'Noch keine Versionen vorhanden.' }}</p>}
      </section>
    </div>
  `,
  styles: [`
    .governance-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr);gap:1rem;margin-bottom:1.25rem}.readiness-card,.history-card{box-shadow:none}.readiness-card>header,.history-card>header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.2rem;border-bottom:1px solid var(--daca-border)}h2,p{margin:.2rem 0}.readiness-card>header>span,.history-card>header>span{color:var(--daca-muted);font-size:.68rem}.readiness-results{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;padding:1rem}.readiness-results article{border-left:4px solid var(--daca-red);padding:.75rem;background:#fff4f2}.readiness-results article.is-ready{border-left-color:var(--daca-green);background:#f2f8f4}.readiness-results strong{font-size:.8rem}.readiness-results p,.readiness-results li,.panel-error{color:var(--daca-muted);font-size:.68rem}.readiness-results ul{margin:.5rem 0 0;padding-left:1rem}.history-card ol{display:grid;max-height:260px;margin:0;padding:0;overflow:auto;list-style:none}.history-card li{display:grid;gap:.25rem;padding:.75rem 1rem;border-left:4px solid transparent;border-bottom:1px solid var(--daca-border)}.history-card li.is-current{border-left-color:var(--daca-blue);background:var(--daca-blue-soft)}.history-card li>div{display:flex;align-items:center;justify-content:space-between;gap:.6rem;font-size:.72rem}.history-card li p,.history-card li code{margin:0;color:var(--daca-muted);font-size:.62rem}.panel-error{padding:1rem}@media(max-width:980px){.governance-grid{grid-template-columns:1fr}}@media(max-width:520px){.readiness-results{grid-template-columns:1fr}}
  `],
})
export class LogicalModelGovernanceComponent {
  readonly model = input.required<LogicalModel>();
  private readonly api = inject(DataModelsApiService);
  readonly versions = signal<readonly LogicalModel[]>([]);
  readonly readiness = signal<LogicalModelReadiness | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const model = this.model();
      this.loading.set(true);
      this.error.set(null);
      forkJoin({
        versions: this.api.listLogicalModelVersions(model.id),
        readiness: this.api.loadLogicalModelReadiness(model.id, model.versionId),
      }).pipe(finalize(() => this.loading.set(false))).subscribe({
        next: ({ versions, readiness }) => { this.versions.set(versions); this.readiness.set(readiness); },
        error: (error: Error) => { this.versions.set([]); this.readiness.set(null); this.error.set(error.message); },
      });
    });
  }

  statusLabel(model: LogicalModel): string { return LOGICAL_MODEL_STATUS_LABELS[model.status]; }
  dateLabel(value: string): string { return value ? new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Zeitpunkt unbekannt'; }
  issueLabel(issue: string): string {
    return issue === 'I14Y readiness requires a distribution or data service'
      ? 'Eine Distribution oder ein Data Service ist erforderlich.'
      : issue;
  }
}
