export const SQL_COMPATIBLE_TYPES = [
  "STRING",
  "INTEGER",
  "FLOAT",
  "NUMERIC",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "TIMESTAMP",
] as const;

export type SqlCompatibleType = (typeof SQL_COMPATIBLE_TYPES)[number];

export interface SchemaField {
  id: string;
  name: string;
  path: string; // e.g. "customer.name" for nesting
  level: number; // 1 = topmost, 2 = first nesting, 3 = second, etc.
  order: number;
  description?: string;
  defaultValue?: string;
  dataType?: SqlCompatibleType;
  children?: SchemaField[];
}

export interface FinalSchema {
  id: string;
  name: string;
  folderId?: string | null;
  fields: SchemaField[];
  createdAt: string;
  updatedAt?: string;
  lastActivityAt?: string;
  datasetCount?: number;
  datasets?: DatasetSummary[];
  /** Set when loaded from API (creator = schema owner from users) */
  creator?: SchemaCreator;
}

export type DatasetState = "draft" | "pending_approval" | "approved" | "rejected" | "completed";

export interface DatasetApprover {
  id: string;
  datasetId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  status: "pending" | "approved" | "rejected";
  comment?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface DatasetLog {
  id: string;
  datasetId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  action: string;
  fromState?: string | null;
  toState?: string | null;
  comment?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DatasetSummary {
  id: string;
  schemaId: string;
  folderId?: string | null;
  name: string;
  rowCount: number;
  state: DatasetState;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetRecord extends DatasetSummary {
  schemaName?: string | null;
  mappingSnapshot: Record<string, unknown>;
  rows: Record<string, unknown>[];
  approvers?: DatasetApprover[];
  logs?: DatasetLog[];
}

/** Creator info returned from API (from users) */
export interface SchemaCreator {
  id: string;
  email: string;
  name: string;
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
}

/** Static default values for target fields that have no mapping (no edge). Keyed by target path. */
export type DefaultValues = Record<string, string>;

export interface PivotConfig {
  enabled: boolean;
  groupByColumns: string[]; // raw column names used to group rows
}

/**
 * A single source column to be unpivoted.
 * `fieldValues` maps each selected output target path to the value
 * this column should produce for that field when expanded into a row.
 * E.g. for "January 2025" with output targets ["year","month","amount"]:
 *   fieldValues = { year: "2025", month: "January", amount: "$RAW" }
 * The special token "$RAW" means "use the actual cell value from this source column".
 */
export interface VerticalPivotColumn {
  rawColumn: string;
  fieldValues: Record<string, string>;
}

/** Sentinel value indicating a field should be populated with the raw cell value */
export const VP_RAW_VALUE_TOKEN = "$RAW";

/**
 * Configuration for "vertical pivot" (unpivot/melt).
 * Multiple source columns are collapsed into rows. For each source column,
 * a new row is produced with:
 * - Regular mapped fields copied as-is
 * - `outputTargetPaths` filled from the column's `fieldValues`
 *   (static strings, or VP_RAW_VALUE_TOKEN for the actual cell data)
 */
export interface VerticalPivotConfig {
  enabled: boolean;
  /** Target schema paths selected as output fields (e.g. ["year", "month", "amount"]) */
  outputTargetPaths: string[];
  /** Source columns to unpivot */
  columns: VerticalPivotColumn[];
}

export interface EdgeDefinition {
  rawColumn: string;
  targetPath: string;
}

export interface ExportFormat {
  id: "excel" | "csv" | "bigquery" | "postgres" | "google_sheets" | "fis";
  label: string;
  description: string;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
}

export type SchemaContextType = "lookup_table" | "validation" | "text_instructions";

export interface SchemaContext {
  id: string;
  schemaId: string;
  type: SchemaContextType;
  name: string;
  content?: string | null;
  dataSourceId?: string | null;
  bqDataset?: string | null;
  bqTable?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchemaMandatoryApprover {
  id: string;
  schemaId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  createdAt: string;
}

export interface SchemaDataSource {
  id: string;
  schemaId: string;
  dataSourceId: string;
  dataSourceName?: string;
  dataSourceType?: string;
  tableSchema: string;
  tableName: string;
  isNewTable: boolean;
  isDefault?: boolean;
  createdAt: string;
}
