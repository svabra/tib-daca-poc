import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { POC_GUIDE_CAPABILITIES, POC_GUIDE_LIMITS, POC_GUIDE_STATUS_LABELS, POC_JOURNEYS } from './poc-guide.data';

@Component({
  selector: 'daca-poc-guide-overview',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading poc-guide-heading" data-poc-guide-overview>
      <div>
        <p class="daca-eyebrow">Dokumentation Datenkatalog · Schritt für Schritt</p>
        <h1>User Journeys</h1>
        <p>Erleben Sie DaCa aus Sicht von Data Analyst, Data Consumer, Data Owner und prüfender Fachrolle. Alle Anleitungen arbeiten ausschliesslich mit synthetischen Daten.</p>
      </div>
      <span class="poc-guide-count">{{ journeys.length }} Journeys</span>
    </section>

    <section class="poc-guide-intro daca-card" aria-labelledby="poc-guide-start-title">
      <div>
        <p class="daca-eyebrow">Orientierung</p>
        <h2 id="poc-guide-start-title">Was möchten Sie ausprobieren?</h2>
        <p>Wählen Sie eine Journey. Jede Anleitung nennt Rollen, Voraussetzungen, erwartetes Ergebnis und den Unterschied zwischen technisch wirksamer Funktion und PoC-Simulation.</p>
      </div>
      <div class="poc-guide-legend" aria-label="Bedeutung der Statuskennzeichnungen">
        <span class="is-implemented">{{ statusLabels.implemented }}</span>
        <span class="is-simulation">{{ statusLabels.simulation }}</span>
        <span class="is-out-of-scope">{{ statusLabels['out-of-scope'] }}</span>
      </div>
    </section>

    <section class="poc-guide-search daca-card" aria-label="Journeys durchsuchen">
      <label for="poc-guide-query">Journeys durchsuchen</label>
      <input id="poc-guide-query" type="search" [value]="query()" (input)="query.set($any($event.target).value)" placeholder="Titel, Beschreibung, Rolle oder Tag suchen">
      <div class="poc-guide-filters" role="group" aria-label="Nach Tag filtern">
        <button type="button" [class.is-active]="selectedTag() === null" [attr.aria-pressed]="selectedTag() === null" (click)="selectedTag.set(null)">Alle</button>
        @for (tag of tags; track tag) {
          <button type="button" [class.is-active]="selectedTag() === tag" [attr.aria-pressed]="selectedTag() === tag" (click)="toggleTag(tag)">{{ tag }}</button>
        }
      </div>
      <p class="poc-guide-result-count" role="status">{{ filteredJourneys().length }} von {{ journeys.length }} Journeys</p>
    </section>

    <div class="poc-guide-grid" aria-label="Verfügbare Customer Journeys">
      @for (journey of filteredJourneys(); track journey.id) {
        <a class="daca-card poc-guide-card" [routerLink]="['/documentation/journeys', journey.id]" [attr.data-poc-guide-journey]="journey.id">
          <span class="poc-guide-card-number">{{ journey.number }}</span>
          <div class="poc-guide-card-main">
            <p>{{ journey.systems.join(' · ') }}</p>
            <h2>{{ journey.title }}</h2>
            <span>{{ journey.summary }}</span>
            <div class="poc-guide-card-tags" aria-label="Tags">@for (tag of journey.tags; track tag) { <span>{{ tag }}</span> }</div>
            @if (journey.verification) { <mark class="poc-guide-verified">✓ {{ journey.verification.label }}</mark> }
          </div>
          <dl>
            <div><dt>Dauer</dt><dd>{{ journey.duration }}</dd></div>
            <div><dt>Stufe</dt><dd>{{ journey.difficulty }}</dd></div>
            <div><dt>Rollen</dt><dd>{{ journey.roles.length }}</dd></div>
          </dl>
          <strong>Journey öffnen <span aria-hidden="true">→</span></strong>
        </a>
      }
    </div>
    @if (filteredJourneys().length === 0) { <p class="poc-guide-empty" role="status">Keine Journey gefunden. Passen Sie Suchtext oder Tag an.</p> }

    <section class="poc-guide-boundaries" aria-labelledby="poc-guide-boundaries-title">
      <div class="poc-guide-section-heading">
        <p class="daca-eyebrow">Transparenter PoC-Rahmen</p>
        <h2 id="poc-guide-boundaries-title">Das kann der PoC – und das bewusst nicht</h2>
      </div>
      <div class="poc-guide-boundary-grid">
        <section class="daca-card is-capability" aria-labelledby="poc-guide-can-title">
          <h3 id="poc-guide-can-title">Das können Sie testen</h3>
          @for (item of capabilities; track item.title) {
            <article><span aria-hidden="true">✓</span><div><strong>{{ item.title }}</strong><p>{{ item.description }}</p></div></article>
          }
        </section>
        <section class="daca-card is-limit" aria-labelledby="poc-guide-cannot-title">
          <h3 id="poc-guide-cannot-title">Das ist nicht Teil des PoC</h3>
          @for (item of limits; track item.title) {
            <article><span aria-hidden="true">–</span><div><strong>{{ item.title }}</strong><p>{{ item.description }}</p></div></article>
          }
        </section>
      </div>
    </section>

    <section class="daca-card poc-guide-simulations" aria-labelledby="poc-guide-simulation-title">
      <div>
        <p class="daca-eyebrow">Werkzeugkasten</p>
        <h2 id="poc-guide-simulation-title">Simulationen und Grenzfälle</h2>
        <p>Die bisherigen, rücksetzbaren PoC-Ereignisse bleiben vollständig erreichbar. Sie verwenden dieselben synthetischen Fixtures wie der Leitfaden.</p>
      </div>
      <a class="daca-button is-secondary" routerLink="/poc-simulation">Simulationen öffnen</a>
    </section>
  `,
})
export class PocGuideOverviewComponent {
  readonly journeys = POC_JOURNEYS;
  readonly query = signal('');
  readonly selectedTag = signal<string | null>(null);
  readonly tags = [...new Set(POC_JOURNEYS.flatMap((journey) => journey.tags))].sort((a, b) => a.localeCompare(b, 'de'));
  readonly filteredJourneys = computed(() => {
    const terms = this.query().trim().toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
    const tag = this.selectedTag();
    return this.journeys.filter((journey) => {
      if (tag && !journey.tags.includes(tag)) return false;
      const searchable = [journey.title, journey.summary, journey.outcome, ...journey.tags, ...journey.roles.map((role) => `${role.name} ${role.responsibility}`)].join(' ').toLocaleLowerCase('de');
      return terms.every((term) => searchable.includes(term));
    });
  });
  readonly capabilities = POC_GUIDE_CAPABILITIES;
  readonly limits = POC_GUIDE_LIMITS;
  readonly statusLabels = POC_GUIDE_STATUS_LABELS;

  toggleTag(tag: string): void {
    this.selectedTag.update((current) => current === tag ? null : tag);
  }
}
