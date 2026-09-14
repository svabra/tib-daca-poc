import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap, tap, throwError, timeout } from 'rxjs';
import {
  AccessRequestSubmission,
  AccessRenewalFixtureState,
  AccessRenewalSubmission,
  AdministrativeOrganization,
  DataProduct,
  DomainChangeRequest,
  DomainAuditEvent,
  DomainGlossaryFixtureState,
  DomainSummary,
  GovernanceSubmission,
  GlossaryTermProposal,
  GlossaryTermSummary,
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
  SourceAccessRequest,
  SemanticSuggestion,
  StoredAccessRequest,
} from './catalog.models';
import { FALLBACK_EDGES, FALLBACK_NODES, FALLBACK_OWNED_ACCESS_CONSUMERS, FALLBACK_PRODUCT, FALLBACK_PRODUCTS, FALLBACK_PROVENANCE } from './catalog.seed';
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

type ConceptLocalizationWire = { language: string; preferredLabel: string; alternativeLabels?: string[]; definition: string; normalizedLabel: string };
type DomainWire = { id: string; urn: string; originCatalogId: string; revision: number; lifecycle: 'active' | 'retired'; ownerUserId: string; deputyOwnerUserId: string; preferredLabel: string; localizations: ConceptLocalizationWire[]; productCount: number; termCount: number; updatedAt: string };
type GlossaryTermWire = { id: string; urn: string; originCatalogId: string; revision: number; lifecycle: 'active' | 'retired'; preferredLabel: string; localizations: ConceptLocalizationWire[]; domainIds: string[]; relations: Array<{ id: string; relation: GlossaryTermSummary['relations'][number]['relationType']; targetTermId: string | null; targetUri: string | null; targetLabel: string }>; updatedAt: string };
type ProposalReviewWire = { domainId: string; proposalRevision: number; ownerUserId: string; status: 'pending' | 'approved' | 'rejected'; decisionComment: string | null; decidedAt: string | null; updatedAt: string };
type ProposalWire = Omit<GlossaryTermProposal, 'requesterName' | 'reviews'> & { reviews: ProposalReviewWire[] };

export interface WorkflowTaskWire {
  id: string;
  taskType: 'metadata_quality' | 'access_governance' | 'access_request_review' | 'simulation_quality_alert' | 'simulation_discoverability_alert' | 'simulation_isbo_restriction' | 'group_membership_changed' | 'publication_approval' | 'governance_correction' | 'service_level_approval' | 'source_access_review' | 'domain_change_review' | 'domain_change_decision' | 'glossary_term_review' | 'glossary_term_collaboration' | 'glossary_term_decision' | 'logical_model_review' | 'logical_model_changes_requested';
  kind?: 'action' | 'collaboration' | 'information';
  taskKind?: 'action' | 'collaboration' | 'information';
  status: 'open' | 'in_progress' | 'completed';
  assigneeUserId: string;
  dataProductId: string | null;
  accessRequestId: string | null;
  simulationEventId?: string | null;
  governanceSubmissionId?: string | null;
  serviceLevelRevisionId?: string | null;
  sourceAccessRequestId?: string | null;
  domainChangeRequestId?: string | null;
  glossaryTermProposalId?: string | null;
  logicalModelReviewId?: string | null;
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
  private readonly sourceAccessRequestState = signal<readonly SourceAccessRequest[]>([]);
  private readonly domainState = signal<readonly DomainSummary[]>([]);
  private productsRefreshGeneration = 0;
  private ownerInboxRefreshGeneration = 0;
  private workflowTasksRefreshGeneration = 0;
  private sourceAccessRefreshGeneration = 0;
  private sourceAccessInboxActivated = false;
  private lastRefreshedIdentity = this.identity.userId();
  private selectedProductId: string | null = null;

  readonly product = computed(() => this.productIdentityState() === this.identity.userId()
    ? this.productState()
    : IDENTITY_LOADING_PRODUCT);
  readonly products = this.productsState.asReadonly();
  readonly ownerAccessRequests = this.ownerAccessRequestState.asReadonly();
  readonly ownedAccessConsumers = this.ownedAccessConsumerState.asReadonly();
  readonly workflowTasks = this.workflowTaskState.asReadonly();
  readonly sourceAccessRequests = this.sourceAccessRequestState.asReadonly();
  readonly domains = this.domainState.asReadonly();
  readonly ownerAccessRequestLoading = signal(true);
  readonly ownerAccessRequestError = signal<string | null>(null);
  readonly workflowTasksLoading = signal(true);
  readonly workflowTasksError = signal<string | null>(null);
  readonly sourceAccessRequestsLoading = signal(false);
  readonly sourceAccessRequestsError = signal<string | null>(null);
  readonly loading = signal(true);
  readonly usingFallback = signal(false);
  /** @deprecated Policy evidence no longer falls back; kept for callers during migration. */
  readonly policyUsingFallback = signal(false);
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
      this.sourceAccessRequestState.set([]);
      this.setCurrentProduct(IDENTITY_LOADING_PRODUCT);
      this.etag.set('"0"');
      this.refreshProducts();
      this.refreshOwnerAccessRequestInbox();
      this.refreshWorkflowTasks();
      if (this.sourceAccessInboxActivated) this.refreshSourceAccessRequestInbox();
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
      domainIds: patch.domains?.map((domain) => domain.id),
      glossaryTermIds: patch.glossaryTerms?.map((term) => term.id),
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

  loadDomains(includeRetired = false): Observable<readonly DomainSummary[]> {
    return this.http.get<Collection<DomainWire>>('/api/v1/domains', {
      headers: this.identity.headers(),
      params: includeRetired ? { includeRetired: true } : {},
    }).pipe(map((result) => (Array.isArray(result) ? result : result.items).map((item) => this.normalizeDomain(item))), tap((items) => this.domainState.set(items)));
  }

  loadDomain(domainId: string): Observable<DomainSummary> {
    return this.http.get<DomainWire>(`/api/v1/domains/${encodeURIComponent(domainId)}`, {
      headers: this.identity.headers(),
    }).pipe(map((item) => this.normalizeDomain(item)));
  }

  loadDataProductsForDomain(domainId: string): Observable<readonly DataProduct[]> {
    return this.http.get<Collection<ProductWire>>('/api/v1/data-products', {
      headers: this.identity.headers(),
      params: { limit: 100, domainId },
    }).pipe(map((result) => (Array.isArray(result) ? result : result.items).map((item) => this.normalizeProduct(item))));
  }

  loadDomainAuditEvents(domainId: string): Observable<readonly DomainAuditEvent[]> {
    return this.http.get<DomainAuditEvent[]>(`/api/v1/domains/${encodeURIComponent(domainId)}/audit-events`, { headers: this.identity.headers() });
  }

  loadDomainChangeRequests(): Observable<readonly DomainChangeRequest[]> {
    return this.http.get<Collection<DomainChangeRequest>>('/api/v1/domain-change-requests', {
      headers: this.identity.headers(),
    }).pipe(map((result) => (Array.isArray(result) ? result : result.items).map((item) => this.normalizeDomainRequest(item))));
  }

  createDomainChangeRequest(payload: {
    operation: DomainChangeRequest['operation'];
    targetDomainId?: string | null;
    baseRevision?: number | null;
    requestedPayload: Record<string, unknown>;
  }): Observable<DomainChangeRequest> {
    const requested = payload.requestedPayload;
    const body = {
      operation: payload.operation,
      targetDomainId: payload.targetDomainId,
      baseRevision: payload.baseRevision,
      payload: payload.operation === 'retire' ? undefined : {
        ownerUserId: requested['ownerUserId'],
        deputyOwnerUserId: requested['deputyOwnerUserId'],
        localizations: requested['localizations'] ?? requested['labels'],
      },
    };
    return this.http.post<DomainChangeRequest>('/api/v1/domain-change-requests', body, {
      headers: this.identity.headers(),
    }).pipe(map((item) => this.normalizeDomainRequest(item)));
  }

  updateDomainDirect(domain: DomainSummary, payload: { ownerUserId: string; deputyOwnerUserId: string; localizations: Array<{ language: string; preferredLabel: string; definition: string }> }): Observable<DomainSummary> {
    return this.http.patch<DomainWire>(`/api/v1/domains/${encodeURIComponent(domain.id)}`, payload, { headers: this.identity.headers().set('If-Match', `"${domain.revision}"`) }).pipe(map((item) => this.normalizeDomain(item)), tap(() => this.loadDomains(true).subscribe()));
  }

  retireDomainDirect(domain: DomainSummary): Observable<DomainSummary> {
    return this.http.post<DomainWire>(`/api/v1/domains/${encodeURIComponent(domain.id)}/retire`, {}, { headers: this.identity.headers().set('If-Match', `"${domain.revision}"`) }).pipe(map((item) => this.normalizeDomain(item)));
  }

  decideDomainChangeRequest(request: DomainChangeRequest, decision: 'approve' | 'reject', comment: string): Observable<DomainChangeRequest> {
    return this.http.post<DomainChangeRequest>(
      `/api/v1/domain-change-requests/${encodeURIComponent(request.id)}/decision`,
      { decision, comment },
      { headers: this.identity.headers().set('If-Match', `"${request.revision}"`) },
    ).pipe(tap(() => this.refreshWorkflowTasks()));
  }

  updateDomainChangeRequest(request: DomainChangeRequest, reviewPayload: Record<string, unknown>): Observable<DomainChangeRequest> {
    return this.http.patch<DomainChangeRequest>(`/api/v1/domain-change-requests/${encodeURIComponent(request.id)}`, { reviewPayload }, { headers: this.identity.headers().set('If-Match', `"${request.revision}"`) }).pipe(map((item) => this.normalizeDomainRequest(item)));
  }

  loadGlossaryTerms(domainIds: readonly string[] = []): Observable<readonly GlossaryTermSummary[]> {
    const params: Record<string, string> = domainIds.length ? { domainId: domainIds[0] } : {};
    const domains$ = this.domainState().length ? of(this.domainState()) : this.loadDomains(true);
    return domains$.pipe(switchMap((domains) => this.http.get<Collection<GlossaryTermWire>>('/api/v1/glossary/terms', {
      headers: this.identity.headers(), params,
    }).pipe(map((result) => (Array.isArray(result) ? result : result.items).map((item) => this.normalizeGlossaryTerm(item, domains))))));
  }

  loadGlossaryTermProposals(): Observable<readonly GlossaryTermProposal[]> {
    const domains$ = this.domainState().length ? of(this.domainState()) : this.loadDomains(true);
    return domains$.pipe(switchMap(() => this.http.get<Collection<ProposalWire>>('/api/v1/glossary/term-proposals', {
      headers: this.identity.headers(),
    }).pipe(map((result) => (Array.isArray(result) ? result : result.items).map((item) => this.normalizeProposal(item))))));
  }

  loadGlossaryTermProposal(proposalId: string): Observable<GlossaryTermProposal> {
    const domains$ = this.domainState().length ? of(this.domainState()) : this.loadDomains(true);
    return domains$.pipe(switchMap(() => this.http.get<ProposalWire>(`/api/v1/glossary/term-proposals/${encodeURIComponent(proposalId)}`, {
      headers: this.identity.headers(),
    }).pipe(map((item) => this.normalizeProposal(item)))));
  }

  createGlossaryTermProposal(payload: {
    operation: GlossaryTermProposal['operation'];
    targetTermId?: string | null;
    sourceProductId?: string | null;
    autoAttach: boolean;
    domainIds: readonly string[];
    labels: Array<{ language: string; preferredLabel: string; alternativeLabels: string[]; definition: string }>;
    relations?: Array<{
      relation: GlossaryTermSummary['relations'][number]['relationType'];
      targetTermId?: string | null;
      targetUri?: string | null;
    }>;
  }): Observable<GlossaryTermProposal> {
    const body = {
      operation: payload.operation,
      ...(payload.targetTermId ? { targetTermId: payload.targetTermId } : {}),
      sourceProductId: payload.sourceProductId,
      autoAttach: payload.autoAttach,
      payload: {
        domainIds: payload.domainIds,
        localizations: payload.labels,
        relations: payload.relations ?? [],
      },
    };
    return this.http.post<ProposalWire>('/api/v1/glossary/term-proposals', body, {
      headers: this.identity.headers(),
    }).pipe(map((item) => this.normalizeProposal(item)), tap(() => this.refreshWorkflowTasks()));
  }

  updateGlossaryTermProposal(proposal: GlossaryTermProposal, reviewPayload: Record<string, unknown>): Observable<GlossaryTermProposal> {
    return this.http.patch<ProposalWire>(
      `/api/v1/glossary/term-proposals/${encodeURIComponent(proposal.id)}`,
      { reviewPayload },
      { headers: this.identity.headers().set('If-Match', `"${proposal.revision}"`) },
    ).pipe(map((item) => this.normalizeProposal(item)), tap(() => this.refreshWorkflowTasks()));
  }

  decideGlossaryTermProposal(proposal: GlossaryTermProposal, domainId: string, decision: 'approve' | 'reject', comment: string): Observable<GlossaryTermProposal> {
    return this.http.post<ProposalWire>(
      `/api/v1/glossary/term-proposals/${encodeURIComponent(proposal.id)}/reviews/${encodeURIComponent(domainId)}/decision`,
      { decision, comment },
      { headers: this.identity.headers().set('If-Match', `"${proposal.revision}"`) },
    ).pipe(map((item) => this.normalizeProposal(item)), tap(() => { this.refreshWorkflowTasks(); this.refreshProducts(); }));
  }

  loadSemanticSuggestions(productId: string): Observable<readonly SemanticSuggestion[]> {
    return this.http.get<Collection<SemanticSuggestion>>(
      `/api/v1/data-products/${encodeURIComponent(productId)}/semantic-suggestions`,
      { headers: this.identity.headers() },
    ).pipe(map((result) => Array.isArray(result) ? result : result.items));
  }

  acknowledgeTask(taskId: string): Observable<void> {
    return this.http.post<void>(`/api/v1/tasks/${encodeURIComponent(taskId)}/acknowledge`, {}, {
      headers: this.identity.headers(),
    }).pipe(tap(() => this.refreshWorkflowTasks()));
  }

  loadKnowledgeGraph(domainId?: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>('/api/v1/knowledge-graph', {
      headers: this.identity.headers(),
      params: domainId ? { domainId } : {},
    });
  }

  loadDomainGlossaryFixture(): Observable<DomainGlossaryFixtureState> {
    return this.http.get<DomainGlossaryFixtureState>('/api/v1/poc/domain-glossary-fixture', { headers: this.identity.headers() });
  }

  prepareDomainGlossaryFixture(): Observable<DomainGlossaryFixtureState> {
    return this.http.post<DomainGlossaryFixtureState>('/api/v1/poc/domain-glossary-fixture/prepare', {}, { headers: this.identity.headers() }).pipe(tap(() => { this.refreshProducts(); this.refreshWorkflowTasks(); }));
  }

  resetDomainGlossaryFixture(confirmationName: string): Observable<DomainGlossaryFixtureState> {
    return this.http.post<DomainGlossaryFixtureState>('/api/v1/poc/domain-glossary-fixture/reset', { confirmationName }, { headers: this.identity.headers() }).pipe(tap(() => { this.refreshProducts(); this.refreshWorkflowTasks(); }));
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

  createAccessRenewal(productId: string, renewal: AccessRenewalSubmission): Observable<StoredAccessRequest> {
    return this.http.post<StoredAccessRequest>(
      `/api/v1/data-products/${encodeURIComponent(productId)}/access-renewals`,
      renewal,
      { headers: this.identity.headers() },
    ).pipe(
      tap((created) => {
        const products = this.withAccessRequests(this.productsState(), [created]);
        this.productsState.set(products);
        const selected = products.find((product) => product.id === this.productState().id);
        if (selected) this.setCurrentProduct(selected);
      }),
      catchError((error: unknown) => throwError(() => this.describeAccessRenewalError(error))),
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
      .pipe(timeout(3000));
  }

  loadOwnedAccessConsumers(): Observable<readonly OwnedAccessConsumer[]> {
    return this.http.get<OwnedAccessConsumer[]>('/api/v1/access-consumers/owned', {
      headers: this.identity.headers(),
    }).pipe(timeout(3000));
  }

  refreshOwnerAccessRequestInbox(): void {
    const refreshGeneration = ++this.ownerInboxRefreshGeneration;
    this.ownerAccessRequestLoading.set(true);
    this.ownerAccessRequestError.set(null);
    this.loadOwnerAccessRequestInbox().subscribe({
      next: (requests) => {
        if (refreshGeneration !== this.ownerInboxRefreshGeneration) return;
        this.ownerAccessRequestState.set(requests);
        this.ownerAccessRequestLoading.set(false);
      },
      error: () => {
        if (refreshGeneration !== this.ownerInboxRefreshGeneration) return;
        this.ownerAccessRequestLoading.set(false);
        this.ownerAccessRequestError.set('Zugriffsanfragen konnten nicht geladen werden. Der Aufgabenstatus ist unbekannt.');
      },
    });
  }

  refreshWorkflowTasks(): void {
    const refreshGeneration = ++this.workflowTasksRefreshGeneration;
    this.workflowTasksLoading.set(true);
    this.workflowTasksError.set(null);
    this.http.get<WorkflowTaskWire[]>('/api/v1/tasks/mine', { headers: this.identity.headers() })
      .pipe(timeout(3000))
      .subscribe({
        next: (tasks) => {
          if (refreshGeneration !== this.workflowTasksRefreshGeneration) return;
          this.workflowTaskState.set(tasks.map((task) => ({ ...task, kind: task.taskType === 'glossary_term_collaboration' ? 'collaboration' : task.taskKind ?? task.kind ?? 'action' })));
          this.workflowTasksLoading.set(false);
        },
        error: () => {
          if (refreshGeneration !== this.workflowTasksRefreshGeneration) return;
          this.workflowTasksLoading.set(false);
          this.workflowTasksError.set('Weitere Aufgaben konnten nicht geladen werden. Der Aufgabenstatus ist unbekannt.');
        },
      });
  }

  refreshSourceAccessRequestInbox(): void {
    this.sourceAccessInboxActivated = true;
    const refreshGeneration = ++this.sourceAccessRefreshGeneration;
    this.sourceAccessRequestsLoading.set(true);
    this.sourceAccessRequestsError.set(null);
    this.http.get<SourceAccessRequest[]>('/api/v1/source-access-requests/inbox', {
      headers: this.identity.headers(),
    }).pipe(timeout(3000)).subscribe({
      next: (requests) => {
        if (refreshGeneration !== this.sourceAccessRefreshGeneration) return;
        this.sourceAccessRequestState.set(requests);
        this.sourceAccessRequestsLoading.set(false);
      },
      error: () => {
        if (refreshGeneration !== this.sourceAccessRefreshGeneration) return;
        this.sourceAccessRequestsLoading.set(false);
        this.sourceAccessRequestsError.set('Datenquellen-Zugriffsanfragen konnten nicht geladen werden.');
      },
    });
  }

  decideSourceAccessRequest(
    requestId: string,
    decision: 'approve' | 'reject',
    comment: string | null,
  ): Observable<SourceAccessRequest> {
    return this.http.post<SourceAccessRequest>(
      `/api/v1/source-access-requests/${encodeURIComponent(requestId)}/decision`,
      { decision, comment },
      { headers: this.identity.headers() },
    ).pipe(tap(() => {
      this.refreshSourceAccessRequestInbox();
      this.refreshWorkflowTasks();
    }));
  }

  identityUserId(): string { return this.identity.userId(); }
  identityUser() { return this.identity.user(); }
  identityUsers() { return this.identity.users(); }
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
          throw new Error('Für dieses Datenprodukt ist keine Policy-Evidenz verfügbar.');
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

  loadAccessRenewalFixture(): Observable<AccessRenewalFixtureState> {
    return this.http.get<AccessRenewalFixtureState>('/api/v1/poc/access-renewal-fixture', {
      headers: this.identity.headers(),
    }).pipe(timeout(3000));
  }

  prepareAccessRenewalFixture(): Observable<AccessRenewalFixtureState> {
    return this.http.post<AccessRenewalFixtureState>('/api/v1/poc/access-renewal-fixture/prepare', {}, {
      headers: this.identity.headers(),
    });
  }

  resetAccessRenewalFixture(confirmationName: string): Observable<AccessRenewalFixtureState> {
    return this.http.post<AccessRenewalFixtureState>('/api/v1/poc/access-renewal-fixture/reset', {
      confirmationName,
    }, { headers: this.identity.headers() });
  }

  publishPolicy(productId: string, policyId: string, revision: number): Observable<PolicyWire> {
    const headers = this.identity.headers().set('If-Match', `"${revision}"`);
    return this.http.post<PolicyWire>(`/api/v1/data-products/${encodeURIComponent(productId)}/policies/${encodeURIComponent(policyId)}/publish`, {}, { headers }).pipe(
      tap(() => { this.refreshProducts(); this.refreshOwnerAccessRequestInbox(); this.refreshWorkflowTasks(); }),
    );
  }

  decideAccessRequest(requestId: string, decision: 'approve' | 'reject', grantedVariant?: 'original' | 'modified'): Observable<{ request: StoredAccessRequest; policy: PolicyWire | null; governanceSubmission?: GovernanceSubmission | null }> {
    return this.http.post<{ request: StoredAccessRequest; policy: PolicyWire | null; governanceSubmission?: GovernanceSubmission | null }>(`/api/v1/access-requests/${encodeURIComponent(requestId)}/decision`, { decision, grantedVariant: grantedVariant ?? null }, { headers: this.identity.headers() }).pipe(
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
    const rawDomains = Array.isArray(product.domains) ? product.domains as unknown as Array<Record<string, unknown>> : [];
    const domains: DomainSummary[] = rawDomains.map((domain) => {
      const labels = Array.isArray(domain['labels']) ? domain['labels'] as Array<Record<string, unknown>> : [];
      const mappedLabels = labels.map((label) => ({ language: String(label['language'] ?? ''), preferredLabel: String(label['preferredLabel'] ?? ''), alternativeLabels: Array.isArray(label['alternativeLabels']) ? label['alternativeLabels'] as string[] : [], definition: String(label['definition'] ?? '') }));
      const cached = this.domainState().find((item) => item.id === String(domain['id']));
      return cached ?? { id: String(domain['id']), urn: String(domain['urn'] ?? ''), originCatalogId: '', revision: Number(domain['revision'] ?? 1), status: domain['lifecycle'] === 'retired' ? 'retired' : 'active', preferredLabel: String(domain['preferredLabel'] ?? ''), definition: mappedLabels[0]?.definition ?? '', labels: mappedLabels, ownerUserId: '', ownerName: '', ownerOrganization: '', deputyOwnerUserId: '', deputyOwnerName: '', deputyOwnerOrganization: '', productCount: 0, termCount: 0, updatedAt: '' };
    });
    const rawTerms = Array.isArray(product.glossaryTerms) ? product.glossaryTerms as unknown as Array<Record<string, unknown>> : [];
    const glossaryTerms: GlossaryTermSummary[] = rawTerms.map((term) => {
      const labels = Array.isArray(term['labels']) ? term['labels'] as Array<Record<string, unknown>> : [];
      const mappedLabels = labels.map((label) => ({ language: String(label['language'] ?? ''), preferredLabel: String(label['preferredLabel'] ?? ''), alternativeLabels: Array.isArray(label['alternativeLabels']) ? label['alternativeLabels'] as string[] : [], definition: String(label['definition'] ?? '') }));
      const domainIds = Array.isArray(term['domainIds']) ? term['domainIds'].map(String) : [];
      return { id: String(term['id']), urn: String(term['urn'] ?? ''), originCatalogId: '', revision: Number(term['revision'] ?? 1), status: term['lifecycle'] === 'retired' ? 'retired' : 'active', preferredLabel: String(term['preferredLabel'] ?? ''), definition: mappedLabels[0]?.definition ?? '', labels: mappedLabels, domains: domains.filter((domain) => domainIds.includes(domain.id)), relations: [], updatedAt: '' };
    });
    return {
      ...FALLBACK_PRODUCT,
      ...product,
      globalId: product.globalId ?? product.urn ?? FALLBACK_PRODUCT.globalId,
      contact: typeof product.contact === 'string' ? product.contact : product.contact?.email ?? FALLBACK_PRODUCT.contact,
      license: product.license ?? FALLBACK_PRODUCT.license,
      quality,
      domains,
      glossaryTerms,
      ...qualitySummary,
      updateFrequency: product.updateFrequency ?? FALLBACK_PRODUCT.updateFrequency,
      additionalMetadata: product.additionalMetadata ?? product.metadata ?? FALLBACK_PRODUCT.additionalMetadata,
      endpoints: endpoints ?? product.endpoints ?? [],
      createdAt: product.createdAt ?? FALLBACK_PRODUCT.createdAt,
      updatedAt: product.updatedAt ?? FALLBACK_PRODUCT.updatedAt,
    };
  }

  private normalizeDomain(item: DomainWire): DomainSummary {
    const owner = this.identity.users().find((user) => user.id === item.ownerUserId);
    const deputy = this.identity.users().find((user) => user.id === item.deputyOwnerUserId);
    const preferred = item.localizations.find((label) => label.language.toLocaleLowerCase() === 'de') ?? item.localizations[0];
    return {
      id: item.id, urn: item.urn, originCatalogId: item.originCatalogId, revision: item.revision,
      status: item.lifecycle, preferredLabel: item.preferredLabel, definition: preferred?.definition ?? '',
      labels: item.localizations.map((label) => ({ language: label.language, preferredLabel: label.preferredLabel, alternativeLabels: label.alternativeLabels ?? [], definition: label.definition })),
      ownerUserId: item.ownerUserId, ownerName: owner?.displayName ?? item.ownerUserId, ownerOrganization: owner?.organization ?? 'Organisation nicht verfügbar',
      deputyOwnerUserId: item.deputyOwnerUserId, deputyOwnerName: deputy?.displayName ?? item.deputyOwnerUserId, deputyOwnerOrganization: deputy?.organization ?? 'Organisation nicht verfügbar',
      productCount: item.productCount, termCount: item.termCount, updatedAt: item.updatedAt,
    };
  }

  private normalizeGlossaryTerm(item: GlossaryTermWire, domains: readonly DomainSummary[]): GlossaryTermSummary {
    const preferred = item.localizations.find((label) => label.language.toLocaleLowerCase() === 'de') ?? item.localizations[0];
    return {
      id: item.id, urn: item.urn, originCatalogId: item.originCatalogId, revision: item.revision, status: item.lifecycle,
      preferredLabel: item.preferredLabel, definition: preferred?.definition ?? '',
      labels: item.localizations.map((label) => ({ language: label.language, preferredLabel: label.preferredLabel, alternativeLabels: label.alternativeLabels ?? [], definition: label.definition })),
      domains: domains.filter((domain) => item.domainIds.includes(domain.id)),
      relations: item.relations.map((relation) => ({ id: relation.id, relationType: relation.relation, targetTermId: relation.targetTermId, targetUri: relation.targetUri ?? '', targetLabel: relation.targetLabel })),
      updatedAt: item.updatedAt,
    };
  }

  private normalizeProposal(item: ProposalWire): GlossaryTermProposal {
    const requester = this.identity.users().find((user) => user.id === item.requesterUserId);
    return {
      ...item,
      requesterName: requester?.displayName ?? item.requesterUserId,
      reviews: item.reviews.map((review) => {
        const domain = this.domainState().find((candidate) => candidate.id === review.domainId);
        const owner = this.identity.users().find((user) => user.id === review.ownerUserId);
        return { id: `${item.id}:${review.domainId}`, domainId: review.domainId, domainLabel: domain?.preferredLabel ?? review.domainId, ownerUserId: review.ownerUserId, ownerName: owner?.displayName ?? review.ownerUserId, status: review.status, decisionComment: review.decisionComment, decidedAt: review.decidedAt };
      }),
    };
  }

  private normalizeDomainRequest(item: DomainChangeRequest): DomainChangeRequest {
    const requester = this.identity.users().find((user) => user.id === item.requesterUserId);
    return { ...item, requesterName: requester?.displayName ?? item.requesterUserId };
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

  private describeAccessRenewalError(error: unknown): Error {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) return new Error(error.error?.detail ?? 'Für diese Freigabe ist derzeit keine Verlängerung möglich.');
      if (error.status === 403) return new Error('Diese Freigabe kann mit der aktuellen Identität nicht verlängert werden.');
      if (error.status === 404) return new Error('Die bestehende Freigabe wurde nicht gefunden. Laden Sie den Zugriffsstatus neu.');
      if (error.status === 422) return new Error('Bitte prüfen Sie Zweck und neues Enddatum. Der Freigabeumfang bleibt unverändert.');
      if (error.status === 0) return new Error('Die Katalog-API ist nicht erreichbar. Der Verlängerungsantrag wurde nicht gespeichert.');
      return new Error(error.error?.detail ?? `Der Verlängerungsantrag konnte nicht gespeichert werden (${error.status}).`);
    }
    return error instanceof Error ? error : new Error('Der Verlängerungsantrag konnte nicht gespeichert werden.');
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
