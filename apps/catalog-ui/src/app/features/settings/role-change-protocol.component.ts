import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentationApiService, RoleChangeEvent } from '../../core/documentation-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { RoleTermComponent } from '../documentation/glossary-word.component';

type Copy = readonly [string, string, string, string];

@Component({
  selector: 'daca-role-change-protocol',
  standalone: true,
  imports: [RouterLink, RoleTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="protocol" aria-labelledby="protocol-title">
      <header class="protocol-intro">
        <div><p class="daca-eyebrow">{{ tr(['NACHVOLLZIEHBARKEIT', 'TRAÇABILITÉ', 'TRACCIABILITÀ', 'TRACEABILITY']) }}</p>
          <h2 id="protocol-title">{{ tr(['Änderungen der Rollen', 'Modifications des rôles', 'Modifiche ai ruoli', 'Role changes']) }}</h2>
          <p>{{ tr(['Zuweisungen, Änderungen und Entzüge werden fortlaufend protokolliert. Bestehende Zuordnungen beim Start des Protokolls sind als Anfangsbestand markiert.', 'Les attributions, modifications et retraits sont consignés dans l’ordre. Les attributions préexistantes sont marquées comme état initial.', 'Assegnazioni, modifiche e revoche sono registrate in sequenza. Le assegnazioni preesistenti sono indicate come stato iniziale.', 'Assignments, changes and removals are recorded in sequence. Pre-existing assignments are marked as the initial state.']) }}</p></div>
        <a routerLink="/settings/responsibilities">{{ tr(['Zur Übersicht', 'Vue d’ensemble', 'Alla panoramica', 'To overview']) }} →</a>
      </header>
      @if (loading()) { <p class="protocol-state" aria-live="polite">{{ tr(['Protokoll wird geladen …', 'Chargement du journal…', 'Caricamento del registro…', 'Loading protocol…']) }}</p> }
      @if (error()) { <p class="protocol-state error" role="alert">{{ error() }} <button type="button" (click)="reload()">{{ tr(['Erneut laden', 'Réessayer', 'Riprova', 'Retry']) }}</button></p> }
      @if (!loading() && !error()) {
        <label class="protocol-search">{{ tr(['Geladene Einträge filtern', 'Filtrer les entrées chargées', 'Filtra le voci caricate', 'Filter loaded entries']) }}
          <input type="search" [value]="query()" (input)="query.set(inputValue($event))" [placeholder]="tr(['Person, Rolle oder Objekt', 'Personne, rôle ou objet', 'Persona, ruolo o oggetto', 'Person, role or object'])">
        </label>
        <div class="protocol-table-wrap"><table>
          <thead><tr><th scope="col">#</th><th scope="col">{{ tr(['Zeitpunkt', 'Date', 'Data', 'Date']) }}</th><th scope="col">{{ tr(['Änderung', 'Modification', 'Modifica', 'Change']) }}</th><th scope="col">{{ tr(['Person / Rolle', 'Personne / rôle', 'Persona / ruolo', 'Person / role']) }}</th><th scope="col">{{ tr(['Bereich', 'Périmètre', 'Ambito', 'Scope']) }}</th><th scope="col">{{ tr(['Ausgeführt von', 'Effectué par', 'Eseguito da', 'Changed by']) }}</th></tr></thead>
          <tbody>@for (entry of visible(); track entry.sequence) {
            <tr><td class="sequence">{{ entry.sequence }}</td><td><time [attr.datetime]="entry.occurredAt">{{ timestamp(entry.occurredAt) }}</time></td>
              <td><span class="action" [class.removed]="entry.action === 'removed'">{{ actionLabel(entry.action) }}</span></td>
              <td><strong>{{ entry.subjectName }}</strong><br><daca-role-term [role]="entry.role" />
                @if (changeDetail(entry); as detail) { <small>{{ detail }}</small> }
              </td><td><strong>{{ entry.scopeName }}</strong><small>{{ scopeLabel(entry.scopeType) }}</small></td>
              <td>{{ entry.actorUserId === 'migration' ? tr(['Datenübernahme', 'Reprise des données', 'Migrazione dati', 'Data migration']) : entry.actorName }}</td></tr>
          } @empty { <tr><td colspan="6" class="empty">{{ tr(['Keine passenden Einträge.', 'Aucune entrée correspondante.', 'Nessuna voce corrispondente.', 'No matching entries.']) }}</td></tr> }</tbody>
        </table></div>
        @if (nextBefore(); as cursor) { <button type="button" class="more" [disabled]="loadingMore()" (click)="loadMore(cursor)">{{ tr(['Ältere Einträge laden', 'Charger les entrées précédentes', 'Carica voci precedenti', 'Load older entries']) }}</button> }
      }
    </section>
  `,
  styles: [`
    .protocol{border:1px solid var(--daca-border);border-top:5px solid var(--daca-red);background:var(--daca-surface)}
    .protocol-intro{display:flex;align-items:start;justify-content:space-between;gap:20px;padding:24px 28px;border-bottom:1px solid var(--daca-border)}
    .protocol-intro h2{font-size:1.35rem;margin:.3rem 0}.protocol-intro p:last-child{max-width:760px;color:var(--daca-muted);line-height:1.5;margin:.4rem 0 0}.protocol-intro a{white-space:nowrap;color:var(--daca-blue);font-weight:700}
    .protocol-search{display:grid;gap:7px;margin:22px 28px;font-size:.75rem;font-weight:750;color:var(--daca-muted)}.protocol-search input{max-width:440px;min-height:43px;border:1px solid var(--daca-border-strong);padding:8px 12px;background:var(--daca-surface);color:var(--daca-ink);font:inherit;font-size:.9rem}
    .protocol-table-wrap{overflow-x:auto}.protocol table{width:100%;border-collapse:collapse;text-align:left;min-width:760px}.protocol th{background:var(--daca-blue-soft);font-size:.71rem;text-transform:uppercase;letter-spacing:.03em;color:var(--daca-muted)}.protocol th,.protocol td{padding:13px 14px;border-bottom:1px solid var(--daca-border);vertical-align:top}.protocol th:first-child,.protocol td:first-child{padding-left:28px}.protocol td{font-size:.84rem}.protocol td strong{font-weight:750}.protocol td small{display:block;margin-top:4px;color:var(--daca-muted)}.sequence{font-variant-numeric:tabular-nums;color:var(--daca-muted)}.action{display:inline-block;padding:3px 8px;background:var(--daca-blue-soft);color:var(--daca-blue);font-weight:750}.action.removed{background:var(--daca-red-soft,#fff1f2);color:var(--daca-red)}.empty,.protocol-state{padding:25px 28px;color:var(--daca-muted)}.protocol-state.error{color:var(--daca-red)}.protocol-state button{background:none;border:0;color:var(--daca-blue);text-decoration:underline;cursor:pointer}.more{margin:20px 28px;border:1px solid var(--daca-border-strong);padding:10px 14px;background:var(--daca-surface);color:var(--daca-blue);font-weight:750;cursor:pointer}.more:disabled{opacity:.5}@media(max-width:850px){.protocol-intro{display:block}.protocol-intro a{display:inline-block;margin-top:15px}}
  `],
})
export class RoleChangeProtocolComponent {
  private readonly api = inject(DocumentationApiService);
  readonly preferences = inject(UserPreferencesService);
  readonly entries = signal<RoleChangeEvent[]>([]);
  readonly nextBefore = signal<number | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly query = signal('');
  readonly visible = computed(() => {
    const needle = this.query().trim().toLocaleLowerCase();
    return this.entries().filter((entry) => !needle || [entry.subjectName, entry.actorName, entry.scopeName, entry.role, entry.action].some((part) => part.toLocaleLowerCase().includes(needle)));
  });

  constructor() {
    effect(() => { this.preferences.language(); this.reload(); });
  }
  tr(copy: Copy): string { return copy[({ de: 0, fr: 1, it: 2, en: 3 })[this.preferences.language()]]; }
  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  reload(): void {
    this.loading.set(true); this.error.set(''); this.entries.set([]); this.nextBefore.set(null);
    this.api.roleChanges(this.preferences.language()).subscribe({
      next: (page) => { this.entries.set(page.items); this.nextBefore.set(page.nextBefore); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.tr(['Das Protokoll konnte nicht geladen werden.', 'Impossible de charger le journal.', 'Impossibile caricare il registro.', 'Could not load the protocol.'])); },
    });
  }
  loadMore(before: number): void {
    this.loadingMore.set(true);
    this.api.roleChanges(this.preferences.language(), before).subscribe({
      next: (page) => { this.entries.update((rows) => [...rows, ...page.items]); this.nextBefore.set(page.nextBefore); this.loadingMore.set(false); },
      error: () => { this.loadingMore.set(false); this.error.set(this.tr(['Ältere Einträge konnten nicht geladen werden.', 'Impossible de charger les anciennes entrées.', 'Impossibile caricare le voci precedenti.', 'Could not load older entries.'])); },
    });
  }
  timestamp(value: string): string { return new Intl.DateTimeFormat(this.preferences.language(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich' }).format(new Date(value)); }
  actionLabel(action: RoleChangeEvent['action']): string {
    const labels: Record<RoleChangeEvent['action'], Copy> = {
      baseline: ['Anfangsbestand', 'État initial', 'Stato iniziale', 'Initial state'],
      assigned: ['Zugewiesen', 'Attribué', 'Assegnato', 'Assigned'],
      changed: ['Geändert', 'Modifié', 'Modificato', 'Changed'],
      removed: ['Entzogen', 'Retiré', 'Revocato', 'Removed'],
    };
    return this.tr(labels[action]);
  }
  scopeLabel(scope: string): string {
    const labels: Record<string, Copy> = {
      organization: ['Organisation', 'Organisation', 'Organizzazione', 'Organization'],
      domain: ['Domäne', 'Domaine', 'Dominio', 'Domain'],
      logical_model: ['Logisches Modell', 'Modèle logique', 'Modello logico', 'Logical model'],
      physical_representation: ['Physische Repräsentation', 'Représentation physique', 'Rappresentazione fisica', 'Physical representation'],
      data_product: ['Datenprodukt', 'Produit de données', 'Prodotto dati', 'Data product'],
      dataset_version: ['Logisches Modell', 'Modèle logique', 'Modello logico', 'Logical model'],
    };
    return this.tr(labels[scope] ?? [scope, scope, scope, scope]);
  }
  changeDetail(entry: RoleChangeEvent): string {
    if (entry.action !== 'changed') return '';
    const before = entry.before ?? {}; const after = entry.after ?? {};
    const parts: string[] = [];
    if (before['userId'] !== after['userId']) parts.push(`${before['userId'] ?? '–'} → ${after['userId'] ?? '–'}`);
    if (before['role'] !== after['role']) parts.push(`${before['role'] ?? '–'} → ${after['role'] ?? '–'}`);
    if (before['delegatedOwnerUserId'] !== after['delegatedOwnerUserId']) parts.push(`${before['delegatedOwnerUserId'] ?? '–'} → ${after['delegatedOwnerUserId'] ?? '–'}`);
    return parts.join(' · ');
  }
}
