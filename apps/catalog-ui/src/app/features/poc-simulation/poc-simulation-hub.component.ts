import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DidacaGlossaryTermComponent } from '@bit-didaca/design-system';

@Component({
  selector: 'didaca-poc-simulation-hub',
  standalone: true,
  imports: [RouterLink, DidacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="didaca-page-heading">
      <div>
        <p class="didaca-eyebrow"><didaca-glossary-term term="PoC" /> Simulation</p>
        <h1>Kontrollierte Ereignisse auslösen</h1>
        <p>Demonstrieren Sie fachliche und technische Abläufe mit synthetischen Daten. Jedes zustandsverändernde Ereignis ist nachvollziehbar und einzeln rücksetzbar.</p>
      </div>
    </section>

    <section class="simulation-contract didaca-card" aria-labelledby="simulation-contract-title">
      <div>
        <p class="didaca-eyebrow">Echte Integrationsschnittstelle</p>
        <h2 id="simulation-contract-title"><didaca-glossary-term term="DAAIF" /> kann Metadaten direkt an <didaca-glossary-term term="DaCa" /> liefern</h2>
        <p>Die UI-Simulation nutzt denselben Endpoint wie eine externe Integration. Er übernimmt ausschliesslich REST-Metadaten und erteilt keine Zugriffsrechte.</p>
      </div>
      <div class="simulation-contract-links">
        <a class="didaca-button" href="http://localhost:8001/docs" target="_blank" rel="noreferrer">Swagger UI öffnen</a>
        <a href="http://localhost:8001/openapi.json" target="_blank" rel="noreferrer">OpenAPI JSON</a>
        <a href="/openapi/daca-metadata-publication.openapi.yaml" download>Versionierte YAML</a>
      </div>
    </section>

    <div class="simulation-grid">
      <a class="didaca-card simulation-card" routerLink="/poc-simulation/product-submitted"><span>01</span><div><h2>Datenprodukt im DaCa eingereicht</h2><p>Die reale Metadatenpublikation übernimmt ein bereits kuratiertes REST-Datenprodukt und erzeugt Owner-Aufgaben.</p></div><strong>Simulation öffnen</strong></a>
      <a class="didaca-card simulation-card" routerLink="/poc-simulation/quality-below-threshold"><span>02</span><div><h2>Datenqualität zu tief</h2><p>Erzeugt einen separaten Alarm bei 58 % gegenüber dem Mindestwert von 80 %, ohne die Reifemedaille zu verfälschen.</p></div><strong>Simulation öffnen</strong></a>
      <a class="didaca-card simulation-card" routerLink="/poc-simulation/not-discoverable"><span>03</span><div><h2>Datenprodukt nicht auffindbar</h2><p>Entfernt die Katalogsichtbarkeit und erzeugt eine Aufgabe für den verantwortlichen Data Owner.</p></div><strong>Simulation öffnen</strong></a>
      <a class="didaca-card simulation-card" routerLink="/poc-simulation/isbo-restricted"><span>04</span><div><h2>Durch den <didaca-glossary-term term="ISBO" /> eingeschränkt</h2><p>Simuliert eine dringende Sicherheitsprüfung; bestehende Freigaben werden bewusst nicht automatisch widerrufen.</p></div><strong>Simulation öffnen</strong></a>
    </div>

    <p class="didaca-alert is-warning"><strong>PoC-Grenze:</strong> Alle Ereignisse betreffen ausschliesslich synthetische Fixture-Produkte. Auslösungen und Resets werden append-only protokolliert.</p>
  `,
})
export class PocSimulationHubComponent {}
