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

export type AggregationFunction =
  | "sum"
  | "concat"
  | "count"
  | "min"
  | "max"
  | "first"
  | "ai_merge";

export interface ColumnMapping {
  rawColumn: string;
  targetPath: string; // final schema path, e.g. "customer.name"
  aggregation?: AggregationFunction;
  defaultValue?: string;
}

export interface PivotConfig {
  enabled: boolean;
  groupByColumns: string[]; // raw column names used to group rows
}

export interface EdgeDefinition {
  rawColumn: string;
  targetPath: string;
}

export interface ExportFormat {
  id: "excel" | "csv" | "bigquery";
  label: string;
  description: string;
}
