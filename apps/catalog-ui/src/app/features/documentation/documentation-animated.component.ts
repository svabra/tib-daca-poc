import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { PIPELINE_STAGES, PipelineCopy } from './documentation-pipeline';
import { DocumentationPipelineSceneComponent } from './documentation-pipeline-scene.component';
import { PIPELINE_CYCLE, PRODUCT_DEPARTURE, PRODUCT_DISTRIBUTION_START } from './documentation-pipeline-animation';
import { SOURCING_CYCLE } from './documentation-data-sourcing-animation';
import { ACCESS_CYCLE } from './documentation-data-access-animation';
import { ACCESS_REQUEST_DURATION } from './documentation-access-request-animation';

const STAGE_TIMES = [0, 2.4, 3.8, 11.4, PRODUCT_DEPARTURE, PRODUCT_DISTRIBUTION_START] as const;

@Component({
  selector: 'daca-documentation-animated',
  standalone: true,
  imports: [RouterLink, DocumentationPipelineSceneComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documentation-animated.component.html',
  styleUrls: ['./documentation-animated.component.css', './documentation-pipeline-timeline.css', './documentation-animation-index.css'],
})
export class DocumentationAnimatedComponent {
  private readonly preferences = inject(UserPreferencesService);
  private readonly document = inject(DOCUMENT);
  readonly stages = PIPELINE_STAGES;
  readonly step = signal(0);
  readonly paused = signal(false);
  readonly reducedMotion = signal(false);
  readonly hidden = signal(this.document.hidden);
  readonly running = computed(() => !this.paused() && !this.reducedMotion() && !this.hidden());
  readonly selected = computed(() => this.stages[this.step()]);
  readonly duration = PIPELINE_CYCLE;
  readonly animations: readonly { route: string; fragment?: string; icon: string; duration: number; title: PipelineCopy; detail: PipelineCopy }[] = [
    { route: '/documentation/animated', fragment: 'pipeline-title', icon: 'pipeline', duration: PIPELINE_CYCLE,
      title: ['Data Pipeline · Übersicht', 'Data Pipeline · Vue d’ensemble', 'Data Pipeline · Panoramica', 'Data Pipeline · Overview'],
      detail: ['Von den Datenquellen zum geschützten Datenprodukt und seinen Konsumenten.', 'Des sources au produit de données protégé et à ses consommateurs.', 'Dalle fonti al prodotto di dati protetto e ai suoi consumatori.', 'From data sources to a protected data product and its consumers.'] },
    { route: '/documentation/animated/data-sources/sourcing', icon: 'database', duration: SOURCING_CYCLE,
      title: ['Data Sourcing', 'Data Sourcing', 'Data Sourcing', 'Data Sourcing'],
      detail: ['Einen PostgreSQL Sourcing Task beschreiben, prüfen und ausführen.', 'Décrire, vérifier et exécuter une Sourcing Task PostgreSQL.', 'Descrivere, verificare ed eseguire una Sourcing Task PostgreSQL.', 'Describe, check and execute a PostgreSQL Sourcing Task.'] },
    { route: '/documentation/animated/data-consumers/access-request', icon: 'identity', duration: ACCESS_REQUEST_DURATION,
      title: ['Daten finden und Zugriff beantragen', 'Trouver des données et demander l’accès', 'Trovare dati e richiedere l’accesso', 'Find data and request access'],
      detail: ['Prosametadaten entdecken, Struktur verstehen und Nutzlastdaten beantragen.', 'Découvrir les métadonnées descriptives, comprendre la structure et demander les données.', 'Scoprire i metadati descrittivi, comprendere la struttura e richiedere i dati.', 'Discover prose metadata, understand structure and request payload data.'] },
    { route: '/documentation/animated/data-consumers/access-management', icon: 'shield-check', duration: ACCESS_CYCLE,
      title: ['Data Access Management', 'Data Access Management', 'Data Access Management', 'Data Access Management'],
      detail: ['Vom abgelehnten Zugriff über den Antrag beim Data Owner zur aktiven Freigabe.', 'Du refus à l’autorisation active via une demande au Data Owner.', 'Dal rifiuto al permesso attivo tramite una richiesta al Data Owner.', 'From denied access through a Data Owner application to active permission.'] },
  ];
  readonly position = signal(0);
  private readonly scene = viewChild(DocumentationPipelineSceneComponent);
  private readonly timeFormatter = computed(() => new Intl.NumberFormat(this.preferences.language(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  constructor() {
    const destroyRef = inject(DestroyRef);
    const media = this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion.set(media?.matches ?? false);
    const updateMotion = () => this.reducedMotion.set(media?.matches ?? false);
    const updateVisibility = () => this.hidden.set(this.document.hidden);
    media?.addEventListener('change', updateMotion);
    this.document.addEventListener('visibilitychange', updateVisibility);
    destroyRef.onDestroy(() => {
      media?.removeEventListener('change', updateMotion);
      this.document.removeEventListener('visibilitychange', updateVisibility);
    });
  }

  updatePosition(seconds: number): void {
    this.position.set(seconds);
    this.step.set(this.stageAt(seconds));
  }

  seekTo(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.paused.set(true);
    const position = Math.max(0, Math.min(this.duration, seconds));
    this.position.set(position);
    this.step.set(this.stageAt(position));
    this.scene()?.seek(position);
  }

  restart(): void {
    this.step.set(0);
    this.position.set(0);
    this.paused.set(false);
    this.scene()?.seek(0);
  }

  togglePlayback(): void {
    if (this.paused() && this.position() >= this.duration) this.scene()?.seek(0);
    this.paused.set(!this.paused());
  }

  seekInput(event: Event): void { this.seekTo(Number((event.target as HTMLInputElement).value)); }

  seconds(value: number): string {
    return this.timeFormatter().format(value);
  }

  private stageAt(seconds: number): number {
    for (let index = STAGE_TIMES.length - 1; index >= 0; index--) {
      if (seconds >= STAGE_TIMES[index]) return index;
    }
    return 0;
  }

  selectStep(index: number): void {
    this.paused.set(true);
    this.step.set(index);
  }

  pauseForSourceSourcing(): void { this.selectStep(0); }
  pauseForConsumerAccess(): void { this.selectStep(5); }

  nextStep(): void { this.selectStep((this.step() + 1) % this.stages.length); }
  tr(copy: PipelineCopy): string { return catalogCopy(copy, this.preferences.language()); }
}
