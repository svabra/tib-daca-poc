import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { PipelineCopy } from './documentation-pipeline';

@Component({
  selector: 'daca-documentation-source-topics',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documentation-source-topics.component.html',
  styleUrl: './documentation-source-topics.component.css',
})
export class DocumentationSourceTopicsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly preferences = inject(UserPreferencesService);
  readonly metadata: boolean = this.route.snapshot.data['topic'] === 'metadata';
  readonly fields: readonly { title: PipelineCopy; detail: PipelineCopy }[] = [
    { title: ['Name', 'Nom', 'Nome', 'Name'], detail: ['Wie heissen die Daten und was beschreiben sie?', 'Comment les données sont-elles nommées et que décrivent-elles ?', 'Come si chiamano i dati e che cosa descrivono?', 'What is the data called and what does it describe?'] },
    { title: ['Herkunft', 'Origine', 'Origine', 'Origin'], detail: ['Aus welcher Quelle stammen die Daten?', 'De quelle source proviennent les données ?', 'Da quale fonte provengono i dati?', 'Which source does the data come from?'] },
    { title: ['Schema', 'Schéma', 'Schema', 'Schema'], detail: ['Welche Felder, Datentypen und Beziehungen gibt es?', 'Quels champs, types de données et relations sont présents ?', 'Quali campi, tipi di dati e relazioni sono presenti?', 'Which fields, data types and relationships are present?'] },
    { title: ['Data Owner', 'Data Owner', 'Data Owner', 'Data Owner'], detail: ['Wer trägt die fachliche Verantwortung?', 'Qui assume la responsabilité métier ?', 'Chi ha la responsabilità funzionale?', 'Who is accountable for the data?'] },
    { title: ['Klassifikation', 'Classification', 'Classificazione', 'Classification'], detail: ['Welche Schutzanforderungen gelten für die Daten?', 'Quelles exigences de protection s’appliquent aux données ?', 'Quali requisiti di protezione si applicano ai dati?', 'Which protection requirements apply to the data?'] },
    { title: ['Schnittstellen', 'Interfaces', 'Interfacce', 'Interfaces'], detail: ['Über welche beschriebenen Zugangswege sind die Daten erreichbar?', 'Par quelles interfaces décrites les données sont-elles accessibles ?', 'Attraverso quali interfacce descritte sono raggiungibili i dati?', 'Which documented interfaces provide access to the data?'] },
  ];

  tr(copy: PipelineCopy): string { return catalogCopy(copy, this.preferences.language()); }
}
