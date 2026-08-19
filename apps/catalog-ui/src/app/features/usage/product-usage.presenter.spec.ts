import { normalizeEndpoint } from '../../core/catalog-api.service';
import { EndpointDescriptor, ProductDictionaryField, ProductQualityMapping } from '../../core/catalog.models';
import {
  endpointIsInternal,
  filterDictionaryFields,
  postgreSQLQuickstart,
  presentDictionaryFields,
  restQuickstart,
} from './product-usage.presenter';

const fields: ProductDictionaryField[] = [
  { id: 'canton', name: 'canton_code', dataType: 'VARCHAR', nullable: false, keyField: true, businessDescription: 'Offizielles Kantonskürzel' },
  { id: 'amount', name: 'net_amount_chf', dataType: 'DECIMAL(18,2)', nullable: true, keyField: false, businessDescription: null },
];
const mappings: ProductQualityMapping[] = [{
  id: 'mapping-canton',
  fieldId: 'canton',
  mappingType: 'field_property',
  status: 'suggested',
  termUri: 'urn:daca:ontology:tax:v1#CantonCode',
  termLabel: 'Kanton',
}];

describe('product usage presenter', () => {
  it('derives transparent metadata gaps and searches all dictionary meanings', () => {
    const presented = presentDictionaryFields(fields, mappings);

    expect(presented[0].complete).toBe(false);
    expect(presented[0].gaps).toEqual(['Ontologie-Zuordnung muss bestätigt werden']);
    expect(presented[1].gaps).toEqual(['Fachliche Beschreibung fehlt']);
    expect(filterDictionaryFields(presented, 'kanton')).toEqual([presented[0]]);
    expect(filterDictionaryFields(presented, 'DECIMAL')).toEqual([presented[1]]);
    expect(filterDictionaryFields(presented, '')).toEqual(presented);
  });

  it('creates a PoC curl quickstart with the real media type and current demo identity only', () => {
    const endpoint: EndpointDescriptor = {
      id: 'rest', protocol: 'http-rest', title: 'Parquet', method: 'GET',
      url: 'https://data.example.admin.ch/api/v1/product', mediaType: 'application/vnd.apache.parquet',
    };
    const quickstart = restQuickstart(endpoint, 'beat.stalder');

    expect(quickstart?.command).toContain("--header 'Accept: application/vnd.apache.parquet'");
    expect(quickstart?.command).toContain("--header 'X-DaCa-User: beat.stalder'");
    expect(quickstart?.command).not.toMatch(/authorization|password|secret|token/i);
  });

  it('uses an explicit POST body placeholder without inventing payload data', () => {
    const endpoint: EndpointDescriptor = {
      id: 'post', protocol: 'http-rest', title: 'Import', method: 'POST',
      url: 'https://data.example.admin.ch/import', mediaType: 'application/json',
    };
    const quickstart = restQuickstart(endpoint, 'beat.stalder');

    expect(quickstart?.command).toContain("--header 'Content-Type: application/json'");
    expect(quickstart?.command).toContain("--data '@<request-body>'");
    expect(quickstart?.command).not.toContain('{');
  });

  it('refuses credential-bearing or malformed REST values', () => {
    const credentialed: EndpointDescriptor = {
      id: 'unsafe', protocol: 'http-rest', title: 'Unsafe', method: 'GET',
      url: 'https://alice:example@data.example/api', mediaType: 'application/json',
    };
    const querySecret = { ...credentialed, url: 'https://data.example/api?access_token=example' };
    const opaqueSignature = { ...credentialed, url: 'https://data.example/api?sig=must-not-copy' };

    expect(restQuickstart(credentialed, 'beat.stalder')).toBeNull();
    expect(restQuickstart(querySecret, 'beat.stalder')).toBeNull();
    expect(restQuickstart(opaqueSignature, 'beat.stalder')).toBeNull();
    expect(restQuickstart({ ...credentialed, url: 'https://data.example/api' }, 'bad\nheader')).toBeNull();
    expect(restQuickstart({
      ...credentialed,
      url: 'https://data.example/api',
      mediaType: 'Authorization: Bearer top-secret-token',
    }, 'beat.stalder')).toBeNull();
  });

  it('creates credential-free PostgreSQL parameters and safely quotes identifiers', () => {
    const endpoint: EndpointDescriptor = {
      id: 'pg', protocol: 'postgresql', title: 'OLAP', host: 'postgres.internal', port: 5432,
      database: 'daca_sample', schema: 'tax-data', relation: 'refund"facts', sslMode: 'verify-full',
    };
    const quickstart = postgreSQLQuickstart(endpoint);

    expect(quickstart?.connectionParameters).toBe("host='postgres.internal' port=5432 dbname='daca_sample' sslmode=verify-full");
    expect(quickstart?.query).toBe('SELECT * FROM "tax-data"."refund""facts" LIMIT 100;');
    expect(JSON.stringify(quickstart)).not.toMatch(/password|secret|token|authorization|user=/i);
  });

  it('preserves endpoint mediaType and sslMode while discarding internal secret references', () => {
    const rest = normalizeEndpoint({
      id: 'rest', name: 'Parquet API', protocol: 'http-rest',
      connection: { baseUrl: 'https://data.example', path: '/product', method: 'GET', mediaType: 'application/vnd.apache.parquet' },
      secretRef: 'must-not-survive',
    } as never);
    const postgres = normalizeEndpoint({
      id: 'pg', name: 'Warehouse', protocol: 'postgresql',
      connection: { host: 'postgres', port: 5432, database: 'catalog', schema: 'public', relation: 'facts', sslMode: 'require' },
      secretRef: 'must-not-survive',
    } as never);

    expect(rest).toMatchObject({ mediaType: 'application/vnd.apache.parquet' });
    expect(postgres).toMatchObject({ sslMode: 'require' });
    expect(JSON.stringify([rest, postgres])).not.toContain('must-not-survive');
    expect('secretRef' in rest).toBe(false);
    expect('secretRef' in postgres).toBe(false);
  });

  it('labels namespace, loopback and private-network endpoints as internal', () => {
    expect(endpointIsInternal({ id: 'one', protocol: 'http-rest', title: 'API', method: 'GET', url: '/sample-api', mediaType: 'application/json' })).toBe(true);
    expect(endpointIsInternal({ id: 'two', protocol: 'postgresql', title: 'PG', host: 'postgres', port: 5432, database: 'db', schema: 'public', relation: 'facts', sslMode: 'prefer' })).toBe(true);
    expect(endpointIsInternal({ id: 'three', protocol: 'http-rest', title: 'API', method: 'GET', url: 'https://data.example.admin.ch/api', mediaType: 'application/json' })).toBe(false);
  });
});
