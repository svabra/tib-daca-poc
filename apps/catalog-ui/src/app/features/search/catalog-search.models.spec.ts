import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { FALLBACK_PHYSICAL_SNAPSHOT } from '../data-models/mapping-fallback';
import { PhysicalSource } from '../data-models/data-models.models';
import { groupSearchAssets, physicalSearchAssets, productSearchAsset, searchAssetIcon, searchAssetMatches } from './catalog-search.models';

export const SEARCH_SOURCE:PhysicalSource={id:FALLBACK_PHYSICAL_SNAPSHOT.sourceId,name:'Gebäudeinventar',revision:1,connectorType:'csv',department:'VBS',office:'armasuisse',systemName:'ImmoGIS',databaseName:'CSV',latestSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,latestSnapshotSequence:1,latestSnapshot:null,catalogPath:'urn:daca:source:test',ownerName:'Owner',updatedAt:'2026-10-30'};

describe('Catalog search asset projection',()=>{
  it.each([
    ['postgresql','table','table'],['postgresql','view','table-options'],
    ['postgresql','materialized_view','table-options'],['s3','parquet','cube'],['s3','table','cube'],
  ] as const)('groups %s %s under Data Structures while retaining its concrete icon', (sourceType,kind,icon)=>{
    const snapshot={...FALLBACK_PHYSICAL_SNAPSHOT,sourceType,tables:[{...FALLBACK_PHYSICAL_SNAPSHOT.tables[0],kind}]};
    const assets=physicalSearchAssets(SEARCH_SOURCE,snapshot),structure=assets[0];
    expect(structure.kind).toBe('structure');expect(structure.physicalType).toBe(kind);expect(searchAssetIcon(structure)).toBe(icon);
    expect(assets[1].parent?.key).toBe(structure.key);expect(searchAssetIcon(assets[1])).toBe('forms');
  });
  it('keeps physical fields under their exact authorized source, snapshot and table',()=>{
    const snapshot={...FALLBACK_PHYSICAL_SNAPSHOT,sourceType:'csv' as const,sourceConnectionConfigured:false};
    const assets=physicalSearchAssets(SEARCH_SOURCE,snapshot),field=assets.find(item=>item.kind==='field')!;
    expect(field.parent?.key).toBe('table:'+snapshot.tables[0].id);
    expect(field.params).toEqual({snapshotId:snapshot.id,tableId:snapshot.tables[0].id,columnId:snapshot.tables[0].columns[0].id});
    expect(field.route).toEqual(['/physical-models',SEARCH_SOURCE.id]);
    expect(field.connection?.configured).toBe(false);
    expect(field.nullable).toBe(snapshot.tables[0].columns[0].nullable);
  });
  it('matches field names, context and accents while keeping parent context out of result counts',()=>{
    const assets=physicalSearchAssets(SEARCH_SOURCE,FALLBACK_PHYSICAL_SNAPSHOT);
    const fields=assets.filter(item=>item.kind==='field'&&searchAssetMatches(item,'Gebaudeinventar'));
    expect(fields.length).toBeGreaterThan(0);
    const groups=groupSearchAssets(fields);
    expect(groups.reduce((count,group)=>count+group.matches.length,0)).toBe(fields.length);
    expect(groups.every(group=>group.parentMatches===false)).toBe(true);
  });
  it('does not imply a known nullability or connection from an imported inventory',()=>{
    const first=FALLBACK_PHYSICAL_SNAPSHOT.tables[0];
    const snapshot={...FALLBACK_PHYSICAL_SNAPSHOT,sourceType:'csv' as const,tables:[{...first,columns:[{...first.columns[0],importMetadata:{format:'daca-structure-csv-v1' as const,records:[],nullabilityKnown:false}}]}]};
    const field=physicalSearchAssets(SEARCH_SOURCE,snapshot).find(item=>item.kind==='field')!;
    expect(field.nullable).toBeUndefined();expect(field.connection?.configured).toBe(false);
  });
  it('retains product search and navigation semantics',()=>{
    const asset=productSearchAsset(FALLBACK_PRODUCT);
    expect(searchAssetMatches(asset,'Steuerstatistik')).toBe(true);
    expect(asset.route).toEqual(['/products',FALLBACK_PRODUCT.id,'overview']);
    expect(asset.product).toBe(FALLBACK_PRODUCT);
  });
});
