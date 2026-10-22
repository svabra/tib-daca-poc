export interface CsvImportMetadata {
  format: string;
  nullabilityKnown?: boolean;
  records?: Record<string, string>[];
  recordsWithoutField?: Record<string, string>[];
}

export interface CsvPreviewColumn {
  name: string;
  dataType: string;
  normalizedDataType: string;
  comment: string | null;
  importMetadata: CsvImportMetadata;
}

export interface CsvPreviewTable {
  name: string;
  system: string;
  stableKey: string;
  comment: string | null;
  columns: CsvPreviewColumn[];
  importMetadata: CsvImportMetadata;
}

export interface CsvInventoryPreview {
  fingerprint: string;
  encoding: string;
  rowCount: number;
  tableCount: number;
  fieldCount: number;
  warnings: string[];
  tables: CsvPreviewTable[];
}

export interface CsvInventoryWrite {
  contentBase64: string;
  name: string;
  filename: string;
  departmentCode: string;
  organizationId: string;
  fingerprint: string;
}
