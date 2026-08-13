import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DacaGlossaryTermComponent } from '@bit-daca/design-system';
import { catchError, of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';

interface Fixture {
  id: string;
  ownerUserId: string;
  sourceProductId: string;
  title: string;
  maturityLevel: 'bronze' | 'silver' | 'gold';
  payload: Record<string, unknown>;
  injectedProductId: string | null;
}

interface PublicationResult {
  productId: string;
  created: boolean;
  state: string;
  missingFields: string[];
  taskIds: string[];
}

@Component({
  selector: 'daca-poc-settings',
  standalone: true,
  imports: [RouterLink, DacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div><p class="daca-eyebrow"><daca-glossary-term term="PoC" /> Simulation</p><h1>Simulationsereignis: Datenprodukt im <daca-glossary-term term="DaCa" /> eingereicht</h1><p>Simulieren Sie die offene REST-Metadatenpublikation eines bereits in <daca-glossary-term term="DAAIF" /> erstellten Datenprodukts.</p></div>
      <a class="poc-open-api" href="/catalog-api/docs" target="_blank" rel="noreferrer">OpenAPI · ohne Identifikation</a>
    </section>

    <p class="daca-alert is-warning"><strong>Nur PoC:</strong> Der Publikationsendpunkt ist lokal bewusst offen. Er übernimmt Metadaten, niemals Zugangsdaten oder Secrets. Datenzugriff bleibt Default Deny.</p>

    <div class="poc-fixture-groups">
      @for (user of identity.users(); track user.id) {
        <section class="daca-card poc-fixture-group">
          <header><div>@if (user.avatarUrl) { <img [src]="user.avatarUrl" alt=""> }<span><small>Data Owner</small><strong>{{ user.displayName }}</strong><small>{{ user.organization }}</small></span></div><b>{{ fixturesFor(user.id).length }} Fixtures</b></header>
          <div>
            @for (fixture of fixturesFor(user.id); track fixture.id) {
              <article>
                <span class="quality-medal" [class]="'is-' + fixture.maturityLevel">{{ medal(fixture.maturityLevel) }}</span>
                <div><small>DAAIF · {{ fixture.sourceProductId }}</small><h2>{{ fixture.title }}</h2><p>{{ fixture.maturityLevel === 'gold' ? 'Fachlich, technisch, DCAT und Ontologie vorbereitet.' : fixture.maturityLevel === 'silver' ? 'Technische und fachliche Angaben vorhanden.' : 'Nur technische REST-Metadaten vorhanden.' }}</p></div>
                @if (fixture.injectedProductId) { <a class="daca-button is-secondary" [routerLink]="['/products', fixture.injectedProductId, 'overview']">Produkt öffnen</a> }
                @else { <button class="daca-button" type="button" aria-describedby="publication-action-help" (click)="open(fixture, $event)">Ereignis «Datenprodukt im DaCa eingereicht» auslösen</button> }
              </article>
            }
          </div>
        </section>
      }
    </div>

    <p id="publication-action-help" class="poc-action-help">Der Auslöser sendet die Fixture-Metadaten an denselben echten Publikationsendpoint, den auch eine externe DAAIF-Integration verwendet. Er erzeugt ein Datenprodukt und Owner-Aufgaben, aber keine Datenfreigabe.</p>

    @if (selected(); as fixture) {
      <div class="poc-dialog-backdrop" (click)="closeBackdrop($event)">
        <section class="poc-dialog" role="dialog" aria-modal="true" aria-labelledby="publication-title">
          <header><div><p class="daca-eyebrow">DAAIF → DaCa</p><h2 id="publication-title">Metadaten publizieren</h2></div><button id="poc-publication-close" type="button" (click)="close()" aria-label="Schliessen">×</button></header>
          <p><strong>{{ fixture.title }}</strong></p>
          <dl><div><dt>Quelle</dt><dd>DAAIF</dd></div><div><dt>Protokoll</dt><dd>REST · GET</dd></div><div><dt>Owner</dt><dd>{{ ownerName(fixture.ownerUserId) }}</dd></div></dl>
          <fieldset><legend>Publikationsmodus</legend><label><input type="radio" name="mode" value="governance_review" [checked]="mode() === 'governance_review'" (change)="mode.set('governance_review')"><span><strong>Governance-Prüfung</strong><small>Owner-sichtbarer Entwurf mit zwei Aufgaben.</small></span></label><label><input type="radio" name="mode" value="automatic" [checked]="mode() === 'automatic'" (change)="mode.set('automatic')"><span><strong>Vollautomatische Publikation</strong><small>Sofort auffindbar, Datenzugriff weiterhin gesperrt.</small></span></label></fieldset>
          <label class="poc-discoverable"><input type="checkbox" [checked]="discoverable()" (change)="discoverable.set($any($event.target).checked)"><span><strong>Im Katalog auffindbar</strong><small>OpenAPI-Default: true. Dies gibt keine Produktdaten frei.</small></span></label>
          @if (error()) { <p class="daca-alert is-error" role="alert">{{ error() }}</p> }
          <footer><button class="daca-button is-secondary" type="button" (click)="close()">Abbrechen</button><button class="daca-button" type="button" [disabled]="submitting()" (click)="publish()">{{ submitting() ? 'Ereignis wird ausgelöst…' : 'Ereignis jetzt auslösen' }}</button></footer>
        </section>
      </div>
    }

    @if (result(); as outcome) {
      <section class="daca-card poc-result" role="status"><div><p class="daca-eyebrow">Erfolgreich übernommen</p><h2>{{ outcome.created ? 'Datenprodukt und Aufgaben erstellt' : 'Datenprodukt war bereits vorhanden' }}</h2><p>{{ outcome.missingFields.length }} Qualitätskriterien sind noch offen.</p></div><div class="poc-result-actions"><a class="daca-button" [routerLink]="['/products', outcome.productId, 'quality']">Qualitätswizard öffnen</a><button class="daca-button is-secondary" type="button" (click)="openReset(outcome.productId)">Fixture zurücksetzen</button></div></section>
    }

    @if (resetProductId()) {
      <div class="poc-dialog-backdrop" (click)="closeResetBackdrop($event)">
        <section class="poc-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-detail">
          <header><div><p class="daca-eyebrow">Physischer PoC-Reset</p><h2 id="reset-title">Fixture-Produkt löschen?</h2></div><button type="button" (click)="closeReset()" aria-label="Schliessen">×</button></header>
          <p id="reset-detail">Produkt, Publikation und abhängige synthetische Daten werden gelöscht. Audit, Provenienz-URN und Reset-Nachweis bleiben erhalten. Geben Sie zur Bestätigung exakt <strong>{{ identity.user().displayName }}</strong> ein.</p>
          <label class="poc-reset-confirmation"><span>Bestätigungsname</span><input type="text" [value]="confirmationName()" (input)="confirmationName.set($any($event.target).value)" autocomplete="off"></label>
          <footer><button class="daca-button is-secondary" type="button" (click)="closeReset()">Abbrechen</button><button class="daca-button" type="button" [disabled]="confirmationName() !== identity.user().displayName || submitting()" (click)="resetFixture()">Fixture physisch zurücksetzen</button></footer>
        </section>
      </div>
    }
  `,
})
export class PocSettingsComponent {
  private readonly http = inject(HttpClient);
  readonly identity = inject(DemoIdentityService);
  private readonly api = inject(CatalogApiService);
  readonly fixtures = signal<readonly Fixture[]>([]);
  readonly selected = signal<Fixture | null>(null);
  readonly mode = signal<'governance_review' | 'automatic'>('governance_review');
  readonly discoverable = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<PublicationResult | null>(null);
  readonly resetProductId = signal<string | null>(null);
  readonly confirmationName = signal('');
  private returnFocus: HTMLElement | null = null;

  constructor() { this.load(); }

  fixturesFor(userId: string): readonly Fixture[] { return this.fixtures().filter((fixture) => fixture.ownerUserId === userId); }
  ownerName(userId: string): string { return this.identity.users().find((user) => user.id === userId)?.displayName ?? userId; }
  medal(value: Fixture['maturityLevel']): string { return ({ bronze: 'Bronze', silver: 'Silber', gold: 'Gold' })[value]; }
  open(fixture: Fixture, event: Event): void { this.returnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null; this.selected.set(fixture); this.mode.set('governance_review'); this.discoverable.set(true); this.error.set(null); setTimeout(() => document.getElementById('poc-publication-close')?.focus()); }
  closeBackdrop(event: MouseEvent): void { if (event.target === event.currentTarget) this.close(); }
  close(): void { const target = this.returnFocus; this.selected.set(null); this.returnFocus = null; queueMicrotask(() => target?.focus()); }
  openReset(productId: string): void { this.resetProductId.set(productId); this.confirmationName.set(''); this.error.set(null); }
  closeReset(): void { this.resetProductId.set(null); this.confirmationName.set(''); }
  closeResetBackdrop(event: MouseEvent): void { if (event.target === event.currentTarget) this.closeReset(); }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void { if (this.resetProductId()) this.closeReset(); else if (this.selected()) this.close(); }
  publish(): void {
    const fixture = this.selected();
    if (!fixture || this.submitting()) return;
    const payload = { ...fixture.payload, publicationMode: this.mode(), discoverable: this.discoverable() };
    this.submitting.set(true);
    this.http.post<PublicationResult>('/api/v1/metadata-publications', payload).subscribe({
      next: (result) => { this.submitting.set(false); this.result.set(result); this.selected.set(null); this.api.refreshProducts(); this.api.refreshOwnerAccessRequestInbox(); this.api.refreshWorkflowTasks(); this.load(); },
      error: (error) => { this.submitting.set(false); this.error.set(error?.error?.detail ?? 'Die Metadaten konnten nicht eingereicht werden.'); },
    });
  }
  resetFixture(): void {
    const productId = this.resetProductId();
    if (!productId || this.confirmationName() !== this.identity.user().displayName || this.submitting()) return;
    this.submitting.set(true);
    this.http.post(`/api/v1/poc/data-products/${encodeURIComponent(productId)}/reset`, { confirmationName: this.confirmationName() }, { headers: this.identity.headers() }).subscribe({
      next: () => { this.submitting.set(false); this.result.set(null); this.closeReset(); this.api.refreshProducts(); this.api.refreshWorkflowTasks(); this.load(); },
      error: (error) => { this.submitting.set(false); this.error.set(error?.error?.detail ?? 'Das Fixture konnte nicht zurückgesetzt werden.'); },
    });
  }
  private load(): void { this.http.get<Fixture[]>('/api/v1/poc/product-fixtures').pipe(catchError(() => of([]))).subscribe((fixtures) => this.fixtures.set(fixtures)); }
}
