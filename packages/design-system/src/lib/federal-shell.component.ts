import { ChangeDetectionStrategy, Component, HostListener, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DacaGlossaryTermComponent } from './glossary-term.component';
import { DacaVersionOverlayComponent } from './version-overlay.component';
import { DacaFeatureScope } from './feature-list';

export interface DacaNavigationItem {
  label: string;
  path: string;
  exact?: boolean;
  description?: string;
  children?: readonly DacaNavigationItem[];
}

export interface DacaUserOption {
  id: string;
  displayName: string;
  organization: string;
  avatarUrl?: string | null;
}

@Component({
  selector: 'daca-federal-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, DacaGlossaryTermComponent, DacaVersionOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="daca-skip-link" href="#main-content">{{ locale() === 'de' ? 'Zum Inhalt springen' : 'Skip to content' }}</a>
    <header class="daca-federal-header">
      <div class="daca-authority-strip" [attr.aria-label]="locale() === 'de' ? 'Navigation der Bundesbehörden' : 'Federal authority navigation'">
        <div class="daca-header-inner daca-authority-inner" [class.has-user]="!!userName()">
          <a class="daca-authority-link" href="https://www.admin.ch/" target="_blank" rel="noreferrer">
            <span>{{ locale() === 'de' ? 'Alle Schweizer Bundesbehörden' : 'All Swiss federal authorities' }}</span>
            <svg class="daca-authority-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5.706 10.015 6.669 3.85 6.669-3.85.375.649-7.044 4.067-7.044-4.067z" />
            </svg>
          </a>
          @if (userName(); as name) {
            @if (users().length > 1) {
              <label class="daca-authority-user daca-user-switcher">
                @if (userAvatarUrl()) { <img [src]="userAvatarUrl()!" alt=""> }
                <span class="daca-authority-user-role">{{ locale() === 'de' ? 'Demo-Benutzerin' : 'Demo user' }}</span>
                <select [value]="userId()" (change)="userChange.emit($any($event.target).value)" aria-label="Demo-Benutzer wechseln">
                  @for (user of users(); track user.id) { <option [value]="user.id" [selected]="user.id === userId()">{{ user.displayName }} · {{ user.organization }}</option> }
                </select>
              </label>
            } @else {
            <span
              class="daca-authority-user"
              [attr.aria-label]="locale() === 'de'
                ? 'Demo-Benutzerin ' + name + '. Anmeldung noch nicht verfügbar.'
                : 'Demo user ' + name + '. Sign-in is not yet available.'"
            >
              <span class="daca-authority-user-role">{{ locale() === 'de' ? 'Demo-Benutzerin' : 'Demo user' }}</span>
              <strong>{{ name }}</strong>
            </span>
            }
          }
          @if (notificationCount() > 0) {
            <a
              class="daca-authority-notification"
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
            class="daca-language-nav"
            [attr.aria-label]="locale() === 'de' ? 'Sprachen · Wechsel im POC nicht verfügbar' : 'Languages · switching is unavailable in the POC'"
          >
            <span lang="de" [attr.aria-current]="locale() === 'de' ? 'true' : null" [attr.aria-disabled]="locale() === 'de' ? null : 'true'">
              DE
              <svg class="daca-language-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5.706 10.015 6.669 3.85 6.669-3.85.375.649-7.044 4.067-7.044-4.067z" />
              </svg>
            </span>
            <span lang="fr" aria-disabled="true">FR</span>
            <span lang="it" aria-disabled="true">IT</span>
            <span lang="rm" aria-disabled="true">RM</span>
            <span lang="en" [attr.aria-current]="locale() === 'en' ? 'true' : null" [attr.aria-disabled]="locale() === 'en' ? null : 'true'">
              EN
              <svg class="daca-language-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5.706 10.015 6.669 3.85 6.669-3.85.375.649-7.044 4.067-7.044-4.067z" />
              </svg>
            </span>
          </nav>
        </div>
      </div>

      <div class="daca-brand-row">
        <div class="daca-header-inner daca-brand-inner">
          <a class="daca-logo-link" routerLink="/" [attr.aria-label]="locale() === 'de' ? 'Zur Startseite von ' + appTitle() : 'Go to the ' + appTitle() + ' home page'">
            <img class="daca-logo" src="/assets/swiss-confederation-logo.png" [alt]="locale() === 'de' ? 'Schweizerische Eidgenossenschaft' : 'Swiss Confederation'">
          </a>
          <div class="daca-brand-copy" [class.has-subtitle-below]="subtitleBelow()">
            @if (subtitleBelow()) {
              <strong>{{ appTitle() }}</strong>
              <span>{{ appSubtitle() }}</span>
            } @else {
              <span>{{ appSubtitle() }}</span>
              <strong>{{ appTitle() }}</strong>
            }
          </div>
          <div class="daca-environment">
            <span class="daca-environment-label">{{ locale() === 'de' ? 'POC-Umgebung' : 'POC environment' }}</span>
            <span class="daca-live-dot" aria-hidden="true"></span>
            <span>{{ locale() === 'de' ? 'Lokaler Katalog' : 'Local federation' }}</span>
          </div>
          <button
            class="daca-menu-button"
            type="button"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="daca-main-navigation"
            (click)="menuOpen.set(!menuOpen())"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            {{ locale() === 'de' ? 'Menü' : 'Menu' }}
          </button>
        </div>
      </div>

      <nav
        id="daca-main-navigation"
        class="daca-main-nav"
        [class.daca-main-nav-open]="menuOpen()"
        [attr.aria-label]="locale() === 'de' ? 'Hauptnavigation' : 'Main navigation'"
      >
        <div class="daca-header-inner daca-main-nav-inner">
          @for (item of navigation(); track item.path) {
            @if (item.children?.length) {
              <div class="daca-nav-group">
                <a
                  [routerLink]="item.path"
                  routerLinkActive="is-active"
                  [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                  (click)="closeNavigation()"
                >{{ item.label }}</a>
                <span class="daca-nav-tools">
                  @if (item.description) {
                    <daca-glossary-term
                      [term]="item.label"
                      [explanation]="item.description"
                      [iconOnly]="true"
                    />
                  }
                  <button
                    class="daca-nav-toggle"
                    type="button"
                    [attr.aria-expanded]="openNavigationPath() === item.path"
                    [attr.aria-controls]="navigationId(item.path)"
                    [attr.aria-label]="'Untermenü ' + item.label + (openNavigationPath() === item.path ? ' schliessen' : ' öffnen')"
                    (click)="toggleNavigation(item.path, $event)"
                  ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.7 9.5 6.3 6 6.3-6 1.4 1.5-7.7 7.3L4.3 11z" /></svg></button>
                </span>
                @if (openNavigationPath() === item.path) {
                  <div class="daca-nav-dropdown" [id]="navigationId(item.path)">
                    @for (child of item.children; track child.path) {
                      <a [routerLink]="child.path" routerLinkActive="is-active" (click)="closeNavigation()">{{ child.label }}</a>
                    }
                  </div>
                }
              </div>
            } @else {
              <a
                [routerLink]="item.path"
                routerLinkActive="is-active"
                [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                (click)="closeNavigation()"
              >{{ item.label }}</a>
            }
          }
        </div>
      </nav>
    </header>

    <main id="main-content" class="daca-page" tabindex="-1">
      <ng-content />
    </main>

    <footer class="daca-footer">
      <div class="daca-header-inner daca-footer-inner">
        @if (footerText(); as text) {
          <span>{{ text }}</span>
        } @else {
          <span>Bundesamt f&uuml;r Informatik und Telekommunikation BIT</span>
          <span>{{ footerProductName() ?? 'BIT DaCa' }} &middot; Distributed Data Catalog &middot; Proof of concept</span>
        }
      </div>
    </footer>

    <daca-version-overlay
      [productName]="versionProductName()"
      [description]="versionDescription()"
      [locale]="locale()"
      [featureScope]="versionFeatureScope()"
      [ariaLabel]="locale() === 'de' ? 'DaCa-Anwendungsversion' : 'DaCa application version'"
    />
  `,
})
export class FederalShellComponent {
  readonly appTitle = input.required<string>();
  readonly appSubtitle = input('Bundesamt f\u00fcr Informatik und Telekommunikation BIT');
  readonly footerProductName = input<string | null>(null);
  readonly footerText = input<string | null>(null);
  readonly versionProductName = input('DaCa');
  readonly versionDescription = input('A PoC by BIT and ESTV');
  readonly versionFeatureScope = input<DacaFeatureScope>('catalog');
  readonly subtitleBelow = input(false);
  readonly locale = input<'de' | 'en'>('en');
  readonly userName = input<string | null>(null);
  readonly userId = input<string | null>(null);
  readonly userAvatarUrl = input<string | null>(null);
  readonly users = input<readonly DacaUserOption[]>([]);
  readonly userChange = output<string>();
  readonly notificationCount = input(0);
  readonly notificationHref = input('/#main-content');
  readonly navigation = input.required<readonly DacaNavigationItem[]>();
  readonly menuOpen = signal(false);
  readonly openNavigationPath = signal<string | null>(null);

  toggleNavigation(path: string, event: Event): void {
    event.stopPropagation();
    this.openNavigationPath.update((open) => open === path ? null : path);
  }

  closeNavigation(): void {
    this.menuOpen.set(false);
    this.openNavigationPath.set(null);
  }

  navigationId(path: string): string {
    return `daca-subnav-${path.replace(/[^a-z0-9]+/gi, '-')}`;
  }

  @HostListener('document:keydown.escape')
  closeSubnavigation(): void {
    this.openNavigationPath.set(null);
  }

  @HostListener('document:click')
  closeSubnavigationOutside(): void {
    this.openNavigationPath.set(null);
  }
}
