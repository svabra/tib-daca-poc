import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterRenderEffect, computed, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { PipelineCopy } from './documentation-pipeline';
import { DocumentationAnimationStationsComponent } from './documentation-animation-stations.component';
import { DocumentationPolicyHelpComponent } from './documentation-policy-help.component';
import { ACCESS_CYCLE, ACCESS_PHASE_TIMES, AccessAnimator, AccessAuditEntry, AccessPolicyScope, AccessScope, sampleAccessState } from './documentation-data-access-animation';

@Component({
  selector: 'daca-documentation-data-access',
  standalone: true,
  imports: [DocumentationAnimationStationsComponent, RouterLink, DocumentationPolicyHelpComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documentation-data-access.component.html',
  styleUrls: ['./documentation-animated.component.css', './documentation-pipeline-timeline.css', './documentation-data-access.component.css', './documentation-data-access-policy.css'],
})
export class DocumentationDataAccessComponent {
  private readonly preferences = inject(UserPreferencesService);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly scene = viewChild<ElementRef<SVGElement>>('scene');
  private animator?: AccessAnimator;
  readonly duration = ACCESS_CYCLE;
  readonly stationTimes = ACCESS_PHASE_TIMES;
  readonly position = signal(0);
  readonly paused = signal(false);
  readonly reducedMotion = signal(false);
  readonly hidden = signal(this.document.hidden);
  readonly running = computed(() => !this.paused() && !this.reducedMotion() && !this.hidden());
  readonly scope = signal<AccessScope>('logical-model');
  readonly selectedPersistences = signal<readonly number[]>([1]);
  readonly policyScope = computed<AccessPolicyScope>(() => ({ level: this.scope(), persistenceIndexes: this.selectedPersistences() }));
  readonly state = computed(() => sampleAccessState(this.position(), undefined, true, this.policyScope()));
  readonly audit = computed(() => [...this.state().audit].reverse());
  readonly lanes = [0, 1, 2] as const;
  readonly steps: readonly { title: PipelineCopy; detail: PipelineCopy }[] = [
    { title: ['Standardmässig blockiert', 'Bloqué par défaut', 'Bloccato per impostazione predefinita', 'Blocked by default'],
      detail: ['Consumer A stellt Leseanfragen. Vor jedem Speicher prüft ein eigener SDAL den Zugriff. Ohne passende, verfügbare und aktive Zugriffsrichtlinie bleibt jede Anfrage blockiert; es fliessen keine Daten.', 'Consumer A envoie des demandes de lecture. Un SDAL distinct contrôle chaque stockage. Sans politique correspondante, disponible et active, chaque demande reste bloquée ; aucune donnée ne circule.', 'Consumer A invia richieste di lettura. Un SDAL distinto controlla ogni archivio. Senza una policy corrispondente, disponibile e attiva, ogni richiesta rimane bloccata e nessun dato viene restituito.', 'Consumer A sends read requests. A separate SDAL checks access before each store. Without a matching, available and active policy, every request remains blocked and no data is returned.'] },
    { title: ['Zugriff über DaCa beantragen', 'Demander l’accès via DaCa', 'Richiedere l’accesso tramite DaCa', 'Request access through DaCa'],
      detail: ['Nach der Ablehnung beantragt Consumer A den Lesezugriff über DaCa beim Data Owner. Der Antrag nennt die gewünschte Nutzung und den Geltungsbereich. Das Einreichen des Antrags erteilt noch keine Berechtigung.', 'Après le refus, Consumer A demande au Data Owner un accès en lecture via DaCa. La demande précise l’usage prévu et le périmètre. Son dépôt ne confère encore aucun droit.', 'Dopo il rifiuto, Consumer A richiede al Data Owner l’accesso in lettura tramite DaCa, indicando l’uso previsto e l’ambito. L’invio della richiesta non concede ancora alcun permesso.', 'After the denial, Consumer A requests read access from the Data Owner through DaCa, specifying the intended use and scope. Submitting the application does not grant permission.'] },
    { title: ['Data Owner prüft den Antrag', 'Le Data Owner examine la demande', 'Il Data Owner esamina la richiesta', 'Data Owner reviews the application'],
      detail: ['DaCa leitet den Zugriffsantrag an den zuständigen Data Owner weiter. Dieser prüft die gewünschte Nutzung und entscheidet über die Freigabe. Bis zu seiner Zustimmung und der anschliessenden Aktivierung der Zugriffsrichtlinie bleiben alle Daten gesperrt.', 'DaCa transmet la demande au Data Owner responsable, qui examine l’usage prévu et décide de l’autorisation. Les données restent bloquées jusqu’à son accord et à l’activation de la politique.', 'DaCa inoltra la richiesta al Data Owner responsabile, che valuta l’uso previsto e decide sull’autorizzazione. I dati rimangono bloccati fino al suo consenso e all’attivazione della policy.', 'DaCa forwards the application to the responsible Data Owner, who reviews the intended use and decides whether to approve it. All data remains blocked until approval and subsequent policy activation.'] },
    { title: ['Freigabe als Zugriffsrichtlinie hinterlegen', 'Enregistrer l’accord comme politique', 'Registrare il consenso nella policy', 'Record approval as a policy'],
      detail: ["Der Data Owner speichert die Zugriffsrichtlinie im DaCa-PAP (Policy Administration Point). Sie bleibt dort erhalten. Die zugehörigen SDALs erhalten ihre Zuweisung; erst nach Bestätigung und Aktivierung wird der gewählte Geltungsbereich freigegeben.", "Le Data Owner conserve la politique dans le PAP de DaCa (Policy Administration Point). Les SDAL concernés reçoivent leur attribution ; seul le périmètre choisi est autorisé après confirmation et activation.", "Il Data Owner conserva la policy nel PAP di DaCa (Policy Administration Point). Gli SDAL interessati ricevono la propria assegnazione; solo l’ambito scelto è autorizzato dopo conferma e attivazione.", "The Data Owner stores the policy in the DaCa PAP (Policy Administration Point), where it remains. The relevant SDALs receive their assignments; the chosen scope becomes accessible only after confirmation and activation."] },
    { title: ['Erneut auf Daten zugreifen', 'Accéder à nouveau aux données', 'Accedere nuovamente ai dati', 'Retry data access'],
      detail: ["Die aktive Zugriffsrichtlinie erlaubt Consumer A das Lesen im gewählten Geltungsbereich. Nur freigegebene Persistenzen liefern goldene Daten durch ihren SDAL zurück. Alle Zugriffsversuche werden automatisch protokolliert, auch abgelehnte. Andere Konsumenten oder Aktionen sowie fehlende Zugriffsrichtlinien bleiben gesperrt.", "La politique active autorise Consumer A à lire dans le périmètre choisi. Seuls les stockages autorisés renvoient des données dorées via leur SDAL. Toutes les tentatives sont journalisées automatiquement, y compris les refus. Les autres consommateurs ou actions restent bloqués.", "La policy attiva consente a Consumer A di leggere nell’ambito scelto. Solo gli archivi autorizzati restituiscono dati dorati tramite il proprio SDAL. Tutti i tentativi sono registrati automaticamente, anche quelli negati. Altri consumatori o azioni rimangono bloccati.", "The active policy lets Consumer A read within the selected scope. Only permitted stores return gold data through their SDAL. Every access attempt is logged automatically, including denials. Other consumers or actions and missing policies remain blocked."] },
  ];
  readonly stores: readonly PipelineCopy[] = [
    ['Objektspeicher / S3', 'Stockage objet / S3', 'Archivio oggetti / S3', 'Object storage / S3'],
    ['Dateien', 'Fichiers', 'File', 'Files'],
    ['Datenbank', 'Base de données', 'Banca dati', 'Database'],
  ];
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
      const policyScope = this.policyScope();
      if (!svg || !view) return;
      this.animator ??= new AccessAnimator(svg, view,
        seconds => this.zone.run(() => this.position.set(seconds)), untracked(() => this.position()));
      this.zone.runOutsideAngular(() => this.animator!.setPolicyScope(policyScope));
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
  selectStep(index: number): void { this.seekTo(ACCESS_PHASE_TIMES[index]); }
  selectScope(scope: AccessScope): void {
    this.paused.set(true);
    this.scope.set(scope);
    this.zone.runOutsideAngular(() => this.animator?.setPolicyScope(this.policyScope()));
  }
  togglePersistence(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.stores.length) return;
    this.paused.set(true);
    this.selectedPersistences.update(selected => selected.includes(index) ? selected.filter(value => value !== index) : [...selected, index].sort());
    this.zone.runOutsideAngular(() => this.animator?.setPolicyScope(this.policyScope()));
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
  gateStatus(index: number): string {
    const lane = this.state().lanes[index];
    return lane.allowed ? this.tr(['Erlaubt', 'Autorisé', 'Consentito', 'Allowed'])
      : lane.assigned ? this.tr(['Zugewiesen · blockiert', 'Attribuée · bloqué', 'Assegnata · bloccato', 'Assigned · blocked'])
        : this.tr(['Blockiert', 'Bloqué', 'Bloccato', 'Blocked']);
  }
  applicationStatus(): string {
    const copy: Record<ReturnType<typeof sampleAccessState>['applicationStage'], PipelineCopy> = {
      none: ['Keine Freigabe', 'Aucune autorisation', 'Nessuna autorizzazione', 'No permission'],
      submitting: ['Zugriffsantrag unterwegs', 'Demande en cours d’envoi', 'Invio della richiesta', 'Sending access application'],
      submitted: ['Zugriffsantrag eingegangen', 'Demande reçue', 'Richiesta ricevuta', 'Application received'],
      forwarding: ['Antrag an Data Owner', 'Demande au Data Owner', 'Richiesta al Data Owner', 'Application to Data Owner'],
      review: ['Entscheidung ausstehend', 'Décision en attente', 'Decisione in attesa', 'Decision pending'],
      approved: ['Zustimmung erteilt', 'Accord donné', 'Consenso concesso', 'Approval granted'],
    };
    return this.tr(copy[this.state().applicationStage]);
  }
  auditDecision(entry: AccessAuditEntry): string {
    return entry.decision === 'allow' ? this.tr(['Erlaubt', 'Autorisé', 'Consentito', 'Allowed']) : this.tr(['Abgelehnt', 'Refusé', 'Negato', 'Denied']);
  }
  auditReason(entry: AccessAuditEntry): string {
    const reasons: Record<AccessAuditEntry['reason'], PipelineCopy> = {
      'no-active-policy': ['Keine aktive Zugriffsrichtlinie', 'Aucune politique active', 'Nessuna policy attiva', 'No active policy'],
      'policy-unavailable': ['Zugriffsrichtlinie nicht verfügbar', 'Politique indisponible', 'Policy non disponibile', 'Policy unavailable'],
      'out-of-scope': ['Persistenz nicht freigegeben', 'Stockage non autorisé', 'Archivio non autorizzato', 'Persistence not permitted'],
      'request-mismatch': ['Anfrage passt nicht zur Zugriffsrichtlinie', 'Demande non conforme à la politique', 'Richiesta non conforme alla policy', 'Request does not match policy'],
      'allowed': ['Passende Freigabe', 'Autorisation correspondante', 'Autorizzazione corrispondente', 'Matching permission'],
    };
    return this.tr(reasons[entry.reason]);
  }
  seconds(value: number): string { return this.timeFormatter().format(value); }
  tr(copy: PipelineCopy): string { return catalogCopy(copy, this.preferences.language()); }
}
