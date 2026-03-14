import { createBigQueryConnector } from "./bigquery";
import type { Connector, BigQueryConfig } from "./types";
import crypto from "crypto";

export const DEFAULT_BIGQUERY_ID = "__default_bigquery__";
export const DEFAULT_BIGQUERY_NAME = "Default BigQuery";

export function isDefaultBigQueryConfigured(): boolean {
  return !!(
    process.env.BIGQUERY_DEFAULT_CONNECTION_STRING &&
    process.env.BIGQUERY_DEFAULT_SCHEMA_NAME
  );
}

function parseConnectionString(): BigQueryConfig {
  const raw = process.env.BIGQUERY_DEFAULT_CONNECTION_STRING ?? "";
  const decoded = Buffer.from(raw, "base64").toString("utf-8");
  const parsed = JSON.parse(decoded) as Record<string, unknown>;

  const projectId =
    (parsed.project_id as string) ?? (parsed.projectId as string) ?? "";

  const credentials: Record<string, unknown> = { ...parsed };

  return { projectId, credentials };
}

export function getDefaultBigQuerySchemaName(): string {
  return process.env.BIGQUERY_DEFAULT_SCHEMA_NAME ?? "system";
}

export function createDefaultBigQueryConnector(): Connector {
  if (!isDefaultBigQueryConfigured()) {
    throw new Error("Default BigQuery is not configured");
  }
  return createBigQueryConnector(parseConnectionString());
}

export function getDefaultBigQueryConfig(): BigQueryConfig {
  return parseConnectionString();
}

export function getDefaultBigQueryVirtualSource() {
  return {
    id: DEFAULT_BIGQUERY_ID,
    name: DEFAULT_BIGQUERY_NAME,
    type: "bigquery" as const,
    config: {},
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    isDefault: true,
  };
}

export function datasetTempTableName(datasetId: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(datasetId)
    .digest("hex")
    .slice(0, 16);
  return `tmp_ds_${hash}`;
}
