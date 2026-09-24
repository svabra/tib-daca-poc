import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { DacaNavigationItem, FederalShellComponent } from '@bit-daca/design-system';
import { CatalogApiService } from './core/catalog-api.service';
import { DemoIdentityService } from './core/demo-identity.service';
import { UserPreferencesService } from './core/user-preferences.service';
import { DemoSessionService } from './core/demo-session.service';

@Component({
  selector: 'daca-root',
  standalone: true,
  imports: [FederalShellComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!session.ready()) {
      <main class="daca-login" aria-live="polite">{{ ui('loadingSession') }}</main>
    } @else if (!session.activeUserId()) {
      <main class="daca-login" aria-labelledby="daca-login-title"><section class="daca-login-card">
        <p class="daca-eyebrow">DaCa · {{ ui('localEnvironment') }}</p><h1 id="daca-login-title">{{ ui('signIn') }}</h1>
        <p>{{ ui('chooseProfile') }}</p>
        @if (session.error()) { <p class="daca-alert is-error" role="alert">{{ session.error() }}</p> }
        <div class="daca-login-options">@for (user of identity.users(); track user.id) {
          <article><span>@if (user.avatarUrl) { <img [src]="user.avatarUrl" alt=""> } @else { <b class="daca-user-avatar-fallback">{{ user.displayName.slice(0, 1) }}</b> }<strong>{{ user.displayName }}</strong><small>{{ user.organization }}</small></span><button class="daca-button" type="button" [disabled]="session.busy()" (click)="login(user.id)">{{ ui('signIn') }} →</button></article>
        }</div>
      </section></main>
    } @else {
    <daca-federal-shell
      appTitle="Data Catalog"
      appSubtitle="Data Platform BIT"
      [footerText]="ui('footerText')"
      versionProductName="DaCa Catalog"
      versionFeatureScope="catalog"
      [locale]="preferences.language()"
      [theme]="preferences.theme()"
      [userName]="identity.user().displayName"
      [userId]="identity.userId()"
      [userAvatarUrl]="identity.user().avatarUrl"
      userProfileHref="/profile"
      documentationHref="/documentation"
      [showHeaderLogout]="false"
      (languageChange)="preferences.requestLanguage($event)"
      (themeToggle)="preferences.toggleTheme()"
      notificationHref="/tasks"
      [notificationCount]="notificationCount()"
      [subtitleBelow]="true"
      [navigation]="navigation()"
    >
      <router-outlet />
    </daca-federal-shell>
    }
    @if (preferences.pending(); as choice) {
      <div class="daca-preference-backdrop"><section class="daca-preference-dialog" role="dialog" aria-modal="true" aria-labelledby="daca-preference-title" aria-describedby="daca-preference-description">
        <p class="daca-eyebrow">{{ ui('personalSetting') }}</p>
        <h2 id="daca-preference-title">{{ preferenceTitle(choice.name) }}</h2>
        <p id="daca-preference-description">«{{ preferenceValue(choice.name, choice.value) }}»: {{ ui('preferenceScope') }}</p>
        @if (preferences.error()) { <p class="daca-alert is-error" role="alert">{{ preferences.error() }}</p> }
        <footer><button class="daca-button is-secondary" type="button" (click)="preferences.cancel()">{{ ui('cancel') }}</button><button class="daca-button is-secondary" type="button" (click)="preferences.savePending('device')">{{ ui('browserOnly') }}</button><button class="daca-button" type="button" (click)="preferences.savePending('profile')">{{ ui('allDevices') }}</button></footer>
      </section></div>
    }
  `,
})
export class App {
  private readonly api = inject(CatalogApiService);
  private readonly router = inject(Router);
  private readonly routeUrl = toSignal(this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map((event) => event.urlAfterRedirects)), { initialValue: this.router.url });
  readonly identity = inject(DemoIdentityService);
  readonly session = inject(DemoSessionService);
  readonly preferences = inject(UserPreferencesService);
  readonly notificationCount = computed(() => this.api.workflowTasks().length + this.api.ownerAccessRequests().length);
  private readonly navigationDefinition: readonly DacaNavigationItem[] = [
    { label: 'Startseite', path: '/', exact: true },
    { label: 'Meine Datenprodukte', path: '/products' },
    { label: 'Datenquellen', path: '/physical-models' },
    { label: 'Datenmodelle', path: '/models' },
    { label: 'Domäne und Terminology', path: '/domains' },
    { label: 'Aufgaben', path: '/tasks' },
  ];
  readonly navigation = computed<readonly DacaNavigationItem[]>(() => this.navigationDefinition.map((item) => ({
    ...item,
    label: this.navigationLabel(item.label),
    children: item.children?.map((child) => ({ ...child, label: this.navigationLabel(child.label) })),
  })));

  constructor() {
    this.session.restore();
    effect(() => {
      const route = this.routeUrl().split('?')[0];
      const language = this.preferences.language();
      const titles: Record<string, readonly [string, string, string, string]> = {
        '/': ['Willkommen', 'Bienvenue', 'Benvenuti', 'Welcome'],
        '/products': ['Meine Datenprodukte', 'Mes produits de données', 'I miei prodotti di dati', 'My data products'],
        '/search': ['Expertensuche', 'Recherche avancée', 'Ricerca avanzata', 'Expert search'],
        '/physical-models': ['Sichtbare Datenquellen', 'Sources de données visibles', 'Fonti dati visibili', 'Visible data sources'],
        '/models': ['Datenmodelle', 'Modèles de données', 'Modelli di dati', 'Data models'],
        '/domains': ['Domäne und Terminology', 'Domaine et terminologie', 'Dominio e terminologia', 'Domain and terminology'],
        '/tasks': ['Aufgaben', 'Tâches', 'Attività', 'Tasks'],
        '/profile': ['Mein Profil', 'Mon profil', 'Il mio profilo', 'My profile'],
        '/settings/language-personal': ['Spracheinstellungen', 'Paramètres linguistiques', 'Impostazioni lingua', 'Language settings'],
        '/settings/appearance': ['Erscheinungsbild', 'Apparence', 'Aspetto', 'Appearance'],
        '/settings/features': ['Featureliste', 'Liste des fonctionnalités', 'Elenco delle funzionalità', 'Feature list'],
        '/settings/responsibilities': ['Rollen und Zuständigkeiten', 'Rôles et responsabilités', 'Ruoli e responsabilità', 'Roles and responsibilities'],
        '/documentation': ['Dokumentation Datenkatalog', 'Documentation du catalogue', 'Documentazione del catalogo', 'Data catalog documentation'],
        '/documentation/journeys': ['User Journeys', 'Parcours utilisateur', 'Percorsi utente', 'User journeys'],
        '/documentation/static': ['Statische Dokumentation', 'Documentation statique', 'Documentazione statica', 'Static documentation'],
        '/documentation/glossary': ['DaCa Glossar', 'Glossaire DaCa', 'Glossario DaCa', 'DaCa glossary'],
      };
      const title = titles[route]?.[({ de: 0, fr: 1, it: 2, en: 3 })[language]];
      if (title) setTimeout(() => { document.title = `${title} | DaCa`; }, 0);
    });
  }

  private navigationLabel(label: string): string {
    const translated: Record<string, readonly [string, string, string]> = {
      'Startseite': ['Accueil', 'Pagina iniziale', 'Home'],
      'Meine Datenprodukte': ['Mes produits de données', 'I miei prodotti di dati', 'My data products'],
      'Datenquellen': ['Sources de données', 'Fonti dati', 'Data sources'],
      'Datenmodelle': ['Modèles de données', 'Modelli di dati', 'Data models'],
      'Domäne und Terminology': ['Domaine et terminologie', 'Dominio e terminologia', 'Domain and terminology'],
      'Aufgaben': ['Tâches', 'Attività', 'Tasks'],
    };
    const index = ({ de: -1, fr: 0, it: 1, en: 2 })[this.preferences.language()];
    return index < 0 ? label : translated[label]?.[index] ?? label;
  }

  login(userId: string): void { this.session.login(userId); }
  preferenceValue(name: string, value: string): string {
    if (name === 'theme') return value === 'dark' ? this.ui('dark') : this.ui('light');
    return ({ de: 'Deutsch', fr: 'Français', it: 'Italiano', en: 'English' } as Record<string, string>)[value] ?? value;
  }
  preferenceTitle(name: string): string {
    const labels: Record<string, readonly [string, string, string, string]> = {
      language: ['Sprache speichern', 'Enregistrer la langue', 'Salva la lingua', 'Save language'],
      theme: ['Erscheinungsbild speichern', 'Enregistrer l’apparence', 'Salva l’aspetto', 'Save appearance'],
    };
    return labels[name]?.[({ de: 0, fr: 1, it: 2, en: 3 })[this.preferences.language()]] ?? name;
  }
  ui(key: string): string {
    const labels: Record<string, readonly [string, string, string, string]> = {
      localEnvironment: ['lokale Arbeitsumgebung', 'environnement de travail local', 'ambiente di lavoro locale', 'local work environment'],
      loadingSession: ['Anmeldung wird geladen…', 'Chargement de la session…', 'Caricamento della sessione…', 'Loading session…'],
      signIn: ['Anmelden', 'Se connecter', 'Accedi', 'Sign in'],
      chooseProfile: ['Wählen Sie ein hinterlegtes Benutzerprofil für diese lokale Vorschau.', 'Choisissez un profil utilisateur pour cet aperçu local.', 'Scegliete un profilo utente per questa anteprima locale.', 'Choose a user profile for this local preview.'],
      personalSetting: ['Persönliche Einstellung', 'Préférence personnelle', 'Preferenza personale', 'Personal setting'],
      language: ['Sprache', 'Langue', 'Lingua', 'Language'],
      appearance: ['Erscheinungsbild', 'Apparence', 'Aspetto', 'Appearance'],
      save: ['speichern', 'enregistrer', 'salva', 'save'],
      preferenceScope: ['Soll diese Wahl nur in diesem Browser gelten oder im Benutzerprofil für alle Geräte gespeichert werden?', 'Ce choix doit-il s’appliquer uniquement à ce navigateur ou être enregistré dans votre profil pour tous les appareils ?', 'Questa scelta deve valere solo in questo browser o essere salvata nel profilo per tutti i dispositivi?', 'Should this choice apply only in this browser or be saved in your profile for all devices?'],
      cancel: ['Abbrechen', 'Annuler', 'Annulla', 'Cancel'],
      browserOnly: ['Nur dieser Browser', 'Ce navigateur uniquement', 'Solo questo browser', 'This browser only'],
      allDevices: ['Alle Geräte', 'Tous les appareils', 'Tutti i dispositivi', 'All devices'],
      light: ['Heller Modus', 'Mode clair', 'Modalità chiara', 'Light mode'],
      dark: ['Dunkler Modus', 'Mode sombre', 'Modalità scura', 'Dark mode'],
      footerText: ['DaCa · Zentraler Datenkatalog · Proof of Concept. Teil der Data Platform BIT. Im Co-Design mit ESTV, V, BK, BFS und weiteren Ämtern erarbeitet.', 'DaCa · Catalogue de données central · Preuve de concept. Fait partie de la plateforme de données de l’OFIT. Conçu avec l’AFC, la Défense, la ChF, l’OFS et d’autres offices.', 'DaCa · Catalogo centrale dei dati · Prova di concetto. Parte della piattaforma dati dell’UFIT. Sviluppato con AFC, Difesa, CaF, UST e altri uffici.', 'DaCa · Central Data Catalog · Proof of concept. Part of the BIT data platform. Co-designed with the FTA, Defence, Federal Chancellery, FSO and other offices.'],
    };
    return labels[key]?.[({ de: 0, fr: 1, it: 2, en: 3 })[this.preferences.language()]] ?? key;
  }
}
