import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LogicalModel, CLASSIFICATION_LABELS, LOGICAL_MODEL_STATUS_LABELS } from './data-models.models';

@Component({
  selector: 'daca-dataset-summary',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="dataset-summary" [class.is-compact]="compact()" aria-label="Datensatzattribute">
      <dl>
        <div><dt>Identifikator</dt><dd>{{ model().identifiers[0] || model().urn }}</dd></div>
        <div><dt>Data Owner</dt><dd>{{ model().dataOwner.displayName }}</dd></div>
        <div><dt>Ersteller</dt><dd>{{ creatorLabel() }}</dd></div>
        <div><dt>Domäne</dt><dd>{{ model().dataDomain.displayName }}</dd></div>
        <div><dt>Klassifizierung</dt><dd>{{ classificationLabel() }}</dd></div>
        <div><dt>Erstellt</dt><dd>{{ model().dateCreated | date:'dd.MM.yyyy' }}</dd></div>
        <div><dt>Medienformat</dt><dd>{{ model().mediaFormats.join(', ') || 'Nicht zugewiesen' }}</dd></div>
        <div><dt>Version / Status</dt><dd>v{{ model().revision }} · {{ statusLabel() }}</dd></div>
      </dl>
    </section>
  `,
  styles: [`
    .dataset-summary{margin-bottom:1.5rem;border:1px solid var(--daca-border);border-top:4px solid var(--daca-red);background:#fff}.dataset-summary dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));margin:0}.dataset-summary div{min-width:0;padding:.85rem 1rem;border-right:1px solid var(--daca-border);border-bottom:1px solid var(--daca-border)}.dataset-summary dt{color:var(--daca-muted);font-size:.63rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.dataset-summary dd{min-width:0;margin:.25rem 0 0;overflow-wrap:anywhere;font-size:.75rem;font-weight:750}.dataset-summary.is-compact{margin-bottom:.7rem}.dataset-summary.is-compact dl{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}.dataset-summary.is-compact div{padding:.5rem .65rem}.dataset-summary.is-compact dt{font-size:.56rem}.dataset-summary.is-compact dd{margin-top:.12rem;font-size:.68rem}@media(max-width:520px){.dataset-summary dl,.dataset-summary.is-compact dl{grid-template-columns:1fr 1fr}}
  `],
})
export class DatasetSummaryComponent {
  readonly model = input.required<LogicalModel>();
  readonly compact = input(false);
  creatorLabel(): string {
    const labels = { application: 'Applikation', internal_organisation: 'Verwaltungseinheit', internal_person: 'Person', external_organisation_or_person: 'Externe Stelle/Person' } as const;
    const creator = this.model().creator;
    if (!creator) return 'Nicht zugewiesen';
    const value = (() => {
      switch (creator.type) {
        case 'application': return creator.applicationName;
        case 'internal_organisation': return `${creator.englishName} (${creator.organizationId})`;
        case 'internal_person': return creator.userId;
        case 'external_organisation_or_person': return [creator.organizationName, creator.personName].filter(Boolean).join(' · ');
      }
    })();
    return `${labels[creator.type]}: ${value || 'Nicht zugewiesen'}`;
  }
  classificationLabel(): string { return CLASSIFICATION_LABELS[this.model().classification]; }
  statusLabel(): string { return LOGICAL_MODEL_STATUS_LABELS[this.model().status]; }
}
