import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserPreferencesService } from '../../core/user-preferences.service';

type Copy = readonly [string, string, string, string];

@Component({
  selector: 'daca-documentation-home',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading"><div><p class="daca-eyebrow">Data Catalog</p><h1>{{ tr(['Dokumentation Datenkatalog', 'Documentation du catalogue de données', 'Documentazione del catalogo dati', 'Data catalog documentation']) }}</h1><p>{{ tr(['Anleitungen, Grundlagen und Begriffe an einem Ort.', 'Guides, principes et termes réunis.', 'Guide, principi e termini in un unico luogo.', 'Guides, fundamentals and terms in one place.']) }}</p></div></section>
    <div class="documentation-categories">
      <a routerLink="/documentation/journeys"><span>01</span><h2>User Journeys</h2><p>{{ tr(['Die bestehenden PoC-Journeys führen Schritt für Schritt durch Aufgaben, Rollen und erwartete Ergebnisse.', 'Les parcours PoC expliquent pas à pas les tâches, les rôles et les résultats attendus.', 'I percorsi PoC spiegano passo per passo attività, ruoli e risultati attesi.', 'The existing PoC journeys explain tasks, roles and expected outcomes step by step.']) }}</p><strong>{{ tr(['Journeys ansehen', 'Voir les parcours', 'Apri i percorsi', 'View journeys']) }} →</strong></a>
      <a routerLink="/documentation/static"><span>02</span><h2>{{ tr(['Statische Dokumentation', 'Documentation statique', 'Documentazione statica', 'Static documentation']) }}</h2><p>{{ tr(['Grundlagen zu Katalog, Metadaten, Datenmodellen und Zugriffsregeln.', 'Principes du catalogue, des métadonnées, des modèles et des règles d’accès.', 'Fondamenti del catalogo, dei metadati, dei modelli e delle regole di accesso.', 'Fundamentals of the catalog, metadata, models and access rules.']) }}</p><strong>{{ tr(['Dokumentation lesen', 'Lire la documentation', 'Leggi la documentazione', 'Read documentation']) }} →</strong></a>
      <a routerLink="/documentation/glossary"><span>03</span><h2>{{ tr(['DaCa Glossar', 'Glossaire DaCa', 'Glossario DaCa', 'DaCa glossary']) }}</h2><p>{{ tr(['Begriffe mit Kurz- und Langbeschreibung direkt aus dem Katalog.', 'Termes et descriptions courtes et détaillées provenant du catalogue.', 'Termini con descrizioni brevi e dettagliate dal catalogo.', 'Terms with short and detailed descriptions directly from the catalog.']) }}</p><strong>{{ tr(['Glossar öffnen', 'Ouvrir le glossaire', 'Apri il glossario', 'Open glossary']) }} →</strong></a>
    </div>
  `,
  styles: [`
    .documentation-categories{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.documentation-categories>a{display:flex;min-height:275px;flex-direction:column;border:1px solid var(--daca-border);border-top:5px solid var(--daca-red);padding:25px;background:var(--daca-surface);color:var(--daca-ink);text-decoration:none}.documentation-categories>a:hover,.documentation-categories>a:focus-visible{border-color:var(--daca-blue);box-shadow:var(--daca-shadow)}.documentation-categories span{color:var(--daca-red);font-size:.75rem;font-weight:800;letter-spacing:.09em}.documentation-categories h2{margin:20px 0 10px;font-size:1.38rem}.documentation-categories p{margin:0;color:var(--daca-muted);line-height:1.5}.documentation-categories strong{margin-top:auto;padding-top:22px;color:var(--daca-blue);font-size:.83rem}@media(max-width:900px){.documentation-categories{grid-template-columns:1fr}.documentation-categories>a{min-height:190px}}
  `],
})
export class DocumentationHomeComponent {
  private readonly preferences = inject(UserPreferencesService);
  tr(copy: Copy): string { return copy[({ de: 0, fr: 1, it: 2, en: 3 })[this.preferences.language()]]; }
}
