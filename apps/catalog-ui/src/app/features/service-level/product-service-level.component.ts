import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataProduct } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import {
  ProductServiceLevelApiService,
  ServiceLevelApiError,
} from './product-service-level-api.service';
import {
  ServiceLevelDefinition,
  ServiceLevelBaseline,
  ServiceLevelDiffRow,
  ServiceLevelRevision,
  ServiceLevelRevisionListResponse,
  ServiceLevelRevisionWrite,
  ServiceLevelSummaryResponse,
  ServiceLevelWeekday,
} from './product-service-level.models';
import {
  itemsToLines,
  linesToItems,
  listLabel,
  SERVICE_LEVEL_WEEKDAYS,
  SUPPLEMENTAL_LEGAL_REFERENCES,
  serviceLevelDiff,
  serviceLevelStateLabel,
  serviceLevelStatusLabel,
  serviceWindowLabel,
} from './product-service-level.presenter';

type EditorMode = 'create' | 'edit' | null;

const SUPPLEMENTAL_LEGAL_CODES = new Set(['BGÖ', 'VBGÖ', 'BGOE', 'VBGOE', 'BGA', 'VBGA']);

function orderedDateRange(control: AbstractControl): ValidationErrors | null {
  const validFrom = String(control.get('validFrom')?.value ?? '');
  const validUntil = String(control.get('validUntil')?.value ?? '');
  const nextReviewOn = String(control.get('nextReviewOn')?.value ?? '');
  const errors: ValidationErrors = {};
  if (validFrom && validUntil && validUntil < validFrom) errors['validityOrder'] = true;
  if (validFrom && nextReviewOn && nextReviewOn < validFrom) errors['reviewOrder'] = true;
  if (validUntil && nextReviewOn && nextReviewOn > validUntil) errors['reviewOrder'] = true;
  return Object.keys(errors).length > 0 ? errors : null;
}

function orderedSupportWindow(control: AbstractControl): ValidationErrors | null {
  const start = String(control.get('supportStart')?.value ?? '');
  const end = String(control.get('supportEnd')?.value ?? '');
  return start && end && end <= start ? { supportWindowOrder: true } : null;
}

@Component({
  selector: 'daca-product-service-level',
  standalone: true,
  imports: [DatePipe, ProductWorkspaceNavComponent, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './product-service-level.component.css',
  template: `
    <daca-product-workspace-nav
      [productId]="productId"
      [productTitle]="product()?.title ?? 'Datenprodukt wird geladen'"
      activeSection="sla"
    />

    <section class="daca-page-heading service-level-heading">
      <div>
        <p class="daca-eyebrow">Datenprodukt · Service Level</p>
        <h1>SLA &amp; Nutzungsbedingungen</h1>
        <p>Nachvollziehbare Erwartungen an Aktualität, Support und zulässige Nutzung – mit Vier-Augen-Freigabe.</p>
      </div>
      @if (summary(); as currentSummary) {
        <div class="service-level-status" [class]="'is-' + currentSummary.state">
          <em>PoC · unverbindliche Orientierung</em>
          <span>{{ stateLabel(currentSummary.state) }}</span>
          <strong>{{ currentSummary.source === 'platform_default' ? 'DaCa PoC-Standardvorlage' : 'SLA-Revision ' + currentSummary.current.revision }}</strong>
        </div>
      }
    </section>

    <section class="daca-card service-level-disclaimer" aria-labelledby="service-level-disclaimer-title">
      <div><p class="daca-eyebrow">Einordnung</p><h2 id="service-level-disclaimer-title">Dokumentierte Zielwerte, keine technische Garantie</h2></div>
      <p>DaCa dokumentiert Vereinbarungen und Freigaben. Der PoC überwacht weder Verfügbarkeit noch Aktualität, Supportzeiten, Wiederherstellung oder Rechtskonformität technisch. Es bestehen insbesondere keine Zusicherungen für Uptime, RTO/RPO oder Lösungszeiten. Verbindlichkeit und Anwendbarkeit müssen die zuständigen Stellen ausserhalb des PoC bestätigen.</p>
    </section>

    <div class="service-level-feedback" aria-live="polite" aria-atomic="true">
      @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
      @if (actionError()) {
        <div class="daca-alert is-error" role="alert">
          <span>{{ actionError() }}</span>
          @if (conflict()) { <button type="button" class="daca-button is-secondary" (click)="reloadAfterConflict()">Aktuelle Version laden</button> }
        </div>
      }
    </div>

    @if (loading()) {
      <section class="daca-card service-level-state" role="status">
        <span class="service-level-loader" aria-hidden="true"></span>
        <div><strong>SLA wird geladen</strong><p>Wir lesen die DaCa PoC-Standardvorlage, den Freigabestatus und den Versionsverlauf.</p></div>
      </section>
    } @else if (loadError()) {
      <section class="daca-card service-level-state is-error" role="alert">
        <span aria-hidden="true">!</span>
        <div><strong>SLA nicht verfügbar</strong><p>{{ loadError() }}</p></div>
        <button type="button" class="daca-button is-secondary" (click)="load()">Erneut versuchen</button>
      </section>
    } @else if (summary(); as currentSummary) {
      <div class="service-level-layout">
        <div class="service-level-content">
          <section class="daca-card service-level-current" aria-labelledby="service-level-current-title">
            <header>
              <div>
                <p class="daca-eyebrow">Aktuell anwendbar</p>
                <h2 id="service-level-current-title">{{ statusLabel(currentSummary.current.status) }}</h2>
                <p>{{ validityLabel(currentSummary.current, true) }}</p>
              </div>
              @if (currentSummary.source === 'platform_default') {
                <span class="service-level-baseline-chip">Noch nicht produktspezifisch bestätigt</span>
              } @else {
                <span class="service-level-revision-chip">Revision {{ currentSummary.current.revision }}</span>
              }
            </header>

            <dl class="service-level-facts">
              <div class="is-wide"><dt>Zweck und geeignete Nutzung</dt><dd>{{ currentSummary.current.definition.purposeAndSuitableUse }}</dd></div>
              <div><dt>Aktualitätstoleranz</dt><dd>{{ currentSummary.current.definition.freshnessToleranceBusinessDays }} Arbeitstage</dd></div>
              <div><dt>Verfügbarkeit</dt><dd>Best effort</dd></div>
              <div class="is-wide"><dt>Supportfenster</dt><dd>{{ windowLabel(currentSummary.current.definition) }}</dd></div>
              <div><dt>Erste Reaktion</dt><dd>innerhalb {{ currentSummary.current.definition.initialResponseTargetSupportHours }} Supportstunden</dd></div>
              <div><dt>Geplante Wartung</dt><dd>{{ currentSummary.current.definition.plannedMaintenanceNoticeHours }} Stunden Vorankündigung</dd></div>
              <div><dt>Nächste Überprüfung</dt><dd>{{ currentSummary.current.definition.nextReviewOn | date: 'dd.MM.yyyy' }}</dd></div>
            </dl>

            <div class="service-level-terms-grid">
              <section><h3>Nutzungsbedingungen</h3><ul>@for (condition of currentSummary.current.definition.usageConditions; track condition) { <li>{{ condition }}</li> }</ul></section>
              <section><h3>Bekannte Einschränkungen</h3><ul>@for (limitation of currentSummary.current.definition.knownLimitations; track limitation) { <li>{{ limitation }}</li> }</ul></section>
            </div>

            @if (currentSummary.nextScheduled; as scheduled) {
              <aside class="service-level-scheduled">
                <div><strong>Nächste veröffentlichte SLA-Revision {{ scheduled.revision }}</strong><span>tritt am {{ scheduled.validFrom | date: 'dd.MM.yyyy' }} in Kraft</span></div>
                <button type="button" class="daca-button is-secondary" (click)="openRevision(scheduled, 'compare')">Änderungen ansehen</button>
              </aside>
            }
          </section>

          <section class="daca-card service-level-boundaries" aria-labelledby="service-level-boundaries-title">
            <header>
              <div><p class="daca-eyebrow">Produktkontext</p><h2 id="service-level-boundaries-title">Plattformfeste Produktangaben</h2></div>
            </header>
            <dl>
              <div><dt>Klassifikation</dt><dd>{{ classificationLabel() }}</dd></div>
              <div><dt>Lizenz</dt><dd>{{ product()?.license || 'Nicht festgelegt' }}</dd></div>
              <div><dt>Qualitätsmedaille</dt><dd>{{ qualityLabel() }}</dd></div>
              <div><dt>Aktualisierungsrhythmus</dt><dd>{{ product()?.updateFrequency || 'Nicht festgelegt' }}</dd></div>
            </dl>
            <p>Katalogsichtbarkeit und diese SLA ändern weder die aktiv publizierten Zugriffs-Policies noch den OGD-Status. Auch eine öffentliche Klassifikation allein begründet keine Veröffentlichung nach EMBAG.</p>
          </section>

          @if (editorMode()) {
            <section class="daca-card service-level-editor" aria-labelledby="service-level-editor-title">
              <header>
                <div><p class="daca-eyebrow">Data Owner · Entwurf</p><h2 id="service-level-editor-title">{{ editorMode() === 'create' ? 'Neue SLA-Revision' : 'SLA-Entwurf bearbeiten' }}</h2></div>
                <button type="button" class="daca-button is-secondary" (click)="discardEditor()">Änderungen verwerfen</button>
              </header>

              <form [formGroup]="form" (ngSubmit)="saveDraft()" novalidate>
                <fieldset>
                  <legend>Gültigkeit</legend>
                  <div class="service-level-form-grid">
                    <label><span>Gültig ab</span><input type="date" formControlName="validFrom" [min]="currentSummary.asOf"></label>
                    <label><span>Gültig bis <small>(optional)</small></span><input type="date" formControlName="validUntil" [min]="form.controls.validFrom.value"></label>
                  </div>
                  @if (form.errors?.['validityOrder']) { <p class="service-level-field-error">«Gültig bis» darf nicht vor «Gültig ab» liegen.</p> }
                </fieldset>

                <fieldset>
                  <legend>Zweck und Aktualität</legend>
                  <label><span>Zweck und geeignete Nutzung</span><textarea rows="4" formControlName="purposeAndSuitableUse" aria-describedby="purpose-help"></textarea><small id="purpose-help">Beschreiben Sie, wofür das Produkt fachlich geeignet ist – ohne schützenswerte Falldaten.</small></label>
                  <div class="service-level-form-grid">
                    <label><span>Aktualitätstoleranz in Arbeitstagen</span><input type="number" min="0" max="365" step="1" formControlName="freshnessToleranceBusinessDays"></label>
                    <label><span>Nächste Überprüfung</span><input type="date" formControlName="nextReviewOn" [min]="form.controls.validFrom.value" [max]="form.controls.validUntil.value || null"></label>
                  </div>
                  @if (form.errors?.['reviewOrder']) { <p class="service-level-field-error">Die nächste Überprüfung muss innerhalb der SLA-Gültigkeit liegen.</p> }
                </fieldset>

                <fieldset>
                  <legend>Support und Wartung</legend>
                  <div class="service-level-weekdays" role="group" aria-label="Supporttage">
                    @for (day of weekdays; track day.id) {
                      <label><input type="checkbox" [checked]="weekdaySelected(day.id)" (change)="toggleWeekday(day.id, $any($event.target).checked)"><span>{{ day.longLabel }}</span></label>
                    }
                  </div>
                  @if (form.controls.weekdays.errors?.['required']) { <p class="service-level-field-error">Wählen Sie mindestens einen Supporttag.</p> }
                  <div class="service-level-form-grid is-three">
                    <label><span>Beginn</span><input type="time" formControlName="supportStart"></label>
                    <label><span>Ende</span><input type="time" formControlName="supportEnd"></label>
                    <label><span>Zeitzone</span><input value="Europe/Zurich" readonly aria-readonly="true"></label>
                  </div>
                  @if (form.errors?.['supportWindowOrder']) { <p class="service-level-field-error">Das Ende des Supportfensters muss nach dem Beginn liegen.</p> }
                  <div class="service-level-form-grid">
                    <label><span>Ziel für erste Reaktion in Supportstunden</span><input type="number" min="1" max="120" step="1" formControlName="initialResponseTargetSupportHours"></label>
                    <label><span>Vorankündigung geplanter Wartung in Stunden</span><input type="number" min="0" max="720" step="1" formControlName="plannedMaintenanceNoticeHours"></label>
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Nutzungsbedingungen und Grenzen</legend>
                  <div class="service-level-form-grid">
                    <label><span>Nutzungsbedingungen <small>(eine pro Zeile)</small></span><textarea rows="6" formControlName="usageConditions"></textarea></label>
                    <label><span>Bekannte Einschränkungen <small>(eine pro Zeile)</small></span><textarea rows="6" formControlName="knownLimitations"></textarea></label>
                  </div>
                  <p class="service-level-form-safety">Keine Tokens, Passwörter, Zugangsdaten oder schützenswerten Falldaten eintragen.</p>
                </fieldset>

                @if (form.invalid && form.touched) { <p class="daca-alert is-error" role="alert">Bitte prüfen Sie die markierten SLA-Angaben.</p> }
                <div class="service-level-editor-actions">
                  <button type="submit" class="daca-button" [disabled]="saving()">{{ saving() ? 'Entwurf wird gespeichert …' : 'Entwurf speichern' }}</button>
                </div>
              </form>
            </section>
          }

          @if (selectedRevision(); as selected) {
            <section id="sla-review" class="daca-card service-level-review" aria-labelledby="service-level-review-title" tabindex="-1">
              <header>
                <div><p class="daca-eyebrow">{{ selected.status === 'pending_approval' ? 'Vier-Augen-Prüfung' : 'Versionsvergleich' }}</p><h2 id="service-level-review-title">SLA-Revision {{ selected.revision }} prüfen</h2></div>
                <span [class]="'is-' + selected.status">{{ statusLabel(selected.status) }}</span>
              </header>
              <dl class="service-level-review-meta">
                <div><dt>Gültigkeit</dt><dd>{{ validityLabel(selected) }}</dd></div>
                <div><dt>Data Owner</dt><dd>{{ selected.owner?.displayName ?? currentSummary.owner.displayName }}</dd></div>
                <div><dt>Kontrollperson</dt><dd>{{ selected.controlPerson?.displayName ?? currentSummary.controlPerson?.displayName ?? 'Nicht zugewiesen' }}</dd></div>
              </dl>

              <h3>Strukturierter Vergleich mit der aktuell anwendbaren SLA</h3>
              @if (diffRows().length) {
                <div class="service-level-diff" role="region" aria-label="SLA-Änderungen" tabindex="0">
                  <table><thead><tr><th scope="col">Bereich</th><th scope="col">Bisher</th><th scope="col">Vorgeschlagen</th></tr></thead><tbody>
                    @for (row of diffRows(); track row.key) { <tr><th scope="row">{{ row.label }}</th><td>{{ row.before }}</td><td>{{ row.after }}</td></tr> }
                  </tbody></table>
                </div>
              } @else { <p class="service-level-no-diff">Keine fachlichen Abweichungen zur aktuell anwendbaren SLA.</p> }

              @if (currentSummary.canReview && selected.status === 'pending_approval') {
                <div class="service-level-decision">
                  <p><strong>Unabhängige Kontrolle:</strong> Prüfen Sie Zweck, Gültigkeit, Zielwerte und Einschränkungen. Eine Freigabe bestätigt die dokumentierte Vereinbarung, nicht deren technische oder rechtliche Erfüllung.</p>
                  <label><span>Begründung bei Ablehnung</span><textarea rows="3" maxlength="2000" [value]="rejectionReason()" (input)="rejectionReason.set($any($event.target).value)" placeholder="Erforderlich, wenn Sie die SLA zurückweisen"></textarea></label>
                  <div><button type="button" class="daca-button" [disabled]="saving()" (click)="decide('approve')">SLA freigeben</button><button type="button" class="daca-button is-secondary" [disabled]="saving()" (click)="decide('reject')">Zur Überarbeitung zurückweisen</button></div>
                </div>
              }
            </section>
          }

          <section class="daca-card service-level-history" aria-labelledby="service-level-history-title">
            <header><div><p class="daca-eyebrow">Nachvollziehbarkeit</p><h2 id="service-level-history-title">SLA-Versionen</h2></div><span>{{ revisions()?.items?.length ?? 0 }}</span></header>
            @if ((revisions()?.items?.length ?? 0) === 0) {
              <p class="service-level-empty">Noch keine produktspezifische SLA-Revision. Die DaCa PoC-Standardvorlage bleibt sichtbar.</p>
            } @else {
              <ol>
                @for (revision of revisions()?.items ?? []; track revision.revisionId) {
                  <li>
                    <div><strong>Revision {{ revision.revision }}</strong><span>{{ statusLabel(revision.status) }} · {{ validityLabel(revision) }}</span>@if (revision.updatedAt) { <time [attr.datetime]="revision.updatedAt">Geändert {{ revision.updatedAt | date: 'dd.MM.yyyy, HH:mm' }} Uhr</time> }</div>
                    <button type="button" class="daca-button is-secondary" (click)="openRevision(revision, 'compare')">Öffnen</button>
                  </li>
                }
              </ol>
            }
          </section>
        </div>

        <aside class="service-level-sidebar">
          <section class="daca-card service-level-responsibility" aria-labelledby="service-level-responsibility-title">
            <div class="daca-card-header"><h2 id="service-level-responsibility-title">Verantwortung</h2></div>
            <div class="daca-card-body">
              <dl><div><dt>Data Owner</dt><dd>{{ currentSummary.owner.displayName }}<small>{{ currentSummary.owner.organization }}</small></dd></div><div><dt>Kontrollperson</dt><dd>{{ currentSummary.controlPerson?.displayName ?? 'Noch nicht zugewiesen' }}<small>{{ currentSummary.controlPerson?.organization ?? 'Vor Einreichung festlegen' }}</small></dd></div></dl>
              @if (currentSummary.canEdit) { <a [routerLink]="['/products', productId, 'overview']">Kontrollperson in der Produktübersicht verwalten</a> }
            </div>
          </section>

          @if (currentSummary.canEdit) {
            <section class="daca-card service-level-owner-actions" aria-labelledby="service-level-owner-actions-title">
              <div class="daca-card-header"><h2 id="service-level-owner-actions-title">Data-Owner-Aktionen</h2></div>
              <div class="daca-card-body">
                @if (draftRevision(); as draft) {
                  <button type="button" class="daca-button" (click)="startEdit(draft)">Entwurf bearbeiten</button>
                  <button type="button" class="daca-button is-secondary" [disabled]="saving()" (click)="submit(draft)">Zur Kontrolle einreichen</button>
                } @else if (pendingRevision(); as pending) {
                  <p>Revision {{ pending.revision }} wartet auf die Kontrolle durch {{ pending.controlPerson?.displayName ?? 'die Kontrollperson' }}.</p>
                  <button type="button" class="daca-button is-secondary" [disabled]="saving()" (click)="withdraw(pending)">Einreichung zurückziehen</button>
                  <button type="button" class="daca-button is-secondary" (click)="openRevision(pending, 'compare')">Einreichung ansehen</button>
                } @else {
                  <button type="button" class="daca-button" (click)="startCreate()">Neue SLA-Revision erstellen</button>
                }
              </div>
            </section>
          }

          <section class="daca-card service-level-law" aria-labelledby="service-level-law-title">
            <div class="daca-card-header"><h2 id="service-level-law-title">Rechtlicher Rahmen</h2></div>
            <div class="daca-card-body">
              <p>Die Links dienen der Orientierung. Welche Bestimmungen im Einzelfall anwendbar sind, muss fachlich und rechtlich beurteilt werden.</p>
              <ul>@for (reference of coreLegalReferences(); track reference.url) { <li><a [href]="reference.url" target="_blank" rel="noopener noreferrer">{{ legalCodeLabel(reference.code) }} · {{ reference.title }}<span class="sr-only"> (öffnet in neuem Tab)</span></a><span>{{ reference.reference }} · {{ reference.applicability }}</span></li> }</ul>
              @if (supplementalLegalReferences().length) {
                <details><summary>Weitere Erlasse zur Transparenz und Archivierung</summary><ul>@for (reference of supplementalLegalReferences(); track reference.url) { <li><a [href]="reference.url" target="_blank" rel="noopener noreferrer">{{ legalCodeLabel(reference.code) }} · {{ reference.title }}<span class="sr-only"> (öffnet in neuem Tab)</span></a><span>{{ reference.reference }} · {{ reference.applicability }}</span></li> }</ul></details>
              }
            </div>
          </section>
        </aside>
      </div>
    }
  `,
})
export class ProductServiceLevelComponent {
  private readonly fb = inject(FormBuilder);
  readonly catalogApi = inject(CatalogApiService);
  private readonly serviceLevelApi = inject(ProductServiceLevelApiService);
  private readonly identity = inject(DemoIdentityService);
  private readonly route = inject(ActivatedRoute);

  readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly weekdays = SERVICE_LEVEL_WEEKDAYS;
  readonly product = signal<DataProduct | null>(null);
  readonly summary = signal<ServiceLevelSummaryResponse | null>(null);
  readonly revisions = signal<ServiceLevelRevisionListResponse | null>(null);
  readonly selectedRevision = signal<ServiceLevelRevision | null>(null);
  readonly editorMode = signal<EditorMode>(null);
  readonly editedRevision = signal<ServiceLevelRevision | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly conflict = signal(false);
  readonly rejectionReason = signal('');
  private loadGeneration = 0;
  private lastIdentity = '';

  readonly form = this.fb.nonNullable.group({
    validFrom: ['', Validators.required],
    validUntil: [''],
    purposeAndSuitableUse: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
    freshnessToleranceBusinessDays: [5, [Validators.required, Validators.min(0), Validators.max(365)]],
    weekdays: this.fb.nonNullable.control<ServiceLevelWeekday[]>([], Validators.required),
    supportStart: ['07:00', Validators.required],
    supportEnd: ['19:00', Validators.required],
    initialResponseTargetSupportHours: [8, [Validators.required, Validators.min(1), Validators.max(120)]],
    plannedMaintenanceNoticeHours: [48, [Validators.required, Validators.min(0), Validators.max(720)]],
    usageConditions: ['', [Validators.required, Validators.maxLength(4000)]],
    knownLimitations: ['', [Validators.required, Validators.maxLength(4000)]],
    nextReviewOn: ['', Validators.required],
  }, { validators: [orderedDateRange, orderedSupportWindow] });

  readonly draftRevision = computed(() => this.revisions()?.items.find((revision) => revision.status === 'draft') ?? null);
  readonly pendingRevision = computed(() => this.revisions()?.items.find((revision) => revision.status === 'pending_approval') ?? null);
  readonly diffRows = computed<readonly ServiceLevelDiffRow[]>(() => {
    const current = this.summary()?.current;
    const selected = this.selectedRevision();
    return current && selected ? serviceLevelDiff(current, selected) : [];
  });
  readonly coreLegalReferences = computed(() =>
    (this.summary()?.legalReferences ?? []).filter((reference) => !SUPPLEMENTAL_LEGAL_CODES.has(reference.code)),
  );
  readonly supplementalLegalReferences = computed(() => {
    const references = (this.summary()?.legalReferences ?? []).filter((reference) => SUPPLEMENTAL_LEGAL_CODES.has(reference.code));
    return references.length > 0 ? references : SUPPLEMENTAL_LEGAL_REFERENCES;
  });
  readonly classificationLabel = computed(() => ({
    public: 'Öffentlich klassifiziert',
    internal: 'Intern',
    confidential: 'Vertraulich',
    restricted: 'Eingeschränkt',
  })[this.product()?.classification ?? 'internal']);
  readonly qualityLabel = computed(() => {
    const product = this.product();
    if (!product?.qualityMedal) return 'Noch nicht ausgewiesen';
    const medal = ({ bronze: 'Bronze', silver: 'Silber', gold: 'Gold', platinum: 'Platinum' } as const)[product.qualityMedal];
    return product.qualityScore === undefined ? medal : `${medal} · ${product.qualityScore}/6`;
  });

  constructor() {
    effect(() => {
      const userId = this.identity.userId();
      if (this.lastIdentity && this.lastIdentity !== userId) {
        this.clearIdentityBoundState();
        this.notice.set('Die Demo-Identität wurde gewechselt. Entwürfe und Prüfdaten wurden verworfen und für die neue Identität neu geladen.');
      }
      this.lastIdentity = userId;
      this.load();
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  protectUnsavedChanges(event: BeforeUnloadEvent): void {
    if (!this.editorMode() || !this.form.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  }

  load(): void {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadError.set(null);
    this.actionError.set(null);
    this.conflict.set(false);
    forkJoin({
      product: this.catalogApi.loadProduct(this.productId),
      summary: this.serviceLevelApi.loadSummary(this.productId),
      revisions: this.serviceLevelApi.loadRevisions(this.productId),
    }).subscribe({
      next: ({ product, summary, revisions }) => {
        if (generation !== this.loadGeneration || product.id !== this.productId || summary.dataProductId !== this.productId) return;
        this.product.set(product);
        this.summary.set(summary);
        this.revisions.set({ ...revisions, items: [...revisions.items].sort((left, right) => right.revision - left.revision) });
        this.loading.set(false);
        const requestedRevisionId = this.route.snapshot.queryParamMap.get('review');
        if (requestedRevisionId) this.openRevisionById(requestedRevisionId, true);
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.product.set(null);
        this.summary.set(null);
        this.revisions.set(null);
        this.loadError.set('Die SLA-Daten konnten nicht vollständig und rollenrichtig geladen werden. Es werden keine Vorschau- oder Entwurfsdaten angezeigt.');
        this.loading.set(false);
      },
    });
  }

  startCreate(): void {
    const current = this.summary()?.current;
    if (!current || !this.summary()?.canEdit) return;
    this.actionError.set(null);
    this.editedRevision.set(null);
    this.fillForm(current, this.suggestedValidFrom(), true);
    this.editorMode.set('create');
  }

  startEdit(revision: ServiceLevelRevision): void {
    if (!revision.revisionId || revision.status !== 'draft' || !this.summary()?.canEdit) return;
    this.actionError.set(null);
    this.editedRevision.set(revision);
    this.fillForm(revision);
    this.editorMode.set('edit');
  }

  discardEditor(): void {
    if (this.form.dirty && !window.confirm('Ungespeicherte SLA-Änderungen wirklich verwerfen?')) return;
    this.editorMode.set(null);
    this.editedRevision.set(null);
    this.form.reset();
  }

  saveDraft(): void {
    if (!this.summary()?.canEdit || !this.editorMode()) return;
    this.validateWeekdays();
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (this.form.controls.validFrom.value < (this.summary()?.asOf ?? '')) {
      this.actionError.set('«Gültig ab» darf nicht vor dem aktuellen Datum in Europe/Zurich liegen.');
      return;
    }
    const listError = this.validateStructuredLists();
    if (listError) {
      this.actionError.set(listError);
      return;
    }
    const payload = this.writePayload();
    const history = this.revisions();
    if (!history) return;
    this.saving.set(true);
    this.actionError.set(null);
    this.conflict.set(false);
    const edited = this.editedRevision();
    const request = edited?.revisionId
      ? this.serviceLevelApi.updateRevision(this.productId, edited.revisionId, payload, edited.lockVersion)
      : this.serviceLevelApi.createRevision(this.productId, payload, history.etag);
    request.subscribe({
      next: ({ body }) => {
        this.saving.set(false);
        this.editorMode.set(null);
        this.editedRevision.set(null);
        this.form.reset();
        this.notice.set(`SLA-Revision ${body.revision} wurde als Entwurf gespeichert.`);
        this.load();
      },
      error: (error: ServiceLevelApiError) => this.handleActionError(error),
    });
  }

  submit(revision: ServiceLevelRevision): void {
    if (!revision.revisionId || revision.status !== 'draft' || !this.summary()?.canEdit) return;
    if (!this.summary()?.controlPerson) {
      this.actionError.set('Legen Sie vor der Einreichung eine unabhängige Kontrollperson in der Produktübersicht fest.');
      return;
    }
    if (!window.confirm(`SLA-Revision ${revision.revision} unveränderlich zur Vier-Augen-Kontrolle einreichen? Die Freigabe bleibt eine unverbindliche PoC-Orientierung.`)) return;
    this.runRevisionAction(
      this.serviceLevelApi.submitRevision(this.productId, revision.revisionId, revision.lockVersion),
      'Die SLA wurde zur unabhängigen Kontrolle eingereicht.',
    );
  }

  withdraw(revision: ServiceLevelRevision): void {
    if (!revision.revisionId || revision.status !== 'pending_approval' || !this.summary()?.canEdit) return;
    if (!window.confirm(`Einreichung der SLA-Revision ${revision.revision} zurückziehen?`)) return;
    this.runRevisionAction(
      this.serviceLevelApi.withdrawRevision(this.productId, revision.revisionId, revision.lockVersion),
      'Die SLA-Einreichung wurde zurückgezogen. Der bisherige veröffentlichte Stand bleibt unverändert.',
    );
  }

  decide(decision: 'approve' | 'reject'): void {
    const revision = this.selectedRevision();
    if (!revision?.revisionId || revision.status !== 'pending_approval' || !this.summary()?.canReview) return;
    const reason = this.rejectionReason().trim();
    if (decision === 'reject' && !reason) {
      this.actionError.set('Bitte begründen Sie die Zurückweisung.');
      return;
    }
    if (reason.length > 2000) {
      this.actionError.set('Die Begründung darf höchstens 2000 Zeichen enthalten.');
      return;
    }
    if (decision === 'approve' && !window.confirm(`SLA-Revision ${revision.revision} freigeben?`)) return;
    this.runRevisionAction(
      this.serviceLevelApi.decideRevision(this.productId, revision.revisionId, revision.lockVersion, decision, reason || undefined),
      decision === 'approve'
        ? 'Die SLA wurde freigegeben. Ihre Gültigkeit richtet sich nach dem dokumentierten Startdatum.'
        : 'Die SLA wurde mit Begründung zur Überarbeitung zurückgewiesen.',
    );
  }

  openRevision(revision: ServiceLevelRevision, mode: 'compare' | 'review'): void {
    if (!revision.revisionId) {
      this.selectedRevision.set(revision);
      return;
    }
    this.openRevisionById(revision.revisionId, mode === 'review');
  }

  weekdaySelected(day: ServiceLevelWeekday): boolean {
    return this.form.controls.weekdays.value.includes(day);
  }

  toggleWeekday(day: ServiceLevelWeekday, selected: boolean): void {
    const current = this.form.controls.weekdays.value;
    const next = selected ? [...new Set([...current, day])] : current.filter((candidate) => candidate !== day);
    this.form.controls.weekdays.setValue(next);
    this.form.controls.weekdays.markAsDirty();
    this.validateWeekdays();
  }

  statusLabel = serviceLevelStatusLabel;
  stateLabel = serviceLevelStateLabel;
  windowLabel = serviceWindowLabel;
  listLabel = listLabel;

  legalCodeLabel(code: string): string {
    return ({ BGOE: 'BGÖ', VBGOE: 'VBGÖ' } as Record<string, string>)[code] ?? code;
  }

  validityLabel(
    revision: Pick<ServiceLevelRevision, 'validFrom' | 'validUntil'> & { effectiveValidUntil?: string | null },
    useEffectiveEnd = false,
  ): string {
    if (useEffectiveEnd && revision.effectiveValidUntil && revision.effectiveValidUntil !== revision.validUntil) {
      const declared = revision.validUntil ? `vereinbart bis ${revision.validUntil}` : 'vereinbart unbefristet';
      return `${revision.validFrom} bis ${revision.effectiveValidUntil} (effektiv; ${declared})`;
    }
    return revision.validUntil ? `${revision.validFrom} bis ${revision.validUntil}` : `ab ${revision.validFrom}, unbefristet`;
  }

  reloadAfterConflict(): void {
    if (this.editorMode() && this.form.dirty && !window.confirm('Die aktuelle Serverversion laden? Ihre ungespeicherten Eingaben gehen verloren.')) return;
    this.clearEditor();
    this.load();
  }

  private openRevisionById(revisionId: string, focusReview: boolean): void {
    const generation = this.loadGeneration;
    this.actionError.set(null);
    this.serviceLevelApi.loadRevision(this.productId, revisionId).subscribe({
      next: ({ body }) => {
        if (generation !== this.loadGeneration) return;
        this.selectedRevision.set(body);
        if (focusReview) setTimeout(() => document.getElementById('sla-review')?.focus());
      },
      error: () => this.actionError.set('Die ausgewählte SLA-Revision konnte nicht rollenrichtig geladen werden.'),
    });
  }

  private runRevisionAction(
    request: ReturnType<ProductServiceLevelApiService['submitRevision']>,
    successNotice: string,
  ): void {
    this.saving.set(true);
    this.actionError.set(null);
    this.conflict.set(false);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.rejectionReason.set('');
        this.selectedRevision.set(null);
        this.notice.set(successNotice);
        this.catalogApi.refreshWorkflowTasks();
        this.load();
      },
      error: (error: ServiceLevelApiError) => this.handleActionError(error),
    });
  }

  private handleActionError(error: ServiceLevelApiError): void {
    this.saving.set(false);
    this.actionError.set(error.message);
    this.conflict.set(error.kind === 'conflict' || error.kind === 'precondition' || error.kind === 'state');
    if (error.kind === 'permission') {
      this.clearEditor();
      this.selectedRevision.set(null);
    }
  }

  private fillForm(
    revision: ServiceLevelRevision | ServiceLevelBaseline,
    validFrom = revision.validFrom,
    forNewRevision = false,
  ): void {
    const definition = revision.definition;
    this.form.reset({
      validFrom,
      validUntil: forNewRevision ? '' : revision.validUntil ?? '',
      purposeAndSuitableUse: definition.purposeAndSuitableUse,
      freshnessToleranceBusinessDays: definition.freshnessToleranceBusinessDays,
      weekdays: [...definition.supportWindow.weekdays],
      supportStart: definition.supportWindow.start,
      supportEnd: definition.supportWindow.end,
      initialResponseTargetSupportHours: definition.initialResponseTargetSupportHours,
      plannedMaintenanceNoticeHours: definition.plannedMaintenanceNoticeHours,
      usageConditions: itemsToLines(definition.usageConditions),
      knownLimitations: itemsToLines(definition.knownLimitations),
      nextReviewOn: forNewRevision ? this.suggestedReviewDate(validFrom) : definition.nextReviewOn,
    });
    this.form.markAsPristine();
  }

  private writePayload(): ServiceLevelRevisionWrite {
    const value = this.form.getRawValue();
    return {
      validFrom: value.validFrom,
      validUntil: value.validUntil || null,
      definition: {
        templateVersion: 1,
        purposeAndSuitableUse: value.purposeAndSuitableUse.trim(),
        freshnessToleranceBusinessDays: Number(value.freshnessToleranceBusinessDays),
        supportWindow: {
          weekdays: value.weekdays,
          start: value.supportStart,
          end: value.supportEnd,
          timezone: 'Europe/Zurich',
        },
        initialResponseTargetSupportHours: Number(value.initialResponseTargetSupportHours),
        plannedMaintenanceNoticeHours: Number(value.plannedMaintenanceNoticeHours),
        usageConditions: linesToItems(value.usageConditions),
        knownLimitations: linesToItems(value.knownLimitations),
        nextReviewOn: value.nextReviewOn,
        availabilityCommitment: 'best_effort',
      },
    };
  }

  private validateWeekdays(): void {
    const control = this.form.controls.weekdays;
    control.setErrors(control.value.length > 0 ? null : { required: true });
  }

  private validateStructuredLists(): string | null {
    const checks: Array<[string, string[]]> = [
      ['Nutzungsbedingungen', linesToItems(this.form.controls.usageConditions.value)],
      ['Bekannte Einschränkungen', linesToItems(this.form.controls.knownLimitations.value)],
    ];
    for (const [label, items] of checks) {
      if (items.length < 1 || items.length > 8) return `${label}: Bitte geben Sie zwischen 1 und 8 eindeutige Einträge an.`;
      if (items.some((item) => item.length > 500)) return `${label}: Ein einzelner Eintrag darf höchstens 500 Zeichen enthalten.`;
      if (new Set(items.map((item) => item.toLocaleLowerCase('de-CH'))).size !== items.length) {
        return `${label}: Doppelte Einträge sind nicht zulässig.`;
      }
    }
    return null;
  }

  private suggestedValidFrom(): string {
    const asOf = new Date(this.summary()?.asOf ?? Date.now());
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(asOf);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const tomorrow = new Date(Date.UTC(value('year'), value('month') - 1, value('day') + 1));
    const tomorrowValue = tomorrow.toISOString().slice(0, 10);
    const publishedStarts = [
      this.summary()?.current.status === 'published' ? this.summary()?.current.validFrom : null,
      this.summary()?.nextScheduled?.status === 'published' ? this.summary()?.nextScheduled?.validFrom : null,
      ...(this.revisions()?.items ?? [])
        .filter((revision) => revision.status === 'published')
        .map((revision) => revision.validFrom),
    ].filter((candidate): candidate is string => Boolean(candidate));
    const latestPublishedStart = publishedStarts.sort().at(-1);
    if (!latestPublishedStart) return tomorrowValue;
    return [tomorrowValue, this.addDays(latestPublishedStart, 1)].sort().at(-1) ?? tomorrowValue;
  }

  private suggestedReviewDate(validFrom: string): string {
    const [year, month, day] = validFrom.split('-').map(Number);
    const nextReview = new Date(Date.UTC(year + 1, month - 1, day));
    return nextReview.toISOString().slice(0, 10);
  }

  private addDays(value: string, days: number): string {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  private clearIdentityBoundState(): void {
    ++this.loadGeneration;
    this.product.set(null);
    this.summary.set(null);
    this.revisions.set(null);
    this.selectedRevision.set(null);
    this.rejectionReason.set('');
    this.clearEditor();
  }

  private clearEditor(): void {
    this.editorMode.set(null);
    this.editedRevision.set(null);
    this.form.reset();
  }
}
