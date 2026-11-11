import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { PipelineCopy } from './documentation-pipeline';
import { DocumentationAnimationStationsComponent } from './documentation-animation-stations.component';
import { ACCESS_REQUEST_DURATION, ACCESS_REQUEST_STATIONS, sampleAccessRequest } from './documentation-access-request-animation';

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
