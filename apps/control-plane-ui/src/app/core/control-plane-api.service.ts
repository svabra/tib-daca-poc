import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, of, timeout } from 'rxjs';
import { CatalogInstance, HealthEvent, SyncConfiguration, TrustGrant } from './control-plane.models';
import { FALLBACK_CATALOGS, FALLBACK_SYNC_CONFIGS, FALLBACK_TRUST_GRANTS } from './control-plane.seed';

type Collection<T> = T[] | { items: T[] };
type CatalogWire = {
  id: string;
  name: string;
  organization: string;
  environment: string;
  endpoint: string;
  apiVersion: string;
  lifecycle: 'active' | 'suspended' | 'retired';
  healthStatus: 'unknown' | 'healthy' | 'degraded' | 'unreachable';
  desiredRevision: number;
  observedRevision: number;
  capabilities: string[];
  lastCheckedAt: string | null;
  updatedAt: string;
};
type TrustWire = {
  id: string;
  providerId: string;
  consumerId: string;
  state: 'pending' | 'approved' | 'revoked' | 'expired';
  validFrom: string | null;
  validUntil: string | null;
  allowedResourceTypes: ('metadata' | 'lineage' | 'provenance' | 'policy')[];
  productFilters: string[];
  ownerFilters: string[];
  domainFilters: string[];
};
type SyncWire = {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  trustGrantId: string | null;
  direction: 'push' | 'pull';
  resourceScopes: ('metadata' | 'lineage' | 'provenance' | 'policy')[];
  schedule: string;
  enabled: boolean;
  conflictPolicy: 'origin-wins';
  revision: number;
};

@Injectable({ providedIn: 'root' })
export class ControlPlaneApiService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly catalogs = signal<readonly CatalogInstance[]>(FALLBACK_CATALOGS);
  readonly trustGrants = signal<readonly TrustGrant[]>(FALLBACK_TRUST_GRANTS);
  readonly syncConfigurations = signal<readonly SyncConfiguration[]>(FALLBACK_SYNC_CONFIGS);
  readonly loading = signal(true);
  readonly usingFallback = signal(false);
  readonly eventStreamConnected = signal(false);
  readonly lastEventAt = signal<string | null>(null);
  readonly mutationError = signal('');

  constructor() {
    this.refresh();
    this.connectHealthStream();
  }

  refresh(): void {
    this.loading.set(true);
    forkJoin({
      catalogs: this.http.get<Collection<CatalogWire>>('/api/v1/catalogs'),
      grants: this.http.get<Collection<TrustWire>>('/api/v1/trust-grants'),
      sync: this.http.get<Collection<SyncWire>>('/api/v1/sync-configurations'),
    })
      .pipe(timeout(3500), catchError(() => {
        this.usingFallback.set(true);
        return of(null);
      }))
      .subscribe((wire) => {
        if (!wire) {
          this.catalogs.set(FALLBACK_CATALOGS);
          this.trustGrants.set(FALLBACK_TRUST_GRANTS);
          this.syncConfigurations.set(FALLBACK_SYNC_CONFIGS);
          this.loading.set(false);
          return;
        }
        const catalogs = this.items(wire.catalogs).map((catalog) => this.normalizeCatalog(catalog));
        const grants = this.items(wire.grants).map((grant) => this.normalizeGrant(grant));
        const sync = this.items(wire.sync).map((configuration) => this.normalizeSync(configuration, grants));
        this.catalogs.set(catalogs.length ? catalogs : FALLBACK_CATALOGS);
        this.trustGrants.set(grants.length ? grants : FALLBACK_TRUST_GRANTS);
        this.syncConfigurations.set(sync.length ? sync : FALLBACK_SYNC_CONFIGS);
        this.usingFallback.set(false);
        this.loading.set(false);
      });
  }

  catalogName(id: string): string {
    return this.catalogs().find((catalog) => catalog.id === id)?.name ?? id;
  }

  setSyncEnabled(config: SyncConfiguration, enabled: boolean): void {
    this.mutationError.set('');
    const headers = new HttpHeaders({
      'If-Match': `"${config.revision}"`,
      'X-DaCa-Actor': 'demo-control-admin',
    });
    this.http
      .patch<SyncWire>(`/api/v1/sync-configurations/${encodeURIComponent(config.id)}`, { enabled }, { headers })
      .pipe(
        timeout(3000),
        catchError((error: HttpErrorResponse) => {
          if (error.status === 0) this.usingFallback.set(true);
          this.mutationError.set(
            error.status === 401
              ? 'The control plane rejected the demo administrator identity.'
              : error.status === 503
                ? 'The control plane is not ready. Desired state was not changed.'
                : error.status === 412
                  ? 'This sync configuration changed. Refresh before trying again.'
                  : `The sync update failed (${error.status || 'network unavailable'}).`,
          );
          return of(null);
        }),
      )
      .subscribe((updated) => {
        if (!updated) return;
        const normalized = this.normalizeSync(updated, this.trustGrants());
        this.syncConfigurations.update((configs) => configs.map((item) => (item.id === normalized.id ? normalized : item)));
      });
  }

  private connectHealthStream(): void {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/v1/events/health');
    source.onopen = () => this.eventStreamConnected.set(true);
    source.onerror = () => this.eventStreamConnected.set(false);
    const applyEvent = (raw: MessageEvent<string>) => {
      try {
        const wire = JSON.parse(raw.data) as {
          catalogId: string;
          status: CatalogInstance['health'];
          latencyMs: number | null;
          checkedAt: string;
        };
        const event: HealthEvent = {
          catalogId: wire.catalogId,
          health: wire.status,
          latencyMs: wire.latencyMs,
          observedAt: wire.checkedAt,
        };
        this.catalogs.update((catalogs) => catalogs.map((catalog) =>
          catalog.id === event.catalogId
            ? { ...catalog, health: event.health, latencyMs: event.latencyMs, lastSeenAt: event.observedAt }
            : catalog,
        ));
        this.lastEventAt.set(event.observedAt);
      } catch {
        // Ignore malformed events and retain the last trusted state.
      }
    };
    source.onmessage = applyEvent;
    source.addEventListener('health', (event) => applyEvent(event as MessageEvent<string>));
    this.destroyRef.onDestroy(() => source.close());
  }

  private items<T>(collection: Collection<T>): T[] {
    return Array.isArray(collection) ? collection : collection.items;
  }

  private normalizeCatalog(catalog: CatalogWire): CatalogInstance {
    return {
      id: catalog.id,
      name: catalog.name,
      organization: catalog.organization,
      environment: catalog.environment,
      endpoint: catalog.endpoint,
      version: catalog.apiVersion,
      lifecycle: catalog.lifecycle,
      health: catalog.healthStatus === 'unknown' ? 'unreachable' : catalog.healthStatus,
      latencyMs: null,
      desiredRevision: catalog.desiredRevision,
      observedRevision: catalog.observedRevision,
      capabilities: catalog.capabilities,
      lastSeenAt: catalog.lastCheckedAt ?? catalog.updatedAt,
    };
  }

  private normalizeGrant(grant: TrustWire): TrustGrant {
    return {
      id: grant.id,
      providerId: grant.providerId,
      consumerId: grant.consumerId,
      state: grant.state,
      validFrom: grant.validFrom ?? '2026-01-01T00:00:00Z',
      validUntil: grant.validUntil ?? '2099-12-31T23:59:59Z',
      resourceTypes: grant.allowedResourceTypes.map((scope) => scope === 'policy' ? 'policies' : scope),
      productFilter: grant.productFilters[0],
      ownerFilter: grant.ownerFilters[0],
      domainFilter: grant.domainFilters[0],
    };
  }

  private normalizeSync(configuration: SyncWire, grants: readonly TrustGrant[]): SyncConfiguration {
    const resourceScopes = configuration.resourceScopes.map((scope) => scope === 'policy' ? 'policies' as const : scope);
    const grant = grants.find((item) => item.id === configuration.trustGrantId);
    const valid = grant?.state === 'approved' && resourceScopes.every((scope) => grant.resourceTypes.includes(scope));
    return {
      id: configuration.id,
      name: configuration.name,
      sourceId: configuration.sourceId,
      targetId: configuration.targetId,
      direction: configuration.direction,
      resourceScopes,
      schedule: configuration.schedule,
      enabled: configuration.enabled,
      conflictStrategy: configuration.conflictPolicy,
      trustGrantId: configuration.trustGrantId ?? 'not-assigned',
      lastValidation: valid ? 'valid' : 'blocked',
      revision: configuration.revision,
    };
  }
}
