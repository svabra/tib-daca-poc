import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { POC_GUIDE_STATUS_LABELS, pocJourneyById } from './poc-guide.data';
import { PocGuideAction, PocGuideScreenshot } from './poc-guide.models';
import { PocGuideConfigService } from './poc-guide-config.service';

@Component({
  selector: 'daca-poc-guide-detail',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (journey(); as current) {
      <nav class="poc-guide-breadcrumb" aria-label="Brotkrümelnavigation">
        <a routerLink="/poc-guide">PoC Leitfaden</a><span aria-hidden="true">›</span><span>{{ current.title }}</span>
      </nav>

      <section class="daca-page-heading poc-guide-detail-heading" data-poc-guide-detail>
        <div>
          <p class="daca-eyebrow">Customer Journey {{ current.number }} · {{ current.systems.join(' · ') }}</p>
          <h1>{{ current.title }}</h1>
          <p>{{ current.summary }}</p>
        </div>
        <dl class="poc-guide-meta">
          <div><dt>Dauer</dt><dd>{{ current.duration }}</dd></div>
          <div><dt>Stufe</dt><dd>{{ current.difficulty }}</dd></div>
        </dl>
      </section>

      @if (current.verification) {
        <p class="daca-alert is-success poc-guide-verification"><strong>✓ {{ current.verification.label }}:</strong> {{ current.verification.detail }}</p>
      }

      <div class="poc-guide-context-grid">
        <section class="daca-card poc-guide-roles" aria-labelledby="poc-guide-roles-title">
          <h2 id="poc-guide-roles-title">Beteiligte Rollen</h2>
          @for (role of current.roles; track role.name) {
            <article><span>{{ initials(role.name) }}</span><div><strong>{{ role.name }}</strong><small>{{ role.responsibility }}</small></div></article>
          }
        </section>
        <section class="daca-card poc-guide-prerequisites" aria-labelledby="poc-guide-prerequisites-title">
          <h2 id="poc-guide-prerequisites-title">Vor dem Start</h2>
          <ul>@for (item of current.prerequisites; track item) { <li>{{ item }}</li> }</ul>
        </section>
        <section class="daca-card poc-guide-outcome" aria-labelledby="poc-guide-outcome-title">
          <h2 id="poc-guide-outcome-title">Erwartetes Ergebnis</h2>
          <p>{{ current.outcome }}</p>
          <small><strong>Wiederholung:</strong> {{ current.repeatability }}</small>
        </section>
      </div>

      <section class="poc-guide-steps" aria-labelledby="poc-guide-steps-title">
        <div class="poc-guide-section-heading">
          <p class="daca-eyebrow">Anleitung</p>
          <h2 id="poc-guide-steps-title">Schritt für Schritt</h2>
        </div>

        <ol>
          @for (step of current.steps; track step.title; let index = $index) {
            <li class="daca-card poc-guide-step" [attr.data-poc-guide-step]="index + 1">
              <div class="poc-guide-step-number" aria-hidden="true">{{ index + 1 }}</div>
              <div class="poc-guide-step-content">
                <header>
                  <h3>{{ step.title }}</h3>
                  <span class="poc-guide-status" [class]="'is-' + step.status">{{ statusLabels[step.status] }}</span>
                </header>
                <p>{{ step.description }}</p>

                @if (step.checkpoint) {
                  <p class="poc-guide-note is-checkpoint"><strong>Checkpoint:</strong> {{ step.checkpoint }}</p>
                }
                @if (step.warning) {
                  <p class="poc-guide-note is-warning"><strong>Wichtig:</strong> {{ step.warning }}</p>
                }

                @if (step.actions?.length) {
                  <div class="poc-guide-actions">
                    @for (action of step.actions; track action.label) {
                      @if (action.target === 'internal') {
                        <a class="daca-button is-secondary" [routerLink]="action.path" [queryParams]="action.demoUserId ? { demoUser: action.demoUserId } : null">{{ action.label }}</a>
                      } @else if (externalHref(action); as href) {
                        <a class="daca-button is-secondary" [href]="href" target="_blank" rel="noopener noreferrer">{{ action.label }} <span aria-hidden="true">↗</span></a>
                      } @else {
                        <span class="poc-guide-external-unavailable" [attr.aria-busy]="guideConfig.loading()">
                          {{ guideConfig.loading() ? 'DAAIF-Link wird geladen…' : 'DAAIF-Link ist in dieser Umgebung nicht konfiguriert.' }}
                        </span>
                      }
                    }
                  </div>
                }

                @if (step.screenshots?.length) {
                  <div class="poc-guide-screenshot-list">
                    @for (screenshot of step.screenshots; track screenshot.src) {
                      <figure>
                        <button type="button" (click)="openScreenshot(screenshot, $event)" [attr.aria-label]="'Screenshot vergrössern: ' + screenshot.alt">
                          <img [src]="screenshot.src" [alt]="screenshot.alt" loading="lazy" decoding="async">
                          <span aria-hidden="true">Vergrössern</span>
                        </button>
                        <figcaption>{{ screenshot.caption }}</figcaption>
                      </figure>
                    }
                  </div>
                }
              </div>
            </li>
          }
        </ol>
      </section>

      <footer class="poc-guide-detail-footer">
        <a class="daca-button is-secondary" routerLink="/poc-guide">Alle Journeys</a>
        <a class="daca-button" routerLink="/poc-simulation">Simulationen und Grenzfälle</a>
      </footer>
    } @else {
      <section class="daca-card poc-guide-not-found" data-poc-guide-not-found>
        <p class="daca-eyebrow">PoC Leitfaden</p>
        <h1>Journey nicht gefunden</h1>
        <p>Die angeforderte Anleitung ist nicht Teil dieses DaCa-PoC.</p>
        <a class="daca-button" routerLink="/poc-guide">Zur Übersicht</a>
      </section>
    }

    <dialog #screenshotDialog class="poc-guide-image-dialog" (close)="screenshotClosed()" (click)="closeOnBackdrop($event)">
      @if (selectedScreenshot(); as screenshot) {
        <div>
          <header><strong>Illustration zur Journey</strong><button type="button" (click)="closeScreenshot()" aria-label="Screenshot schliessen">×</button></header>
          <img [src]="screenshot.src" [alt]="screenshot.alt">
          <p>{{ screenshot.caption }}</p>
        </div>
      }
    </dialog>
  `,
})
export class PocGuideDetailComponent {
  @ViewChild('screenshotDialog') private screenshotDialog?: ElementRef<HTMLDialogElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly routeParams = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private returnFocus: HTMLElement | null = null;
  readonly guideConfig = inject(PocGuideConfigService);
  readonly journey = computed(() => pocJourneyById(this.routeParams().get('journeyId')));
  readonly selectedScreenshot = signal<PocGuideScreenshot | null>(null);
  readonly statusLabels = POC_GUIDE_STATUS_LABELS;

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  externalHref(action: PocGuideAction): string | null {
    return this.guideConfig.externalHref(action.target);
  }

  openScreenshot(screenshot: PocGuideScreenshot, event: Event): void {
    this.returnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.selectedScreenshot.set(screenshot);
    queueMicrotask(() => {
      const dialog = this.screenshotDialog?.nativeElement;
      if (!dialog) return;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector<HTMLButtonElement>('button')?.focus();
    });
  }

  closeScreenshot(): void {
    const dialog = this.screenshotDialog?.nativeElement;
    if (dialog && typeof dialog.close === 'function') dialog.close();
    else {
      dialog?.removeAttribute('open');
      this.screenshotClosed();
    }
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.screenshotDialog?.nativeElement) this.closeScreenshot();
  }

  screenshotClosed(): void {
    this.selectedScreenshot.set(null);
    this.returnFocus?.focus();
    this.returnFocus = null;
  }
}
