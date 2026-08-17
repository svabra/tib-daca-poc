import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, input, signal } from '@angular/core';
import { DacaFeatureLocale, DacaFeatureScope, dacaFeatureList } from './feature-list';
import { DACA_VERSION } from './version';

@Component({
  selector: 'daca-version-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="daca-version-overlay" [attr.aria-label]="ariaLabel()">
      <div class="daca-version-overlay-row">
        <span class="daca-version-overlay-label">{{ productName() }}</span>
        <span class="daca-version-overlay-value">V{{ version() }}</span>
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
  `,
})
export class DacaVersionOverlayComponent {
  @ViewChild('featureDialog', { static: true }) private readonly featureDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('featureTrigger', { static: true }) private readonly featureTrigger!: ElementRef<HTMLButtonElement>;
  @ViewChild('featureCloseButton') private readonly featureCloseButton?: ElementRef<HTMLButtonElement>;

  readonly productName = input('DaCa');
  readonly version = input(DACA_VERSION);
  readonly description = input('A PoC by BIT and ESTV');
  readonly ariaLabel = input('DaCa application version');
  readonly locale = input<DacaFeatureLocale>('en');
  readonly featureScope = input<DacaFeatureScope>('catalog');
  readonly featureListOpen = signal(false);
  readonly featureList = computed(() => dacaFeatureList(this.featureScope(), this.locale()));

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
}
