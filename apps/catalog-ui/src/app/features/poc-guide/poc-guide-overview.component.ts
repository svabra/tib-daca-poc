import { ChangeDetectionStrategy, Component } from '@angular/core';
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
        <p class="daca-eyebrow">Proof of Concept · Schritt für Schritt</p>
        <h1>PoC Leitfaden</h1>
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

    <div class="poc-guide-grid" aria-label="Verfügbare Customer Journeys">
      @for (journey of journeys; track journey.id) {
        <a class="daca-card poc-guide-card" [routerLink]="['/poc-guide', journey.id]" [attr.data-poc-guide-journey]="journey.id">
          <span class="poc-guide-card-number">{{ journey.number }}</span>
          <div class="poc-guide-card-main">
            <p>{{ journey.systems.join(' · ') }}</p>
            <h2>{{ journey.title }}</h2>
            <span>{{ journey.summary }}</span>
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
  readonly capabilities = POC_GUIDE_CAPABILITIES;
  readonly limits = POC_GUIDE_LIMITS;
  readonly statusLabels = POC_GUIDE_STATUS_LABELS;
}
