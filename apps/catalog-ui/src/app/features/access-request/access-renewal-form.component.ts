import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import {
  DataProduct,
  ProductEffectiveAccessGrant,
  ProductEffectiveAccessResponse,
  StoredAccessRequest,
} from '../../core/catalog.models';

@Component({
  selector: 'daca-access-renewal-form',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="access-request-breadcrumb" aria-label="Brotkrümelnavigation">
      <a [routerLink]="['/products', productId, 'usage']">Daten &amp; Nutzung</a><span aria-hidden="true">›</span><span>Freigabe verlängern</span>
    </nav>

    <section class="daca-page-heading access-request-heading">
      <div>
        <p class="daca-eyebrow">Verlängerungsantrag</p>
        <h1>Bestehende Freigabe verlängern</h1>
        <p>Zweck und neues Enddatum bestätigen. Identität, Protokoll, Datenvariante und Laufzeitregeln werden unverändert aus der aktiven Policy übernommen.</p>
      </div>
    </section>

    @if (loading()) {
      <section class="daca-card access-renewal-state" role="status">
        <strong>Freigabekontext wird geprüft</strong>
        <p>DaCa lädt die aktuell wirksame Policy. Solange der Kontext nicht vollständig bestätigt ist, kann kein Antrag gesendet werden.</p>
      </section>
    } @else if (loadError(); as error) {
      <section class="daca-card access-renewal-state is-error" role="alert">
        <strong>Verlängerung nicht verfügbar</strong>
        <p>{{ error }}</p>
        <div><button class="daca-button is-secondary" type="button" (click)="load()">Erneut prüfen</button><a class="daca-button is-secondary" [routerLink]="['/products', productId, 'usage']">Zurück zu Daten &amp; Nutzung</a></div>
      </section>
    } @else if (createdRequest(); as receipt) {
      <section class="daca-card access-request-confirmation" aria-live="polite">
        <span class="access-request-confirmation-icon" aria-hidden="true">✓</span>
        <p class="daca-eyebrow">Verlängerung eingereicht</p>
        <h2>Ihr Verlängerungsantrag ist eingegangen</h2>
        <p>Die bestehende Freigabe bleibt bis zu ihrem bisherigen Enddatum wirksam. Das neue Enddatum gilt erst nach Owner-Entscheid, Vier-Augen-Freigabe und bestätigtem Deployment in OPA und PostgreSQL.</p>
        <dl>
          <div><dt>Antragsnummer</dt><dd>{{ receipt.requestNumber }}</dd></div>
          <div><dt>Datenprodukt</dt><dd>{{ product()?.title }}</dd></div>
          <div><dt>Bisher gültig bis</dt><dd>{{ grant()?.validUntil | date: 'dd.MM.yyyy' }}</dd></div>
          <div><dt>Beantragt bis</dt><dd>{{ receipt.validUntil | date: 'dd.MM.yyyy' }}</dd></div>
        </dl>
        <div class="access-request-confirmation-actions">
          <a class="daca-button" routerLink="/products" [queryParams]="{ relationship: 'requestedByMe' }">Meine Anfragen anzeigen</a>
          <a class="daca-button is-secondary" [routerLink]="['/products', productId, 'usage']">Zurück zu Daten &amp; Nutzung</a>
        </div>
      </section>
    } @else if (grant(); as currentGrant) {
      <div class="access-request-layout access-renewal-layout">
        <form class="daca-card access-request-form" [formGroup]="form" (ngSubmit)="submit()">
          <header>
            <p class="daca-eyebrow">Unveränderter Umfang</p>
            <h2>Nur Zweck und Enddatum aktualisieren</h2>
            <p>Eine Erweiterung von Identität, Protokoll oder Datenvariante erfordert einen neuen Zugriffsantrag.</p>
          </header>

          <fieldset>
            <legend>Bestehende Freigabe</legend>
            <dl class="access-renewal-context" data-testid="renewal-immutable-context">
              <div><dt>Identität</dt><dd>eIAM · {{ api.identityUserId() }}</dd></div>
              <div><dt>Protokoll</dt><dd>{{ protocolLabel(currentGrant) }}</dd></div>
              <div><dt>Datenvariante</dt><dd>{{ variantLabel(currentGrant.dataVariant) }}</dd></div>
              @if (sourceRequest(); as source) { <div><dt>Rechtsgrundlage</dt><dd>{{ source.legalBasis }}</dd></div> }
              <div><dt>Gültig ab</dt><dd>{{ currentGrant.validFrom | date: 'dd.MM.yyyy' }}</dd></div>
              <div><dt>Aktuell gültig bis</dt><dd>{{ currentGrant.validUntil | date: 'dd.MM.yyyy' }}</dd></div>
              <div><dt>Zeitfenster</dt><dd>{{ availabilityLabel(currentGrant) }}</dd></div>
            </dl>
            <p class="access-renewal-continuity"><strong>Bestehender Zugriff bleibt unverändert:</strong> Dieser Antrag ersetzt oder unterbricht die aktive Freigabe nicht. Erst ein vollständig bestätigtes Deployment aktiviert das neue Enddatum.</p>
          </fieldset>

          <fieldset>
            <legend>Verlängerung beantragen</legend>
            <label class="access-request-field">
              <span>Verwendungszweck *</span>
              <textarea rows="5" formControlName="purpose" autocomplete="off"></textarea>
              <small>Mindestens 20 Zeichen; keine schützenswerten Einzelfalldaten angeben.</small>
              @if (form.controls.purpose.touched && form.controls.purpose.invalid) { <small class="field-error">Beschreiben Sie den Verwendungszweck mit mindestens 20 Zeichen.</small> }
            </label>
            <label class="access-request-field">
              <span>Neues Enddatum *</span>
              <input type="date" formControlName="validUntil" [min]="minimumEndDate()">
              <small>Das Datum muss nach dem bisherigen Enddatum {{ currentGrant.validUntil | date: 'dd.MM.yyyy' }} liegen.</small>
              @if (form.controls.validUntil.touched && (form.controls.validUntil.invalid || endDateInvalid())) { <small class="field-error">Wählen Sie ein späteres, gültiges Enddatum.</small> }
            </label>
          </fieldset>

          <label class="access-request-consent">
            <input type="checkbox" formControlName="conditionsAccepted">
            <span>Ich bestätige den unveränderten Freigabeumfang und beantrage ausschliesslich die angezeigte Verlängerung. *</span>
          </label>
          @if (form.controls.conditionsAccepted.touched && form.controls.conditionsAccepted.invalid) { <p class="field-error">Diese Bestätigung ist für die Einreichung erforderlich.</p> }
          @if (submitError(); as error) { <p class="daca-alert is-error" role="alert">{{ error }}</p> }

          <footer>
            <a class="daca-button is-secondary" [routerLink]="['/products', productId, 'usage']">Abbrechen</a>
            <button class="daca-button" type="submit" [disabled]="submitting()">
              {{ submitting() ? 'Verlängerung wird eingereicht …' : 'Verlängerung beantragen' }}
            </button>
          </footer>
        </form>

        <aside class="access-request-sidebar" aria-label="Datenprodukt und Prüfprozess">
          <section class="daca-card access-request-product-card">
            <p class="daca-eyebrow">Datenprodukt</p>
            <h2>{{ product()?.title }}</h2>
            <p>{{ product()?.description }}</p>
            <dl>
              <div><dt>Antrag</dt><dd>{{ currentGrant.sourceRequestNumber }}</dd></div>
              <div><dt>Policy</dt><dd>Revision {{ effectiveAccess()?.policyRevision }}</dd></div>
              <div><dt>Ablauf</dt><dd>{{ expiryLabel(currentGrant.expiresInDays) }}</dd></div>
            </dl>
          </section>
          <section class="daca-card access-request-process">
            <p class="daca-eyebrow">Prüfprozess</p>
            <h2>Was geschieht danach?</h2>
            <ol>
              <li><strong>Owner-Prüfung</strong><span>Alt und Neu werden direkt verglichen.</span></li>
              <li><strong>Policy-Revision</strong><span>Der unveränderte Grant erhält das neue Enddatum.</span></li>
              <li><strong>Vier-Augen-Freigabe</strong><span>Die Kontrollperson prüft exakt diese Revision.</span></li>
              <li><strong>Doppel-Deployment</strong><span>OPA und PostgreSQL müssen dieselbe Revision bestätigen.</span></li>
            </ol>
          </section>
        </aside>
      </div>
    }
  `,
})
export class AccessRenewalFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  readonly api = inject(CatalogApiService);
  readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly grantId = this.route.snapshot.paramMap.get('grantId') ?? '';
  readonly product = signal<DataProduct | null>(null);
  readonly effectiveAccess = signal<ProductEffectiveAccessResponse | null>(null);
  readonly grant = signal<ProductEffectiveAccessGrant | null>(null);
  readonly sourceRequest = signal<StoredAccessRequest | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly createdRequest = signal<StoredAccessRequest | null>(null);
  private loadGeneration = 0;

  readonly form = this.fb.nonNullable.group({
    purpose: ['', [Validators.required, Validators.minLength(20)]],
    validUntil: ['', Validators.required],
    conditionsAccepted: [false, Validators.requiredTrue],
  });

  constructor() {
    this.api.selectProduct(this.productId);
    effect(() => {
      this.api.identityUserId();
      this.load();
    });
  }

  load(): void {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadError.set(null);
    this.submitError.set(null);
    this.product.set(null);
    this.effectiveAccess.set(null);
    this.grant.set(null);
    this.sourceRequest.set(null);
    if (!this.productId || !this.grantId) {
      this.loading.set(false);
      this.loadError.set('Die Produkt- oder Freigabe-ID fehlt in der Adresse.');
      return;
    }
    forkJoin({
      product: this.api.loadProduct(this.productId),
      access: this.api.loadEffectiveAccess(this.productId),
      requests: this.api.loadMyAccessRequests(this.productId, true),
    }).subscribe({
      next: ({ product, access, requests }) => {
        if (generation !== this.loadGeneration) return;
        const grant = access.grants.find((item) => item.grantId === this.grantId);
        const sourceRequest = requests.find((item) => item.id === grant?.sourceRequestId) ?? null;
        if (product.id !== this.productId || !this.isEligibleContext(access, grant, sourceRequest)) {
          this.loading.set(false);
          this.loadError.set('Die aktive Freigabe ist nicht eindeutig verlängerbar. Öffnen Sie Daten & Nutzung und prüfen Sie den aktuellen Zugriffsstatus erneut.');
          return;
        }
        this.product.set(product);
        this.effectiveAccess.set(access);
        this.grant.set(grant);
        this.sourceRequest.set(sourceRequest);
        this.form.reset({
          purpose: grant.purpose ?? '',
          validUntil: addOneYear(grant.validUntil),
          conditionsAccepted: false,
        });
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.loading.set(false);
        this.loadError.set('Der wirksame Freigabekontext konnte nicht vollständig geladen werden. Es werden keine Ersatzdaten verwendet.');
      },
    });
  }

  minimumEndDate(): string {
    const grant = this.grant();
    return grant ? addDays(grant.validUntil, 1) : '';
  }

  endDateInvalid(): boolean {
    const grant = this.grant();
    const endDate = this.form.controls.validUntil.value;
    return Boolean(grant && endDate && endDate <= grant.validUntil);
  }

  submit(): void {
    this.form.markAllAsTouched();
    const grant = this.grant();
    if (!grant || this.form.invalid || this.endDateInvalid() || this.submitting()) return;
    const value = this.form.getRawValue();
    this.submitting.set(true);
    this.submitError.set(null);
    this.api.createAccessRenewal(this.productId, {
      sourceGrantId: grant.grantId,
      purpose: value.purpose.trim(),
      validUntil: value.validUntil,
      conditionsAccepted: true,
    }).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.createdRequest.set(created);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (error: Error) => {
        this.submitting.set(false);
        this.submitError.set(error.message);
      },
    });
  }

  protocolLabel(grant: ProductEffectiveAccessGrant): string {
    return grant.protocols.map((protocol) => protocol === 'http' ? 'REST' : 'PostgreSQL').join(' & ');
  }

  variantLabel(variant: ProductEffectiveAccessGrant['dataVariant']): string {
    return variant === 'original' ? 'Originaldaten' : 'Modifiziert / minimiert';
  }

  availabilityLabel(grant: ProductEffectiveAccessGrant): string {
    const availability = grant.weeklyAvailability;
    if (!availability) return 'Durchgehend · 24/7';
    const labels: Record<string, string> = { monday: 'Mo', tuesday: 'Di', wednesday: 'Mi', thursday: 'Do', friday: 'Fr', saturday: 'Sa', sunday: 'So' };
    return `${availability.weekdays.map((day) => labels[day]).join(', ')}, ${availability.startTime}–${availability.endTime} ${availability.timeZone}`;
  }

  expiryLabel(days: number): string {
    return days === 0 ? 'Heute' : days === 1 ? 'Morgen' : `In ${days} Tagen`;
  }

  private isEligibleContext(
    access: ProductEffectiveAccessResponse,
    grant: ProductEffectiveAccessGrant | undefined,
    sourceRequest: StoredAccessRequest | null,
  ): grant is ProductEffectiveAccessGrant {
    return access.granted
      && /^\d{4}-\d{2}-\d{2}$/.test(access.asOfDate)
      && Number.isInteger(access.policyRevision)
      && (access.policyRevision ?? 0) > 0
      && Boolean(grant)
      && grant?.subjectType === 'person'
      && grant.renewalEligibility?.eligible === true
      && grant.renewalEligibility.reason === 'eligible'
      && grant.renewalEligibility.renewalRequestId === null
      && Boolean(grant.sourceRequestId?.trim())
      && Boolean(grant.sourceRequestNumber?.trim())
      && sourceRequest?.dataProductId === this.productId
      && sourceRequest.requestNumber === grant.sourceRequestNumber
      && sourceRequest.requesterId === this.api.identityUserId()
      && Boolean(sourceRequest.legalBasis?.trim())
      && grant.expiryState === 'expiringSoon'
      && Number.isInteger(grant.expiresInDays)
      && grant.expiresInDays >= 0
      && grant.expiresInDays <= 30
      && grant.protocols.length > 0
      && /^\d{4}-\d{2}-\d{2}$/.test(grant.validFrom)
      && /^\d{4}-\d{2}-\d{2}$/.test(grant.validUntil);
  }
}

function addOneYear(value: string): string {
  const parsed = parseDateOnly(value);
  if (!parsed) return '';
  parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
  return parsed.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const parsed = parseDateOnly(value);
  if (!parsed) return '';
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
