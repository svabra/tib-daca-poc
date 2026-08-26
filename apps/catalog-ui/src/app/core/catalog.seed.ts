import { AccessConsumerGrant, DataProduct, LineageEdge, LineageNode, OwnedAccessConsumer, PolicyDefinition, ProvenanceEvent } from './catalog.models';

export const ESTV_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

export const FALLBACK_OWNED_ACCESS_CONSUMERS: readonly OwnedAccessConsumer[] = [
  {
    dataProductId: ESTV_PRODUCT_ID,
    consumerType: 'person',
    identityId: 'lea.meier',
    displayName: 'Lea Meier',
    organization: 'Kanton Bern',
    grants: [
      fallbackConsumerGrant('0001', 'http', 'original'),
      fallbackConsumerGrant('0002', 'postgresql', 'modified'),
    ],
  },
  {
    dataProductId: ESTV_PRODUCT_ID,
    consumerType: 'person',
    identityId: 'marco.galli',
    displayName: 'Marco Galli',
    organization: 'Kanton Tessin',
    grants: [fallbackConsumerGrant('0003', 'http', 'modified')],
  },
  {
    dataProductId: ESTV_PRODUCT_ID,
    consumerType: 'person',
    identityId: 'nadine.favre',
    displayName: 'Nadine Favre',
    organization: 'Kanton Waadt',
    grants: [fallbackConsumerGrant('0004', 'both', 'original')],
  },
  {
    dataProductId: ESTV_PRODUCT_ID,
    consumerType: 'machine',
    identityId: 'svc-estv-cantonal-tax-dashboard',
    displayName: 'svc-estv-cantonal-tax-dashboard',
    organization: 'Kanton St. Gallen',
    grants: [fallbackConsumerGrant('0005', 'http', 'modified')],
  },
  {
    dataProductId: ESTV_PRODUCT_ID,
    consumerType: 'machine',
    identityId: 'svc-zrh-tax-analysis',
    displayName: 'svc-zrh-tax-analysis',
    organization: 'Kanton Zürich',
    grants: [fallbackConsumerGrant('0006', 'postgresql', 'original')],
  },
  {
    dataProductId: '16666666-6666-4666-8666-666666666666',
    consumerType: 'machine',
    identityId: 'svc-estv-refund-monitoring',
    displayName: 'svc-estv-refund-monitoring',
    organization: 'ESTV',
    grants: [fallbackConsumerGrant('0007', 'http', 'modified')],
  },
];

function fallbackConsumerGrant(
  suffix: string,
  protocol: AccessConsumerGrant['protocol'],
  variant: AccessConsumerGrant['variant'],
): AccessConsumerGrant {
  return {
    grantId: `preview-grant-${suffix}`,
    policyRevision: 1,
    requestNumber: `ZA-2026-CONS-${suffix}`,
    protocol,
    variant,
    validFrom: '2026-01-01',
    validUntil: '2027-12-31',
    purpose: null,
    expiresInDays: 498,
    expiryState: 'active',
  };
}

export const FALLBACK_PRODUCT: DataProduct = {
  id: ESTV_PRODUCT_ID,
  globalId: 'urn:daca:ch:estv:tax-statistics-by-canton',
  originCatalog: 'estv.catalog.admin.ch',
  ownerUserId: 'kassandra.valdata',
  deputyOwnerUserId: 'joel.ruod',
  controlPersonUserId: 'thomas.kriegli',
  revision: 7,
  title: 'ESTV-Steuerstatistik nach Kanton',
  description:
    'Aggregierte jährliche Steuerstatistik der Schweizer Kantone. Das Datenprodukt enthält synthetische Werte für den DaCa-Proof-of-Concept und keine Personendaten.',
  owner: 'ESTV',
  domain: 'Direkte Bundessteuer',
  domains: [],
  glossaryTerms: [],
  pendingTermProposals: [],
  lifecycle: 'active',
  classification: 'restricted',
  keywords: ['Bundessteuer', 'Kantone', 'Steuerstatistik', 'synthetisch'],
  contact: 'data-products@estv.admin.ch',
  license: 'Confederation data use conditions',
  quality: 'Validated aggregate; completeness 100%',
  qualityMedal: 'bronze',
  qualityScore: 0,
  updateFrequency: 'Annual',
  additionalMetadata: {
    spatialCoverage: 'Switzerland',
    temporalCoverage: '2024',
    language: ['de', 'fr', 'it', 'en'],
    connectedAuthorities: ['26 Kantone'],
    deliveryProtocols: ['REST', 'PostgreSQL'],
    dataOwner: { name: 'Kassandra Valdata', organization: 'ESTV', avatarUrl: '/assets/kassandra-valdata.webp' },
    catalogUsage: {
      consumerUserIds: [],
      consumerMachineIds: [{ id: 'svc-estv-cantonal-tax-dashboard', label: 'Kantonales Steuerdashboard' }],
      responsibleUserIds: ['kassandra.valdata'],
      sharedByUserIds: ['kassandra.valdata'],
      requestedByUserIds: [],
      sharedWithUserIds: [],
    },
  },
  endpoints: [
    {
      id: 'endpoint-rest-estv',
      protocol: 'http-rest',
      title: 'Tax statistics REST API',
      method: 'GET',
      url: '/sample-api/api/v1/estv/tax-statistics',
      mediaType: 'application/json',
    },
    {
      id: 'endpoint-postgres-estv',
      protocol: 'postgresql',
      title: 'Governed PostgreSQL relation',
      host: 'postgres',
      port: 55432,
      database: 'daca_sample',
      schema: 'public',
      relation: 'tax_statistics',
      sslMode: 'prefer',
    },
  ],
  createdAt: '2026-07-21T10:10:00Z',
  updatedAt: '2026-08-03T08:30:00Z',
};

export const FALLBACK_PRODUCTS: readonly DataProduct[] = [
  FALLBACK_PRODUCT,
  {
    ...FALLBACK_PRODUCT,
    id: '12222222-2222-4222-8222-222222222222',
    globalId: 'urn:daca:ch:estv:direct-federal-tax-assessments',
    revision: 3,
    title: 'Direkte Bundessteuer – Veranlagungen nach Kanton und Gemeinde',
    description: 'Aggregierte Veranlagungen und Erträge der direkten Bundessteuer mit Kantons- und Gemeindebezug; ausschliesslich synthetische POC-Werte.',
    domain: 'Direkte Bundessteuer',
    classification: 'internal',
    keywords: ['Bundessteuer', 'Veranlagung', 'Kantone', 'Gemeinden'],
    updateFrequency: 'Quartalsweise',
    additionalMetadata: {
      connectedAuthorities: ['26 Kantone', 'Schweizer Gemeinden'],
      deliveryProtocols: ['REST'],
      dataOwner: { name: 'Kassandra Valdata', organization: 'ESTV', avatarUrl: '/assets/kassandra-valdata.webp' },
      catalogUsage: {
        consumerUserIds: [], consumerMachineIds: [], responsibleUserIds: ['kassandra.valdata'],
        sharedByUserIds: [], requestedByUserIds: [], sharedWithUserIds: [],
      },
    },
    endpoints: [],
    createdAt: '2026-07-29T13:40:00Z',
    updatedAt: '2026-08-08T09:15:00Z',
  },
  {
    ...FALLBACK_PRODUCT,
    id: '13333333-3333-4333-8333-333333333333',
    globalId: 'urn:daca:ch:estv:vat-sector-indicators',
    ownerUserId: 'ariane.keller',
    deputyOwnerUserId: 'kassandra.valdata',
    revision: 5,
    title: 'Mehrwertsteuer – Branchenindikatoren',
    description: 'Synthetische, aggregierte Umsatz- und Abrechnungsindikatoren zur Mehrwertsteuer nach Branche und Wirtschaftsregion.',
    domain: 'Mehrwertsteuer',
    classification: 'internal',
    keywords: ['Mehrwertsteuer', 'MWST', 'Branchen', 'Umsatz'],
    updateFrequency: 'Monatlich',
    additionalMetadata: {
      connectedAuthorities: ['BFS', 'Kantonale Wirtschaftsämter'],
      deliveryProtocols: ['REST', 'PostgreSQL'],
      dataOwner: { name: 'Ariane Keller', organization: 'ESTV', avatarUrl: '/assets/data-owners/ariane-keller.webp' },
      catalogUsage: {
        consumerUserIds: ['kassandra.valdata'], consumerMachineIds: [], responsibleUserIds: [],
        sharedByUserIds: [], requestedByUserIds: [], sharedWithUserIds: ['kassandra.valdata'],
      },
    },
    endpoints: [],
    createdAt: '2026-07-31T09:05:00Z',
    updatedAt: '2026-08-09T07:30:00Z',
  },
  {
    ...FALLBACK_PRODUCT,
    id: '14444444-4444-4444-8444-444444444444',
    globalId: 'urn:daca:ch:cantons:withholding-tax-tariffs',
    originCatalog: 'urn:daca:catalog:cantonal-tax-authorities',
    ownerUserId: 'noemie.rochat',
    deputyOwnerUserId: 'lucien.morel',
    revision: 12,
    title: 'Quellensteuer – Tarife, Kantons- und Gemeindecodes',
    description: 'Harmonisierte synthetische Tarifparameter sowie Kantons- und Gemeindecodes für die Quellensteuerprüfung der ESTV.',
    owner: 'Kanton Neuchâtel',
    domain: 'Quellensteuer',
    classification: 'internal',
    keywords: ['Quellensteuer', 'Tarife', 'Kantone', 'Gemeindecodes'],
    updateFrequency: 'Monatlich',
    additionalMetadata: {
      connectedAuthorities: ['26 Kantone', 'Schweizer Gemeinden', 'ESTV'],
      deliveryProtocols: ['REST'],
      dataOwner: {
        name: 'Noémie Rochat', organization: 'Kanton Neuchâtel', avatarUrl: '/assets/data-owners/noemie-rochat.webp',
        phone: '+41 58 000 00 42', teamsUrl: 'https://teams.microsoft.com/l/chat/0/0?users=noemie.rochat%40example.admin.ch',
      },
      catalogUsage: {
        consumerUserIds: [],
        consumerMachineIds: [{ id: 'svc-estv-withholding-tax-validation', label: 'Quellensteuer-Prüfservice' }],
        responsibleUserIds: [],
        sharedByUserIds: [],
        requestedByUserIds: ['kassandra.valdata'],
        sharedWithUserIds: [],
      },
      accessRequest: {
        requestId: 'AR-NE-2026-0142', status: 'legal_review', updatedAt: '2026-08-08T14:20:00Z',
        detail: 'Der Kanton Neuchâtel prüft die Rechtsgrundlage für die Nutzung durch den ESTV-Prüfservice.',
      },
    },
    endpoints: [],
    createdAt: '2026-07-17T14:25:00Z',
    updatedAt: '2026-08-07T16:45:00Z',
  },
  {
    ...FALLBACK_PRODUCT,
    id: '17777777-7777-4777-8777-777777777777',
    globalId: 'urn:daca:ch:ne:corporate-federal-tax-factors',
    originCatalog: 'urn:daca:catalog:neuchatel',
    ownerUserId: 'noemie.rochat',
    deputyOwnerUserId: 'lucien.morel',
    revision: 6,
    title: 'Juristische Personen Neuchâtel – Steuerfaktoren für die direkte Bundessteuer',
    description: 'Synthetische aggregierte Steuerfaktoren juristischer Personen aus dem Kanton Neuchâtel für den Abgleich der direkten Bundessteuer; keine Einzel- oder Personendaten.',
    owner: 'Kanton Neuchâtel',
    domain: 'Direkte Bundessteuer',
    classification: 'restricted',
    keywords: ['Juristische Personen', 'Bundessteuer', 'Neuchâtel', 'Gemeinden'],
    contact: 'noemie.rochat@example.admin.ch',
    updateFrequency: 'Quartalsweise',
    additionalMetadata: {
      connectedAuthorities: ['Kanton Neuchâtel', 'Gemeinden des Kantons Neuchâtel', 'ESTV'],
      deliveryProtocols: ['REST'],
      dataOwner: {
        name: 'Noémie Rochat', organization: 'Kanton Neuchâtel', avatarUrl: '/assets/data-owners/noemie-rochat.webp',
        phone: '+41 58 000 00 42', teamsUrl: 'https://teams.microsoft.com/l/chat/0/0?users=noemie.rochat%40example.admin.ch',
      },
      catalogUsage: {
        consumerUserIds: ['kassandra.valdata'],
        consumerMachineIds: [{ id: 'svc-estv-corporate-tax-reconciliation', label: 'Unternehmenssteuer-Abgleich' }],
        responsibleUserIds: [],
        sharedByUserIds: [],
        requestedByUserIds: ['kassandra.valdata'],
        sharedWithUserIds: ['kassandra.valdata'],
      },
      accessRequest: {
        requestId: 'AR-NE-2026-0148', status: 'granted_modified', updatedAt: '2026-08-09T10:10:00Z',
        detail: 'Freigegeben mit Aggregation auf Gemeinde- und Branchenebene; Einzelwerte bleiben ausgeschlossen.',
      },
    },
    endpoints: [],
    createdAt: '2026-07-24T08:15:00Z',
    updatedAt: '2026-08-09T10:10:00Z',
  },
  {
    ...FALLBACK_PRODUCT,
    id: '15555555-5555-4555-8555-555555555555',
    globalId: 'urn:daca:ch:efv:nfa-tax-potential',
    originCatalog: 'urn:daca:catalog:efv',
    ownerUserId: 'daniel.aebischer',
    deputyOwnerUserId: 'simone.wyss',
    revision: 4,
    title: 'Ressourcenpotenzial NFA – Steuerbasis',
    description: 'Aggregierte synthetische Steuerbasis für das Ressourcenpotenzial im nationalen Finanzausgleich mit Datenbeiträgen der Kantone.',
    owner: 'EFV und Kantone',
    domain: 'Finanzausgleich',
    keywords: ['NFA', 'Ressourcenpotenzial', 'Steuerbasis', 'Kantone'],
    updateFrequency: 'Jährlich',
    additionalMetadata: {
      connectedAuthorities: ['EFV', 'ESTV', '26 Kantone'],
      deliveryProtocols: ['PostgreSQL'],
      dataOwner: { name: 'Daniel Aebischer', organization: 'EFV', avatarUrl: '/assets/data-owners/daniel-aebischer.webp' },
      catalogUsage: {
        consumerUserIds: ['kassandra.valdata'],
        consumerMachineIds: [{ id: 'svc-estv-federal-tax-forecast', label: 'Bundessteuer-Prognoseservice' }],
        responsibleUserIds: [],
        sharedByUserIds: [],
        requestedByUserIds: [],
        sharedWithUserIds: ['kassandra.valdata'],
      },
    },
    endpoints: [],
    createdAt: '2026-07-18T11:30:00Z',
    updatedAt: '2026-08-06T11:00:00Z',
  },
  {
    ...FALLBACK_PRODUCT,
    id: '16666666-6666-4666-8666-666666666666',
    globalId: 'urn:daca:ch:estv:withholding-tax-refunds-by-canton',
    revision: 2,
    title: 'Verrechnungssteuer – Rückerstattungen nach Kanton',
    description: 'Synthetische aggregierte Rückerstattungsvolumen der Verrechnungssteuer nach Kanton und Bearbeitungsperiode.',
    domain: 'Verrechnungssteuer',
    lifecycle: 'draft',
    keywords: ['Verrechnungssteuer', 'Rückerstattung', 'Kantone', 'Volumen'],
    updateFrequency: 'Quartalsweise',
    additionalMetadata: {
      connectedAuthorities: ['ESTV', 'Kantonale Steuerverwaltungen'],
      deliveryProtocols: ['REST'],
      dataOwner: { name: 'Kassandra Valdata', organization: 'ESTV', avatarUrl: '/assets/kassandra-valdata.webp' },
      catalogUsage: {
        consumerUserIds: [],
        consumerMachineIds: [{ id: 'svc-estv-refund-monitoring', label: 'Rückerstattungsmonitor' }],
        responsibleUserIds: ['kassandra.valdata'],
        sharedByUserIds: ['kassandra.valdata'],
        requestedByUserIds: [],
        sharedWithUserIds: [],
      },
    },
    endpoints: [],
    createdAt: '2026-08-01T09:45:00Z',
    updatedAt: '2026-08-05T13:20:00Z',
  },
];

export const FALLBACK_NODES: readonly LineageNode[] = [
  { id: 'cantonal-returns', label: 'Cantonal aggregates', detail: 'Validated annual source submissions', kind: 'source', catalog: '26 cantons' },
  { id: 'estv-stage', label: 'ESTV harmonisation', detail: 'Schema alignment, controls and aggregation', kind: 'transform', catalog: 'ESTV processing' },
  { id: 'tax-product', label: 'Tax statistics', detail: 'Versioned governed data product', kind: 'product', catalog: 'ESTV catalog' },
  { id: 'sg-analysis', label: 'SG finance analysis', detail: 'Authorised downstream REST/PostgreSQL use', kind: 'consumer', catalog: 'Kanton St. Gallen' },
];

export const FALLBACK_EDGES: readonly LineageEdge[] = [
  { id: 'edge-ingest', source: 'cantonal-returns', target: 'estv-stage', label: 'aggregates', state: 'verified' },
  { id: 'edge-publish', source: 'estv-stage', target: 'tax-product', label: 'publishes', state: 'verified' },
  { id: 'edge-consume', source: 'tax-product', target: 'sg-analysis', label: 'data.read', state: 'declared' },
];

export const FALLBACK_PROVENANCE: readonly ProvenanceEvent[] = [
  {
    id: 'prov-3',
    type: 'Policy published',
    actor: 'ESTV Data Owner',
    occurredAt: '2026-08-03T08:30:00Z',
    summary: 'PBAC revision 3 activated for HTTP and PostgreSQL.',
    evidence: 'sha256:843a…ef91',
  },
  {
    id: 'prov-2',
    type: 'Quality attested',
    actor: 'ESTV Data Steward',
    occurredAt: '2026-08-02T15:10:00Z',
    summary: 'Completeness and aggregate disclosure checks passed.',
    evidence: 'quality-run/2026-08-02-18',
  },
  {
    id: 'prov-1',
    type: 'Product revised',
    actor: 'estv-harmonisation-pipeline',
    occurredAt: '2026-08-01T06:00:00Z',
    summary: 'Annual synthetic 2024 canton aggregates published.',
    evidence: 'pipeline/estv-tax/9821',
  },
];

export const FALLBACK_POLICY: PolicyDefinition = {
  id: 'policy-estv-sg-read',
  revision: 3,
  state: 'published',
  effect: 'allow',
  subjects: ['kanton-st-gallen'],
  resources: { productId: ESTV_PRODUCT_ID, owner: 'ESTV' },
  actions: ['data.read'],
  protocols: ['http', 'postgresql'],
  opaRevision: 3,
  postgresRevision: 3,
  generatedRego: `package daca.estv.tax_statistics

import rego.v1

default allow := false

allow if {
  input.subject.id == "kanton-st-gallen"
  input.action == "data.read"
  input.resource.product_id == "${ESTV_PRODUCT_ID}"
  input.resource.owner == "ESTV"
  input.protocol in {"http", "postgresql"}
}`,
};
