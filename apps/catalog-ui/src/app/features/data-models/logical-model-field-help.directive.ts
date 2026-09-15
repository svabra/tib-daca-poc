import { DOCUMENT } from '@angular/common';
import { AfterViewInit, Directive, ElementRef, HostListener, Inject, Input, OnDestroy } from '@angular/core';

export type LogicalModelHelpLocale = 'de' | 'fr' | 'it';

type HelpText = Record<LogicalModelHelpLocale, string>;

const help = (de: string, fr: string, it: string): HelpText => ({ de, fr, it });

export const LOGICAL_MODEL_FIELD_HELP: Record<string, HelpText> = {
  classification: help('Schutzbedarf des gesamten Modells. Die höchste Feldklassifizierung sollte nicht überschritten werden.', 'Niveau de protection du modèle entier. Il ne devrait pas être inférieur à la classification de champ la plus élevée.', 'Livello di protezione dell’intero modello. Non dovrebbe essere inferiore alla classificazione di campo più elevata.'),
  titleDe: help('Verbindlicher deutscher Name des beschriebenen Datensatzes.', 'Nom allemand obligatoire du jeu de données décrit.', 'Nome tedesco obbligatorio del set di dati descritto.'),
  descriptionDe: help('Fachliche deutsche Beschreibung von Inhalt, Zweck und Abgrenzung des Datensatzes.', 'Description métier allemande du contenu, de la finalité et du périmètre du jeu de données.', 'Descrizione specialistica in tedesco del contenuto, dello scopo e dell’ambito del set di dati.'),
  titleFr: help('Französische Übersetzung des Datensatztitels.', 'Traduction française du titre du jeu de données.', 'Traduzione francese del titolo del set di dati.'),
  descriptionFr: help('Französische Übersetzung der fachlichen Datensatzbeschreibung.', 'Traduction française de la description métier du jeu de données.', 'Traduzione francese della descrizione specialistica del set di dati.'),
  titleIt: help('Italienische Übersetzung des Datensatztitels.', 'Traduction italienne du titre du jeu de données.', 'Traduzione italiana del titolo del set di dati.'),
  descriptionIt: help('Italienische Übersetzung der fachlichen Datensatzbeschreibung.', 'Traduction italienne de la description métier du jeu de données.', 'Traduzione italiana della descrizione specialistica del set di dati.'),
  titleEn: help('Optionale englische Übersetzung des Datensatztitels.', 'Traduction anglaise facultative du titre du jeu de données.', 'Traduzione inglese facoltativa del titolo del set di dati.'),
  descriptionEn: help('Optionale englische Übersetzung der Datensatzbeschreibung.', 'Traduction anglaise facultative de la description du jeu de données.', 'Traduzione inglese facoltativa della descrizione del set di dati.'),
  titleRm: help('Optionale rätoromanische Übersetzung des Datensatztitels.', 'Traduction romanche facultative du titre du jeu de données.', 'Traduzione romancia facoltativa del titolo del set di dati.'),
  descriptionRm: help('Optionale rätoromanische Übersetzung der Datensatzbeschreibung.', 'Traduction romanche facultative de la description du jeu de données.', 'Traduzione romancia facoltativa della descrizione del set di dati.'),
  identifiers: help('Katalogweit eindeutiger Identifier als genau ein String ohne Leerzeichen. Den organisations-abgeleiteten Modus für stabile, organisationsbezogene Modelle nutzen; für übergreifende oder externe Kennungen den manuellen Identifier verwenden.', 'Identifiant unique dans le catalogue: une seule chaîne sans espace. Utilisez le mode dérivé de l’organisation pour les modèles stables liés à une organisation; utilisez un identifiant manuel pour les identifiants transversaux ou externes.', 'Identificatore univoco nel catalogo: una sola stringa senza spazi. Usare la modalità derivata dall’organizzazione per modelli stabili legati a un’organizzazione; usare un identificatore manuale per identificatori trasversali o esterni.'),
  department: help('Departement, in dessen Verwaltungskontext das Modell geführt wird.', 'Département dans le contexte administratif duquel le modèle est géré.', 'Dipartimento nel cui contesto amministrativo viene gestito il modello.'),
  office: help('Bundesamt oder Verwaltungseinheit, die das Modell organisatorisch führt.', 'Office fédéral ou unité administrative responsable de la gestion organisationnelle du modèle.', 'Ufficio federale o unità amministrativa responsabile della gestione organizzativa del modello.'),
  division: help('Optionale untergeordnete Organisationseinheit für den präzisen Bearbeitungsscope.', 'Unité organisationnelle subordonnée facultative pour préciser le périmètre de traitement.', 'Unità organizzativa subordinata facoltativa per precisare l’ambito di elaborazione.'),
  dataDomainId: help('Fachdomäne des Modells. Sie bestimmt verbindlich den prüfenden Domain Owner und dessen Stellvertretung.', 'Domaine métier du modèle. Il détermine le Domain Owner chargé de l’examen et sa suppléance.', 'Dominio specialistico del modello. Determina il Domain Owner responsabile della verifica e il suo sostituto.'),
  creatorType: help('Art der Stelle oder Person, die den beschriebenen Datensatz ursprünglich erzeugt.', 'Type d’entité ou de personne qui a créé à l’origine le jeu de données décrit.', 'Tipo di entità o persona che ha originariamente creato il set di dati descritto.'),
  creatorName: help('Name der erzeugenden Applikation, Organisation oder Person.', 'Nom de l’application, de l’organisation ou de la personne productrice.', 'Nome dell’applicazione, dell’organizzazione o della persona produttrice.'),
  creatorIdentifier: help('Stabile Kennung der internen Verwaltungseinheit, zum Beispiel ein Organisationscode.', 'Identifiant stable de l’unité administrative interne, par exemple un code d’organisation.', 'Identificatore stabile dell’unità amministrativa interna, ad esempio un codice organizzativo.'),
  creatorPersonName: help('Optionale Kontaktperson bei einer externen erzeugenden Organisation.', 'Personne de contact facultative d’une organisation productrice externe.', 'Persona di contatto facoltativa presso un’organizzazione produttrice esterna.'),
  dateCreated: help('Datum, an dem der fachliche Datensatz ursprünglich erstellt wurde.', 'Date de création initiale du jeu de données métier.', 'Data di creazione originaria del set di dati specialistico.'),
  entityName: help('Stabiler technischer Name der logischen Entität, zum Beispiel Mitarbeitende.', 'Nom technique stable de l’entité logique, par exemple Collaborateurs.', 'Nome tecnico stabile dell’entità logica, ad esempio Collaboratori.'),
  entityBusinessObject: help('Versioniertes Geschäftsobjekt, das die Bedeutung der gesamten Entität festlegt.', 'Objet métier versionné qui définit la signification de l’entité entière.', 'Oggetto aziendale versionato che definisce il significato dell’intera entità.'),
  fieldName: help('Eindeutiger technischer Name des Feldes innerhalb seiner Entität.', 'Nom technique unique du champ au sein de son entité.', 'Nome tecnico univoco del campo all’interno della sua entità.'),
  fieldBusinessObject: help('Versioniertes Geschäftsobjekt, dessen Eigenschaft dieses Feld repräsentiert.', 'Objet métier versionné dont ce champ représente une propriété.', 'Oggetto aziendale versionato di cui questo campo rappresenta una proprietà.'),
  dataType: help('SHACL-/XML-Schema-Datentyp der zulässigen Feldwerte.', 'Type de données SHACL/XML Schema des valeurs admises pour le champ.', 'Tipo di dati SHACL/XML Schema dei valori ammessi per il campo.'),
  length: help('Optionale maximale Zeichen- oder Bytelänge des Feldwertes.', 'Longueur maximale facultative du champ en caractères ou en octets.', 'Lunghezza massima facoltativa del valore in caratteri o byte.'),
  precision: help('Gesamtzahl signifikanter Stellen eines numerischen Wertes.', 'Nombre total de chiffres significatifs d’une valeur numérique.', 'Numero totale di cifre significative di un valore numerico.'),
  scale: help('Anzahl Nachkommastellen eines Dezimalwertes; darf die Precision nicht überschreiten.', 'Nombre de décimales d’une valeur; ne doit pas dépasser la précision.', 'Numero di cifre decimali; non deve superare la precisione.'),
  order: help('Darstellungs- und Exportreihenfolge des Feldes innerhalb der Entität.', 'Ordre d’affichage et d’exportation du champ dans l’entité.', 'Ordine di visualizzazione ed esportazione del campo nell’entità.'),
  nullable: help('Legt fest, ob ein Datensatz für dieses Feld keinen Wert enthalten darf.', 'Indique si un enregistrement peut ne contenir aucune valeur pour ce champ.', 'Indica se un record può non contenere alcun valore per questo campo.'),
  minCount: help('Minimale Anzahl Werte gemäss SHACL; 0 bedeutet optional.', 'Nombre minimal de valeurs selon SHACL; 0 signifie facultatif.', 'Numero minimo di valori secondo SHACL; 0 significa facoltativo.'),
  maxCount: help('Maximale Anzahl Werte gemäss SHACL; muss mindestens minCount entsprechen.', 'Nombre maximal de valeurs selon SHACL; doit être au moins égal à minCount.', 'Numero massimo di valori secondo SHACL; deve essere almeno pari a minCount.'),
  fieldClassification: help('Schutzbedarf dieses einzelnen Feldes.', 'Niveau de protection de ce champ individuel.', 'Livello di protezione di questo singolo campo.'),
  sourceSystem: help('Optionales Ursprungssystem, aus dem dieses fachliche Feld stammt.', 'Système source facultatif dont provient ce champ métier.', 'Sistema sorgente facoltativo da cui proviene questo campo specialistico.'),
  shortDescription: help('Kurze fachliche Definition des Feldinhalts, unabhängig von der technischen Umsetzung.', 'Définition métier concise du contenu du champ, indépendante de l’implémentation technique.', 'Definizione specialistica concisa del contenuto del campo, indipendente dall’implementazione tecnica.'),
  comment: help('Optionale ergänzende Hinweise für Modellierende und Prüfende.', 'Remarques complémentaires facultatives pour les personnes qui modélisent et examinent.', 'Note supplementari facoltative per chi modella e verifica.'),
  conceptIds: help('Optionale versionierte Verknüpfungen zu semantischen I14Y-Concepts.', 'Liens versionnés facultatifs vers des concepts sémantiques I14Y.', 'Collegamenti versionati facoltativi a concetti semantici I14Y.'),
  primaryConceptId: help('Optionales primäres I14Y-Concept für den Export als dcterms:conformsTo.', 'Concept I14Y principal facultatif exporté comme dcterms:conformsTo.', 'Concetto I14Y primario facoltativo esportato come dcterms:conformsTo.'),
  valueListConceptId: help('Optionale I14Y-CodeList, welche die erlaubten Feldwerte definiert.', 'CodeList I14Y facultative qui définit les valeurs autorisées du champ.', 'CodeList I14Y facoltativa che definisce i valori ammessi per il campo.'),
};

export function logicalModelHelpLocale(language?: string | null): LogicalModelHelpLocale {
  const primary = language?.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'fr' || primary === 'it' || primary === 'de' ? primary : 'de';
}

let tooltipSequence = 0;

@Directive({ selector: '[dacaFieldHelp]', standalone: true })
export class LogicalModelFieldHelpDirective implements AfterViewInit, OnDestroy {
  @Input({ required: true }) dacaFieldHelp = '';

  private readonly tooltipId = `logical-model-field-help-${++tooltipSequence}`;
  private tooltip: HTMLDivElement | null = null;
  private trigger: HTMLButtonElement | null = null;
  private describedControl: HTMLElement | null = null;

  constructor(
    private readonly element: ElementRef<HTMLElement>,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  ngAfterViewInit(): void {
    const text = LOGICAL_MODEL_FIELD_HELP[this.dacaFieldHelp];
    if (!text) return;
    const locale = logicalModelHelpLocale(this.document.defaultView?.navigator.language);
    const tooltip = this.document.createElement('div');
    tooltip.id = this.tooltipId;
    tooltip.className = 'daca-glossary-tooltip daca-field-help-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = text[locale];
    tooltip.hidden = true;
    this.document.body.append(tooltip);
    this.tooltip = tooltip;

    const trigger = this.document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'daca-field-help-trigger';
    trigger.textContent = 'i';
    trigger.hidden = true;
    trigger.setAttribute('aria-label', locale === 'fr' ? 'Afficher la description du champ' : locale === 'it' ? 'Mostra la descrizione del campo' : 'Feldbeschreibung anzeigen');
    trigger.setAttribute('aria-describedby', this.tooltipId);
    trigger.addEventListener('click', (event) => this.toggleFromTrigger(event));
    trigger.addEventListener('mouseenter', () => this.open());
    trigger.addEventListener('focus', () => this.open());
    trigger.addEventListener('blur', () => this.close());
    this.element.nativeElement.append(trigger);
    this.element.nativeElement.classList.add('daca-field-help');
    this.trigger = trigger;

    this.describedControl = this.element.nativeElement.querySelector<HTMLElement>('input, select, textarea');
    if (this.describedControl) {
      const existing = this.describedControl.getAttribute('aria-describedby')?.trim();
      this.describedControl.setAttribute('aria-describedby', [existing, this.tooltipId].filter(Boolean).join(' '));
    }
  }

  @HostListener('mouseenter') reveal(): void {
    this.trigger?.removeAttribute('hidden');
    this.element.nativeElement.classList.add('is-field-help-revealed');
  }

  @HostListener('focusin') onFocusIn(): void {
    this.reveal();
  }

  @HostListener('mouseleave') onMouseLeave(): void {
    this.close();
    this.hideTrigger();
  }

  @HostListener('focusout', ['$event']) onFocusOut(event: FocusEvent): void {
    if (event.relatedTarget instanceof Node && this.element.nativeElement.contains(event.relatedTarget)) return;
    this.close();
    this.hideTrigger();
  }

  open(): void {
    if (!this.tooltip || !this.trigger) return;
    this.tooltip.hidden = false;
    this.tooltip.classList.add('is-visible');
    this.positionTooltip();
  }

  close(): void {
    if (this.tooltip) {
      this.tooltip.classList.remove('is-visible');
      this.tooltip.hidden = true;
    }
  }

  @HostListener('document:keydown.escape') onEscape(): void { this.close(); }
  @HostListener('window:resize') onResize(): void { if (this.tooltip && !this.tooltip.hidden) this.positionTooltip(); }
  @HostListener('window:scroll') onScroll(): void { if (this.tooltip && !this.tooltip.hidden) this.positionTooltip(); }

  ngOnDestroy(): void {
    this.tooltip?.remove();
  }

  private toggleFromTrigger(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.tooltip?.hidden) this.open(); else this.close();
  }

  private hideTrigger(): void {
    this.trigger?.setAttribute('hidden', '');
    this.element.nativeElement.classList.remove('is-field-help-revealed');
  }

  private positionTooltip(): void {
    if (!this.tooltip || !this.trigger) return;
    const viewport = this.document.defaultView;
    if (!viewport) return;
    const anchor = this.trigger.getBoundingClientRect();
    const box = this.tooltip.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(Math.max(margin, anchor.left), Math.max(margin, viewport.innerWidth - box.width - margin));
    const below = anchor.bottom + 8;
    const top = below + box.height <= viewport.innerHeight - margin
      ? below
      : Math.max(margin, anchor.top - box.height - 8);
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }
}
