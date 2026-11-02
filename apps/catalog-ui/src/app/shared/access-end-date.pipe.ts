import { DatePipe } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

/** The existing OPA/PostgreSQL policy ceiling represents no chosen end date. */
export const OPEN_ENDED_POLICY_DATE = '9999-12-31';

@Pipe({name:'accessEndDate',standalone:true})
export class AccessEndDatePipe implements PipeTransform {
  transform(value:string|null|undefined):string {
    if(value===null || value===OPEN_ENDED_POLICY_DATE)return 'Unbestimmtes Enddatum';
    return value ? new DatePipe('en-US').transform(value,'dd.MM.yyyy') ?? '–' : '–';
  }
}
