import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DacaFeatureLocale, DacaFeatureScope } from './feature-list';
import { dacaReleaseHistory } from './release-history';
import { DacaAppUpdateService } from './app-update.service';
import { DACA_VERSION } from './version';

@Component({
  selector: 'daca-version-overlay',
  standalone: true,
  imports: [RouterLink],
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
      <p class="daca-version-overlay-credit">Co-Designed by V, armasuisse, ESTV und BIT</p>
      <p class="daca-version-overlay-status">{{ updateReady() ? (locale() === 'de' ? 'Neue Version ist bereit' : 'New version is ready') : (locale() === 'de' ? 'Version ist aktuell' : 'Version is current') }}</p>
      <button
        #featureTrigger
        class="daca-version-feature-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-controls="daca-feature-list-dialog"
        [attr.aria-expanded]="featureListOpen()"
        (click)="openFeatureList()"
      >{{ locale() === 'de' ? 'Neu in dieser Version' : 'New in this version' }}</button>
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
            <p class="daca-feature-dialog-release">V{{ latestRelease().version }}</p>
            <h2 id="daca-feature-list-title">{{ locale() === 'de' ? 'Neu in dieser Version' : 'New in this version' }}</h2>
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
        <p id="daca-feature-list-introduction" class="daca-feature-dialog-introduction">{{ locale() === 'de' ? 'Diese Verbesserungen unterstützen Ihre Arbeit mit DaCa.' : 'These improvements help you work with DaCa.' }}</p>
        <ul class="daca-feature-list">
          @for (feature of latestRelease().features; track feature.title) {
            <li>
              <div>
                <h3>{{ feature.title }}</h3>
                <p>{{ feature.description }}</p>
                <div class="daca-release-tags">@for (tag of feature.tags; track tag) { <span>{{ tag }}</span> }</div>
              </div>
            </li>
          }
        </ul>
        <div class="daca-feature-dialog-actions">
          <a class="daca-button" routerLink="/settings/features" (click)="closeFeatureList()">{{ locale() === 'de' ? 'Alle Versionen und Features ansehen' : 'View all versions and features' }}</a>
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
        <h2 id="daca-update-confirmation-title">{{ locale() === 'de' ? 'DaCa-Update verfügbar' : 'DaCa update available' }}</h2>
        <p id="daca-update-confirmation-description">
          {{ locale() === 'de'
            ? 'Ungespeicherte Seiteninhalte gehen beim Update verloren. Die neue Version wird anschliessend vollständig geladen.'
            : 'Unsaved page content will be lost during the update. The new version will then be loaded in full.' }}
        </p>
        <p class="daca-update-confirmation-transition">{{ transitionLabel() }}</p>
        @if (targetRelease(); as release) {
          <button class="daca-update-notes-toggle" type="button" data-testid="app-update-notes-toggle" [attr.aria-expanded]="showReleaseNotes()" (click)="showReleaseNotes.set(!showReleaseNotes())">
            {{ locale() === 'de' ? (showReleaseNotes() ? 'Neuerungen ausblenden' : 'Neuerungen in V' + release.version + ' anzeigen') : (showReleaseNotes() ? 'Hide changes' : 'Show changes in V' + release.version) }}
          </button>
          @if (showReleaseNotes()) {
            <ul class="daca-update-release-notes" aria-label="Release notes">
              @for (feature of release.features; track feature.title) {
                <li><h3>{{ feature.title }}</h3><p>{{ feature.description }}</p></li>
              }
            </ul>
          }
        }
        <a class="daca-update-feature-link" routerLink="/settings/features" (click)="closeUpdateConfirmation(false)">{{ locale() === 'de' ? 'Alle Versionen und Features ansehen' : 'View all versions and features' }}</a>
        <div class="daca-feature-dialog-actions">
          <button #updateCancelButton class="daca-button is-secondary" type="button" autofocus (click)="closeUpdateConfirmation()">
            {{ locale() === 'de' ? 'Update später durchführen' : 'Update later' }}
          </button>
          <button #updateConfirmButton class="daca-button" type="button" (click)="confirmUpdate()">
            {{ locale() === 'de' ? 'Update durchführen' : 'Apply update' }}
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
  private readonly dialogReady = signal(false);
  private readonly shownUpdateHashes = new Set<string>();
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
  readonly showReleaseNotes = signal(false);
  readonly latestRelease = computed(() => dacaReleaseHistory(this.featureScope(), this.locale())[0]);
  readonly targetRelease = computed(() => dacaReleaseHistory(this.featureScope(), this.locale()).find((release) => release.version === this.appUpdate?.targetVersion()) ?? null);
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
        ? `${this.productName()} · V${current} → V${target} · neuer Build`
        : `${this.productName()} · V${current} → V${target} · new build`;
    }
    return `${this.productName()} · V${current} → V${target}`;
  });

  constructor() {
    effect(() => {
      const ready = this.updateReady();
      const hash = this.appUpdate?.state?.().latestHash ?? this.appUpdate?.targetVersion() ?? 'ready';
      if (!this.dialogReady() || !ready || this.shownUpdateHashes.has(hash)) return;
      this.shownUpdateHashes.add(hash);
      queueMicrotask(() => {
        if (this.updateReady()) this.openUpdateConfirmation();
      });
    });
  }

  ngAfterViewInit(): void {
    this.dialogReady.set(true);
  }

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
    this.showReleaseNotes.set(false);
    const dialog = this.updateDialog.nativeElement;
    if (dialog.hasAttribute('open')) return;
    this.closeDialogWithoutFocus(this.featureDialog.nativeElement);
    this.featureListOpen.set(false);
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
