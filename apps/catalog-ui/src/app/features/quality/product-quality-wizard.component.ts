import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DacaGlossaryTermComponent } from '@bit-daca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';

interface QualityField { id: string; name: string; dataType: string; nullable: boolean; keyField: boolean; businessDescription: string | null; }
interface Mapping { fieldId: string | null; mappingType: string; status: string; termUri: string; termLabel: string; }
interface QualityState { quality: { score: number; medal: string; criteria: Array<{ id: string; label: string; complete: boolean }>; dcatReviewed: boolean }; fields: QualityField[]; graph: { nodes?: unknown[]; edges?: unknown[] } | null; graphStatus: string; mappings: Mapping[]; }
interface OntologyTerm { id: string; uri: string; kind: 'class' | 'property'; label: string; definition: string; }

@Component({
  selector: 'daca-product-quality-wizard',
  standalone: true,
  imports: [RouterLink, DacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="quality-breadcrumb"><a routerLink="/products">Meine Datenprodukte</a><span>›</span><a [routerLink]="['/products', product().id, 'overview']">{{ product().title }}</a><span>›</span><strong>Qualität</strong></nav>
    <section class="daca-page-heading quality-heading"><div><p class="daca-eyebrow">Datenprodukt-Qualität</p><h1>Von <daca-glossary-term term="DAAIF" /> zu Platinum</h1><p>Prüfen und ergänzen Sie technische, fachliche und semantische Metadaten in fünf kompakten Schritten.</p></div>@if (state(); as current) { <span class="quality-medal quality-medal-large" [class]="'is-' + current.quality.medal">{{ current.quality.medal }} · {{ current.quality.score }}/6</span> }</section>

    @if (state(); as current) {
      <section class="daca-card quality-scorecard"><header><div><p class="daca-eyebrow">Qualitätsstatus</p><h2>Sechs Bedingungen für Platinum</h2></div><span>{{ completedCriteria() }} von 6 erfüllt</span></header><div>@for (criterion of current.quality.criteria; track criterion.id) { <article [class.is-complete]="criterion.complete"><span>{{ criterion.complete ? '✓' : criterion.id === 'ontology' ? '◎' : '○' }}</span><strong>{{ criterion.label }}</strong></article> }</div></section>

      <div class="quality-layout">
        <nav class="quality-steps" aria-label="Qualitätswizard">
          @for (item of steps; track item.id) { <button type="button" [class.is-active]="step() === item.id" [class.is-complete]="stepComplete(item.id, current)" (click)="step.set(item.id)"><span>{{ item.id }}</span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></button> }
        </nav>

        <form class="daca-card quality-workspace" (submit)="$event.preventDefault(); save()">
          @if (step() === 1) { <header><p class="daca-eyebrow">Schritt 1</p><h2>Technische Metadaten</h2><p>DAAIF hat Schema und Datentypen automatisch geliefert.</p></header><div class="quality-fields">@for (field of current.fields; track field.id) { <article><code>{{ field.name }}</code><strong>{{ field.dataType }}</strong><span>{{ field.nullable ? 'nullable' : 'required' }}</span><label><input type="checkbox" [checked]="field.keyField" (change)="setKey(field, $any($event.target).checked)"> Fachliches Kernfeld</label></article> }</div> }
          @if (step() === 2) { <header><p class="daca-eyebrow">Schritt 2</p><h2>Fachliche Metadaten</h2></header><div class="quality-form-grid"><label>Titel<input [value]="title()" (input)="title.set($any($event.target).value)"></label><label>Fachgebiet<input [value]="domain()" (input)="domain.set($any($event.target).value)"></label><label class="is-wide">Beschreibung<textarea rows="4" [value]="description()" (input)="description.set($any($event.target).value)"></textarea></label><label>Klassifikation<select [value]="classification()" (change)="classification.set($any($event.target).value)"><option value="public">Öffentlich</option><option value="internal">Intern</option><option value="confidential">Vertraulich</option><option value="restricted">Eingeschränkt</option></select></label><label>Aktualisierung<input [value]="frequency()" (input)="frequency.set($any($event.target).value)"></label><label class="is-wide">Kontakt<input type="email" [value]="contactEmail()" (input)="contactEmail.set($any($event.target).value)"></label></div><div class="quality-field-descriptions"><h3>Attributbeschreibungen</h3>@for (field of current.fields; track field.id) { <label><code>{{ field.name }}</code><input [value]="field.businessDescription ?? ''" (input)="setDescription(field, $any($event.target).value)" placeholder="Fachliche Bedeutung beschreiben"></label> }</div> }
          @if (step() === 3) { <header><p class="daca-eyebrow">Schritt 3</p><h2>DCAT-AP-CH kontrollieren</h2><p>DaCa bildet Produkt und REST-Service auf die Katalogbegriffe ab. Jede Zuordnung wird einzeln bestätigt.</p></header><div class="quality-dcat">@for (mapping of dcatMappings; track mapping.term) { <article><code>{{ mapping.term }}</code><strong>{{ dcatValue(mapping.term) }}</strong><label><input type="checkbox" [checked]="dcatConfirmed()[mapping.term]" (change)="setDcatConfirmation(mapping.term, $any($event.target).checked)"> OK</label></article> }</div><p class="daca-alert">DCAT-AP-CH beschreibt den Katalogeintrag; die fachliche Bedeutung wird separat im nächsten Schritt verankert.</p> }
          @if (step() === 4) { <header><p class="daca-eyebrow">Schritt 4 · Kanonische Ontologie</p><h2>Fachliche Bedeutung verankern</h2><p>DCAT beschreibt den Katalogeintrag. Die DaCa-Steuerontologie beschreibt, was Produkt und Kernfelder bedeuten.</p></header><label>Produktklasse<select [value]="productClassUri()" (change)="productClassUri.set($any($event.target).value)"><option value="">Bitte auswählen</option>@for (term of classTerms(); track term.id) { <option [value]="term.uri">{{ term.label }}</option> }</select></label><div class="quality-ontology-fields">@for (field of keyFields(current); track field.id) { <label><span><code>{{ field.name }}</code><small>Kernfeld</small></span><select [value]="fieldTerm(field.id)" (change)="setFieldTerm(field.id, $any($event.target).value)"><option value="">Noch nicht zugeordnet</option>@for (term of propertyTerms(); track term.id) { <option [value]="term.uri">{{ term.label }}</option> }</select></label> }</div><p class="daca-alert"><strong>DaCa Canonical Tax Ontology · PoC</strong><br>Nur bestätigte Begriffe der aktiven Version zählen für Platinum. I14Y-Links werden nicht erfunden.</p> }
          @if (step() === 5) { <header><p class="daca-eyebrow">Schritt 5 · KOBY Graphify</p><h2>Kontextgraph prüfen</h2><p>Deterministische PoC-Simulation ohne externen AI-Aufruf.</p></header><div class="quality-graph"><span>DAAIF</span><i>publiziert</i><strong>{{ title() }}</strong><i>gehört zu</i><span>{{ domain() }}</span><i>bereitgestellt über</i><span>REST</span></div><label class="quality-confirm"><input type="checkbox" [checked]="graphConfirmed()" (change)="graphConfirmed.set($any($event.target).checked)"><span><strong>Kontextgraph bestätigt</strong><small>Die dargestellten Beziehungen sind fachlich nachvollziehbar.</small></span></label> }

          @if (error()) { <p class="daca-alert is-error">{{ error() }}</p> }
          @if (saved()) { <p class="daca-alert">Gespeichert. Der Qualitätsstatus wurde serverseitig neu berechnet.</p> }
          <footer><button class="daca-button is-secondary" type="button" [disabled]="step() === 1" (click)="step.set(step() - 1)">Zurück</button>@if (step() < 5) { <button class="daca-button" type="button" (click)="step.set(step() + 1)">Weiter</button> } @else { <button class="daca-button" type="submit">Prüfung speichern</button> }</footer>
        </form>
      </div>
    } @else { <p class="daca-alert is-warning">Qualitätsdaten werden geladen…</p> }
  `,
})
export class ProductQualityWizardComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  readonly api = inject(CatalogApiService);
  readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly product = computed(() => this.api.products().find((item) => item.id === this.productId) ?? this.api.product());
  readonly state = signal<QualityState | null>(null);
  readonly terms = signal<readonly OntologyTerm[]>([]);
  readonly step = signal(1);
  readonly title = signal(''); readonly description = signal(''); readonly domain = signal('');
  readonly classification = signal('internal'); readonly contactEmail = signal(''); readonly frequency = signal('quarterly');
  readonly dcatReviewed = signal(false); readonly productClassUri = signal(''); readonly graphConfirmed = signal(false);
  readonly dcatMappings = [{ term: 'dcat:Dataset' }, { term: 'dcat:DataService' }, { term: 'dcat:Distribution' }, { term: 'dcterms:publisher' }] as const;
  readonly dcatConfirmed = signal<Record<string, boolean>>({});
  readonly fieldTerms = signal<Record<string, string>>({}); readonly error = signal<string | null>(null); readonly saved = signal(false);
  readonly steps = [{ id: 1, label: 'Technik', detail: 'REST und Schema' }, { id: 2, label: 'Fachlichkeit', detail: 'Beschreibungen' }, { id: 3, label: 'DCAT', detail: 'Katalogprofil' }, { id: 4, label: 'Ontologie', detail: 'Kanonische Begriffe' }, { id: 5, label: 'Graphify', detail: 'Kontext prüfen' }];
  readonly completedCriteria = computed(() => this.state()?.quality.criteria.filter((item) => item.complete).length ?? 0);
  readonly classTerms = computed(() => this.terms().filter((term) => term.kind === 'class'));
  readonly propertyTerms = computed(() => this.terms().filter((term) => term.kind === 'property'));

  constructor() { this.api.selectProduct(this.productId); this.load(); this.http.get<OntologyTerm[]>('/api/v1/ontology/terms').subscribe((terms) => this.terms.set(terms)); }
  keyFields(state: QualityState): QualityField[] { return state.fields.filter((field) => field.keyField); }
  fieldTerm(id: string): string { return this.fieldTerms()[id] ?? ''; }
  setFieldTerm(id: string, uri: string): void { this.fieldTerms.update((terms) => ({ ...terms, [id]: uri })); this.saved.set(false); }
  setKey(field: QualityField, value: boolean): void { field.keyField = value; this.state.update((state) => state ? { ...state, fields: [...state.fields] } : state); }
  setDescription(field: QualityField, value: string): void { field.businessDescription = value; this.state.update((state) => state ? { ...state, fields: [...state.fields] } : state); }
  dcatValue(term: string): string { return ({ 'dcat:Dataset': this.title(), 'dcat:DataService': 'REST Data Service', 'dcat:Distribution': 'application/json', 'dcterms:publisher': this.product().owner })[term] ?? ''; }
  setDcatConfirmation(term: string, confirmed: boolean): void { const next = { ...this.dcatConfirmed(), [term]: confirmed }; this.dcatConfirmed.set(next); this.dcatReviewed.set(this.dcatMappings.every((mapping) => next[mapping.term])); this.saved.set(false); }
  stepComplete(step: number, state: QualityState): boolean { return ({ 1: state.quality.criteria.find((item) => item.id === 'technical')?.complete, 2: state.quality.criteria.find((item) => item.id === 'business')?.complete, 3: state.quality.dcatReviewed, 4: state.quality.criteria.find((item) => item.id === 'ontology')?.complete, 5: state.quality.criteria.find((item) => item.id === 'graph')?.complete })[step] ?? false; }
  save(): void {
    const state = this.state(); if (!state) return;
    const graph = state.graph ?? { nodes: [{ id: 'daaif', label: 'DAAIF' }, { id: this.productId, label: this.title() }, { id: 'domain', label: this.domain() }, { id: 'rest', label: 'REST' }], edges: [{ source: 'daaif', target: this.productId }, { source: this.productId, target: 'domain' }, { source: this.productId, target: 'rest' }] };
    this.error.set(null); this.saved.set(false);
    this.http.put<{ score: number; medal: string; criteria: QualityState['quality']['criteria']; dcatReviewed: boolean }>(`/api/v1/data-products/${this.productId}/quality`, { title: this.title(), description: this.description(), domain: this.domain(), classification: this.classification(), contactEmail: this.contactEmail(), updateFrequency: this.frequency(), dcatReviewed: this.dcatReviewed(), productClassUri: this.productClassUri(), fields: state.fields.map((field) => ({ id: field.id, keyField: field.keyField, businessDescription: field.businessDescription, ontologyTermUri: field.keyField ? this.fieldTerm(field.id) : null })), graph, graphConfirmed: this.graphConfirmed() }, { headers: this.api.identityHeaders() }).subscribe({ next: (quality) => { this.state.update((current) => current ? { ...current, quality } : current); this.saved.set(true); this.api.refreshProducts(); }, error: (error) => this.error.set(error?.error?.detail ?? 'Die Qualitätsprüfung konnte nicht gespeichert werden.') });
  }
  private load(): void { this.http.get<QualityState>(`/api/v1/data-products/${this.productId}/quality`, { headers: this.api.identityHeaders() }).subscribe((state) => { this.state.set(state); const product = this.product(); this.title.set(product.title); this.description.set(product.description); this.domain.set(product.domain); this.classification.set(product.classification); this.contactEmail.set(product.contact); this.frequency.set(product.updateFrequency); this.dcatReviewed.set(state.quality.dcatReviewed); this.dcatConfirmed.set(Object.fromEntries(this.dcatMappings.map((mapping) => [mapping.term, state.quality.dcatReviewed]))); this.graphConfirmed.set(state.graphStatus === 'confirmed'); const terms: Record<string, string> = {}; for (const mapping of state.mappings) { if (mapping.mappingType === 'product_class') this.productClassUri.set(mapping.termUri); else if (mapping.fieldId) terms[mapping.fieldId] = mapping.termUri; } this.fieldTerms.set(terms); }); }
}
