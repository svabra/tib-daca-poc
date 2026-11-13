export const CREATION_FORMATS = [
  {value:'parquet',label:'Parquet'}, {value:'http-rest',label:'HTTP REST API'},
  {value:'csv',label:'CSV'}, {value:'xlsx',label:'Excel'},
] as const;
export type CreationFormat = typeof CREATION_FORMATS[number]['value'];
export const CREATION_FREQUENCIES = [
  {value:'once',label:'Einmalig'}, {value:'realtime',label:'Real-time < 5 seconds'},
  {value:'hourly',label:'Stündlich'}, {value:'daily',label:'Täglich'},
  {value:'weekly',label:'Wöchentlich'}, {value:'annually',label:'Jährlich'},
] as const;
export type CreationFrequency = typeof CREATION_FREQUENCIES[number]['value'];
export type BasisWindowType = 'fixed' | 'rolling';
export const ROLLING_WINDOW_UNITS = [
  {value:'days',label:'Tage',singular:'Tag'}, {value:'weeks',label:'Wochen',singular:'Woche'},
  {value:'months',label:'Monate',singular:'Monat'}, {value:'years',label:'Jahre',singular:'Jahr'},
] as const;
export type RollingWindowUnit = typeof ROLLING_WINDOW_UNITS[number]['value'];
export function rollingWindowLabel(size:number|null|undefined,unit:string|null|undefined):string {
  const option=ROLLING_WINDOW_UNITS.find(option=>option.value===unit);
  return `${size ?? ''} ${size === 1 ? option?.singular : option?.label}`.trim();
}
export function creationFormatLabel(value:string):string { return CREATION_FORMATS.find(option=>option.value===value)?.label ?? value; }
export function creationFrequencyLabel(value:string|null|undefined):string { return CREATION_FREQUENCIES.find(option=>option.value===value)?.label ?? value ?? 'Nicht angegeben'; }
