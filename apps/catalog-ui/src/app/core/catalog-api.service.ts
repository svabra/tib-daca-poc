import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, tap, throwError, timeout } from 'rxjs';
import {
  AccessRequestSubmission,
  DataProduct,
  EndpointDescriptor,
  LineageEdge,
  LineageNode,
  OwnedAccessConsumer,
  PolicyDefinition,
  ProvenanceEvent,
  StoredAccessRequest,
} from './catalog.models';
import { FALLBACK_EDGES, FALLBACK_NODES, FALLBACK_OWNED_ACCESS_CONSUMERS, FALLBACK_POLICY, FALLBACK_PRODUCT, FALLBACK_PRODUCTS, FALLBACK_PROVENANCE } from './catalog.seed';

type Collection<T> = T[] | { items: T[] };
type ProductWire = Partial<Omit<DataProduct, 'contact' | 'quality' | 'license'>> & {
  id: string;
  urn?: string;
  contact?: string | { name?: string; email?: string };
  quality?: string | Record<string, unknown>;
  license?: string | null;
  updateFrequency?: string | null;
  metadata?: Record<string, unknown>;
};
type EndpointWire = {
  id: string;
  name: string;
  description?: string | null;
  protocol: 'http-rest' | 'postgresql';
  connection: Record<string, unknown>;
  secretRef?: string | null;
};
type LineageWire = {
  productUrn: string;
  edges: Array<{
    id: string;
    sourceUrn: string;
    targetUrn: string;
    relationType: string;
    transformation?: string | null;
    state: string;
  }>;
};
type ProvenanceWire = {
  id: string;
  sequence: number;
  eventType: string;
  actor: string;
  details: Record<string, unknown>;
  occurredAt: string;
};
type PolicyWire = {
  id: string;
  revision: number;
  status: 'draft' | 'published' | 'revoked';
  definition: {
    effect: 'allow' | 'deny';
    subjects: { userIds: string[] };
    resources: { productUrns: string[]; owners: string[] };
    actions: string[];
    protocols: ('http' | 'postgresql')[];
  };
  generatedRego: string;
  deployments: Array<{ target: 'opa' | 'postgresql'; observedRevision: number | null; desiredRevision: number }>;
};

const FALLBACK_OWNER_ACCESS_REQUEST: StoredAccessRequest = {
  id: '81111111-1111-4111-8111-111111111111',
  requestNumber: 'ZA-2026-ESTV-0001',
  dataProductId: '11111111-1111-4111-8111-111111111111',
  requesterId: 'beat.stalder',
  requesterName: 'Beat Stalder',
  requesterOrganization: 'Kanton St. Gallen',
  contactEmail: 'beat.stalder@sg.ch',
  consumerType: 'person',
  machineId: null,
  purpose: 'Kantonale Finanzanalyse und Plausibilisierung der aggregierten Bundessteuerstatistik.',
  legalBasis: 'Amtshilfe zwischen Behörden',
  requestedProtocol: 'http',
  requestedVariant: 'modified',
  validFrom: '2026-09-01',
  validUntil: '2027-08-31',
  notes: 'Benötigt werden ausschliesslich aggregierte Daten ohne Personenbezug.',
  status: 'submitted',
  createdAt: '2026-08-11T07:45:00Z',
  updatedAt: '2026-08-11T07:45:00Z',
};

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly productState = signal<DataProduct>(FALLBACK_PRODUCT);
  private readonly productsState = signal<readonly DataProduct[]>(FALLBACK_PRODUCTS);
  private readonly ownerAccessRequestState = signal<readonly StoredAccessRequest[]>([]);
  private readonly ownedAccessConsumerState = signal<readonly OwnedAccessConsumer[]>(FALLBACK_OWNED_ACCESS_CONSUMERS);

  readonly product = this.productState.asReadonly();
  readonly products = this.productsState.asReadonly();
  readonly ownerAccessRequests = this.ownerAccessRequestState.asReadonly();
  readonly ownedAccessConsumers = this.ownedAccessConsumerState.asReadonly();
  readonly ownerAccessRequestLoading = signal(true);
  readonly loading = signal(true);
  readonly usingFallback = signal(false);
  readonly policyUsingFallback = signal(true);
  readonly connectionLabel = computed(() =>
    this.usingFallback() ? 'Preview data · API unavailable' : this.loading() ? 'Connecting to catalog…' : 'Live catalog API',
  );
  readonly etag = signal(`"${FALLBACK_PRODUCT.revision}"`);

  constructor() {
    this.refreshProducts();
    this.refreshOwnerAccessRequestInbox();
  }

  refreshProducts(): void {
    this.loading.set(true);
    const identityHeaders = new HttpHeaders({ 'X-DiDaCa-User': 'kassandra.valdata' });
    forkJoin({
      products: this.http.get<Collection<ProductWire>>('/api/v1/data-products?limit=25'),
      accessRequests: this.http
        .get<StoredAccessRequest[]>('/api/v1/access-requests/mine', { headers: identityHeaders })
        .pipe(catchError(() => of([]))),
      accessConsumers: this.http
        .get<OwnedAccessConsumer[]>('/api/v1/access-consumers/owned', { headers: identityHeaders })
        .pipe(catchError(() => of(FALLBACK_OWNED_ACCESS_CONSUMERS))),
    })
      .pipe(
        timeout(3000),
        map(({ products, accessRequests, accessConsumers }) => ({
          items: (Array.isArray(products) ? products : products.items).map((item) => this.normalizeProduct(item)),
          accessRequests,
          accessConsumers,
        })),
        map(({ items, accessRequests, accessConsumers }) => ({
          items: this.withAccessRequests(items, accessRequests),
          accessConsumers,
        })),
        catchError(() => {
          this.usingFallback.set(true);
          return of({ items: FALLBACK_PRODUCTS, accessConsumers: FALLBACK_OWNED_ACCESS_CONSUMERS });
        }),
      )
      .subscribe(({ items, accessConsumers }) => {
        const products = items.length > 0 ? items : FALLBACK_PRODUCTS;
        this.productsState.set(products);
        this.ownedAccessConsumerState.set(accessConsumers);
        this.productState.set(products[0]);
        this.etag.set(`"${products[0].revision}"`);
        this.loading.set(false);
        if (!this.usingFallback()) this.hydrateProduct(products[0].id);
      });
  }

  selectProduct(id: string | null | undefined): void {
    if (!id) return;
    const cached = this.productsState().find((product) => product.id === id);
    if (cached) {
      this.productState.set(cached);
      this.etag.set(`"${cached.revision}"`);
    }
    this.hydrateProduct(id);
  }

  updateMetadata(patch: Partial<DataProduct>): Observable<DataProduct> {
    const current = this.productState();
    const headers = new HttpHeaders({
      'If-Match': this.etag(),
      'X-DiDaCa-User': 'didaca-demo-editor',
    });
    const body = {
      title: patch.title,
      description: patch.description,
      owner: patch.owner,
      domain: patch.domain,
      lifecycle: patch.lifecycle,
      classification: patch.classification,
      keywords: patch.keywords,
      contact: patch.contact === undefined ? undefined : { name: `${patch.owner ?? current.owner} Data Office`, email: patch.contact },
      license: patch.license,
      quality: patch.quality === undefined ? undefined : { statement: patch.quality },
      updateFrequency: patch.updateFrequency,
      metadata: patch.additionalMetadata,
    };
    return this.http
      .patch<ProductWire>(`/api/v1/data-products/${encodeURIComponent(current.id)}`, body, { headers, observe: 'response' })
      .pipe(
        map((response: HttpResponse<ProductWire>) => {
          if (!response.body) throw new Error('The catalog returned an empty update response.');
          const updated = this.normalizeProduct(response.body);
          this.productState.set(updated);
          this.productsState.update((products) => products.map((product) => (product.id === updated.id ? updated : product)));
          this.etag.set(response.headers.get('etag') ?? `"${updated.revision}"`);
          this.usingFallback.set(false);
          return updated;
        }),
        catchError((error: unknown) => throwError(() => this.describeError(error))),
      );
  }

  createAccessRequest(productId: string, request: AccessRequestSubmission): Observable<StoredAccessRequest> {
    const headers = new HttpHeaders({ 'X-DiDaCa-User': 'kassandra.valdata' });
    return this.http
      .post<StoredAccessRequest>(
        `/api/v1/data-products/${encodeURIComponent(productId)}/access-requests`,
        request,
        { headers },
      )
      .pipe(
        tap((created) => {
          const products = this.withAccessRequests(this.productsState(), [created]);
          this.productsState.set(products);
          const selected = products.find((product) => product.id === this.productState().id);
          if (selected) this.productState.set(selected);
        }),
        catchError((error: unknown) => throwError(() => this.describeAccessRequestError(error))),
      );
  }

  loadMyAccessRequests(productId: string): Observable<readonly StoredAccessRequest[]> {
    const headers = new HttpHeaders({ 'X-DiDaCa-User': 'kassandra.valdata' });
    return this.http
      .get<StoredAccessRequest[]>(
        `/api/v1/data-products/${encodeURIComponent(productId)}/access-requests/mine`,
        { headers },
      )
      .pipe(
        timeout(3000),
        catchError(() => of([])),
      );
  }

  loadOwnerAccessRequestInbox(): Observable<readonly StoredAccessRequest[]> {
    const headers = new HttpHeaders({ 'X-DiDaCa-User': 'kassandra.valdata' });
    return this.http
      .get<StoredAccessRequest[]>('/api/v1/access-requests/inbox', { headers })
      .pipe(
        timeout(3000),
        catchError(() => of([FALLBACK_OWNER_ACCESS_REQUEST])),
      );
  }

  refreshOwnerAccessRequestInbox(): void {
    this.ownerAccessRequestLoading.set(true);
    this.loadOwnerAccessRequestInbox().subscribe((requests) => {
      this.ownerAccessRequestState.set(requests);
      this.ownerAccessRequestLoading.set(false);
    });
  }

  loadLineage(): Observable<{ nodes: readonly LineageNode[]; edges: readonly LineageEdge[]; provenance: readonly ProvenanceEvent[] }> {
    const id = encodeURIComponent(this.productState().id);
    return forkJoin({
      lineage: this.http.get<LineageWire>(`/api/v1/data-products/${id}/lineage`),
      provenance: this.http.get<ProvenanceWire[]>(`/api/v1/data-products/${id}/provenance`),
    }).pipe(
      timeout(3000),
      map(({ lineage, provenance }) => {
        const nodeUrns = new Set<string>();
        for (const edge of lineage.edges) {
          nodeUrns.add(edge.sourceUrn);
          nodeUrns.add(edge.targetUrn);
        }
        const nodes: LineageNode[] = [...nodeUrns].map((urn) => {
          const kind: LineageNode['kind'] = urn === lineage.productUrn
            ? 'product'
            : lineage.edges.some((edge) => edge.targetUrn === lineage.productUrn && edge.sourceUrn === urn)
              ? 'source'
              : 'consumer';
          return {
            id: urn,
            label: urn === lineage.productUrn ? this.productState().title : this.urnLabel(urn),
            detail: urn === lineage.productUrn ? this.productState().description : `Catalog resource ${urn}`,
            kind,
            catalog: urn.includes(':sg:') ? 'Kanton St. Gallen' : urn.includes(':estv:') ? 'ESTV' : 'External catalog',
          };
        });
        const edges: LineageEdge[] = lineage.edges.map((edge) => ({
          id: edge.id,
          source: edge.sourceUrn,
          target: edge.targetUrn,
          label: edge.relationType,
          state: edge.state === 'active' ? 'verified' : 'declared',
        }));
        const events: ProvenanceEvent[] = provenance.map((event) => ({
          id: event.id,
          type: this.titleCase(event.eventType),
          actor: event.actor,
          occurredAt: event.occurredAt,
          summary: Object.entries(event.details).map(([key, value]) => `${key}: ${String(value)}`).join(' · '),
          evidence: `sequence/${event.sequence}`,
        })).reverse();
        return { nodes, edges, provenance: events };
      }),
      catchError(() => of({ nodes: FALLBACK_NODES, edges: FALLBACK_EDGES, provenance: FALLBACK_PROVENANCE })),
    );
  }

  loadPolicy(): Observable<PolicyDefinition> {
    const id = encodeURIComponent(this.productState().id);
    return this.http.get<{ items: PolicyWire[] }>(`/api/v1/data-products/${id}/policies`).pipe(
      timeout(3000),
      map((response) => response.items[0]),
      map((policy) => {
        if (!policy) {
          this.policyUsingFallback.set(true);
          return FALLBACK_POLICY;
        }
        this.policyUsingFallback.set(false);
        const opa = policy.deployments.find((deployment) => deployment.target === 'opa');
        const postgres = policy.deployments.find((deployment) => deployment.target === 'postgresql');
        return {
          id: policy.id,
          revision: policy.revision,
          state: policy.status,
          effect: policy.definition.effect,
          subjects: policy.definition.subjects.userIds,
          resources: { productId: this.productState().id, owner: policy.definition.resources.owners[0] ?? this.productState().owner },
          actions: policy.definition.actions,
          protocols: policy.definition.protocols,
          generatedRego: policy.generatedRego,
          opaRevision: opa?.observedRevision ?? 0,
          postgresRevision: postgres?.observedRevision ?? 0,
        } satisfies PolicyDefinition;
      }),
      catchError(() => {
        this.policyUsingFallback.set(true);
        return of(FALLBACK_POLICY);
      }),
    );
  }

  private hydrateProduct(id: string): void {
    forkJoin({
      product: this.http.get<ProductWire>(`/api/v1/data-products/${encodeURIComponent(id)}`, { observe: 'response' }),
      endpoints: this.http.get<EndpointWire[]>(`/api/v1/data-products/${encodeURIComponent(id)}/endpoints`),
    })
      .pipe(timeout(3000), catchError(() => of(null)))
      .subscribe((result) => {
        if (!result?.product.body) return;
        const product = this.normalizeProduct(result.product.body, result.endpoints.map((endpoint) => this.normalizeEndpoint(endpoint)));
        this.productState.set(product);
        this.productsState.update((products) => products.map((item) => (item.id === product.id ? product : item)));
        this.etag.set(result.product.headers.get('etag') ?? `"${product.revision}"`);
      });
  }

  private normalizeProduct(product: ProductWire, endpoints?: EndpointDescriptor[]): DataProduct {
    const quality = typeof product.quality === 'string'
      ? product.quality
      : product.quality
        ? Object.entries(product.quality).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
        : FALLBACK_PRODUCT.quality;
    return {
      ...FALLBACK_PRODUCT,
      ...product,
      globalId: product.globalId ?? product.urn ?? FALLBACK_PRODUCT.globalId,
      contact: typeof product.contact === 'string' ? product.contact : product.contact?.email ?? FALLBACK_PRODUCT.contact,
      license: product.license ?? FALLBACK_PRODUCT.license,
      quality,
      updateFrequency: product.updateFrequency ?? FALLBACK_PRODUCT.updateFrequency,
      additionalMetadata: product.additionalMetadata ?? product.metadata ?? FALLBACK_PRODUCT.additionalMetadata,
      endpoints: endpoints ?? product.endpoints ?? FALLBACK_PRODUCT.endpoints,
      updatedAt: product.updatedAt ?? FALLBACK_PRODUCT.updatedAt,
    };
  }

  private normalizeEndpoint(endpoint: EndpointWire): EndpointDescriptor {
    const connection = endpoint.connection;
    if (endpoint.protocol === 'http-rest') {
      const baseUrl = String(connection['baseUrl'] ?? '');
      const path = String(connection['path'] ?? '');
      return {
        id: endpoint.id,
        protocol: 'http-rest',
        title: endpoint.name,
        method: String(connection['method'] ?? 'GET'),
        url: `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`,
        mediaType: 'application/json',
        secretRef: endpoint.secretRef ?? undefined,
      };
    }
    return {
      id: endpoint.id,
      protocol: 'postgresql',
      title: endpoint.name,
      host: String(connection['host'] ?? 'localhost'),
      port: Number(connection['port'] ?? 5432),
      database: String(connection['database'] ?? ''),
      schema: String(connection['schema'] ?? ''),
      relation: String(connection['relation'] ?? ''),
      secretRef: endpoint.secretRef ?? undefined,
    };
  }

  private withAccessRequests(
    products: readonly DataProduct[],
    requests: readonly StoredAccessRequest[],
  ): readonly DataProduct[] {
    const latestByProduct = new Map<string, StoredAccessRequest>();
    for (const request of requests) {
      const current = latestByProduct.get(request.dataProductId);
      if (!current || request.createdAt > current.createdAt) latestByProduct.set(request.dataProductId, request);
    }
    return products.map((product) => {
      const request = latestByProduct.get(product.id);
      if (!request) return product;
      const metadata = product.additionalMetadata;
      const usageCandidate = metadata['catalogUsage'];
      const usage = usageCandidate && typeof usageCandidate === 'object' && !Array.isArray(usageCandidate)
        ? usageCandidate as Record<string, unknown>
        : {};
      const requestedIds = Array.isArray(usage['requestedByUserIds'])
        ? usage['requestedByUserIds'].filter((value): value is string => typeof value === 'string')
        : [];
      return {
        ...product,
        additionalMetadata: {
          ...metadata,
          catalogUsage: {
            ...usage,
            requestedByUserIds: [...new Set([...requestedIds, 'kassandra.valdata'])],
          },
          accessRequest: {
            requestId: request.requestNumber,
            status: request.status,
            detail: request.purpose,
            updatedAt: request.updatedAt,
          },
        },
      };
    });
  }

  private urnLabel(urn: string): string {
    return this.titleCase(urn.split(':').at(-1)?.replaceAll('-', ' ') ?? urn);
  }

  private titleCase(value: string): string {
    return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private describeError(error: unknown): Error {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 412) return new Error('This product changed since you opened it. Reload before saving your edits.');
      if (error.status === 428) return new Error('The catalog requires a current revision (If-Match) for this update.');
      if (error.status === 401) return new Error('The catalog rejected the demo editor identity. Check demo-auth configuration.');
      if (error.status === 503) return new Error('The catalog is not ready to accept changes. Nothing was saved.');
      if (error.status === 0) return new Error('Catalog API is unavailable. Preview data was not saved.');
      return new Error(error.error?.detail ?? `Catalog update failed (${error.status}).`);
    }
    return error instanceof Error ? error : new Error('Catalog update failed.');
  }

  private describeAccessRequestError(error: unknown): Error {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) return new Error(error.error?.detail ?? 'Für dieses Datenprodukt kann keine weitere Anfrage erstellt werden.');
      if (error.status === 401) return new Error('Die Demo-Identität konnte nicht bestätigt werden.');
      if (error.status === 422) return new Error('Bitte prüfen Sie die Angaben und den gewünschten Gültigkeitszeitraum.');
      if (error.status === 0) return new Error('Die Katalog-API ist nicht erreichbar. Der Antrag wurde nicht gespeichert.');
      return new Error(error.error?.detail ?? `Der Antrag konnte nicht gespeichert werden (${error.status}).`);
    }
    return error instanceof Error ? error : new Error('Der Antrag konnte nicht gespeichert werden.');
  }
}
