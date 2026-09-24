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
    <a class="daca-skip-link" href="#main-content">{{ shellLabel('skip') }}</a>
    <header class="daca-federal-header">
      <div class="daca-authority-strip" [attr.aria-label]="shellLabel('federalNavigation')">
        <div class="daca-header-inner daca-authority-inner" [class.has-user]="!!userName()">
          <a class="daca-authority-link" href="https://www.admin.ch/" target="_blank" rel="noreferrer">
            <span>{{ shellLabel('federalAuthorities') }}</span>
            <svg class="daca-authority-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5.706 10.015 6.669 3.85 6.669-3.85.375.649-7.044 4.067-7.044-4.067z" />
            </svg>
          </a>
          @if (userName(); as name) {
            @if (userProfileHref()) {
            <a class="daca-authority-user" [routerLink]="userProfileHref() || null" [attr.aria-label]="shellLabel('profile') + ': ' + name">
              @if (userAvatarUrl()) { <img class="daca-profile-avatar" [src]="userAvatarUrl()!" alt=""> } @else { <span class="daca-user-avatar-fallback" aria-hidden="true">{{ name.slice(0, 1) }}</span> }
              <strong>{{ name }}</strong>
            </a>
            } @else {
              <span class="daca-authority-user" [attr.aria-label]="name">
                @if (userAvatarUrl()) { <img class="daca-profile-avatar" [src]="userAvatarUrl()!" alt=""> } @else { <span class="daca-user-avatar-fallback" aria-hidden="true">{{ name.slice(0, 1) }}</span> }
                <strong>{{ name }}</strong>
              </span>
            }
            @if (showHeaderLogout()) { <button class="daca-header-action" type="button" (click)="logout.emit()">{{ shellLabel('logout') }}</button> }
          }
          @if (notificationCount() > 0) {
            <a
              class="daca-authority-notification"
              [href]="notificationHref()"
              [attr.aria-label]="notificationCount() + ' ' + shellLabel(notificationCount() === 1 ? 'notificationSingular' : 'notificationPlural')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
              </svg>
              <span>{{ notificationCount() > 99 ? '99+' : notificationCount() }}</span>
            </a>
          }
          <label class="daca-header-language"><span class="daca-sr-only">{{ shellLabel('language') }}</span><select [value]="locale()" (change)="languageChange.emit($any($event.target).value)"><option value="de">DE</option><option value="fr">FR</option><option value="it">IT</option><option value="en">EN</option></select></label>
          <button class="daca-header-theme" type="button" (click)="themeToggle.emit()" [attr.aria-label]="shellLabel(theme() === 'dark' ? 'lightMode' : 'darkMode')">{{ theme() === 'dark' ? '☀' : '◐' }}<span class="daca-header-icon-tooltip" aria-hidden="true">{{ shellLabel(theme() === 'dark' ? 'lightMode' : 'darkMode') }}</span></button>
          @if (documentationHref()) {
            <a class="daca-header-documentation" [routerLink]="documentationHref()" [attr.aria-label]="shellLabel('documentation')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.3"/><path d="M12 10.5v6M12 7.2h.01"/></svg>
              <span class="daca-header-icon-tooltip" aria-hidden="true">{{ shellLabel('documentation') }}</span>
            </a>
          }
          <a class="daca-header-settings" routerLink="/settings" [attr.aria-label]="shellLabel('settings')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4l.6 2.3 2 .9 2.1-1.2 2.8 2.8-1.2 2.1.9 2L23 11v4l-2.3.6-.9 2 1.2 2.1-2.8 2.8-2.1-1.2-2 .9L14 24h-4l-.6-2.3-2-.9-2.1 1.2-2.8-2.8 1.2-2.1-.9-2L0 15v-4l2.3-.6.9-2L2 6.3l2.8-2.8 2.1 1.2 2-.9L10 2Z" transform="translate(1 -1) scale(.92)"/><circle cx="12" cy="12" r="3" /></svg>
            <span class="daca-header-icon-tooltip" aria-hidden="true">{{ shellLabel('settings') }}</span>
          </a>
        </div>
      </div>

      <div class="daca-brand-row">
        <div class="daca-header-inner daca-brand-inner">
          <a class="daca-logo-link" routerLink="/" [attr.aria-label]="shellLabel('homePrefix') + appTitle() + shellLabel('homeSuffix')">
            <img class="daca-logo" src="/assets/swiss-confederation-logo.png" [alt]="shellLabel('confederation')">
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
            <span class="daca-environment-label">{{ shellLabel('environment') }}</span>
            <span class="daca-live-dot" aria-hidden="true"></span>
            <span>{{ shellLabel('localCatalog') }}</span>
          </div>
          <button
            class="daca-menu-button"
            type="button"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="daca-main-navigation"
            (click)="menuOpen.set(!menuOpen())"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            {{ shellLabel('menu') }}
          </button>
        </div>
      </div>

      <nav
        id="daca-main-navigation"
        class="daca-main-nav"
        [class.daca-main-nav-open]="menuOpen()"
        [attr.aria-label]="shellLabel('mainNavigation')"
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
                    [attr.aria-label]="shellLabel('submenu') + ' ' + item.label + ' ' + shellLabel(openNavigationPath() === item.path ? 'close' : 'open')"
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
          <span>{{ footerProductName() ?? 'BIT DaCa' }} &middot; Central Data Catalog &middot; Proof of concept</span>
        }
      </div>
    </footer>

    <daca-version-overlay
      [productName]="versionProductName()"
      [description]="versionDescription()"
      [locale]="locale() === 'de' ? 'de' : 'en'"
      [featureScope]="versionFeatureScope()"
      [ariaLabel]="locale() === 'de' ? 'DaCa-Anwendungsversion' : 'DaCa application version'"
    />
  `,
})
export class FederalShellComponent {
  shellLabel(key: string): string {
    if (key === 'profile') return ({ de: 'Profil', fr: 'Profil', it: 'Profilo', en: 'Profile' })[this.locale()];
    const labels: Record<string, readonly [string, string, string, string]> = {
      skip: ['Zum Inhalt springen', 'Aller au contenu', 'Vai al contenuto', 'Skip to content'],
      federalNavigation: ['Navigation der Bundesbehörden', 'Navigation des autorités fédérales', 'Navigazione delle autorità federali', 'Federal authority navigation'],
      federalAuthorities: ['Alle Schweizer Bundesbehörden', 'Toutes les autorités fédérales suisses', 'Tutte le autorità federali svizzere', 'All Swiss federal authorities'],
      logout: ['Abmelden', 'Déconnexion', 'Disconnetti', 'Sign out'],
      language: ['Sprache wählen', 'Choisir la langue', 'Scegli la lingua', 'Choose language'],
      lightMode: ['Hellen Modus einschalten', 'Activer le mode clair', 'Attiva modalità chiara', 'Enable light mode'],
      darkMode: ['Dunklen Modus einschalten', 'Activer le mode sombre', 'Attiva modalità scura', 'Enable dark mode'],
      settings: ['Einstellungen öffnen', 'Ouvrir les paramètres', 'Apri impostazioni', 'Open settings'],
      documentation: ['Dokumentation Datenkatalog', 'Documentation du catalogue de données', 'Documentazione del catalogo dati', 'Data catalog documentation'],
      environment: ['POC-Umgebung', 'Environnement POC', 'Ambiente POC', 'POC environment'],
      localCatalog: ['Lokaler Katalog', 'Catalogue local', 'Catalogo locale', 'Local catalog'],
      menu: ['Menü', 'Menu', 'Menu', 'Menu'],
      mainNavigation: ['Hauptnavigation', 'Navigation principale', 'Navigazione principale', 'Main navigation'],
      homePrefix: ['Zur Startseite von ', 'Aller à la page d’accueil de ', 'Vai alla pagina iniziale di ', 'Go to the '],
      homeSuffix: ['', '', '', ' home page'],
      confederation: ['Schweizerische Eidgenossenschaft', 'Confédération suisse', 'Confederazione Svizzera', 'Swiss Confederation'],
      notificationSingular: ['offene Aufgabe anzeigen', 'tâche ouverte à afficher', 'attività aperta da visualizzare', 'open task to view'],
      notificationPlural: ['offene Aufgaben anzeigen', 'tâches ouvertes à afficher', 'attività aperte da visualizzare', 'open tasks to view'],
      submenu: ['Untermenü', 'Sous-menu', 'Sottomenu', 'Submenu'],
      close: ['schliessen', 'fermer', 'chiudi', 'close'],
      open: ['öffnen', 'ouvrir', 'apri', 'open'],
    };
    return labels[key]?.[({ de: 0, fr: 1, it: 2, en: 3 })[this.locale()]] ?? key;
  }
  readonly appTitle = input.required<string>();
  readonly appSubtitle = input('Bundesamt f\u00fcr Informatik und Telekommunikation BIT');
  readonly footerProductName = input<string | null>(null);
  readonly footerText = input<string | null>(null);
  readonly versionProductName = input('DaCa');
  readonly versionDescription = input('A PoC by BIT and ESTV');
  readonly versionFeatureScope = input<DacaFeatureScope>('catalog');
  readonly subtitleBelow = input(false);
  readonly locale = input<'de' | 'fr' | 'it' | 'en'>('en');
  readonly theme = input<'light' | 'dark'>('light');
  readonly userName = input<string | null>(null);
  readonly userId = input<string | null>(null);
  readonly userAvatarUrl = input<string | null>(null);
  readonly userProfileHref = input<string | null>(null);
  readonly documentationHref = input<string | null>(null);
  readonly showHeaderLogout = input(true);
  readonly users = input<readonly DacaUserOption[]>([]);
  readonly userChange = output<string>();
  readonly logout = output<void>();
  readonly languageChange = output<string>();
  readonly themeToggle = output<void>();
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
