import { EndpointDescriptor } from '../core/catalog.models';

export type DaaifHttpFormat = 'rest' | 'csv' | 'xlsx' | 'parquet';
const FORMATS: Record<DaaifHttpFormat, {label:string;mediaType:string}> = {
  rest:{label:'HTTP / REST (JSON)',mediaType:'application/json'},
  csv:{label:'HTTP / CSV',mediaType:'text/csv'},
  xlsx:{label:'HTTP / Excel (.xlsx)',mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
  parquet:{label:'HTTP / Parquet',mediaType:'application/vnd.apache.parquet'},
};
export interface DaaifHttpRepresentation { id:string; format:DaaifHttpFormat; label:string; endpointUrl:string; launchUrl:string; }

/** Use registered HTTP descriptors only; keep demo identity out of stored URLs. */
export function daaifHttpRepresentations(endpoints:readonly EndpointDescriptor[],userId:string):DaaifHttpRepresentation[] {
  const result:DaaifHttpRepresentation[]=[];
  for(const endpoint of endpoints){
    if(endpoint.protocol!=='http-rest'||endpoint.method!=='GET')continue;
    try{
      const url=new URL(endpoint.url);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)continue;
      const match=url.pathname.match(/^\/api\/public\/data-products\/([a-z0-9-]+)(?:\/download\/(csv|xlsx|parquet))?$/);
      if(!match)continue;
      const format=(match[2]??'rest') as DaaifHttpFormat;
      if(endpoint.mediaType.split(';')[0].trim().toLowerCase()!==FORMATS[format].mediaType)continue;
      if(result.some(item=>item.format===format))continue;
      const endpointUrl=url.toString();
      url.pathname=`/dataproducts/${match[1]}`;
      url.search=new URLSearchParams({demoUser:userId,format}).toString();
      result.push({id:endpoint.id,format,label:FORMATS[format].label,endpointUrl,launchUrl:url.toString()});
    }catch{ /* Invalid descriptors do not become data links. */ }
  }
  const order=Object.keys(FORMATS);
  return result.sort((a,b)=>order.indexOf(a.format)-order.indexOf(b.format));
}

export function endpointFormatLabel(endpoint:EndpointDescriptor):string {
  if(endpoint.protocol==='postgresql')return 'PostgreSQL';
  const mediaType=endpoint.mediaType.split(';')[0].trim().toLowerCase();
  return Object.values(FORMATS).find(item=>item.mediaType===mediaType)?.label??'HTTP';
}
