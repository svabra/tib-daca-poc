import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface DidacaNavigationItem {
  label: string;
  path: string;
  exact?: boolean;
}

@Component({
  selector: 'didaca-federal-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="didaca-skip-link" href="#main-content">{{ locale() === 'de' ? 'Zum Inhalt springen' : 'Skip to content' }}</a>
    <header class="didaca-federal-header">
      <div class="didaca-authority-strip" [attr.aria-label]="locale() === 'de' ? 'Navigation der Bundesbehörden' : 'Federal authority navigation'">
        <div class="didaca-header-inner didaca-authority-inner" [class.has-user]="!!userName()">
          <a class="didaca-authority-link" href="https://www.admin.ch/" target="_blank" rel="noreferrer">
            <span>{{ locale() === 'de' ? 'Alle Schweizer Bundesbehörden' : 'All Swiss federal authorities' }}</span>
            <svg class="didaca-authority-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5.706 10.015 6.669 3.85 6.669-3.85.375.649-7.044 4.067-7.044-4.067z" />
            </svg>
          </a>
          @if (userName(); as name) {
            <span
              class="didaca-authority-user"
              [attr.aria-label]="locale() === 'de'
                ? 'Demo-Benutzerin ' + name + '. Anmeldung noch nicht verfügbar.'
                : 'Demo user ' + name + '. Sign-in is not yet available.'"
            >
              <span class="didaca-authority-user-role">{{ locale() === 'de' ? 'Demo-Benutzerin' : 'Demo user' }}</span>
              <strong>{{ name }}</strong>
            </span>
          }
          @if (notificationCount() > 0) {
            <a
              class="didaca-authority-notification"
              [href]="notificationHref()"
              [attr.aria-label]="locale() === 'de'
                ? notificationCount() + (notificationCount() === 1 ? ' offene Aufgabe anzeigen' : ' offene Aufgaben anzeigen')
                : 'Show ' + notificationCount() + (notificationCount() === 1 ? ' open task' : ' open tasks')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
              </svg>
              <span>{{ notificationCount() > 99 ? '99+' : notificationCount() }}</span>
            </a>
          }
          <nav
            class="didaca-language-nav"
            [attr.aria-label]="locale() === 'de' ? 'Sprachen · Wechsel im POC nicht verfügbar' : 'Languages · switching is unavailable in the POC'"
          >
            <span lang="de" [attr.aria-current]="locale() === 'de' ? 'true' : null" [attr.aria-disabled]="locale() === 'de' ? null : 'true'">
              DE
              <svg class="didaca-language-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5.706 10.015 6.669 3.85 6.669-3.85.375.649-7.044 4.067-7.044-4.067z" />
              </svg>
            </span>
            <span lang="fr" aria-disabled="true">FR</span>
            <span lang="it" aria-disabled="true">IT</span>
            <span lang="rm" aria-disabled="true">RM</span>
            <span lang="en" [attr.aria-current]="locale() === 'en' ? 'true' : null" [attr.aria-disabled]="locale() === 'en' ? null : 'true'">
              EN
              <svg class="didaca-language-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5.706 10.015 6.669 3.85 6.669-3.85.375.649-7.044 4.067-7.044-4.067z" />
              </svg>
            </span>
          </nav>
        </div>
      </div>

      <div class="didaca-brand-row">
        <div class="didaca-header-inner didaca-brand-inner">
          <a class="didaca-logo-link" routerLink="/" [attr.aria-label]="locale() === 'de' ? 'Zur Startseite von ' + appTitle() : 'Go to the ' + appTitle() + ' home page'">
            <img class="didaca-logo" src="/assets/swiss-confederation-logo.png" [alt]="locale() === 'de' ? 'Schweizerische Eidgenossenschaft' : 'Swiss Confederation'">
          </a>
          <div class="didaca-brand-copy" [class.has-subtitle-below]="subtitleBelow()">
            @if (subtitleBelow()) {
              <strong>{{ appTitle() }}</strong>
              <span>{{ appSubtitle() }}</span>
            } @else {
              <span>{{ appSubtitle() }}</span>
              <strong>{{ appTitle() }}</strong>
            }
          </div>
          <div class="didaca-environment">
            <span class="didaca-environment-label">{{ locale() === 'de' ? 'POC-Umgebung' : 'POC environment' }}</span>
            <span class="didaca-live-dot" aria-hidden="true"></span>
            <span>{{ locale() === 'de' ? 'Lokaler Katalog' : 'Local federation' }}</span>
          </div>
          <button
            class="didaca-menu-button"
            type="button"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="didaca-main-navigation"
            (click)="menuOpen.set(!menuOpen())"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            {{ locale() === 'de' ? 'Menü' : 'Menu' }}
          </button>
        </div>
      </div>

      <nav
        id="didaca-main-navigation"
        class="didaca-main-nav"
        [class.didaca-main-nav-open]="menuOpen()"
        [attr.aria-label]="locale() === 'de' ? 'Hauptnavigation' : 'Main navigation'"
      >
        <div class="didaca-header-inner didaca-main-nav-inner">
          @for (item of navigation(); track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              (click)="menuOpen.set(false)"
            >{{ item.label }}</a>
          }
        </div>
      </nav>
    </header>

    <main id="main-content" class="didaca-page" tabindex="-1">
      <ng-content />
    </main>

    <footer class="didaca-footer">
      <div class="didaca-header-inner didaca-footer-inner">
        @if (footerText(); as text) {
          <span>{{ text }}</span>
        } @else {
          <span>Bundesamt f&uuml;r Informatik und Telekommunikation BIT</span>
          <span>{{ footerProductName() ?? 'BIT DiDaCa' }} &middot; Distributed Data Catalog &middot; Proof of concept</span>
        }
      </div>
    </footer>
  `,
})
export class FederalShellComponent {
  readonly appTitle = input.required<string>();
  readonly appSubtitle = input('Bundesamt f\u00fcr Informatik und Telekommunikation BIT');
  readonly footerProductName = input<string | null>(null);
  readonly footerText = input<string | null>(null);
  readonly subtitleBelow = input(false);
  readonly locale = input<'de' | 'en'>('en');
  readonly userName = input<string | null>(null);
  readonly notificationCount = input(0);
  readonly notificationHref = input('/#main-content');
  readonly navigation = input.required<readonly DidacaNavigationItem[]>();
  readonly menuOpen = signal(false);
}
