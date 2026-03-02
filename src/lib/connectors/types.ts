export interface BigQueryConfig {
  projectId: string;
  keyFilename?: string;
  credentials?: Record<string, unknown>;
}

export interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
}

export interface RedshiftConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export type DataSourceType = "bigquery" | "mysql" | "postgres" | "redshift";

export interface DataSource {
  id: string;
  userId: string;
  name: string;
  type: DataSourceType;
  config: BigQueryConfig | MySQLConfig | PostgresConfig | RedshiftConfig;
  createdAt: string;
  updatedAt: string;
}

export interface TableInfo {
  schema: string;
  name: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface Connector {
  testConnection(): Promise<{ ok: boolean; error?: string }>;
  listTables(): Promise<TableInfo[]>;
  getColumns(schema: string, table: string): Promise<ColumnInfo[]>;
  previewData(schema: string, table: string, limit?: number): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}
