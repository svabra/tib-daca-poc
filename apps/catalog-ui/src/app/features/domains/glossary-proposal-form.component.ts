import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataProduct, DomainSummary, GlossaryTermSummary } from '../../core/catalog.models';

export interface GlossaryProposalFormValue {
  operation: 'create' | 'update';
  targetTermId?: string;
  sourceProductId?: string;
  autoAttach: boolean;
  domainIds: readonly string[];
  labels: Array<{
    language: string;
    preferredLabel: string;
    alternativeLabels: string[];
    definition: string;
  }>;
  relations: Array<{
    relation: GlossaryTermSummary['relations'][number]['relationType'];
    targetTermId?: string;
    targetUri?: string;
  }>;
}

interface DuplicateHint {
  term: GlossaryTermSummary;
  matchedLabel: string;
  exact: boolean;
}

@Component({
  selector: 'daca-glossary-proposal-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="proposal-form" [formGroup]="form" (ngSubmit)="submit()">
      @if (target) {
        <p class="daca-alert">
          Sie schlagen eine neue Revision von <strong>{{ target.preferredLabel }}</strong> vor.
          Weitere Sprachlabels und bestehende SKOS-Relationen bleiben erhalten.
        </p>
      }

      @if (product) {
        <section class="product-context" aria-labelledby="proposal-product-title">
          <div>
            <p class="daca-eyebrow">Produktkontext</p>
            <h2 id="proposal-product-title">{{ product.title }}</h2>
            <p>Das Produkt wird als Herkunft des Vorschlags dokumentiert.</p>
          </div>
          <label>
            <input
              type="checkbox"
              formControlName="autoAttach"
            >
            Nach der Freigabe automatisch an dieses Produkt anhängen
          </label>
          @if (!canAttachProduct) {
            <small>Nur Product Owner oder Stellvertretung dürfen die automatische Zuordnung beantragen.</small>
          } @else if (!sharesProductDomain()) {
            <small>Für die automatische Zuordnung muss mindestens eine gewählte Domain auch dem Produkt zugeordnet sein.</small>
          }
        </section>
      }

      <div class="language-grid">
        <fieldset>
          <legend>Deutsch</legend>
          <label>Begriff *<input formControlName="labelDe" autocomplete="off" required aria-required="true" aria-describedby="proposal-form-hint" (input)="touchLabels()"></label>
          <label>Synonyme & Abkürzungen<input formControlName="alternativeLabelsDe" placeholder="z. B. GepFz, Panzerfahrzeug"></label>
          <label>Definition *<textarea rows="5" formControlName="definitionDe" required aria-required="true" aria-describedby="proposal-form-hint"></textarea></label>
        </fieldset>
        <fieldset>
          <legend>English</legend>
          <label>Preferred label<input formControlName="labelEn" autocomplete="off" (input)="touchLabels()"></label>
          <label>Synonyms & abbreviations<input formControlName="alternativeLabelsEn" placeholder="comma-separated"></label>
          <label>Definition<textarea rows="5" formControlName="definitionEn"></textarea></label>
        </fieldset>
      </div>

      @if (duplicateHints().length) {
        <section class="duplicate-hints" aria-live="polite" aria-labelledby="duplicate-title">
          <h2 id="duplicate-title">Ähnliche bestehende Terme</h2>
          <p>Prüfen Sie zuerst, ob das bestehende Konzept bereits passt. Ein Hinweis blockiert den Antrag nicht.</p>
          <ul>
            @for (hint of duplicateHints(); track hint.term.id) {
              <li>
                <span><strong>{{ hint.term.preferredLabel }}</strong><small>{{ hint.exact ? 'Gleiche Bezeichnung' : 'Ähnliche Bezeichnung' }} · Treffer «{{ hint.matchedLabel }}»</small></span>
                <button type="button" (click)="targetSelect.emit(hint.term)">Bestehenden Term ändern</button>
              </li>
            }
          </ul>
        </section>
      }

      <fieldset class="domain-selection">
        <legend>Fachdomains *</legend>
        <p>Die primären Data Owners aller gewählten Domains müssen dieselbe Vorschlagsrevision freigeben.</p>
        @for (domain of activeDomains(); track domain.id) {
          <label><input type="checkbox" [checked]="domainSelected(domain.id)" (change)="toggleDomain(domain.id, checkboxChecked($event))">{{ domain.preferredLabel }}</label>
        } @empty {
          <span>Keine aktiven Domains verfügbar.</span>
        }
      </fieldset>

      <fieldset class="relation-selection">
        <legend>Semantische Beziehung (optional)</legend>
        <p>Verknüpfen Sie das Konzept mit einem bereits akzeptierten Term. Bestehende Beziehungen bleiben bei Änderungen erhalten.</p>
        @if (existingRelations().length) {
          <ul aria-label="Bestehende SKOS-Beziehungen">
            @for (relation of existingRelations(); track relation.id) {
              <li><code>skos:{{ relation.relationType }}</code> {{ relation.targetLabel }}</li>
            }
          </ul>
        }
        <div class="relation-fields">
          <label>Relation
            <select formControlName="relationType">
              <option value="related">related – fachlich verwandt</option>
              <option value="broader">broader – allgemeinerer Begriff</option>
              <option value="narrower">narrower – spezifischerer Begriff</option>
              <option value="exactMatch">exactMatch – gleiches Konzept</option>
              <option value="closeMatch">closeMatch – sehr ähnliches Konzept</option>
            </select>
          </label>
          <label>Zielterm
            <select formControlName="relationTargetTermId">
              <option value="">Keine zusätzliche Beziehung</option>
              @for (term of relationTargets(); track term.id) {
                <option [value]="term.id">{{ term.preferredLabel }}{{ termAbbreviations(term) ? ' · ' + termAbbreviations(term) : '' }}</option>
              }
            </select>
          </label>
        </div>
      </fieldset>

      @if (!valid()) {
        <p id="proposal-form-hint" class="form-hint" role="status">Deutscher Begriff, deutsche Definition und mindestens eine Fachdomain sind erforderlich. Englischer Begriff und Definition müssen gemeinsam ausgefüllt werden.</p>
      }

      <div class="form-actions">
        <button class="daca-button is-secondary" type="button" (click)="proposalCancel.emit()">Abbrechen</button>
        <button class="daca-button" type="submit" [disabled]="!valid() || submitting">
          {{ submitting ? 'Wird eingereicht …' : target ? 'Änderungsantrag einreichen' : 'Term vorschlagen' }}
        </button>
      </div>
    </form>
  `,
  styles: [`
    .proposal-form{display:grid;gap:1.25rem}.language-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.language-grid fieldset,.domain-selection,.relation-selection,.product-context,.duplicate-hints{margin:0;padding:1rem;border:1px solid var(--daca-color-border,#d5d8dc);background:#fff}.language-grid fieldset{display:grid;gap:.8rem}.language-grid legend,.domain-selection legend,.relation-selection legend{font-weight:700}.proposal-form label{display:grid;gap:.35rem;font-weight:700}.domain-selection{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.75rem}.domain-selection legend,.domain-selection p{grid-column:1/-1}.domain-selection p,.relation-selection p{margin:0}.domain-selection label,.product-context label{display:flex;align-items:flex-start;gap:.5rem}.relation-selection{display:grid;gap:.75rem}.relation-selection ul{margin:0;padding-left:1.25rem}.relation-fields{display:grid;grid-template-columns:minmax(12rem,.6fr) minmax(16rem,1fr);gap:1rem}.product-context{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,.8fr);gap:1rem;align-items:center}.product-context h2{margin:.1rem 0}.product-context p{margin:.25rem 0}.product-context small{grid-column:2;color:#5d646b}.duplicate-hints h2{margin-top:0}.duplicate-hints ul{list-style:none;margin:0;padding:0}.duplicate-hints li{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.65rem 0;border-top:1px solid #e3e6e8}.duplicate-hints li span{display:grid}.duplicate-hints small{color:#5d646b}.form-hint{margin:0;color:#a3291b}.form-actions{display:flex;justify-content:flex-end;gap:.75rem}@media(max-width:760px){.language-grid,.product-context,.relation-fields{grid-template-columns:1fr}.product-context small{grid-column:1}.duplicate-hints li{align-items:flex-start;flex-direction:column}}
  `],
})
export class GlossaryProposalFormComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  @Input({ required: true }) domains: readonly DomainSummary[] = [];
  @Input({ required: true }) terms: readonly GlossaryTermSummary[] = [];
  @Input() target: GlossaryTermSummary | null = null;
  @Input() product: DataProduct | null = null;
  @Input() initialDomainIds: readonly string[] = [];
  @Input() initialLabel = '';
  @Input() canAttachProduct = false;
  @Input() submitting = false;
  @Output() readonly proposalSubmit = new EventEmitter<GlossaryProposalFormValue>();
  @Output() readonly proposalCancel = new EventEmitter<void>();
  @Output() readonly targetSelect = new EventEmitter<GlossaryTermSummary>();

  readonly selectedDomainIds = signal<readonly string[]>([]);
  readonly labelVersion = signal(0);
  readonly form = this.fb.nonNullable.group({
    labelDe: ['', [Validators.required, Validators.maxLength(255)]],
    alternativeLabelsDe: [''],
    definitionDe: ['', [Validators.required, Validators.maxLength(4000)]],
    labelEn: ['', Validators.maxLength(255)],
    alternativeLabelsEn: [''],
    definitionEn: ['', Validators.maxLength(4000)],
    autoAttach: [false],
    relationType: ['related' as GlossaryTermSummary['relations'][number]['relationType']],
    relationTargetTermId: [''],
  });

  ngOnChanges(changes: SimpleChanges): void {
    const proposalContextChanged = Boolean(changes['target'] || changes['initialDomainIds'] || changes['initialLabel'] || changes['product']);
    if (proposalContextChanged) {
      this.resetFromInputs();
    } else if (changes['domains']) {
      const domainIds = [...new Set([
        ...this.selectedDomainIds(),
        ...(this.target?.domains.map((domain) => domain.id) ?? []),
        ...this.initialDomainIds,
      ])].filter((id) => this.domains.some((domain) => domain.id === id && domain.status === 'active'));
      this.selectedDomainIds.set(domainIds);
      if (this.autoAttachEligible() && this.form.controls.autoAttach.pristine) {
        this.form.controls.autoAttach.setValue(true, { emitEvent: false });
      }
    }
    if (proposalContextChanged || changes['domains'] || changes['canAttachProduct']) {
      if (!this.autoAttachEligible()) this.form.controls.autoAttach.setValue(false, { emitEvent: false });
      this.syncAutoAttachControl();
    }
  }

  private resetFromInputs(): void {
    const de = this.target?.labels.find((label) => languageFamily(label.language) === 'de');
    const en = this.target?.labels.find((label) => languageFamily(label.language) === 'en');
    const domainIds = [...new Set([
      ...(this.target?.domains.filter((domain) => domain.status === 'active').map((domain) => domain.id) ?? []),
      ...this.initialDomainIds,
    ])].filter((id) => this.domains.some((domain) => domain.id === id && domain.status === 'active'));
    this.selectedDomainIds.set(domainIds);
    this.form.reset({
      labelDe: de?.preferredLabel ?? this.initialLabel,
      alternativeLabelsDe: de?.alternativeLabels.join(', ') ?? '',
      definitionDe: de?.definition ?? '',
      labelEn: en?.preferredLabel ?? '',
      alternativeLabelsEn: en?.alternativeLabels.join(', ') ?? '',
      definitionEn: en?.definition ?? '',
      autoAttach: Boolean(this.product && this.canAttachProduct && this.sharesProductDomain()),
      relationType: 'related',
      relationTargetTermId: '',
    });
    this.labelVersion.update((value) => value + 1);
  }

  activeDomains(): readonly DomainSummary[] {
    return this.domains.filter((domain) => domain.status === 'active');
  }

  domainSelected(domainId: string): boolean {
    return this.selectedDomainIds().includes(domainId);
  }

  toggleDomain(domainId: string, selected: boolean): void {
    this.selectedDomainIds.update((current) => selected
      ? current.includes(domainId) ? current : [...current, domainId]
      : current.filter((item) => item !== domainId));
    if (!this.autoAttachEligible()) this.form.controls.autoAttach.setValue(false);
    this.syncAutoAttachControl();
  }

  checkboxChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  touchLabels(): void {
    this.labelVersion.update((value) => value + 1);
  }

  sharesProductDomain(): boolean {
    if (!this.product) return false;
    const productDomains = new Set(this.product.domains.map((domain) => domain.id));
    return this.selectedDomainIds().some((id) => productDomains.has(id));
  }

  autoAttachEligible(): boolean {
    return Boolean(this.product && this.canAttachProduct && this.sharesProductDomain());
  }

  private syncAutoAttachControl(): void {
    const control = this.form.controls.autoAttach;
    if (this.autoAttachEligible()) control.enable({ emitEvent: false });
    else control.disable({ emitEvent: false });
  }

  valid(): boolean {
    const value = this.form.getRawValue();
    const englishComplete = Boolean(value.labelEn.trim()) === Boolean(value.definitionEn.trim());
    return this.form.valid && englishComplete && this.selectedDomainIds().length > 0;
  }

  duplicateHints(): readonly DuplicateHint[] {
    this.labelVersion();
    const candidates = [this.form.controls.labelDe.value, this.form.controls.labelEn.value]
      .map((value) => normalizeLabel(value))
      .filter((value) => value.length >= 3);
    if (!candidates.length) return [];
    return this.terms
      .filter((term) => term.id !== this.target?.id)
      .map((term) => {
        const labels = term.labels.flatMap((label) => [label.preferredLabel, ...label.alternativeLabels]);
        const match = labels
          .map((label) => ({ label, normalized: normalizeLabel(label) }))
          .filter(({ normalized }) => normalized.length >= 3)
            .find(({ normalized }) => candidates.some((candidate) => normalized === candidate
              || normalized.includes(candidate)
              || candidate.includes(normalized)
              || conceptKey(normalized) === conceptKey(candidate)));
        if (!match) return null;
        return {
          term,
          matchedLabel: match.label,
          exact: candidates.includes(match.normalized),
        } satisfies DuplicateHint;
      })
      .filter((item): item is DuplicateHint => item !== null)
      .sort((left, right) => Number(right.exact) - Number(left.exact) || left.term.preferredLabel.localeCompare(right.term.preferredLabel, 'de'))
      .slice(0, 5);
  }

  existingRelations(): GlossaryTermSummary['relations'] {
    return this.target?.relations ?? [];
  }

  relationTargets(): readonly GlossaryTermSummary[] {
    return this.terms
      .filter((term) => term.status === 'active' && term.id !== this.target?.id)
      .slice()
      .sort((left, right) => left.preferredLabel.localeCompare(right.preferredLabel, 'de'));
  }

  termAbbreviations(term: GlossaryTermSummary): string {
    return term.labels.flatMap((label) => label.alternativeLabels).join(', ');
  }

  submit(): void {
    if (!this.valid() || this.submitting) return;
    const value = this.form.getRawValue();
    const de = this.target?.labels.find((label) => languageFamily(label.language) === 'de');
    const en = this.target?.labels.find((label) => languageFamily(label.language) === 'en');
    const editableLabels = [
      {
        language: de?.language ?? 'de',
        preferredLabel: value.labelDe.trim(),
        alternativeLabels: commaSeparatedValues(value.alternativeLabelsDe),
        definition: value.definitionDe.trim(),
      },
      ...(value.labelEn.trim() ? [{
        language: en?.language ?? 'en',
        preferredLabel: value.labelEn.trim(),
        alternativeLabels: commaSeparatedValues(value.alternativeLabelsEn),
        definition: value.definitionEn.trim(),
      }] : []),
    ];
    const preservedLabels = this.target?.labels
      .filter((label) => label !== de && label !== en)
      .map((label) => ({ ...label, alternativeLabels: [...label.alternativeLabels] })) ?? [];
    const relations: GlossaryProposalFormValue['relations'] = [];
    for (const relation of this.target?.relations ?? []) {
      if (relation.targetTermId) relations.push({ relation: relation.relationType, targetTermId: relation.targetTermId });
      else if (relation.targetUri) relations.push({ relation: relation.relationType, targetUri: relation.targetUri });
    }
    const relationTargetTermId = value.relationTargetTermId.trim();
    if (relationTargetTermId && relationTargetTermId !== this.target?.id && !relations.some((relation) => (
      relation.relation === value.relationType && relation.targetTermId === relationTargetTermId
    ))) {
      relations.push({ relation: value.relationType, targetTermId: relationTargetTermId });
    }
    this.proposalSubmit.emit({
      operation: this.target ? 'update' : 'create',
      ...(this.target ? { targetTermId: this.target.id } : {}),
      ...(this.product ? { sourceProductId: this.product.id } : {}),
      autoAttach: this.autoAttachEligible() && value.autoAttach,
      domainIds: this.selectedDomainIds(),
      labels: [...editableLabels, ...preservedLabels],
      relations,
    });
  }
}

function normalizeLabel(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleLowerCase('de-CH');
}

function languageFamily(value: string): string {
  return value.toLocaleLowerCase().split('-')[0];
}

function conceptKey(value: string): string {
  return normalizeLabel(value).split(' ').map((token) => {
    if (token.length <= 5) return token;
    for (const suffix of ['ern', 'em', 'en', 'er', 'es', 'e', 's']) {
      if (token.endsWith(suffix) && token.length - suffix.length >= 5) {
        return token.slice(0, -suffix.length);
      }
    }
    return token;
  }).join(' ');
}

function commaSeparatedValues(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}
