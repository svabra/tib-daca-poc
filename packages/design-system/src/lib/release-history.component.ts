import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DacaFeatureLocale, DacaFeatureScope } from './feature-list';
import { searchDacaReleases } from './release-history';

@Component({
  selector: 'daca-release-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="daca-release-page" [class.daca-page]="!embedded()">
      @if (!embedded()) { <header class="daca-page-heading"><div><p class="daca-eyebrow">{{ locale() === 'de' ? 'Einstellungen' : 'Settings' }}</p><h1>{{ locale() === 'de' ? 'Featureliste' : 'Feature list' }}</h1><p>{{ locale() === 'de' ? 'Entdecken Sie, wie neue Versionen Ihre Arbeit unterstützen.' : 'See how each release helps your work.' }}</p></div></header> }
      <section class="daca-release-panel"><header class="daca-release-panel-heading"><p class="daca-eyebrow">{{ locale() === 'de' ? 'Release-Historie' : 'Release history' }}</p><h2>{{ locale() === 'de' ? 'Neue Features und Verbesserungen' : 'New features and improvements' }}</h2></header>
      <label class="daca-release-search"><span>{{ locale() === 'de' ? 'Features und Tags suchen' : 'Search features and tags' }}</span><input type="search" [value]="query()" (input)="query.set($any($event.target).value)" [placeholder]="locale() === 'de' ? 'Suchbegriff oder Tag' : 'Feature or tag'"></label>
      <div class="daca-release-list">
        @for (release of results(); track release.version) {
          <article class="daca-release-entry"><h2>V{{ release.version }}</h2><ul class="daca-release-features">@for (feature of release.features; track feature.title) { <li><h3>{{ feature.title }}</h3><p>{{ feature.description }}</p><div class="daca-release-tags">@for (tag of feature.tags; track tag) { <span>{{ tag }}</span> }</div></li> }</ul></article>
        }
        @if (results().length === 0) { <p class="daca-release-empty">{{ locale() === 'de' ? 'Keine passenden Änderungen gefunden.' : 'No matching changes found.' }}</p> }
      </div></section>
      <p class="daca-feature-dialog-note">{{ locale() === 'de' ? 'Diese Liste beschreibt die lokale PoC-Umgebung. Einzelne Abläufe sind simuliert.' : 'This list describes the local proof of concept. Some workflows are simulated.' }}</p>
    </div>
  `,
})
export class DacaReleaseHistoryComponent {
  readonly scope = input<DacaFeatureScope>('catalog');
  readonly locale = input<DacaFeatureLocale>('de');
  readonly embedded = input(false);
  readonly query = signal('');
  readonly results = computed(() => searchDacaReleases(this.scope(), this.locale(), this.query()));
}
