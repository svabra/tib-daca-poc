import {
  EndpointDescriptor,
  ProductDictionaryField,
  ProductQualityMapping,
} from '../../core/catalog.models';

type RestEndpoint = Extract<EndpointDescriptor, { protocol: 'http-rest' }>;
type PostgreSQLEndpoint = Extract<EndpointDescriptor, { protocol: 'postgresql' }>;

export interface DictionaryFieldPresentation extends ProductDictionaryField {
  ontology: ProductQualityMapping | null;
  gaps: readonly string[];
  complete: boolean;
}

export interface RestQuickstart {
  url: string;
  command: string;
}

export interface PostgreSQLQuickstart {
  connectionParameters: string;
  query: string;
}

const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=[A-Za-z0-9!#$&^_.+-]+)*$/;

export function presentDictionaryFields(
  fields: readonly ProductDictionaryField[],
  mappings: readonly ProductQualityMapping[],
): readonly DictionaryFieldPresentation[] {
  return fields.map((field) => {
    const candidates = mappings.filter((mapping) =>
      mapping.mappingType === 'field_property' && mapping.fieldId === field.id,
    );
    const ontology = candidates.find((mapping) => mapping.status === 'confirmed')
      ?? candidates.find((mapping) => mapping.status === 'suggested')
      ?? candidates[0]
      ?? null;
    const gaps: string[] = [];
    if (!field.businessDescription?.trim()) gaps.push('Fachliche Beschreibung fehlt');
    if (field.keyField && ontology?.status !== 'confirmed') {
      gaps.push(ontology?.status === 'suggested'
        ? 'Ontologie-Zuordnung muss bestätigt werden'
        : 'Bestätigte Ontologie-Zuordnung fehlt');
    }
    return { ...field, ontology, gaps, complete: gaps.length === 0 };
  });
}

export function filterDictionaryFields(
  fields: readonly DictionaryFieldPresentation[],
  query: string,
): readonly DictionaryFieldPresentation[] {
  const needle = query.trim().toLocaleLowerCase('de-CH');
  if (!needle) return fields;
  return fields.filter((field) => [
    field.name,
    field.dataType,
    field.businessDescription ?? '',
    field.ontology?.termLabel ?? '',
    field.ontology?.termUri ?? '',
  ].some((value) => value.toLocaleLowerCase('de-CH').includes(needle)));
}

export function restQuickstart(endpoint: RestEndpoint, demoUserId: string): RestQuickstart | null {
  const url = endpoint.url.trim();
  const mediaType = endpoint.mediaType.trim();
  const userId = demoUserId.trim();
  if (
    !url
    || /[\r\n]/.test(url)
    || !MEDIA_TYPE.test(mediaType)
    || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,199}$/.test(userId)
  ) return null;
  try {
    const parsed = url.startsWith('/') ? new URL(url, 'https://daca.invalid') : new URL(url);
    if (!url.startsWith('/') && !['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.search || parsed.hash) return null;
  } catch {
    return null;
  }
  const parts = [
    `curl.exe --request ${endpoint.method}`,
    `--url '${url.replaceAll("'", "''")}'`,
    `--header 'Accept: ${mediaType.replaceAll("'", "''")}'`,
    `--header 'X-DaCa-User: ${userId}'`,
  ];
  if (endpoint.method === 'POST') {
    parts.push(`--header 'Content-Type: ${mediaType.replaceAll("'", "''")}'`);
    parts.push("--data '@<request-body>'");
  }
  return { url, command: parts.join(' ') };
}

export function postgreSQLQuickstart(endpoint: PostgreSQLEndpoint): PostgreSQLQuickstart | null {
  const values = [endpoint.host, endpoint.database, endpoint.schema, endpoint.relation];
  if (
    values.some((value) => !value.trim() || /[\r\n\0]/.test(value))
    || /[@/?#]/.test(endpoint.host)
    || !Number.isInteger(endpoint.port)
    || endpoint.port < 1
    || endpoint.port > 65535
  ) return null;
  return {
    connectionParameters: [
      `host=${quoteConnectionValue(endpoint.host)}`,
      `port=${endpoint.port}`,
      `dbname=${quoteConnectionValue(endpoint.database)}`,
      `sslmode=${endpoint.sslMode}`,
    ].join(' '),
    query: `SELECT * FROM ${quoteIdentifier(endpoint.schema)}.${quoteIdentifier(endpoint.relation)} LIMIT 100;`,
  };
}

export function endpointIsInternal(endpoint: EndpointDescriptor): boolean {
  const hostname = endpoint.protocol === 'postgresql'
    ? endpoint.host.trim().toLowerCase()
    : hostnameFromUrl(endpoint.url);
  if (!hostname) return true;
  if (hostname === 'localhost' || hostname === '::1' || hostname === '127.0.0.1') return true;
  if (!hostname.includes('.')) return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.svc')) return true;
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  const private172 = /^172\.(\d{1,2})\./.exec(hostname);
  return private172 ? Number(private172[1]) >= 16 && Number(private172[1]) <= 31 : false;
}

function hostnameFromUrl(value: string): string {
  if (value.trim().startsWith('/')) return '';
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function quoteConnectionValue(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
