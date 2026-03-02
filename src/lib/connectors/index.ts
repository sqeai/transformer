import type { Connector, DataSourceType, BigQueryConfig, MySQLConfig, PostgresConfig, RedshiftConfig } from "./types";
import { createMySQLConnector } from "./mysql";
import { createBigQueryConnector } from "./bigquery";
import { createPostgresConnector } from "./postgres";
import { createRedshiftConnector } from "./redshift";

export type { Connector, DataSourceType, BigQueryConfig, MySQLConfig, PostgresConfig, RedshiftConfig, TableInfo, ColumnInfo } from "./types";

export function createConnector(type: DataSourceType, config: Record<string, unknown>): Connector {
  switch (type) {
    case "mysql":
      return createMySQLConnector(config as unknown as MySQLConfig);
    case "bigquery":
      return createBigQueryConnector(config as unknown as BigQueryConfig);
    case "postgres":
      return createPostgresConnector(config as unknown as PostgresConfig);
    case "redshift":
      return createRedshiftConnector(config as unknown as RedshiftConfig);
    default:
      throw new Error(`Unsupported data source type: ${type}`);
  }
}
