import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap, tap, throwError, timeout } from 'rxjs';
import {
  AccessRequestSubmission,
  AdministrativeOrganization,
  DataProduct,
  GovernanceSubmission,
  EndpointDescriptor,
  IdentityDirectoryEntry,
  IdentityDirectorySource,
  IdentityGroupDetail,
  IdentityGroupSummary,
  LineageEdge,
  LineageNode,
  OwnedAccessConsumer,
  PolicyDefinition,
  ProductActivityResponse,
  ProductEffectiveAccessResponse,
  ProductQualityWorkspace,
  ProvenanceEvent,
  StoredAccessRequest,
} from './catalog.models';
import { FALLBACK_EDGES, FALLBACK_NODES, FALLBACK_OWNED_ACCESS_CONSUMERS, FALLBACK_POLICY, FALLBACK_PRODUCT, FALLBACK_PRODUCTS, FALLBACK_PROVENANCE } from './catalog.seed';
import { DemoIdentityService } from './demo-identity.service';

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

type QualitySummary = Required<Pick<DataProduct, 'qualityMedal' | 'qualityScore'>>;

const IDENTITY_LOADING_PRODUCT: DataProduct = {
  ...FALLBACK_PRODUCT,
  id: '',
  globalId: '',
  revision: 0,
  title: 'Datenprodukt wird geladen',
  description: 'Die sichtbaren Produktdaten werden für die gewählte Demo-Identität neu geladen.',
  owner: '',
  domain: '',
  lifecycle: 'draft',
  classification: 'internal',
  keywords: [],
  contact: '',
  license: '',
  quality: '',
  qualityMedal: 'bronze',
  qualityScore: 0,
  updateFrequency: '',
  additionalMetadata: { deliveryProtocols: [] },
  endpoints: [],
  createdAt: '',
  updatedAt: '',
};

export function resolveProductQuality(
  quality: ProductWire['quality'],
  cached: Pick<DataProduct, 'qualityMedal' | 'qualityScore'> | undefined,
  preserveCached: boolean,
): QualitySummary {
  const qualityObject = quality && typeof quality === 'object' ? quality : null;
  const receivedMedal = qualityObject && ['bronze', 'silver', 'gold', 'platinum'].includes(String(qualityObject['medal']))
    ? qualityObject['medal'] as QualitySummary['qualityMedal']
    : undefined;
  const scoreCandidate = qualityObject ? Number(qualityObject['score']) : Number.NaN;
  const receivedScore = Number.isInteger(scoreCandidate) && scoreCandidate >= 0 && scoreCandidate <= 6
    ? scoreCandidate
    : undefined;

  return preserveCached
    ? {
        qualityMedal: cached?.qualityMedal ?? receivedMedal ?? 'bronze',
        qualityScore: cached?.qualityScore ?? receivedScore ?? 0,
      }
    : {
        qualityMedal: receivedMedal ?? cached?.qualityMedal ?? 'bronze',
        qualityScore: receivedScore ?? cached?.qualityScore ?? 0,
      };
}

export type EndpointWire = {
  id: string;
  name: string;
  description?: string | null;
  protocol: 'http-rest' | 'postgresql';
  connection: Record<string, unknown>;
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
export type PolicyWire = {
  id: string;
  revision: number;
  status: 'draft' | 'published' | 'revoked';
  definition: {
    effect: 'allow' | 'deny';
    subjects: { userIds: string[]; machineIds?: string[]; groupIds?: string[] };
    resources: { productUrns: string[]; owners: string[] };
    actions: string[];
    protocols: ('http' | 'postgresql')[];
    grants?: NonNullable<PolicyDefinition['grants']>;
  };
  generatedRego: string;
  deployments: Array<{ target: 'opa' | 'postgresql'; observedRevision: number | null; desiredRevision: number }>;
};

export interface WorkflowTaskWire {
  id: string;
  taskType: 'metadata_quality' | 'access_governance' | 'access_request_review' | 'simulation_quality_alert' | 'simulation_discoverability_alert' | 'simulation_isbo_restriction' | 'group_membership_changed' | 'publication_approval' | 'governance_correction' | 'service_level_approval';
  status: 'open' | 'in_progress' | 'completed';
  assigneeUserId: string;
  dataProductId: string;
  accessRequestId: string | null;
  simulationEventId?: string | null;
  governanceSubmissionId?: string | null;
  serviceLevelRevisionId?: string | null;
  title: string;
  detail: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);
  private readonly productState = signal<DataProduct>(FALLBACK_PRODUCT);
  private readonly productIdentityState = signal(this.identity.userId());
  private readonly productsState = signal<readonly DataProduct[]>(FALLBACK_PRODUCTS);
  private readonly ownerAccessRequestState = signal<readonly StoredAccessRequest[]>([]);
  private readonly ownedAccessConsumerState = signal<readonly OwnedAccessConsumer[]>(FALLBACK_OWNED_ACCESS_CONSUMERS);
  private readonly workflowTaskState = signal<readonly WorkflowTaskWire[]>([]);
  private productsRefreshGeneration = 0;
  private ownerInboxRefreshGeneration = 0;
  private workflowTasksRefreshGeneration = 0;
  private lastRefreshedIdentity = this.identity.userId();
  private selectedProductId: string | null = null;

  readonly product = computed(() => this.productIdentityState() === this.identity.userId()
    ? this.productState()
    : IDENTITY_LOADING_PRODUCT);
  readonly products = this.productsState.asReadonly();
  readonly ownerAccessRequests = this.ownerAccessRequestState.asReadonly();
  readonly ownedAccessConsumers = this.ownedAccessConsumerState.asReadonly();
  readonly workflowTasks = this.workflowTaskState.asReadonly();
  readonly ownerAccessRequestLoading = signal(true);
  readonly loading = signal(true);
  readonly usingFallback = signal(false);
  readonly policyUsingFallback = signal(true);
  readonly connectionLabel = computed(() =>
    this.usingFallback() ? 'Preview data · API unavailable' : this.loading() ? 'Connecting to catalog…' : 'Live catalog API',
  );
  readonly etag = signal(`"${FALLBACK_PRODUCT.revision}"`);

  constructor() {
    effect(() => {
      const userId = this.identity.userId();
      if (userId === this.lastRefreshedIdentity) return;
      this.lastRefreshedIdentity = userId;
      this.productsState.set([]);
      this.ownerAccessRequestState.set([]);
      this.ownedAccessConsumerState.set([]);
      this.workflowTaskState.set([]);
      this.setCurrentProduct(IDENTITY_LOADING_PRODUCT);
      this.etag.set('"0"');
      this.refreshProducts();
      this.refreshOwnerAccessRequestInbox();
      this.refreshWorkflowTasks();
    });
    this.refreshProducts();
    this.refreshOwnerAccessRequestInbox();
    this.refreshWorkflowTasks();
  }

  refreshProducts(): void {
    const refreshGeneration = ++this.productsRefreshGeneration;
    const userId = this.identity.userId();
    this.loading.set(true);
    this.usingFallback.set(false);
    const identityHeaders = this.identity.headers();
    forkJoin({
      products: this.http.get<Collection<ProductWire>>('/api/v1/data-products?limit=25', { headers: identityHeaders }),
      accessRequests: this.http
        .get<StoredAccessRequest[]>('/api/v1/access-requests/mine', { headers: identityHeaders })
        .pipe(catchError(() => of([]))),
      accessConsumers: this.http
        .get<OwnedAccessConsumer[]>('/api/v1/access-consumers/owned', { headers: identityHeaders })
        .pipe(catchError(() => of([]))),
    })
      .pipe(
        timeout(3000),
        map(({ products, accessRequests, accessConsumers }) => ({
          items: (Array.isArray(products) ? products : products.items).map((item) => this.normalizeProduct(item)),
          accessRequests,
          accessConsumers,
        })),
        map(({ items, accessRequests, accessConsumers }) => ({
          items: this.withAccessRequests(items, accessRequests, userId),
          accessConsumers,
          usingFallback: false,
        })),
        catchError(() => of({
          items: FALLBACK_PRODUCTS,
          accessConsumers: FALLBACK_OWNED_ACCESS_CONSUMERS,
          usingFallback: true,
        })),
      )
      .subscribe(({ items, accessConsumers, usingFallback }) => {
        if (refreshGeneration !== this.productsRefreshGeneration) return;
        const products = items;
        this.usingFallback.set(usingFallback);
        this.productsState.set(products);
        this.ownedAccessConsumerState.set(accessConsumers);
        this.loading.set(false);
        const selectedProduct = this.selectedProductId
          ? products.find((product) => product.id === this.selectedProductId)
          : products[0];
        if (selectedProduct) {
          this.setCurrentProduct(selectedProduct);
          this.etag.set(`"${selectedProduct.revision}"`);
        }
        if (!usingFallback && this.selectedProductId) {
          this.hydrateProduct(this.selectedProductId);
        } else if (!usingFallback && selectedProduct) {
          this.hydrateProduct(selectedProduct.id);
        }
      });
  }

  selectProduct(id: string | null | undefined): void {
    if (!id) return;
    this.selectedProductId = id;
    const cached = this.productsState().find((product) => product.id === id);
    if (cached) {
      this.setCurrentProduct(cached);
      this.etag.set(`"${cached.revision}"`);
    }
    this.hydrateProduct(id);
  }

  loadProduct(id: string): Observable<DataProduct> {
    const requestedUserId = this.identity.userId();
    const headers = this.identity.headers();
    return forkJoin({
      product: this.http.get<ProductWire>(
        `/api/v1/data-products/${encodeURIComponent(id)}`,
        { headers, observe: 'response' },
      ),
      endpoints: this.http.get<EndpointWire[]>(
        `/api/v1/data-products/${encodeURIComponent(id)}/endpoints`,
        { headers },
      ),
    }).pipe(
      timeout(3000),
      map((result) => {
        if (this.identity.userId() !== requestedUserId) {
          throw new Error('The active demo identity changed while the product was loading.');
        }
        if (!result.product.body || result.product.body.id !== id) {
          throw new Error('The catalog returned a different or empty product.');
        }
        const product = this.normalizeProduct(
          result.product.body,
          result.endpoints.map((endpoint) => normalizeEndpoint(endpoint)),
          true,
        );
        this.setCurrentProduct(product);
        this.productsState.update((products) => {
          const existing = products.some((item) => item.id === product.id);
          return existing
            ? products.map((item) => (item.id === product.id ? product : item))
            : [...products, product];
        });
        this.etag.set(result.product.headers.get('etag') ?? `"${product.revision}"`);
        this.usingFallback.set(false);
        return product;
      }),
    );
  }

  updateMetadata(patch: Partial<DataProduct>): Observable<DataProduct> {
    const current = this.productState();
    return this.updateProductMetadata(current, patch);
  }

  updateProductMetadata(current: DataProduct, patch: Partial<DataProduct>): Observable<DataProduct> {
    const headers = new HttpHeaders({
      'If-Match': `"${current.revision}"`,
      'X-DaCa-User': this.identity.userId(),
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
          const updated = this.normalizeProduct(response.body, undefined, true);
          this.setCurrentProduct(updated);
          this.productsState.update((products) => products.map((product) => (product.id === updated.id ? updated : product)));
          this.etag.set(response.headers.get('etag') ?? `"${updated.revision}"`);
          this.usingFallback.set(false);
          return updated;
        }),
        catchError((error: unknown) => throwError(() => this.describeError(error))),
      );
  }

  createAccessRequest(productId: string, request: AccessRequestSubmission): Observable<StoredAccessRequest> {
    const headers = this.identity.headers();
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
          if (selected) this.setCurrentProduct(selected);
        }),
        catchError((error: unknown) => throwError(() => this.describeAccessRequestError(error))),
      );
  }

  loadMyAccessRequests(productId: string, strict = false): Observable<readonly StoredAccessRequest[]> {
    const headers = this.identity.headers();
    const request = this.http
      .get<StoredAccessRequest[]>(
        `/api/v1/data-products/${encodeURIComponent(productId)}/access-requests/mine`,
        { headers },
      )
      .pipe(timeout(3000));
    return strict ? request : request.pipe(catchError(() => of([])));
  }

  loadOwnerAccessRequestInbox(): Observable<readonly StoredAccessRequest[]> {
    const headers = this.identity.headers();
    return this.http
      .get<StoredAccessRequest[]>('/api/v1/access-requests/inbox', { headers })
      .pipe(
        timeout(3000),
        catchError(() => of([])),
      );
  }

  refreshOwnerAccessRequestInbox(): void {
    const refreshGeneration = ++this.ownerInboxRefreshGeneration;
    this.ownerAccessRequestLoading.set(true);
    this.loadOwnerAccessRequestInbox().subscribe((requests) => {
      if (refreshGeneration !== this.ownerInboxRefreshGeneration) return;
      this.ownerAccessRequestState.set(requests);
      this.ownerAccessRequestLoading.set(false);
    });
  }

  refreshWorkflowTasks(): void {
    const refreshGeneration = ++this.workflowTasksRefreshGeneration;
    this.http.get<WorkflowTaskWire[]>('/api/v1/tasks/mine', { headers: this.identity.headers() })
      .pipe(timeout(3000), catchError(() => of([])))
      .subscribe((tasks) => {
        if (refreshGeneration !== this.workflowTasksRefreshGeneration) return;
        this.workflowTaskState.set(tasks);
      });
  }

  identityUserId(): string { return this.identity.userId(); }
  identityUser() { return this.identity.user(); }
  identityHeaders(): HttpHeaders { return this.identity.headers(); }

  loadLineage(): Observable<{ nodes: readonly LineageNode[]; edges: readonly LineageEdge[]; provenance: readonly ProvenanceEvent[] }> {
    const id = encodeURIComponent(this.productState().id);
    const headers = this.identity.headers();
    return forkJoin({
      lineage: this.http.get<LineageWire>(`/api/v1/data-products/${id}/lineage`, { headers }),
      provenance: this.http.get<ProvenanceWire[]>(`/api/v1/data-products/${id}/provenance`, { headers }),
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

  loadProductQuality(productId: string): Observable<ProductQualityWorkspace> {
    return this.http.get<ProductQualityWorkspace>(
      `/api/v1/data-products/${encodeURIComponent(productId)}/quality`,
      { headers: this.identity.headers() },
    ).pipe(timeout(3000));
  }

  loadProductActivity(productId: string): Observable<ProductActivityResponse> {
    return this.http.get<ProductActivityResponse>(
      `/api/v1/data-products/${encodeURIComponent(productId)}/activity`,
      { headers: this.identity.headers() },
    ).pipe(timeout(3000));
  }

  loadPolicy(): Observable<PolicyDefinition> {
    const id = encodeURIComponent(this.productState().id);
    return this.http.get<{ items: PolicyWire[] }>(`/api/v1/data-products/${id}/policies`, {
      headers: this.identity.headers(),
    }).pipe(
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
          grants: policy.definition.grants ?? [],
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

  createAccessGovernance(productId: string, body: Record<string, unknown>): Observable<PolicyWire> {
    return this.http.post<PolicyWire>(`/api/v1/data-products/${encodeURIComponent(productId)}/access-governance`, body, { headers: this.identity.headers(), observe: 'response' }).pipe(
      map((response) => {
        if (!response.body) throw new Error('Der Katalog hat keinen Policy-Entwurf geliefert.');
        this.etag.set(response.headers.get('etag') ?? `"${response.body.revision}"`);
        return response.body;
      }),
    );
  }

  createGovernanceSubmission(productId: string, body: Record<string, unknown>): Observable<GovernanceSubmission> {
    return this.http.post<GovernanceSubmission>(
      `/api/v1/data-products/${encodeURIComponent(productId)}/governance-submissions`,
      body,
      { headers: this.identity.headers() },
    ).pipe(tap(() => this.refreshWorkflowTasks()));
  }

  loadGovernanceSubmission(submissionId: string): Observable<{ submission: GovernanceSubmission; etag: string }> {
    return this.http.get<GovernanceSubmission>(
      `/api/v1/governance-submissions/${encodeURIComponent(submissionId)}`,
      { headers: this.identity.headers(), observe: 'response' },
    ).pipe(map((response) => {
      if (!response.body) throw new Error('Der Governance-Snapshot ist leer.');
      return { submission: response.body, etag: response.headers.get('etag') ?? `"${response.body.revision}"` };
    }));
  }

  decideGovernanceSubmission(
    submissionId: string,
    revision: number,
    policyRevision: number,
    decision: 'approve' | 'reject',
    comment: string | null,
  ): Observable<GovernanceSubmission> {
    const headers = this.identity.headers().set('If-Match', `"${revision}"`);
    return this.http.post<GovernanceSubmission>(
      `/api/v1/governance-submissions/${encodeURIComponent(submissionId)}/decision`,
      { decision, policyRevision, comment },
      { headers },
    );
  }

  searchDirectoryPeople(
    q = '',
    source: IdentityDirectorySource | '' = '',
    organizationId = '',
  ): Observable<IdentityDirectoryEntry[]> {
    const params: Record<string, string> = { limit: '20' };
    if (q.trim()) params['q'] = q.trim();
    if (source) params['source'] = source;
    if (organizationId) params['organization_id'] = organizationId;
    return this.http.get<IdentityDirectoryEntry[]>('/api/v1/identity-directory/people', {
      headers: this.identity.headers(),
      params,
    });
  }

  loadAdministrativeOrganizations(): Observable<AdministrativeOrganization[]> {
    return this.http.get<AdministrativeOrganization[]>('/api/v1/identity-directory/organizations', {
      headers: this.identity.headers(),
    });
  }

  searchIdentityGroups(
    q = '',
    source: IdentityDirectorySource | '' = '',
  ): Observable<IdentityGroupSummary[]> {
    const params: Record<string, string> = { limit: '20' };
    if (q.trim()) params['q'] = q.trim();
    if (source) params['source'] = source;
    return this.http.get<IdentityGroupSummary[]>('/api/v1/identity-directory/groups', {
      headers: this.identity.headers(),
      params,
    });
  }

  loadIdentityGroup(groupId: string): Observable<IdentityGroupDetail> {
    return this.http.get<IdentityGroupDetail>(
      `/api/v1/identity-directory/groups/${encodeURIComponent(groupId)}`,
      { headers: this.identity.headers() },
    );
  }

  createIdentityGroup(body: {
    label: string;
    description: string;
    memberIds: string[];
  }): Observable<IdentityGroupDetail> {
    return this.http.post<IdentityGroupDetail>('/api/v1/identity-directory/groups', body, {
      headers: this.identity.headers(),
    });
  }

  upsertAccessSetting(
    productId: string,
    grant: NonNullable<PolicyDefinition['grants']>[number],
    accessRequestFulfillments: Array<{
      accessRequestId: string;
      fulfillmentSubject: { type: 'person' | 'machine' | 'group'; id: string };
    }> = [],
  ): Observable<PolicyWire> {
    const url = `/api/v1/data-products/${encodeURIComponent(productId)}`;
    return this.http.get<PolicyWire>(`${url}/policies/latest`, {
      headers: this.identity.headers(),
      observe: 'response',
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status !== 404) return throwError(() => error);
        return of(new HttpResponse<PolicyWire>({ body: null, headers: new HttpHeaders({ ETag: '"0"' }) }));
      }),
      switchMap((response) => {
        const currentRevision = response.body?.revision ?? 0;
        const headers = this.identity.headers().set(
          'If-Match',
          response.headers.get('etag') ?? `"${currentRevision}"`,
        );
        return this.http.put<PolicyWire>(`${url}/access-settings`, { grant, accessRequestFulfillments }, {
          headers,
          observe: 'response',
        });
      }),
      map((response) => {
        if (!response.body) throw new Error('Der Katalog hat keinen Policy-Entwurf geliefert.');
        return response.body;
      }),
    );
  }

  loadLatestPolicyWire(productId: string): Observable<PolicyWire> {
    return this.http.get<PolicyWire>(
      `/api/v1/data-products/${encodeURIComponent(productId)}/policies/latest`,
      { headers: this.identity.headers() },
    ).pipe(timeout(3000));
  }

  loadEffectiveAccess(productId: string): Observable<ProductEffectiveAccessResponse> {
    return this.http.get<ProductEffectiveAccessResponse>(
      `/api/v1/data-products/${encodeURIComponent(productId)}/effective-access`,
      { headers: this.identity.headers() },
    ).pipe(timeout(3000));
  }

  publishPolicy(productId: string, policyId: string, revision: number): Observable<PolicyWire> {
    const headers = this.identity.headers().set('If-Match', `"${revision}"`);
    return this.http.post<PolicyWire>(`/api/v1/data-products/${encodeURIComponent(productId)}/policies/${encodeURIComponent(policyId)}/publish`, {}, { headers }).pipe(
      tap(() => { this.refreshProducts(); this.refreshOwnerAccessRequestInbox(); this.refreshWorkflowTasks(); }),
    );
  }

  decideAccessRequest(requestId: string, decision: 'approve' | 'reject', grantedVariant?: 'original' | 'modified'): Observable<{ request: StoredAccessRequest; policy: PolicyWire | null }> {
    return this.http.post<{ request: StoredAccessRequest; policy: PolicyWire | null }>(`/api/v1/access-requests/${encodeURIComponent(requestId)}/decision`, { decision, grantedVariant: grantedVariant ?? null }, { headers: this.identity.headers() }).pipe(
      tap(() => { this.refreshOwnerAccessRequestInbox(); this.refreshWorkflowTasks(); }),
    );
  }

  private hydrateProduct(id: string): void {
    this.loadProduct(id).pipe(catchError(() => of(null))).subscribe();
  }

  private setCurrentProduct(product: DataProduct): void {
    this.productState.set(product);
    this.productIdentityState.set(this.identity.userId());
  }

  private normalizeProduct(
    product: ProductWire,
    endpoints?: EndpointDescriptor[],
    preserveCachedQuality = false,
  ): DataProduct {
    const qualityObject = product.quality && typeof product.quality === 'object' ? product.quality : null;
    const cachedProduct = this.productsState().find((item) => item.id === product.id);
    const qualitySummary = resolveProductQuality(
      product.quality,
      cachedProduct,
      preserveCachedQuality,
    );
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
      ...qualitySummary,
      updateFrequency: product.updateFrequency ?? FALLBACK_PRODUCT.updateFrequency,
      additionalMetadata: product.additionalMetadata ?? product.metadata ?? FALLBACK_PRODUCT.additionalMetadata,
      endpoints: endpoints ?? product.endpoints ?? [],
      createdAt: product.createdAt ?? FALLBACK_PRODUCT.createdAt,
      updatedAt: product.updatedAt ?? FALLBACK_PRODUCT.updatedAt,
    };
  }

  private withAccessRequests(
    products: readonly DataProduct[],
    requests: readonly StoredAccessRequest[],
    userId = this.identity.userId(),
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
            requestedByUserIds: [...new Set([...requestedIds, userId])],
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

export function normalizeEndpoint(endpoint: EndpointWire): EndpointDescriptor {
  const connection = endpoint.connection;
  if (endpoint.protocol === 'http-rest') {
    const baseUrl = String(connection['baseUrl'] ?? '');
    const path = String(connection['path'] ?? '');
    const method = connection['method'] === 'POST' ? 'POST' : 'GET';
    const mediaType = typeof connection['mediaType'] === 'string' && connection['mediaType'].trim()
      ? connection['mediaType'].trim()
      : 'application/json';
    return {
      id: endpoint.id,
      protocol: 'http-rest',
      title: endpoint.name,
      method,
      url: `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`,
      mediaType,
    };
  }
  const sslMode = connection['sslMode'];
  return {
    id: endpoint.id,
    protocol: 'postgresql',
    title: endpoint.name,
    host: String(connection['host'] ?? 'postgres'),
    port: Number(connection['port'] ?? 5432),
    database: String(connection['database'] ?? ''),
    schema: String(connection['schema'] ?? ''),
    relation: String(connection['relation'] ?? ''),
    sslMode: sslMode === 'disable'
      || sslMode === 'require'
      || sslMode === 'verify-ca'
      || sslMode === 'verify-full'
      ? sslMode
      : 'prefer',
  };
}
