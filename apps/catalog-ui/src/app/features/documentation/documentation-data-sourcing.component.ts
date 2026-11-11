import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterRenderEffect, computed, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { PipelineCopy } from './documentation-pipeline';
import { DocumentationAnimationStationsComponent } from './documentation-animation-stations.component';
import { DocumentationPolicyHelpComponent } from './documentation-policy-help.component';
import { SOURCING_CYCLE, SOURCING_EVENTS, SOURCING_STATION_TIMES, SOURCING_COLOR, SourcingAnimator, SourcingKind, SourcingState, sampleSourcingState } from './documentation-data-sourcing-animation';

@Component({
  selector: 'daca-documentation-data-sourcing',
  standalone: true,
  imports: [DocumentationAnimationStationsComponent, RouterLink, DocumentationPolicyHelpComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documentation-data-sourcing.component.html',
  styleUrls: ['./documentation-animated.component.css', './documentation-pipeline-timeline.css', './documentation-data-sourcing.component.css', './documentation-stations.css'],
})
export class DocumentationDataSourcingComponent {
  private readonly preferences = inject(UserPreferencesService);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly scene = viewChild<ElementRef<SVGElement>>('scene');
  private animator?: SourcingAnimator;
  readonly duration = SOURCING_CYCLE;
  readonly position = signal(0);
  readonly paused = signal(false);
  readonly reducedMotion = signal(false);
  readonly hidden = signal(this.document.hidden);
  readonly running = computed(() => !this.paused() && !this.reducedMotion() && !this.hidden());
  readonly target = signal<SourcingKind>('structured');
  readonly state = computed(() => sampleSourcingState(this.position(), this.target()));
  readonly sourceColor = SOURCING_COLOR;
  readonly events = SOURCING_EVENTS;
  readonly stationTimes = SOURCING_STATION_TIMES;
  readonly legend: readonly { id: string; title: PipelineCopy; detail: PipelineCopy }[] = [
    { id: 'person', title: ['Data Analyst', 'Data Analyst', 'Data Analyst', 'Data Analyst'], detail: ['Beschreibt den Sourcing Task', 'Décrit la Sourcing Task', 'Descrive la Sourcing Task', 'Describes the Sourcing Task'] },
    { id: 'database', title: ['Datenbank', 'Base de données', 'Database', 'Database'], detail: ['Datenquelle PostgreSQL', 'Source PostgreSQL', 'Fonte PostgreSQL', 'PostgreSQL data source'] },
    { id: 'gear', title: ['Zahnrad', 'Engrenage', 'Ingranaggio', 'Cogwheel'], detail: ['Geplante Transformation', 'Transformation prévue', 'Trasformazione prevista', 'Planned transformation'] },
    { id: 'bucket', title: ['S3-Bucket', 'Bucket S3', 'Bucket S3', 'S3 bucket'], detail: ['Unstrukturierte Ablage', 'Stockage non structuré', 'Archivio non strutturato', 'Unstructured storage'] },
    { id: 'table', title: ['Tabelle', 'Table', 'Tabella', 'Table'], detail: ['Strukturierte Ablage', 'Stockage structuré', 'Archivio strutturato', 'Structured storage'] },
    { id: 'door', title: ['Tür', 'Porte', 'Porta', 'Door'], detail: ['Öffnet nach Freigabe gemäss Zugriffsrichtlinie', 'S’ouvre après autorisation', 'Si apre dopo l’autorizzazione', 'Opens after policy approval'] },
    { id: 'conveyor', title: ['Förderband', 'Convoyeur', 'Nastro trasportatore', 'Conveyor'], detail: ['Extraktion und Datentransport', 'Extraction et transfert', 'Estrazione e trasferimento', 'Extraction and data transfer'] },
    { id: 'document', title: ['Dokument', 'Document', 'Documento', 'Document'], detail: ['Eingereichter Sourcing Task', 'Sourcing Task soumise', 'Sourcing Task inviata', 'Submitted Sourcing Task'] },
    { id: 'identity', title: ['Ausweis', 'Badge', 'Tesserino', 'Identity card'], detail: ['Personalisierte Prüfung der Zugriffsrichtlinie', 'Contrôle personnel de la politique', 'Verifica personale della policy', 'Personalized policy check'] },
    { id: 'permission', title: ['Dokument mit Häkchen', 'Document coché', 'Documento con spunta', 'Checked document'], detail: ['Freigabe und Introspektionsmetadaten', 'Autorisation et métadonnées d’introspection', 'Autorizzazione e metadati di introspezione', 'Permission and introspection metadata'] },
    { id: 'data', title: ['Blauer Punkt', 'Point bleu', 'Punto blu', 'Blue dot'], detail: ['Übertragene Daten', 'Données transférées', 'Dati trasferiti', 'Transferred data'] },
  ];
  readonly stations: readonly { title: PipelineCopy; detail: PipelineCopy }[] = [
    { title: ['Task beschreiben', 'Décrire la tâche', 'Descrivere il task', 'Describe task'], detail: ['Der Data Analyst beschreibt den Sourcing Task im UI-geführten Data Sourcing Wizard von DAAIF: zuerst die Quelle, dann die Transformation und zuletzt das Ziel.', 'Le Data Analyst décrit la Sourcing Task dans le Data Sourcing Wizard de DAAIF : d’abord la source, puis la transformation et enfin la cible.', 'Il Data Analyst descrive la Sourcing Task nel Data Sourcing Wizard di DAAIF: prima la fonte, poi la trasformazione e infine la destinazione.', 'The Data Analyst describes the Sourcing Task in DAAIF’s UI-guided Data Sourcing Wizard: first the source, then the transformation, and finally the target.'] },
    { title: ['Task übergeben', 'Transmettre la tâche', 'Trasmettere il task', 'Hand over task'], detail: ['DAAIF übergibt den beschriebenen Sourcing Task direkt nach unten an den Source Connector PostgreSQL.', 'DAAIF transmet la Sourcing Task directement au Source Connector PostgreSQL placé en dessous.', 'DAAIF trasmette la Sourcing Task direttamente al Source Connector PostgreSQL sottostante.', 'DAAIF hands the described Sourcing Task straight down to the Source Connector PostgreSQL.'] },
    { title: ['Zugriffsrichtlinie prüfen', 'Vérifier la politique', 'Verificare la policy', 'Check policy'], detail: ['Source Connector PostgreSQL verwendet die personalisierte Berechtigung des Data Analyst für den Sourcing Task. Secure Data Access Layer PostgreSQL prüft die Zugriffsrichtlinie über PEP/PDP und liefert freigegebene Introspektionsmetadaten.', 'Source Connector PostgreSQL utilise l’autorisation personnelle du Data Analyst. Secure Data Access Layer PostgreSQL vérifie la politique via PEP/PDP et fournit les métadonnées d’introspection autorisées.', 'Source Connector PostgreSQL usa l’autorizzazione personale del Data Analyst. Secure Data Access Layer PostgreSQL verifica la policy tramite PEP/PDP e fornisce i metadati di introspezione autorizzati.', 'Source Connector PostgreSQL uses the Data Analyst’s personalized permission for the Sourcing Task. Secure Data Access Layer PostgreSQL checks policy through PEP/PDP and supplies permitted introspection metadata.'] },
    { title: ['Daten übernehmen', 'Acquérir les données', 'Acquisire i dati', 'Source data'], detail: ['Nach der Freigabe fliessen Daten aus PostgreSQL durch Secure Data Access Layer PostgreSQL über Source Connector PostgreSQL in das gewählte strukturierte oder unstrukturierte Ziel im Data Lake. Secure Data Access Layer PostgreSQL setzt die Zugriffsrichtlinie durch; Source Connector PostgreSQL führt die Extraktion aus.', 'Après autorisation, les données passent de PostgreSQL par Secure Data Access Layer PostgreSQL et Source Connector PostgreSQL vers la cible structurée ou non structurée choisie dans le Data Lake. Secure Data Access Layer PostgreSQL applique la politique ; Source Connector PostgreSQL effectue l’extraction.', 'Dopo l’autorizzazione, i dati passano da PostgreSQL attraverso Secure Data Access Layer PostgreSQL e Source Connector PostgreSQL verso la destinazione strutturata o non strutturata scelta nel Data Lake. Secure Data Access Layer PostgreSQL applica la policy; Source Connector PostgreSQL esegue l’estrazione.', 'After permission, data flows from PostgreSQL through Secure Data Access Layer PostgreSQL and Source Connector PostgreSQL into the selected structured or unstructured target in the Data Lake. Secure Data Access Layer PostgreSQL enforces policy; Source Connector PostgreSQL performs extraction.'] },
  ];
  readonly cellSlots = [0, 1, 2, 3, 4, 5] as const;
  readonly targets: readonly { id: SourcingKind; title: PipelineCopy }[] = [
    { id: 'structured', title: ['Strukturiert', 'Structuré', 'Strutturato', 'Structured'] },
    { id: 'unstructured', title: ['Unstrukturiert', 'Non structuré', 'Non strutturato', 'Unstructured'] },
  ];
  private readonly statusCopy: Record<SourcingState['jobStatus'], PipelineCopy> = {
    created: ['Wizard bereit', 'Wizard prêt', 'Wizard pronto', 'Wizard ready'],
    submitted: ['Sourcing Task eingereicht', 'Sourcing Task soumise', 'Sourcing Task inviata', 'Sourcing Task submitted'],
    checking: ['Secure Data Access Layer PostgreSQL prüft den Zugriff', 'Secure Data Access Layer PostgreSQL vérifie l’accès', 'Secure Data Access Layer PostgreSQL verifica l’accesso', 'Secure Data Access Layer PostgreSQL checking access'],
    running: ['Source Connector PostgreSQL extrahiert Daten', 'Extraction par Source Connector PostgreSQL', 'Estrazione tramite Source Connector PostgreSQL', 'Source Connector PostgreSQL extracting data'],
    completed: ['Sourcing Task abgeschlossen', 'Sourcing Task terminée', 'Sourcing Task completata', 'Sourcing Task completed'],
    blocked: ['Zugriff blockiert', 'Accès bloqué', 'Accesso bloccato', 'Access blocked'],
  };
  private readonly timeFormatter = computed(() => new Intl.NumberFormat(this.preferences.language(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  constructor() {
    const view = this.document.defaultView;
    const media = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion.set(media?.matches ?? false);
    const motion = () => this.reducedMotion.set(media?.matches ?? false);
    const visibility = () => this.hidden.set(this.document.hidden);
    media?.addEventListener('change', motion);
    this.document.addEventListener('visibilitychange', visibility);
    inject(DestroyRef).onDestroy(() => {
      this.animator?.stop();
      media?.removeEventListener('change', motion);
      this.document.removeEventListener('visibilitychange', visibility);
    });
    afterRenderEffect(onCleanup => {
      const svg = this.scene()?.nativeElement;
      const running = this.running();
      if (!svg || !view) return;
      this.animator ??= new SourcingAnimator(svg, view, seconds => this.zone.run(() => this.position.set(seconds)), untracked(() => this.position()), untracked(() => this.target()));
      this.zone.runOutsideAngular(() => this.animator!.setRunning(running));
      onCleanup(() => this.animator?.stop());
    });
  }

  seekTo(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.paused.set(true);
    this.position.set(Math.max(0, Math.min(this.duration, seconds)));
    this.zone.runOutsideAngular(() => this.animator?.seek(this.position()));
  }
  seekInput(event: Event): void { this.seekTo(Number((event.target as HTMLInputElement).value)); }
  selectTarget(target: SourcingKind): void {
    this.paused.set(true);
    this.target.set(target);
    this.zone.runOutsideAngular(() => {
      this.animator?.setTarget(target);
      this.animator?.seek(this.position());
    });
  }
  selectStation(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.stations.length) return;
    this.seekTo(this.stationTimes[index]);
  }
  restart(): void {
    this.position.set(0);
    this.paused.set(false);
    this.zone.runOutsideAngular(() => this.animator?.seek(0));
  }
  togglePlayback(): void {
    if (this.paused() && this.position() >= this.duration) this.zone.runOutsideAngular(() => this.animator?.seek(0));
    this.paused.set(!this.paused());
  }
  cellX(slot: number): number { return 970 + slot % 3 * 65; }
  cellY(slot: number): number { return 195 + Math.floor(slot / 3) * 48; }
  bucketX(slot: number): number { return 990 + slot % 3 * 45; }
  bucketY(slot: number): number { return 430 + Math.floor(slot / 3) * 38; }
  connectorLabel(): string {
    return this.state().jobStatus === 'blocked' ? this.tr(['Blockiert', 'Bloqué', 'Bloccato', 'Blocked'])
      : this.state().jobStatus === 'completed' ? this.tr(['Abgeschlossen', 'Terminé', 'Completato', 'Completed'])
      : this.state().extracting ? this.tr(['Daten werden gefördert', 'Transfert des données', 'Trasferimento dei dati', 'Conveying data'])
      : this.state().jobReady ? this.tr(['Bereit zur Extraktion', 'Prêt à extraire', 'Pronto all’estrazione', 'Ready to extract'])
        : this.tr(['Wartet auf Freigabe', 'Attend l’autorisation', 'In attesa del permesso', 'Awaiting permission']);
  }
  doorLabel(): string {
    return this.state().doorOpen > 0 ? this.tr(['Zugang freigegeben', 'Accès autorisé', 'Accesso autorizzato', 'Access permitted'])
      : this.state().securityChecked ? this.tr(['Durchgang geschlossen', 'Passage fermé', 'Passaggio chiuso', 'Passage closed'])
        : this.tr(['Wartet auf Freigabe', 'Attend l’autorisation', 'In attesa del permesso', 'Awaiting permission']);
  }
  jobLabel(): string { return this.tr(this.statusCopy[this.state().jobStatus]); }
  seconds(value: number): string { return this.timeFormatter().format(value); }
  tr(copy: PipelineCopy): string { return catalogCopy(copy, this.preferences.language()); }
}
