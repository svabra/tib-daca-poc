import { DataProduct, DomainSummary, GlossaryTermSummary } from '../../core/catalog.models';
import { LogicalModelSummary, PhysicalSnapshot, PhysicalSource, PhysicalTable } from '../data-models/data-models.models';
import { physicalConnectionStatus } from '../data-models/physical-connection-status';
import { catalogDataProductMatches, catalogProductMatches } from '../welcome/welcome-search';

export type SearchKind='product'|'logical'|'structure'|'field'|'term'|'domain'|'source';
export type SearchMode='context'|'focus';
export interface SearchDomain {id:string;label:string;}
export interface CatalogSearchAsset {
  key:string;id:string;kind:SearchKind;label:string;description:string;context:readonly string[];
  organization:string;domains:readonly SearchDomain[];status:string;route:readonly string[];
  params?:Record<string,string>;updatedAt?:string;identifier?:string;dataType?:string;nullable?:boolean;
  connection?:ReturnType<typeof physicalConnectionStatus>;product?:DataProduct;
  parent?:CatalogSearchAsset;keywords?:readonly string[];
  physicalType?:PhysicalTable['kind'];sourceType?:PhysicalSource['connectorType'];
}
export interface SearchGroup {key:string;parent:CatalogSearchAsset;matches:readonly CatalogSearchAsset[];children:readonly CatalogSearchAsset[];parentMatches:boolean;}

export const SEARCH_KINDS:readonly SearchKind[]=['product','logical','structure','field','term','domain','source'];
export const SEARCH_ICONS:Record<SearchKind,string>={product:'box',logical:'hierarchy',structure:'schema',field:'forms',term:'book',domain:'database',source:'server'};

export function searchAssetIcon(asset:CatalogSearchAsset):string{
  if(asset.kind==='structure'){
    if(asset.sourceType==='s3'||asset.physicalType==='parquet')return 'cube';
    if(asset.physicalType==='view'||asset.physicalType==='materialized_view')return 'table-options';
    return asset.physicalType==='table'?'table':SEARCH_ICONS.structure;
  }
  if(asset.kind==='source')return asset.sourceType==='s3'?'cloud':asset.sourceType==='csv'?'file-spreadsheet':asset.sourceType?'database':SEARCH_ICONS.source;
  return SEARCH_ICONS[asset.kind];
}

export function productSearchAsset(product:DataProduct):CatalogSearchAsset{
  return{key:'product:'+product.id,id:product.id,kind:'product',label:product.title,description:product.description,
    context:[product.domain,product.owner].filter(Boolean),organization:product.owner,
    domains:product.domains.length?product.domains.map(item=>({id:item.id,label:item.preferredLabel})):[{id:product.domain,label:product.domain}],
    status:product.lifecycle,route:['/products',product.id,'overview'],updatedAt:product.updatedAt,identifier:product.globalId,product};
}

export function domainSearchAsset(domain:DomainSummary):CatalogSearchAsset{
  return{key:'domain:'+domain.id,id:domain.id,kind:'domain',label:domain.preferredLabel,description:domain.definition,
    context:[domain.ownerOrganization].filter(Boolean),organization:domain.ownerOrganization,
    domains:[{id:domain.id,label:domain.preferredLabel}],status:domain.status,route:['/domains',domain.id],updatedAt:domain.updatedAt,identifier:domain.urn,
    keywords:domain.labels.flatMap(item=>[item.preferredLabel,item.definition,...item.alternativeLabels])};
}
export function termSearchAsset(term:GlossaryTermSummary):CatalogSearchAsset{
  return{key:'term:'+term.id,id:term.id,kind:'term',label:term.preferredLabel,description:term.definition,
    context:term.domains.map(item=>item.preferredLabel),organization:term.domains[0]?.ownerOrganization??'',
    domains:term.domains.map(item=>({id:item.id,label:item.preferredLabel})),status:term.status,
    route:['/domains/terminology'],params:{termId:term.id,q:term.preferredLabel},updatedAt:term.updatedAt,identifier:term.urn,
    keywords:term.labels.flatMap(item=>[item.preferredLabel,item.definition,...item.alternativeLabels])};
}
export function logicalSearchAsset(model:LogicalModelSummary,domains:readonly DomainSummary[]=[]):CatalogSearchAsset{
  const domainLabel=domains.find(domain=>domain.id===model.dataDomain.id)?.preferredLabel??(model.dataDomain.displayName===model.dataDomain.id?'':model.dataDomain.displayName);
  return{key:'logical:'+model.id,id:model.id,kind:'logical',label:model.title.de||model.title.en,description:model.description.de||model.description.en,
    context:[domainLabel,model.office].filter(Boolean),organization:model.office,
    domains:model.dataDomain.id?[{id:model.dataDomain.id,label:domainLabel||model.dataDomain.id}]:[],status:model.status,
    route:['/models',model.id],updatedAt:model.updatedAt,identifier:model.urn,keywords:[model.dataDomain.id,...Object.values(model.title),...Object.values(model.description),...model.identifiers].filter((value):value is string=>typeof value==='string')};
}
export function sourceSearchAsset(source:PhysicalSource):CatalogSearchAsset{
  return{key:'source:'+source.id,id:source.id,kind:'source',label:source.name,description:source.description??'',
    context:[source.databaseName,source.catalogPath].filter(Boolean),organization:source.office||source.ownerName,
    domains:[],status:source.lifecycle??'active',route:['/physical-models',source.id],updatedAt:source.updatedAt,
    sourceType:source.connectorType,keywords:[source.ownerName,source.systemName]};
}
export function physicalSearchAssets(source:PhysicalSource,snapshot:PhysicalSnapshot):CatalogSearchAsset[]{
  const connection=physicalConnectionStatus(snapshot);
  return snapshot.tables.flatMap(table=>{
    const parent:CatalogSearchAsset={key:'table:'+table.id,id:table.id,kind:'structure',physicalType:table.kind,sourceType:snapshot.sourceType,label:table.kind==='parquet'?table.name:[table.databaseName||snapshot.databaseName,table.schemaName,table.name].filter(Boolean).join('.'),
      description:table.comment??'',context:[source.name,table.databaseName||snapshot.databaseName,table.schemaName].filter(Boolean),
      organization:source.office||source.ownerName,domains:(table.dataDomains??[]).map(item=>({id:item.id,label:item.displayName})),
      status:source.lifecycle??'active',route:['/physical-models',source.id],params:{snapshotId:snapshot.id,tableId:table.id},updatedAt:snapshot.importedAt,
      identifier:table.stableKey,connection,keywords:[table.storageLocation??'']};
    return[parent,...table.columns.map(column=>({...parent,key:'field:'+column.id,id:column.id,kind:'field' as const,label:column.name,
      description:column.comment??'',context:[source.name,table.schemaName,table.name].filter(Boolean),
      params:{snapshotId:snapshot.id,tableId:table.id,columnId:column.id},dataType:column.dataType,nullable:column.importMetadata?.nullabilityKnown===false?undefined:column.nullable,
      identifier:column.id,parent,keywords:[column.rawDataType??'']}))];
  });
}

export function searchAssetMatches(asset:CatalogSearchAsset,query:string):boolean{
  if(asset.product)return catalogDataProductMatches(query,asset.product);
  return catalogProductMatches(query,[asset.label,asset.description,...asset.context,asset.organization,asset.identifier??'',asset.dataType??'',
    ...asset.domains.map(item=>item.label),...(asset.keywords??[])]);
}
export function groupSearchAssets(assets:readonly CatalogSearchAsset[]):SearchGroup[]{
  const groups=new Map<string,{parent:CatalogSearchAsset;matches:CatalogSearchAsset[]}>();
  for(const asset of assets){const parent=asset.parent??asset;let group=groups.get(parent.key);if(!group){group={parent,matches:[]};groups.set(parent.key,group);}group.matches.push(asset);}
  return[...groups.entries()].map(([key,{parent,matches}])=>({key,parent,matches,children:matches.filter(item=>item.key!==parent.key),parentMatches:matches.some(item=>item.key===parent.key)}));
}
