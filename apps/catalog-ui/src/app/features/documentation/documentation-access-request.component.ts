import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { PipelineCopy } from './documentation-pipeline';
import { DocumentationAnimationStationsComponent } from './documentation-animation-stations.component';
import { ACCESS_REQUEST_DURATION, ACCESS_REQUEST_ROUTES, ACCESS_REQUEST_STATIONS, AccessRequestMessageId, sampleAccessRequest } from './documentation-access-request-animation';

@Component({
  selector: 'daca-documentation-access-request',
  standalone: true,
  imports: [DocumentationAnimationStationsComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documentation-access-request.component.html',
  styleUrls: ['./documentation-animated.component.css', './documentation-pipeline-timeline.css', './documentation-stations.css', './documentation-access-request.component.css'],
})
export class DocumentationAccessRequestComponent {
  private readonly preferences = inject(UserPreferencesService);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  readonly duration = ACCESS_REQUEST_DURATION;
  readonly stationTimes = ACCESS_REQUEST_STATIONS;
  readonly routes = ACCESS_REQUEST_ROUTES;
  readonly position = signal(0);
  readonly paused = signal(false);
  readonly reducedMotion = signal(false);
  readonly hidden = signal(this.document.hidden);
  readonly running = computed(() => !this.paused() && !this.reducedMotion() && !this.hidden());
  readonly state = computed(() => sampleAccessRequest(this.position()));
  readonly title: PipelineCopy = ['Daten finden und Zugriff beantragen', 'Trouver des données et demander l’accès', 'Trovare dati e richiedere l’accesso', 'Find data and request access'];
  readonly stations: readonly { title: PipelineCopy; subtitle: PipelineCopy; detail: PipelineCopy }[] = [
    { title: ['Daten finden', 'Trouver des données', 'Trovare dati', 'Find data'],
      subtitle: ['Prosametadaten', 'Métadonnées descriptives', 'Metadati descrittivi', 'Prose metadata'],
      detail: ['Der Data Analyst sucht im DaCa nach Thema, Beschreibung und Zweck. Die Prosametadaten helfen, passende Daten zu finden und fachlich einzuordnen.', 'Le Data Analyst recherche dans DaCa par thème, description et finalité. Les métadonnées descriptives permettent de trouver les données pertinentes et de comprendre leur contexte.', 'Il Data Analyst cerca in DaCa per tema, descrizione e scopo. I metadati descrittivi aiutano a trovare i dati pertinenti e a comprenderne il contesto.', 'The Data Analyst searches DaCa by topic, description and purpose. Prose metadata helps find relevant data and understand its business context.'] },
    { title: ['Struktur verstehen', 'Comprendre la structure', 'Comprendere la struttura', 'Understand structure'],
      subtitle: ['Introspektionsmetadaten', 'Métadonnées d’introspection', 'Metadati di introspezione', 'Introspection metadata'],
      detail: ['Zuerst wird Zugriff auf Introspektionsmetadaten beantragt. Nach Freigabe durch den Data Owner werden beispielsweise Schema, Felder und Datentypen sichtbar. Nutzlastdaten bleiben geschützt.', 'L’accès aux métadonnées d’introspection est demandé en premier. Après autorisation du Data Owner, le schéma, les champs et les types deviennent visibles. Les données utiles restent protégées.', 'Si richiede prima l’accesso ai metadati di introspezione. Dopo l’autorizzazione del Data Owner diventano visibili schema, campi e tipi. I dati effettivi restano protetti.', 'Access to introspection metadata is requested first. Following Data Owner approval, the schema, fields and types become visible. Payload data stays protected.'] },
    { title: ['Nutzlast beantragen', 'Demander les données', 'Richiedere i dati', 'Request payload'],
      subtitle: ['Elektronischer Antrag im DaCa', 'Demande électronique dans DaCa', 'Richiesta elettronica in DaCa', 'Electronic request in DaCa'],
      detail: ['Erst jetzt folgt ein eigener elektronischer Antrag im DaCa: für welche Daten, zu welchem Zweck und für welche Nutzung – etwa Queries oder Data Sourcing Tasks. Der Data Owner entscheidet über die Freigabe.', 'Une demande électronique distincte suit dans DaCa : quelles données, pour quelle finalité et quel usage, par exemple des requêtes ou des Data Sourcing Tasks. Le Data Owner décide de l’autorisation.', 'Solo ora segue una richiesta elettronica separata in DaCa: quali dati, per quale scopo e utilizzo, ad esempio query o Data Sourcing Tasks. Il Data Owner decide sull’autorizzazione.', 'Only then is a separate electronic request submitted in DaCa: which data, for what purpose and for which use, such as queries or Data Sourcing Tasks. The Data Owner decides whether to grant access.'] },
  ];
  readonly fields: readonly PipelineCopy[] = [
    ['Schema', 'Schéma', 'Schema', 'Schema'], ['Felder', 'Champs', 'Campi', 'Fields'], ['Datentypen', 'Types de données', 'Tipi di dati', 'Data types'],
  ];
  readonly applicationFields: readonly PipelineCopy[] = [
    ['Daten', 'Données', 'Dati', 'Data'], ['Zweck', 'Finalité', 'Scopo', 'Purpose'], ['Nutzung', 'Usage', 'Utilizzo', 'Usage'],
  ];
  readonly legend: readonly { icon: string; label: PipelineCopy }[] = [
    { icon: 'search', label: ['Suchanfrage', 'Recherche', 'Ricerca', 'Search query'] },
    { icon: 'document', label: ['Prosametadaten', 'Métadonnées descriptives', 'Metadati descrittivi', 'Prose metadata'] },
    { icon: 'identity', label: ['Zugriffsantrag', 'Demande d’accès', 'Richiesta di accesso', 'Access request'] },
    { icon: 'permission', label: ['Freigabe', 'Autorisation', 'Autorizzazione', 'Approval'] },
    { icon: 'shield-check', label: ['Zugriffsrichtlinie', 'Politique d’accès', 'Policy di accesso', 'Access policy'] },
    { icon: 'table', label: ['Introspektionsmetadaten', 'Métadonnées d’introspection', 'Metadati di introspezione', 'Introspection metadata'] },
  ];
  readonly messageCopy: Record<AccessRequestMessageId, PipelineCopy> = {
    search: ['Data Analyst → DaCa: Suche nach Thema, Beschreibung und Zweck.', 'Data Analyst → DaCa : recherche par thème, description et finalité.', 'Data Analyst → DaCa: ricerca per tema, descrizione e scopo.', 'Data Analyst → DaCa: search by topic, description and purpose.'],
    prose: ['DaCa → Data Analyst: Prosametadaten zu passenden Daten.', 'DaCa → Data Analyst : métadonnées descriptives des données pertinentes.', 'DaCa → Data Analyst: metadati descrittivi dei dati pertinenti.', 'DaCa → Data Analyst: prose metadata for relevant data.'],
    'introspection-application': ['Data Analyst → DaCa: Zugriff auf Introspektionsmetadaten beantragen.', 'Data Analyst → DaCa : demander l’accès aux métadonnées d’introspection.', 'Data Analyst → DaCa: richiedere accesso ai metadati di introspezione.', 'Data Analyst → DaCa: request access to introspection metadata.'],
    'introspection-review': ['DaCa → Data Owner: Introspektionsantrag zur Prüfung weiterleiten.', 'DaCa → Data Owner : transmettre la demande d’introspection pour examen.', 'DaCa → Data Owner: inoltrare la richiesta di introspezione per verifica.', 'DaCa → Data Owner: forward the introspection request for review.'],
    approval: ['Data Owner → DaCa: Introspektion freigeben; Nutzlast bleibt geschützt.', 'Data Owner → DaCa : autoriser l’introspection ; les données utiles restent protégées.', 'Data Owner → DaCa: autorizzare l’introspezione; i dati effettivi restano protetti.', 'Data Owner → DaCa: approve introspection; payload stays protected.'],
    policy: ['DaCa (PAP) → SDAL: Zugriffsrichtlinie bereitstellen. Sie bleibt zentral im DaCa gespeichert.', 'DaCa (PAP) → SDAL : fournir la politique d’accès, conservée dans DaCa.', 'DaCa (PAP) → SDAL: fornire la policy di accesso, conservata in DaCa.', 'DaCa (PAP) → SDAL: provide the access policy, retained centrally in DaCa.'],
    'introspection-query': ['Data Analyst → SDAL: Introspektionsmetadaten mit persönlicher Berechtigung abrufen.', 'Data Analyst → SDAL : consulter les métadonnées avec son autorisation personnelle.', 'Data Analyst → SDAL: consultare i metadati con la propria autorizzazione.', 'Data Analyst → SDAL: retrieve introspection metadata with personal permission.'],
    'source-query': ['SDAL → Data Source: Freigegebene Strukturinformationen abfragen.', 'SDAL → Data Source : interroger les informations de structure autorisées.', 'SDAL → Data Source: interrogare le informazioni strutturali autorizzate.', 'SDAL → Data Source: query the permitted structural information.'],
    'source-metadata': ['Data Source → SDAL: Schema, Felder und Datentypen zurückgeben.', 'Data Source → SDAL : retourner le schéma, les champs et les types.', 'Data Source → SDAL: restituire schema, campi e tipi.', 'Data Source → SDAL: return schema, fields and data types.'],
    metadata: ['SDAL → Data Analyst: Freigegebene Introspektionsmetadaten liefern. Der Zugriff wird protokolliert.', 'SDAL → Data Analyst : fournir les métadonnées autorisées. L’accès est journalisé.', 'SDAL → Data Analyst: fornire i metadati autorizzati. L’accesso viene registrato.', 'SDAL → Data Analyst: deliver permitted introspection metadata. The access is logged.'],
    'payload-application': ['Data Analyst → DaCa: Separaten Nutzlastantrag mit Daten, Zweck und Nutzung einreichen.', 'Data Analyst → DaCa : soumettre une demande distincte précisant données, finalité et usage.', 'Data Analyst → DaCa: inviare una richiesta separata con dati, scopo e utilizzo.', 'Data Analyst → DaCa: submit a separate payload request with data, purpose and usage.'],
    'payload-review': ['DaCa → Data Owner: Nutzlastantrag zur Entscheidung weiterleiten.', 'DaCa → Data Owner : transmettre la demande de données pour décision.', 'DaCa → Data Owner: inoltrare la richiesta di dati per decisione.', 'DaCa → Data Owner: forward the payload request for a decision.'],
  };
  readonly messageDescription = computed<PipelineCopy>(() => {
    const state = this.state();
    if (state.message) return this.messageCopy[state.message.id];
    if (state.payloadAtOwner) return ['Data Owner prüft den Nutzlastantrag. Die Entscheidung steht aus.', 'Le Data Owner examine la demande de données. La décision est en attente.', 'Il Data Owner esamina la richiesta di dati. La decisione è in attesa.', 'The Data Owner reviews the payload request. The decision is pending.'];
    if (state.payloadSubmitted) return ['Der Nutzlastantrag ist im DaCa eingegangen.', 'La demande de données est reçue dans DaCa.', 'La richiesta di dati è ricevuta in DaCa.', 'DaCa has received the payload request.'];
    if (state.station === 2) return ['Data Analyst beschreibt Daten, Zweck und Nutzung im elektronischen Antrag.', 'Le Data Analyst précise données, finalité et usage dans la demande.', 'Il Data Analyst descrive dati, scopo e utilizzo nella richiesta.', 'The Data Analyst describes data, purpose and usage in the application.'];
    if (state.metadataVisible) return ['Die Struktur ist sichtbar. Nutzlastdaten bleiben geschützt.', 'La structure est visible. Les données utiles restent protégées.', 'La struttura è visibile. I dati effettivi restano protetti.', 'The structure is visible. Payload data stays protected.'];
    if (state.introspectionRequest >= 1) return ['Data Owner prüft den Antrag auf Introspektionsmetadaten.', 'Le Data Owner examine la demande d’introspection.', 'Il Data Owner verifica la richiesta di introspezione.', 'The Data Owner reviews the introspection request.'];
    if (state.station === 1) return ['Data Analyst beantragt zuerst Zugriff auf Introspektionsmetadaten im DaCa.', 'Le Data Analyst demande d’abord l’accès aux métadonnées dans DaCa.', 'Il Data Analyst richiede prima l’accesso ai metadati in DaCa.', 'The Data Analyst first requests access to introspection metadata in DaCa.'];
    return state.found ? ['Passende Daten gefunden. DaCa liefert den fachlichen Kontext.', 'Données pertinentes trouvées. DaCa fournit le contexte métier.', 'Dati pertinenti trovati. DaCa fornisce il contesto funzionale.', 'Relevant data found. DaCa provides the business context.'] : ['Data Analyst sucht passende Daten im DaCa.', 'Le Data Analyst recherche des données dans DaCa.', 'Il Data Analyst cerca dati pertinenti in DaCa.', 'The Data Analyst searches DaCa for relevant data.'];
  });
  private frame?: number;
  private elapsed = 0;
  private lastFrame?: number;
  private lastDraw = 0;
  private readonly formatter = computed(() => new Intl.NumberFormat(this.preferences.language(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  constructor() {
    const view = this.document.defaultView;
    const media = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion.set(media?.matches ?? false);
    const motion = () => this.reducedMotion.set(media?.matches ?? false);
    const visibility = () => this.hidden.set(this.document.hidden);
    media?.addEventListener('change', motion);
    this.document.addEventListener('visibilitychange', visibility);
    effect(onCleanup => {
      if (this.running() && view) this.zone.runOutsideAngular(() => {
        const tick = (time: number) => {
          if (this.lastFrame !== undefined) this.elapsed = (this.elapsed + Math.min((time - this.lastFrame) / 1000, .1)) % this.duration;
          this.lastFrame = time;
          if (time - this.lastDraw >= 32) {
            this.lastDraw = time;
            this.zone.run(() => this.position.set(this.elapsed));
          }
          this.frame = view.requestAnimationFrame(tick);
        };
        this.frame = view.requestAnimationFrame(tick);
      });
      onCleanup(() => this.stop());
    });
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      media?.removeEventListener('change', motion);
      this.document.removeEventListener('visibilitychange', visibility);
    });
  }
  private stop(): void {
    if (this.frame !== undefined) this.document.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.lastFrame = undefined;
  }
  seekTo(time: number): void {
    if (!Number.isFinite(time)) return;
    this.paused.set(true);
    this.stop();
    this.elapsed = Math.max(0, Math.min(this.duration, time));
    this.position.set(this.elapsed);
  }
  seekInput(event: Event): void { this.seekTo(Number((event.target as HTMLInputElement).value)); }
  selectStation(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < this.stationTimes.length) this.seekTo(this.stationTimes[index]);
  }
  restart(): void { this.elapsed = 0; this.lastFrame = undefined; this.position.set(0); this.paused.set(false); }
  togglePlayback(): void {
    if (this.paused() && this.position() >= this.duration) this.restart();
    else this.paused.set(!this.paused());
  }
  seconds(value: number): string { return this.formatter().format(value); }
  formWidth(row: number): number { return Math.max(0, Math.min(1, this.state().form * 3 - row)) * 68; }
  tr(copy: PipelineCopy): string { return catalogCopy(copy, this.preferences.language()); }
}
