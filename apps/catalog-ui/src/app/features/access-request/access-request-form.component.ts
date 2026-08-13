import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DidacaGlossaryTermComponent } from '@bit-didaca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { AccessRequestStatus, AccessRequestSubmission, StoredAccessRequest } from '../../core/catalog.models';
import { canTransferOwnership, dataOwner, deliveryProtocols } from '../products/my-data-products';

@Component({
  selector: 'didaca-access-request-form',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, DidacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="access-request-breadcrumb" aria-label="Brotkrümelnavigation">
      <a routerLink="/products">Meine Datenprodukte</a><span aria-hidden="true">›</span><span>Zugriff anfragen</span>
    </nav>

    <section class="didaca-page-heading access-request-heading">
      <div>
        <p class="didaca-eyebrow">Zugriffsantrag</p>
        <h1>Zugriff auf Datenprodukt anfragen</h1>
        <p>Beschreiben Sie den vorgesehenen Datenbezug für eine persönliche <didaca-glossary-term term="eIAM" />-Identität oder einen <didaca-glossary-term term="M2M" />-Service. Die Data Ownerin oder der Data Owner prüft Identität, Rechtslage und Zugriffskonditionen.</p>
      </div>
    </section>

    @if (isOwnProduct()) {
      <section class="didaca-card access-request-owner-guard">
        <h2>Kein Antrag erforderlich</h2>
        <p>Sie sind für dieses Datenprodukt verantwortlich und verfügen bereits über den benötigten Arbeitszugriff.</p>
        <a class="didaca-button is-secondary" routerLink="/products">Zurück zu meinen Datenprodukten</a>
      </section>
    } @else if (createdRequest(); as receipt) {
      <section class="didaca-card access-request-confirmation" aria-live="polite">
        <span class="access-request-confirmation-icon" aria-hidden="true">✓</span>
        <p class="didaca-eyebrow">Antrag gespeichert</p>
        <h2>Ihre Zugriffsanfrage ist eingegangen</h2>
        <p>Der Antrag wurde in der lokalen SQLite-Katalogdatenbank gespeichert und an die zuständige Data Ownerin beziehungsweise den zuständigen Data Owner übergeben.</p>
        <dl>
          <div><dt>Antragsnummer</dt><dd>{{ receipt.requestNumber }}</dd></div>
          <div><dt>Status</dt><dd>{{ statusLabel(receipt.status) }}</dd></div>
          <div><dt>Datenprodukt</dt><dd>{{ product().title }}</dd></div>
          <div><dt>Eingereicht</dt><dd>{{ receipt.createdAt | date: 'dd.MM.yyyy, HH:mm' }}</dd></div>
        </dl>
        <div class="access-request-confirmation-actions">
          <a class="didaca-button is-primary" routerLink="/products" [queryParams]="{ relationship: 'requestedByMe' }">Meine Anfragen anzeigen</a>
          <button class="didaca-button is-secondary" type="button" (click)="createAnotherRequest()">Weiteren Antrag erstellen</button>
        </div>
      </section>
    } @else {
      <div class="access-request-layout">
        <form class="didaca-card access-request-form" [formGroup]="form" (ngSubmit)="submit()">
          <header>
            <p class="didaca-eyebrow">Antragsangaben</p>
            <h2>Wer benötigt welche Daten – und wofür?</h2>
            <p>Mit <span aria-hidden="true">*</span><span class="sr-only">Stern</span> markierte Felder sind erforderlich.</p>
          </header>

          <fieldset>
            <legend>1. Antragstellende Person</legend>
            <div class="access-request-person">
              <img src="/assets/kassandra-valdata.webp" alt="">
              <span><strong>Kassandra Valdata</strong><small>Eidgenössische Steuerverwaltung ESTV</small><small>Identität aus dem Demo-Benutzerkontext</small></span>
            </div>
            <label class="access-request-field">
              <span>Kontakt-E-Mail *</span>
              <input type="email" formControlName="contactEmail" autocomplete="email">
              @if (form.controls.contactEmail.touched && form.controls.contactEmail.invalid) { <small class="field-error">Geben Sie eine gültige E-Mail-Adresse ein.</small> }
            </label>
          </fieldset>

          <fieldset>
            <legend>2. Vorgesehene Nutzung</legend>
            <div class="access-request-choice-group" role="radiogroup" aria-label="Zugriff für">
              <label [class.is-selected]="form.controls.consumerType.value === 'person'">
                <input type="radio" formControlName="consumerType" value="person" (change)="consumerTypeChanged()">
                <span><strong>Für mich persönlich</strong><small>Interaktiver Zugriff durch Kassandra Valdata</small></span>
              </label>
              <label [class.is-selected]="form.controls.consumerType.value === 'machine'">
                <input type="radio" formControlName="consumerType" value="machine" (change)="consumerTypeChanged()">
                <span><strong>Für eine Machine ID</strong><small>Zugriff durch einen Web Service oder technischen Client</small></span>
              </label>
            </div>

            @if (form.controls.consumerType.value === 'machine') {
              <label class="access-request-field">
                <span>Machine ID *</span>
                <input formControlName="machineId" placeholder="z. B. svc-estv-tax-analysis" autocomplete="off">
                <small>Keine Passwörter, Tokens oder anderen Zugangsdaten eintragen.</small>
                @if (form.controls.machineId.touched && form.controls.machineId.invalid) { <small class="field-error">Geben Sie die technische Identität an.</small> }
              </label>
            }

            <label class="access-request-field">
              <span>Verwendungszweck *</span>
              <textarea rows="4" formControlName="purpose" placeholder="Welche Aufgabe soll mit den Daten erfüllt werden?"></textarea>
              <small>Mindestens 20 Zeichen; keine schützenswerten Einzelfalldaten angeben.</small>
              @if (form.controls.purpose.touched && form.controls.purpose.invalid) { <small class="field-error">Beschreiben Sie den Verwendungszweck mit mindestens 20 Zeichen.</small> }
            </label>

            <label class="access-request-field">
              <span>Rechtsgrundlage / Auftrag *</span>
              <select formControlName="legalBasis">
                <option value="">Bitte auswählen</option>
                <option value="Gesetzlicher Auftrag der ESTV">Gesetzlicher Auftrag der ESTV</option>
                <option value="Amtshilfe zwischen Behörden">Amtshilfe zwischen Behörden</option>
                <option value="Statistik, Planung und Qualitätssicherung">Statistik, Planung und Qualitätssicherung</option>
                <option value="Rechtsgrundlage wird mit der Data Ownerin geklärt">Noch mit der Data Ownerin / dem Data Owner zu klären</option>
              </select>
              @if (form.controls.legalBasis.touched && form.controls.legalBasis.invalid) { <small class="field-error">Wählen Sie den fachlichen oder gesetzlichen Auftrag aus.</small> }
            </label>
          </fieldset>

          <fieldset>
            <legend>3. Gewünschter Zugriff</legend>
            <div class="access-request-grid">
              <label class="access-request-field">
                <span>Bereitstellung *</span>
                <select formControlName="requestedProtocol">
                  <option value="http">REST / HTTP</option>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="both">REST / HTTP und PostgreSQL</option>
                </select>
              </label>
              <label class="access-request-field">
                <span>Datenvariante *</span>
                <select formControlName="requestedVariant">
                  <option value="either">Data Owner entscheidet</option>
                  <option value="modified">Modifiziert / minimiert</option>
                  <option value="original">Originaldaten</option>
                </select>
              </label>
              <label class="access-request-field">
                <span>Gültig ab *</span>
                <input type="date" formControlName="validFrom">
              </label>
              <label class="access-request-field">
                <span>Gültig bis *</span>
                <input type="date" formControlName="validUntil" [min]="form.controls.validFrom.value">
              </label>
            </div>
            @if (periodInvalid()) { <p class="access-request-period-error" role="alert">Das Enddatum darf nicht vor dem Startdatum liegen.</p> }
            <label class="access-request-field">
              <span>Ergänzende Hinweise <small>(optional)</small></span>
              <textarea rows="3" formControlName="notes" placeholder="Besondere Bedingungen, benötigte Attribute oder zeitliche Abhängigkeiten"></textarea>
            </label>
          </fieldset>

          <label class="access-request-consent">
            <input type="checkbox" formControlName="conditionsAccepted">
            <span>Ich bestätige, dass die Angaben dem vorgesehenen Zweck entsprechen und keine Zugangsdaten oder geschützten Datensätze enthalten. *</span>
          </label>
          @if (form.controls.conditionsAccepted.touched && form.controls.conditionsAccepted.invalid) { <p class="field-error">Diese Bestätigung ist für die Einreichung erforderlich.</p> }

          @if (submitError(); as error) { <p class="didaca-alert is-error" role="alert">{{ error }}</p> }

          <footer>
            <a class="didaca-button is-secondary" routerLink="/products">Abbrechen</a>
            <button class="didaca-button is-primary" type="submit" [disabled]="submitting()">
              {{ submitting() ? 'Antrag wird gespeichert…' : 'Zugriffsanfrage einreichen' }}
            </button>
          </footer>
        </form>

        <aside class="access-request-sidebar" aria-label="Datenprodukt und Antragsstatus">
          <section class="didaca-card access-request-product-card">
            <p class="didaca-eyebrow">Datenprodukt</p>
            <h2>{{ product().title }}</h2>
            <p>{{ product().description }}</p>
            <dl>
              <div><dt>Data Owner</dt><dd>{{ ownerName() }}</dd></div>
              <div><dt>Organisation</dt><dd>{{ product().owner }}</dd></div>
              <div><dt>Bereitstellung</dt><dd>{{ protocolsLabel() }}</dd></div>
              <div><dt>Klassifikation</dt><dd>{{ classificationLabel() }}</dd></div>
            </dl>
          </section>

          <section class="didaca-card access-request-process">
            <p class="didaca-eyebrow">Prüfprozess</p>
            <h2>Was geschieht danach?</h2>
            <ol>
              <li><strong>Anfrage eingegangen</strong><span>Der Antrag erhält eine eindeutige Nummer.</span></li>
              <li><strong>Identität und Rechtslage</strong><span>Organisation, Auftrag und Rechtsgrundlage werden geprüft.</span></li>
              <li><strong>Zugriffskonditionen</strong><span>Umfang, Variante und Gültigkeit werden festgelegt.</span></li>
              <li><strong>Entscheid</strong><span>Zugriff wird original, modifiziert oder nicht gewährt.</span></li>
            </ol>
          </section>

          @if (existingRequests().length) {
            <section class="didaca-card access-request-history">
              <p class="didaca-eyebrow">Bisherige Anträge</p>
              @for (request of existingRequests(); track request.id) {
                <article>
                  <strong>{{ request.requestNumber }}</strong>
                  <span>{{ statusLabel(request.status) }}</span>
                  <small>{{ request.createdAt | date: 'dd.MM.yyyy' }} · {{ consumerLabel(request) }}</small>
                </article>
              }
            </section>
          }
        </aside>
      </div>
    }
  `,
})
export class AccessRequestFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  readonly api = inject(CatalogApiService);
  readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly product = computed(() => this.api.products().find((item) => item.id === this.productId) ?? this.api.product());
  readonly createdRequest = signal<StoredAccessRequest | null>(null);
  readonly existingRequests = signal<readonly StoredAccessRequest[]>([]);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    consumerType: this.fb.nonNullable.control<'person' | 'machine'>('person'),
    machineId: '',
    purpose: ['', [Validators.required, Validators.minLength(20)]],
    legalBasis: ['', Validators.required],
    requestedProtocol: this.fb.nonNullable.control<'http' | 'postgresql' | 'both'>('http'),
    requestedVariant: this.fb.nonNullable.control<'original' | 'modified' | 'either'>('either'),
    validFrom: [futureDate(7), Validators.required],
    validUntil: [futureDate(372), Validators.required],
    contactEmail: ['', [Validators.required, Validators.email]],
    notes: '',
    conditionsAccepted: [false, Validators.requiredTrue],
  });

  constructor() {
    this.form.controls.contactEmail.setValue(this.api.identityUser().email);
    this.api.selectProduct(this.productId);
    this.api.loadMyAccessRequests(this.productId).subscribe((requests) => this.existingRequests.set(requests));
  }

  isOwnProduct(): boolean {
    return canTransferOwnership(this.product(), this.api.identityUserId());
  }

  ownerName(): string {
    return dataOwner(this.product())?.name ?? this.product().owner;
  }

  protocolsLabel(): string {
    return deliveryProtocols(this.product()).join(' & ') || 'Gemäss Produktbeschreibung';
  }

  classificationLabel(): string {
    return ({ public: 'Öffentlich', internal: 'Intern', confidential: 'Vertraulich', restricted: 'Eingeschränkt' })[this.product().classification];
  }

  consumerTypeChanged(): void {
    const machineId = this.form.controls.machineId;
    if (this.form.controls.consumerType.value === 'machine') {
      machineId.setValidators([Validators.required, Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,254}$/)]);
    } else {
      machineId.clearValidators();
      machineId.setValue('');
    }
    machineId.updateValueAndValidity();
  }

  periodInvalid(): boolean {
    const { validFrom, validUntil } = this.form.getRawValue();
    return Boolean(validFrom && validUntil && validUntil < validFrom);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.periodInvalid() || this.submitting()) return;
    const value = this.form.getRawValue();
    const submission: AccessRequestSubmission = {
      consumerType: value.consumerType,
      machineId: value.consumerType === 'machine' ? value.machineId.trim() : null,
      purpose: value.purpose.trim(),
      legalBasis: value.legalBasis,
      requestedProtocol: value.requestedProtocol,
      requestedVariant: value.requestedVariant,
      validFrom: value.validFrom,
      validUntil: value.validUntil,
      contactEmail: value.contactEmail.trim(),
      notes: value.notes.trim() || null,
      conditionsAccepted: true,
    };
    this.submitting.set(true);
    this.submitError.set(null);
    this.api.createAccessRequest(this.productId, submission).subscribe({
      next: (request) => {
        this.submitting.set(false);
        this.createdRequest.set(request);
        this.existingRequests.update((requests) => [request, ...requests]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (error: Error) => {
        this.submitting.set(false);
        this.submitError.set(error.message);
      },
    });
  }

  createAnotherRequest(): void {
    this.createdRequest.set(null);
    this.form.controls.machineId.setValue('');
    this.form.controls.purpose.setValue('');
    this.form.controls.notes.setValue('');
    this.form.controls.conditionsAccepted.setValue(false);
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  statusLabel(status: AccessRequestStatus): string {
    return {
      submitted: 'Anfrage eingegangen',
      identity_review: 'Identität wird geprüft',
      legal_review: 'Rechtslage wird geprüft',
      conditions_review: 'Zugriffskonditionen werden geprüft',
      approved_policy_pending: 'Genehmigt · Policy wird publiziert',
      granted_modified: 'Zugriff gewährt (modifiziert)',
      granted_original: 'Zugriff gewährt (original)',
      rejected: 'Zugriff nicht gewährt',
      withdrawn: 'Anfrage zurückgezogen',
    }[status];
  }

  consumerLabel(request: StoredAccessRequest): string {
    return request.consumerType === 'machine' ? `Machine ID ${request.machineId}` : 'Persönlicher Zugriff';
  }
}

function futureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
