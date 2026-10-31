import type { PhysicalSnapshot, PhysicalSource, PhysicalTable } from './data-models.models';

export function physicalCategoryKey(type: PhysicalSnapshot['sourceType'] | PhysicalSource['connectorType']): 'physicalDeclaration' | 'physicalRepresentation' {
  return type === 'csv' ? 'physicalDeclaration' : 'physicalRepresentation';
}

export function physicalCategoryLabel(type: PhysicalSnapshot['sourceType']): string {
  return type === 'csv' ? 'Physische Deklaration' : 'Physische Repräsentation';
}

/** A snapshot can contain several databases/systems; the object's database always takes precedence. */
export function physicalObjectName(snapshot: PhysicalSnapshot, table: PhysicalTable): string {
  if (table.kind === 'parquet' && table.storageLocation) return table.storageLocation;
  return [table.databaseName || snapshot.databaseName, table.schemaName, table.name].filter(Boolean).join('.');
}
