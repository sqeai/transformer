export interface SchemaField {
  id: string;
  name: string;
  path: string; // e.g. "customer.name" for nesting
  level: number; // 0 = top level
  order: number;
  children?: SchemaField[];
}

export interface FinalSchema {
  id: string;
  name: string;
  fields: SchemaField[];
  createdAt: string;
}

export type RawColumn = string;

export interface ColumnMapping {
  rawColumn: string;
  targetPath: string; // final schema path, e.g. "customer.name"
}

export interface ExportFormat {
  id: "excel" | "csv" | "bigquery";
  label: string;
  description: string;
}
