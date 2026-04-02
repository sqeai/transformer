import type { SqlCompatibleType } from "./types";
import type { DataSourceType } from "./connectors/types";

/**
 * Maps our standardized SQL types to database-specific types.
 */
export function mapSqlType(
  standardType: SqlCompatibleType,
  targetDb: DataSourceType,
): string {
  switch (targetDb) {
    case "bigquery":
      return mapToBigQuery(standardType);
    case "postgres":
      return mapToPostgres(standardType);
    case "mysql":
      return mapToMySQL(standardType);
    case "redshift":
      return mapToRedshift(standardType);
    default:
      return standardType;
  }
}

function mapToBigQuery(type: SqlCompatibleType): string {
  switch (type) {
    case "STRING":
      return "STRING";
    case "INTEGER":
      return "INT64";
    case "FLOAT":
      return "FLOAT64";
    case "NUMERIC":
      return "NUMERIC";
    case "BOOLEAN":
      return "BOOL";
    case "DATE":
      return "DATE";
    case "DATETIME":
      return "DATETIME";
    case "TIMESTAMP":
      return "TIMESTAMP";
    default:
      return "STRING";
  }
}

function mapToPostgres(type: SqlCompatibleType): string {
  switch (type) {
    case "STRING":
      return "TEXT";
    case "INTEGER":
      return "BIGINT";
    case "FLOAT":
      return "DOUBLE PRECISION";
    case "NUMERIC":
      return "NUMERIC";
    case "BOOLEAN":
      return "BOOLEAN";
    case "DATE":
      return "DATE";
    case "DATETIME":
      return "TIMESTAMP";
    case "TIMESTAMP":
      return "TIMESTAMPTZ";
    default:
      return "TEXT";
  }
}

function mapToMySQL(type: SqlCompatibleType): string {
  switch (type) {
    case "STRING":
      return "TEXT";
    case "INTEGER":
      return "BIGINT";
    case "FLOAT":
      return "DOUBLE";
    case "NUMERIC":
      return "DECIMAL(65,30)";
    case "BOOLEAN":
      return "BOOLEAN";
    case "DATE":
      return "DATE";
    case "DATETIME":
      return "DATETIME";
    case "TIMESTAMP":
      return "TIMESTAMP";
    default:
      return "TEXT";
  }
}

function mapToRedshift(type: SqlCompatibleType): string {
  switch (type) {
    case "STRING":
      return "VARCHAR(65535)";
    case "INTEGER":
      return "BIGINT";
    case "FLOAT":
      return "DOUBLE PRECISION";
    case "NUMERIC":
      return "NUMERIC";
    case "BOOLEAN":
      return "BOOLEAN";
    case "DATE":
      return "DATE";
    case "DATETIME":
      return "TIMESTAMP";
    case "TIMESTAMP":
      return "TIMESTAMPTZ";
    default:
      return "VARCHAR(65535)";
  }
}
