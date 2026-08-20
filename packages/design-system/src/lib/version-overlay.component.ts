import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, inject, input, signal } from '@angular/core';
import { DacaFeatureLocale, DacaFeatureScope, dacaFeatureList } from './feature-list';
import { DacaAppUpdateService } from './app-update.service';
import { DACA_VERSION } from './version';

@Component({
  selector: 'daca-version-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="daca-version-overlay" [attr.aria-label]="ariaLabel()">
      <div class="daca-version-overlay-row">
        <span class="daca-version-overlay-label">{{ productName() }}</span>
        <span class="daca-version-overlay-version">
          <span class="daca-version-overlay-value">V{{ version() }}</span>
          @if (updateReady()) {
            <button
              #updateTrigger
              class="daca-version-update-trigger"
              type="button"
              data-testid="app-update-reload"
              aria-haspopup="dialog"
              aria-controls="daca-app-update-confirmation"
              [attr.aria-label]="updateButtonLabel()"
              (click)="openUpdateConfirmation()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 7v5h-5M4 17v-5h5" />
                <path d="M6.1 8.4A7 7 0 0 1 18.8 7M17.9 15.6A7 7 0 0 1 5.2 17" />
              </svg>
            </button>
          }
        </span>
      </div>
      <div class="daca-version-overlay-row daca-version-overlay-row-poc">
        <span class="daca-version-overlay-description">{{ description() }}</span>
      </div>
      <button
        #featureTrigger
        class="daca-version-feature-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-controls="daca-feature-list-dialog"
        [attr.aria-expanded]="featureListOpen()"
        (click)="openFeatureList()"
      >{{ locale() === 'de' ? 'Featureliste anzeigen' : 'View feature list' }}</button>
    </aside>

    <dialog
      #featureDialog
      id="daca-feature-list-dialog"
      class="daca-feature-dialog"
      [attr.aria-labelledby]="'daca-feature-list-title'"
      [attr.aria-describedby]="'daca-feature-list-introduction'"
      (cancel)="handleDialogCancel($event)"
      (click)="handleDialogClick($event)"
    >
      <div class="daca-feature-dialog-content">
        <header class="daca-feature-dialog-header">
          <div>
            <p class="daca-feature-dialog-release">{{ locale() === 'de' ? 'Featureliste' : 'Feature list' }} · V{{ featureList().version }}</p>
            <h2 id="daca-feature-list-title">{{ featureList().title }}</h2>
          </div>
          <button
            #featureCloseButton
            class="daca-feature-dialog-close"
            type="button"
            [attr.aria-label]="locale() === 'de' ? 'Featureliste schliessen' : 'Close feature list'"
            (click)="closeFeatureList()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" /></svg>
          </button>
        </header>
        <p id="daca-feature-list-introduction" class="daca-feature-dialog-introduction">{{ featureList().introduction }}</p>
        <ul class="daca-feature-list">
          @for (feature of featureList().features; track feature.title) {
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
              <div>
                <h3>{{ feature.title }}</h3>
                <p>{{ feature.description }}</p>
              </div>
            </li>
          }
        </ul>
        <p class="daca-feature-dialog-note">{{ featureList().pocNote }}</p>
        <div class="daca-feature-dialog-actions">
          <button class="daca-button is-secondary" type="button" (click)="closeFeatureList()">
            {{ locale() === 'de' ? 'Schliessen' : 'Close' }}
          </button>
        </div>
      </div>
    </dialog>

    <dialog
      #updateDialog
      id="daca-app-update-confirmation"
      class="daca-update-confirmation"
      data-testid="app-update-confirmation"
      aria-labelledby="daca-update-confirmation-title"
      aria-describedby="daca-update-confirmation-description"
      (cancel)="handleUpdateDialogCancel($event)"
      (click)="handleUpdateDialogClick($event)"
    >
      <div class="daca-update-confirmation-content">
        <p class="daca-feature-dialog-release">{{ locale() === 'de' ? 'Neue Version verfügbar' : 'New version available' }}</p>
        <h2 id="daca-update-confirmation-title">{{ locale() === 'de' ? 'DaCa jetzt neu laden?' : 'Reload DaCa now?' }}</h2>
        <p id="daca-update-confirmation-description">
          {{ locale() === 'de'
            ? 'Nicht gespeicherte Eingaben gehen beim Neuladen verloren. Die neue Version wird anschliessend vollständig geladen.'
            : 'Unsaved input will be lost when the page reloads. The new version will then be loaded in full.' }}
        </p>
        <p class="daca-update-confirmation-transition">{{ transitionLabel() }}</p>
        <div class="daca-feature-dialog-actions">
          <button #updateCancelButton class="daca-button is-secondary" type="button" (click)="closeUpdateConfirmation()">
            {{ locale() === 'de' ? 'Abbrechen' : 'Cancel' }}
          </button>
          <button #updateConfirmButton class="daca-button" type="button" (click)="confirmUpdate()">
            {{ locale() === 'de' ? 'Jetzt aktualisieren' : 'Update now' }}
          </button>
        </div>
      </div>
    </dialog>

    @if (updating()) {
      <dialog
        #updateScreen
        class="daca-app-update-screen"
        data-testid="app-update-overlay"
        aria-labelledby="daca-app-update-title"
        aria-describedby="daca-app-update-description"
        (cancel)="$event.preventDefault()"
      >
        <div class="daca-app-update-card" role="status" aria-live="assertive" aria-busy="true" tabindex="-1">
          <svg class="daca-app-update-spinner" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M26 10v7h-7" />
            <path d="M25.2 17A10 10 0 1 1 22 8.7" />
          </svg>
          <div>
            <h2 id="daca-app-update-title">Updating Version...</h2>
            <p class="daca-app-update-transition">{{ transitionLabel() }}</p>
            <p id="daca-app-update-description">
              {{ locale() === 'de'
                ? 'Die neue DaCa-Version wird geladen. Die Seite startet gleich neu.'
                : 'The new DaCa version is loading. The page will restart shortly.' }}
            </p>
            <p class="daca-app-update-wait">{{ locale() === 'de' ? 'Bitte warten' : 'Please wait' }}</p>
          </div>
        </div>
      </dialog>
    }
  `,
})
export class DacaVersionOverlayComponent {
  private readonly appUpdate = inject(DacaAppUpdateService, { optional: true });
  @ViewChild('featureDialog', { static: true }) private readonly featureDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('featureTrigger', { static: true }) private readonly featureTrigger!: ElementRef<HTMLButtonElement>;
  @ViewChild('featureCloseButton') private readonly featureCloseButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('updateDialog', { static: true }) private readonly updateDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('updateTrigger') private readonly updateTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('updateCancelButton') private readonly updateCancelButton?: ElementRef<HTMLButtonElement>;
  private updateFocusReturn: HTMLElement | null = null;
  @ViewChild('updateScreen')
  private set updateScreen(element: ElementRef<HTMLDialogElement> | undefined) {
    if (!element) {
      const focusReturn = this.updateFocusReturn;
      this.updateFocusReturn = null;
      if (focusReturn?.isConnected) {
        queueMicrotask(() => focusReturn.focus());
      }
      return;
    }
    const featureDialog = this.featureDialog?.nativeElement;
    const featureWasOpen = featureDialog?.hasAttribute('open') ?? false;
    const activeElement = element.nativeElement.ownerDocument.activeElement;
    this.updateFocusReturn = featureWasOpen
      ? this.featureTrigger?.nativeElement ?? null
      : activeElement && 'focus' in activeElement ? activeElement as HTMLElement : null;
    this.closeDialogWithoutFocus(this.featureDialog?.nativeElement);
    if (featureWasOpen) {
      this.featureListOpen.set(false);
    }
    this.closeDialogWithoutFocus(this.updateDialog?.nativeElement);
    const dialog = element.nativeElement;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    queueMicrotask(() => dialog.querySelector<HTMLElement>('[role="status"]')?.focus());
  }

  readonly productName = input('DaCa');
  readonly version = input(DACA_VERSION);
  readonly description = input('A PoC by BIT and ESTV');
  readonly ariaLabel = input('DaCa application version');
  readonly locale = input<DacaFeatureLocale>('en');
  readonly featureScope = input<DacaFeatureScope>('catalog');
  readonly featureListOpen = signal(false);
  readonly featureList = computed(() => dacaFeatureList(this.featureScope(), this.locale()));
  readonly updateReady = computed(() => this.appUpdate?.updateReady() ?? false);
  readonly updating = computed(() => this.appUpdate?.updating() ?? false);
  readonly updateButtonLabel = computed(() => {
    const target = this.appUpdate?.targetVersion();
    if (this.locale() === 'de') {
      return target ? `Neue DaCa-Version V${target} laden` : 'Neue DaCa-Version laden';
    }
    return target ? `Load new DaCa version V${target}` : 'Load new DaCa version';
  });
  readonly transitionLabel = computed(() => {
    const current = this.appUpdate?.currentVersion ?? this.version();
    const target = this.appUpdate?.targetVersion();
    if (!target) {
      return this.locale() === 'de'
        ? `${this.productName()} · V${current} → neue Version`
        : `${this.productName()} · V${current} → new version`;
    }
    if (target === current) {
      return this.locale() === 'de'
        ? `${this.productName()} · Build-Aktualisierung für V${current}`
        : `${this.productName()} · Build update for V${current}`;
    }
    return `${this.productName()} · V${current} → V${target}`;
  });

  openFeatureList(): void {
    const dialog = this.featureDialog.nativeElement;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    this.featureListOpen.set(true);
    queueMicrotask(() => this.featureCloseButton?.nativeElement.focus());
  }

  closeFeatureList(): void {
    const dialog = this.featureDialog.nativeElement;
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    this.featureListOpen.set(false);
    queueMicrotask(() => this.featureTrigger.nativeElement.focus());
  }

  handleDialogCancel(event: Event): void {
    event.preventDefault();
    this.closeFeatureList();
  }

  handleDialogClick(event: MouseEvent): void {
    if (event.target === this.featureDialog.nativeElement) {
      this.closeFeatureList();
    }
  }

  openUpdateConfirmation(): void {
    const dialog = this.updateDialog.nativeElement;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    queueMicrotask(() => this.updateCancelButton?.nativeElement.focus());
  }

  closeUpdateConfirmation(restoreFocus = true): void {
    const dialog = this.updateDialog.nativeElement;
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    if (restoreFocus) {
      queueMicrotask(() => this.updateTrigger?.nativeElement.focus());
    }
  }

  confirmUpdate(): void {
    this.closeUpdateConfirmation(false);
    this.appUpdate?.reloadToLatest();
  }

  handleUpdateDialogCancel(event: Event): void {
    event.preventDefault();
    this.closeUpdateConfirmation();
  }

  handleUpdateDialogClick(event: MouseEvent): void {
    if (event.target === this.updateDialog.nativeElement) {
      this.closeUpdateConfirmation();
    }
  }

  private closeDialogWithoutFocus(dialog: HTMLDialogElement | undefined): void {
    if (!dialog?.hasAttribute('open')) {
      return;
    }
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }
}
