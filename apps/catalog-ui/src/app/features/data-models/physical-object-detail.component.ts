import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PhysicalSnapshot, PhysicalSource, PhysicalTable } from './data-models.models';

@Component({
  selector: 'daca-physical-object-detail', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="object-detail">
      <header><div><p class="daca-eyebrow">{{ typeLabel() }}</p><h2>{{ table().name }}</h2><code>{{ table().storageLocation || (snapshot().sourceType === 'csv' ? snapshot().catalogPath + ':' + table().stableKey : snapshot().catalogPath + table().schemaName + '/' + table().name) }}</code></div><ng-content /></header>
      @if(snapshot().sourceType === 'csv'){<p class="inventory-origin">Herkunft: Aus Strukturinventar · {{ source().name }}</p>}
      <section class="object-facts"><div><h3>Quelle und Verantwortung</h3><p>{{ source().name }} · {{ source().ownerName }}</p><p>Snapshot {{ snapshot().revision }}@if(table().databaseName){ · {{ table().databaseName }}}</p></div><dl><div><dt>Objekt</dt><dd>{{ typeLabel() }}</dd></div><div><dt>Spalten</dt><dd>{{ table().columns.length }}</dd></div><div><dt>{{ table().kind === 'parquet' ? 'Zeilen (Parquet-Footer)' : 'Zeilen' }}</dt><dd>{{ table().rowCount ?? 'Nicht erhoben' }}</dd></div><div><dt>Dateigrösse</dt><dd>{{ table().sizeBytes === null ? 'Nicht erhoben' : table().sizeBytes + ' Bytes' }}</dd></div><div><dt>Datenzugriff</dt><dd>Keine Datenzeilen in dieser Ansicht</dd></div></dl></section>
      <section class="columns-section"><header><div><p class="daca-eyebrow">Struktur</p><h3>Spalten</h3></div><span>Nur Strukturmetadaten</span></header><div class="daca-table-wrap" role="region" tabindex="0" [attr.aria-label]="'Felder von ' + table().name"><table class="daca-table field-table"><thead><tr><th>#</th><th>Feld</th><th>Datentyp</th><th>Länge</th><th>Precision / Scale</th><th>Nullability</th><th>Kommentar</th></tr></thead><tbody>@for (column of table().columns; track column.id) {<tr><td>{{ column.ordinalPosition }}</td><th scope="row">{{ column.name }}</th><td><code>{{ column.dataType }}</code></td><td>{{ column.length ?? '–' }}</td><td>{{ column.precision ?? '–' }} / {{ column.scale ?? '–' }}</td><td>{{ column.importMetadata?.nullabilityKnown === false ? 'Nicht angegeben' : column.nullable ? 'NULL' : 'NOT NULL' }}</td><td>{{ column.comment || '–' }}</td></tr>}</tbody></table></div></section>
      @if (table().importMetadata) {
        <section class="columns-section csv-originals"><p class="daca-eyebrow">CSV-Originalangaben</p><p>Originaltypen und ergänzende Angaben aus dem Strukturinventar; Klassifizierungen wurden nicht in eine Zugriffspolicy umgewandelt.</p>
          @for (column of table().columns; track column.id) {
            <details><summary>{{ column.name }} · {{ column.rawDataType }}@if ((column.importMetadata?.records?.length ?? 0) > 1) { · mehrere Beschreibungen }</summary>
              @for (record of column.importMetadata?.records ?? []; track $index) {<dl>@for (entry of entries(record); track entry[0]) {<div><dt>{{ entry[0] }}</dt><dd>{{ entry[1] || 'Nicht angegeben' }}</dd></div>}</dl>}
            </details>
          }
          @for (record of table().importMetadata?.recordsWithoutField ?? []; track $index) {<details><summary>Tabellenhinweis ohne Feldnamen</summary><dl>@for (entry of entries(record); track entry[0]) {<div><dt>{{ entry[0] }}</dt><dd>{{ entry[1] || 'Nicht angegeben' }}</dd></div>}</dl></details>}
        </section>
      }
    </article>
  `,
  styles: [`
    .csv-originals p{font-size:.72rem;color:var(--daca-muted)}.csv-originals details{border-top:1px solid var(--daca-border);padding:.6rem 0}.csv-originals summary{cursor:pointer;font-size:.75rem;font-weight:750}.csv-originals dl{display:grid;gap:.5rem}.csv-originals dl>div{display:grid;grid-template-columns:140px 1fr;gap:.6rem}.csv-originals dd{white-space:pre-wrap;overflow-wrap:anywhere}.inventory-origin{margin:.2rem 1rem .8rem;color:var(--daca-muted);font-size:.72rem}:host{display:block;min-width:0}.object-detail{min-width:0;border:1px solid var(--daca-border);border-top:5px solid var(--daca-blue);background:#fff}.object-detail>header{display:flex;justify-content:space-between;align-items:start;gap:1rem;padding:1rem}.object-detail h2{margin:.1rem 0;overflow-wrap:anywhere;font-size:1.25rem}.object-detail code{overflow-wrap:anywhere;color:var(--daca-muted);font-size:.65rem}.object-facts{display:grid;grid-template-columns:1fr 2fr;gap:1rem;margin:0 1rem;border-block:1px solid var(--daca-border);padding:1rem 0}.object-facts h3,dt{margin:.2rem 0;font-size:.62rem;text-transform:uppercase;color:var(--daca-muted)}.object-facts p,dd{margin:.3rem 0;font-size:.72rem}.object-facts dl{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin:0}.columns-section{padding:1rem}.columns-section>header{display:flex;justify-content:space-between;align-items:end;gap:.5rem}.columns-section h3{margin:.2rem 0 .6rem}.columns-section>header>span{font-size:.55rem;color:var(--daca-muted);text-transform:uppercase}.field-table{min-width:690px}.field-table th,.field-table td{font-size:.64rem}@media(max-width:680px){.object-facts{grid-template-columns:1fr}.object-detail>header{flex-direction:column}}
  `],
})
export class PhysicalObjectDetailComponent {
  readonly table = input.required<PhysicalTable>();
  readonly snapshot = input.required<PhysicalSnapshot>();
  readonly source = input.required<PhysicalSource>();
  entries(record: Record<string, string>): [string, string][] { return Object.entries(record); }
  typeLabel(): string { const kind=this.table().kind; return kind==='parquet'?'Parquet-Objekt':kind==='view'?'View':kind==='materialized_view'?'Materialized View':'Tabelle'; }
}
