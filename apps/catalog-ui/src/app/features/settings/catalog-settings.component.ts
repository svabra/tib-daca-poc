import { catalogCopy } from '../../core/catalog-localization';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { DacaReleaseHistoryComponent } from '../../../../../../packages/design-system/src/lib/release-history.component';
import { DACA_VERSION } from '../../../../../../packages/design-system/src/lib/version';
import { CatalogLanguage, CatalogTheme, UserPreferencesService } from '../../core/user-preferences.service';
import { LandingPreferencesService } from '../../core/landing-preferences.service';
import { ResponsibilityPerspectivesComponent } from './responsibility-perspectives.component';
import { RoleChangeProtocolComponent } from './role-change-protocol.component';

type SettingsSection = 'language' | 'appearance' | 'home' | 'features' | 'responsibilities' | 'role-changes';
type Copy = readonly [string, string, string, string];

@Component({
  selector: 'daca-catalog-settings',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, DacaReleaseHistoryComponent, ResponsibilityPerspectivesComponent, RoleChangeProtocolComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-layout">
      <aside class="settings-navigation" [attr.aria-label]="tr(['Einstellungsbereiche', 'Rubriques des paramètres', 'Sezioni delle impostazioni', 'Settings sections'])">
        <nav [attr.aria-label]="tr(['Einstellungsbereiche', 'Rubriques des paramètres', 'Sezioni delle impostazioni', 'Settings sections'])">
          <a routerLink="/settings/language-personal" routerLinkActive="is-active" ariaCurrentWhenActive="page">{{ tr(['Spracheinstellungen', 'Paramètres linguistiques', 'Impostazioni lingua', 'Language settings']) }}</a>
          <a routerLink="/settings/appearance" routerLinkActive="is-active" ariaCurrentWhenActive="page">{{ tr(['Erscheinungsbild', 'Apparence', 'Aspetto', 'Appearance']) }}</a>
          <a routerLink="/settings/home" routerLinkActive="is-active" ariaCurrentWhenActive="page">{{ tr(['Startseite', 'Accueil', 'Pagina iniziale', 'Home page']) }}</a>
          <a routerLink="/settings/features" routerLinkActive="is-active" ariaCurrentWhenActive="page">{{ tr(['Featureliste', 'Liste des fonctionnalités', 'Elenco delle funzionalità', 'Feature list']) }}</a>
          <a routerLink="/settings/responsibilities" routerLinkActive="is-active" ariaCurrentWhenActive="page">{{ tr(['Rollen und Zuständigkeiten', 'Rôles et responsabilités', 'Ruoli e responsabilità', 'Roles and responsibilities']) }}</a>
          <a routerLink="/settings/role-changes" routerLinkActive="is-active" ariaCurrentWhenActive="page">{{ tr(['Rollenprotokoll', 'Journal des rôles', 'Registro dei ruoli', 'Role protocol']) }}</a>
        </nav>
      </aside>

      <div class="settings-content">
        <header class="settings-heading">
          <div><p class="daca-eyebrow">Data Catalog</p><h1>{{ section === 'responsibilities' ? tr(['Rollen und Zuständigkeiten', 'Rôles et responsabilités', 'Ruoli e responsabilità', 'Roles and responsibilities']) : section === 'role-changes' ? tr(['Rollenprotokoll', 'Journal des rôles', 'Registro dei ruoli', 'Role protocol']) : tr(['Einstellungen', 'Paramètres', 'Impostazioni', 'Settings']) }}</h1><p>{{ section === 'responsibilities' || section === 'role-changes' ? '' : description() }}</p></div>
          <span class="settings-version">{{ tr(['Aktuell', 'Actuel', 'Attuale', 'Current']) }} · V{{ version }}</span>
        </header>

        @if (section === 'language') {
          <section class="settings-panel" aria-labelledby="settings-language-title">
            <header><p class="daca-eyebrow">{{ tr(['Sprache', 'Langue', 'Lingua', 'Language']) }}</p><h2 id="settings-language-title">{{ tr(['Persönliche Spracheinstellungen', 'Paramètres linguistiques personnels', 'Impostazioni linguistiche personali', 'Personal language settings']) }}</h2></header>
            <div class="settings-panel-body">
              <p>{{ tr(['Die Auswahl kann nur in diesem Browser bleiben oder für alle Ihre Geräte im DaCa-Profil gespeichert werden.', 'Le choix peut rester dans ce navigateur ou être enregistré dans votre profil DaCa pour tous vos appareils.', 'La scelta può restare in questo browser o essere salvata nel profilo DaCa per tutti i dispositivi.', 'Your choice can stay in this browser or be saved in your DaCa profile for all devices.']) }}</p>
              <label class="settings-language-field"><span>{{ tr(['Darstellungssprache', 'Langue d’affichage', 'Lingua di visualizzazione', 'Display language']) }}</span><select [value]="preferences.language()" (change)="preferences.requestLanguage($any($event.target).value)"><option value="de">Deutsch</option><option value="fr">Français</option><option value="it">Italiano</option><option value="rm">Rumantsch Grischun</option><option value="en">English</option></select></label>
              <p class="settings-note">{{ tr(['Die DaCa-Oberfläche wird sofort in der gewählten Sprache angezeigt. Fachliche Namen, Datenwerte und externe Quellbezeichnungen bleiben unverändert.', 'L’interface DaCa s’affiche immédiatement dans la langue choisie. Les noms métiers, les valeurs et les libellés de sources externes restent inchangés.', 'L’interfaccia DaCa viene mostrata subito nella lingua scelta. Nomi di dominio, valori e denominazioni delle fonti esterne restano invariati.', 'The DaCa interface switches to the selected language immediately. Domain names, data values and external source labels stay unchanged.']) }}</p>
            </div>
          </section>
        } @else if (section === 'appearance') {
          <section class="settings-panel" aria-labelledby="settings-appearance-title">
            <header><p class="daca-eyebrow">{{ tr(['Persönlich', 'Personnel', 'Personale', 'Personal']) }}</p><h2 id="settings-appearance-title">{{ tr(['Erscheinungsbild', 'Apparence', 'Aspetto', 'Appearance']) }}</h2></header>
            <div class="settings-panel-body">
              <p>{{ tr(['Wählen Sie ein helles oder dunkles Erscheinungsbild. Danach entscheiden Sie, ob die Einstellung nur in diesem Browser oder in Ihrem Profil für alle Geräte gelten soll.', 'Choisissez une apparence claire ou sombre. Ensuite, décidez si le choix s’applique uniquement à ce navigateur ou à votre profil sur tous les appareils.', 'Scegliete un aspetto chiaro o scuro. Poi decidete se applicarlo solo a questo browser o al profilo su tutti i dispositivi.', 'Choose a light or dark appearance. Then decide whether it applies only in this browser or through your profile on all devices.']) }}</p>
              <fieldset class="settings-theme-choice"><legend>{{ tr(['Modus', 'Mode', 'Modalità', 'Mode']) }}</legend>
                <button type="button" [class.is-selected]="preferences.theme() === 'light'" [attr.aria-pressed]="preferences.theme() === 'light'" (click)="chooseTheme('light')"><span aria-hidden="true">☼</span><strong>{{ tr(['Hell', 'Clair', 'Chiaro', 'Light']) }}</strong><small>{{ tr(['Gut lesbar bei Tageslicht', 'Lisible à la lumière du jour', 'Leggibile alla luce del giorno', 'Easy to read in daylight']) }}</small></button>
                <button type="button" [class.is-selected]="preferences.theme() === 'dark'" [attr.aria-pressed]="preferences.theme() === 'dark'" (click)="chooseTheme('dark')"><span aria-hidden="true">◐</span><strong>{{ tr(['Dunkel', 'Sombre', 'Scuro', 'Dark']) }}</strong><small>{{ tr(['Weniger Helligkeit bei längerer Arbeit', 'Luminosité réduite pour les longues sessions', 'Luminosità ridotta per sessioni lunghe', 'Less brightness for longer sessions']) }}</small></button>
              </fieldset>
              <p class="settings-note">{{ tr(['Aktuelles Erscheinungsbild:', 'Apparence actuelle :', 'Aspetto attuale:', 'Current appearance:']) }} {{ preferences.theme() === 'dark' ? tr(['Dunkel', 'Sombre', 'Scuro', 'Dark']) : tr(['Hell', 'Clair', 'Chiaro', 'Light']) }}.</p>
            </div>
          </section>
        } @else if (section === 'home') {
          <section class="settings-panel" aria-labelledby="settings-welcome-title">
            <header><p class="daca-eyebrow">{{ tr(['Startseite', 'Accueil', 'Pagina iniziale', 'Home']) }}</p><h2 id="settings-welcome-title">{{ tr(['Willkommensbereich', 'Message de bienvenue', 'Sezione di benvenuto', 'Welcome section']) }}</h2></header>
            <div class="settings-panel-body">
              <p>{{ tr(['Der einführende Willkommensbereich kann auf der Startseite nach Bestätigung ausgeblendet werden. Organisationscanvas und Suche bleiben sichtbar. Diese Auswahl gilt pro Benutzer in diesem Browser.', 'Le message de bienvenue peut être masqué après confirmation sur l’accueil. Le canvas et la recherche restent visibles. Ce choix est personnel et propre à ce navigateur.', 'Il benvenuto può essere nascosto dopo conferma nella pagina iniziale. Canvas e ricerca restano visibili. La scelta vale per utente e browser.', 'The welcome section can be hidden after confirmation on the home page. The organization canvas and search remain visible. This choice is per user in this browser.']) }}</p>
              <p>{{ landing.welcomeVisible() ? tr(['Der Willkommensbereich ist sichtbar.', 'Le message est visible.', 'Il benvenuto è visibile.', 'The welcome section is visible.']) : tr(['Der Willkommensbereich ist ausgeblendet.', 'Le message est masqué.', 'Il benvenuto è nascosto.', 'The welcome section is hidden.']) }}</p>
              <button type="button" class="daca-button is-secondary" [disabled]="landing.welcomeVisible()" (click)="landing.setWelcome(true)">{{ tr(['Willkommensbereich wieder anzeigen', 'Rétablir le message de bienvenue', 'Ripristina il benvenuto', 'Restore welcome section']) }}</button>
              <p><a routerLink="/">{{ tr(['Zur Startseite', 'Vers l’accueil', 'Alla pagina iniziale', 'Back to home']) }}</a></p>
              @if (landing.storageError()) { <p role="status">{{ tr(['Browserspeicher nicht verfügbar; die Auswahl gilt nur für diese Sitzung.', 'Stockage indisponible ; ce choix vaut pour cette session.', 'Memoria non disponibile; la scelta vale per questa sessione.', 'Browser storage is unavailable; this choice applies only to this session.']) }}</p> }
            </div>
          </section>
        } @else if (section === 'responsibilities') {
          <daca-responsibility-perspectives />
        } @else if (section === 'role-changes') {
          <daca-role-change-protocol />
        } @else {
          <daca-release-history scope="catalog" [locale]="preferences.language() === 'de' ? 'de' : 'en'" [embedded]="true" />
        }
      </div>
    </div>
  `,
  styles: [`
    :host{display:block}.settings-layout{display:grid;grid-template-columns:232px minmax(0,1fr);gap:40px;align-items:start}.settings-navigation{border:1px solid var(--daca-border);background:var(--daca-surface)}.settings-navigation nav{display:grid;padding:10px 0}.settings-navigation a{border-left:3px solid transparent;padding:12px 16px;color:var(--daca-muted);font-size:.82rem;font-weight:750;text-decoration:none}.settings-navigation a:hover{background:var(--daca-blue-soft);color:var(--daca-ink)}.settings-navigation a.is-active{border-left-color:var(--daca-red);background:var(--daca-blue-soft);color:var(--daca-ink)}.settings-content{min-width:0}.settings-heading{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:26px}.settings-heading h1{margin:.2rem 0;font-size:clamp(2rem,3.4vw,3rem)}.settings-heading p:last-child{margin:.3rem 0 0;color:var(--daca-muted)}.settings-version{flex:none;border:1px solid var(--daca-border);padding:8px 12px;background:var(--daca-surface);color:var(--daca-muted);font-size:.7rem}.settings-panel{border:1px solid var(--daca-border);border-top:5px solid var(--daca-red);background:var(--daca-surface)}.settings-panel>header{border-bottom:1px solid var(--daca-border);padding:22px 24px}.settings-panel h2{margin:.25rem 0 0;font-size:1.25rem}.settings-panel-body{display:grid;gap:22px;max-width:710px;padding:26px 28px 32px}.settings-panel-body>p{margin:0;color:var(--daca-muted);line-height:1.55}.settings-language-field{display:grid;gap:8px;max-width:360px;color:var(--daca-muted);font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.settings-language-field select{min-height:42px;border:1px solid var(--daca-border-strong);padding:8px 12px;background:var(--daca-surface);color:var(--daca-ink);font-size:.9rem;font-weight:650;text-transform:none}.settings-panel-body>.settings-note{border-left:3px solid var(--daca-blue);padding:13px 15px;background:var(--daca-blue-soft);color:var(--daca-ink);font-size:.82rem}.settings-theme-choice{display:flex;flex-wrap:wrap;gap:10px;margin:0;border:0;padding:0}.settings-theme-choice legend{width:100%;margin-bottom:6px;color:var(--daca-muted);font-size:.72rem;font-weight:800;text-transform:uppercase}.settings-theme-choice button{display:grid;min-width:180px;grid-template-columns:26px 1fr;grid-template-rows:auto auto;gap:2px 8px;border:1px solid var(--daca-border-strong);border-radius:4px;padding:13px 14px;background:var(--daca-surface);color:var(--daca-ink);text-align:left;cursor:pointer}.settings-theme-choice button>span{grid-row:1/span 2;align-self:center;color:var(--daca-blue);font-size:1.25rem}.settings-theme-choice button strong{font-size:.8rem}.settings-theme-choice button small{color:var(--daca-muted);font-size:.68rem}.settings-theme-choice button:hover,.settings-theme-choice button:focus-visible,.settings-theme-choice button.is-selected{border-color:var(--daca-blue);box-shadow:0 8px 18px #1122331a}.settings-theme-choice button.is-selected{background:var(--daca-blue-soft)}@media(max-width:860px){.settings-layout{grid-template-columns:1fr;gap:24px}.settings-navigation nav{display:flex;overflow-x:auto;padding:0}.settings-navigation a{flex:none;border-left:0;border-bottom:3px solid transparent}.settings-navigation a.is-active{border-left:0;border-bottom-color:var(--daca-red)}}@media(max-width:600px){.settings-heading{align-items:start;flex-direction:column}.settings-panel-body{padding:20px}.settings-theme-choice button{width:100%}}
  `],
})
export class CatalogSettingsComponent {
  private readonly route = inject(ActivatedRoute);
  readonly preferences = inject(UserPreferencesService);
  readonly landing = inject(LandingPreferencesService);
  readonly section = (this.route.snapshot.data['settingsSection'] as SettingsSection | undefined) ?? 'features';
  readonly version = DACA_VERSION;

  tr(copy: Copy): string { return catalogCopy(copy, this.preferences.language()); }
  description(): string {
    if (this.section === 'language') return this.tr(['Ihre persönliche Spracheinstellung für DaCa.', 'Votre préférence linguistique personnelle pour DaCa.', 'La vostra preferenza linguistica personale per DaCa.', 'Your personal language preference for DaCa.']);
    if (this.section === 'appearance') return this.tr(['Helles oder dunkles Erscheinungsbild – im Browser oder profilweit speichern.', 'Enregistrez une apparence claire ou sombre dans le navigateur ou dans votre profil.', 'Salvate un aspetto chiaro o scuro nel browser o nel profilo.', 'Save a light or dark appearance in this browser or your profile.']);
    if (this.section === 'home') return this.tr(['Willkommensbereich und Einstieg in Ihren Datenraum.', 'Message de bienvenue et accès à votre espace de données.', 'Benvenuto e accesso al vostro spazio dati.', 'Welcome section and entry to your data landscape.']);
    if (this.section === 'responsibilities') return this.tr(['Zuständigkeiten aus dem Katalog.', 'Responsabilités du catalogue.', 'Responsabilità del catalogo.', 'Catalog responsibilities.']);
    return this.tr(['Version, Updates und die nachvollziehbare Featureliste von DaCa.', 'Version, mises à jour et liste des fonctionnalités de DaCa.', 'Versione, aggiornamenti ed elenco delle funzionalità di DaCa.', 'Version, updates and DaCa’s feature list.']);
  }
  chooseTheme(theme: CatalogTheme): void { this.preferences.requestTheme(theme); }
}
