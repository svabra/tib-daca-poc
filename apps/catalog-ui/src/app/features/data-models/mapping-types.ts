import { MappingType } from './data-models.models';

export const MAPPING_TYPE_OPTIONS: readonly {value:MappingType;label:string;description:string}[] = [
  {value:'Direct',label:'Direkt',description:'Unveränderte Übernahme eines Feldwerts, zum Beispiel vehicle_id → vehicle_id.'},
  {value:'Renamed',label:'Umbenannt',description:'Gleicher Wert unter einem anderen Feldnamen, zum Beispiel name → designation_de.'},
  {value:'Derived',label:'Abgeleitet',description:'Ein Wert wird aus einem oder mehreren Feldern berechnet, zum Beispiel Gesamtgewicht = Leergewicht + Zuladung.'},
  {value:'Lookup',label:'Werteliste / Nachschlagen',description:'Ein Wert wird über eine Referenz oder Werteliste zugeordnet, zum Beispiel Kategoriecode → Kategoriename.'},
  {value:'Transformed',label:'Transformiert',description:'Ein Wert wird nach einer Regel umgewandelt, zum Beispiel Gramm → Kilogramm oder Text → Datum.'},
];
export function mappingTypeDescription(type:MappingType):string{return MAPPING_TYPE_OPTIONS.find((item)=>item.value===type)?.description??'';}

export function compatibleType(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('en').replace(/^xsd:/, '');
  if (['varchar', 'character varying', 'char', 'character', 'text', 'citext', 'string'].includes(normalized)) return 'string';
  if (['smallint', 'integer', 'bigint', 'int8', 'int16', 'int32', 'int64'].includes(normalized)) return 'integer';
  if (['numeric', 'decimal', 'real', 'double precision', 'float', 'double'].includes(normalized) || normalized.startsWith('decimal')) return 'decimal';
  if (['bool', 'boolean'].includes(normalized)) return 'boolean';
  if (normalized.includes('timestamp') || normalized === 'datetime' || normalized === 'date-time') return 'datetime';
  if (normalized.startsWith('time')) return 'time';
  if (normalized.endsWith('[]') || normalized.startsWith('array') || normalized.startsWith('list<')) return 'array';
  return normalized.replaceAll(' ', '_');
}
