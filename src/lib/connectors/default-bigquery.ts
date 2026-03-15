import { createBigQueryConnector } from "./bigquery";
import type { Connector, BigQueryConfig } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_BQ_DATA_SOURCE_NAME = "Default BigQuery";

export function getDefaultBigQueryConfig(): BigQueryConfig | null {
  const raw = process.env.BIGQUERY_DEFAULT_CONNECTION_STRING;
  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;

    return {
      projectId: (parsed.projectId ?? parsed.project_id ?? "") as string,
      credentials: (parsed.credentials ?? parsed) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export function getDefaultSchemaPrefix(): string {
  return process.env.BIGQUERY_DEFAULT_SCHEMA_NAME_PREFIX ?? "";
}

/**
 * Returns the BigQuery dataset name where schema-backed tables live.
 * Format: `${prefix}_schemas`
 */
export function getDefaultSchemaDataset(): string {
  const prefix = getDefaultSchemaPrefix();
  if (!prefix) return "";
  return `${prefix}_schemas`;
}

/**
 * Get the fully qualified table reference for a schema's default BQ table.
 * Dataset: `${prefix}_schemas`, Table: schema UUID (dashes replaced with underscores)
 */
export function getDefaultSchemaTableRef(schemaId: string): {
  dataset: string;
  table: string;
} {
  return {
    dataset: getDefaultSchemaDataset(),
    table: schemaId.replace(/-/g, "_"),
  };
}

export function createDefaultBigQueryConnector(): Connector | null {
  const config = getDefaultBigQueryConfig();
  if (!config || !config.projectId) return null;
  return createBigQueryConnector(config);
}

export function isDefaultBigQueryAvailable(): boolean {
  return !!getDefaultBigQueryConfig()?.projectId && !!getDefaultSchemaPrefix();
}

/**
 * Ensures a real row exists in the `data_sources` table for the default
 * BigQuery connection. Returns the UUID of that row, or null on failure.
 * This is needed because `schema_data_sources.data_source_id` is a UUID
 * column with a FK constraint.
 */
export async function ensureDefaultBqDataSource(userId: string): Promise<string | null> {
  const config = getDefaultBigQueryConfig();
  if (!config) return null;

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("data_sources")
    .select("id")
    .eq("name", DEFAULT_BQ_DATA_SOURCE_NAME)
    .eq("type", "bigquery")
    .is("folder_id", null)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("data_sources")
    .insert({
      user_id: userId,
      name: DEFAULT_BQ_DATA_SOURCE_NAME,
      type: "bigquery",
      config,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create default BQ data source row:", error.message);
    return null;
  }

  return created.id as string;
}

/**
 * Get the data_sources row ID for the default BQ, if it already exists.
 */
export async function getDefaultBqDataSourceId(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("data_sources")
    .select("id")
    .eq("name", DEFAULT_BQ_DATA_SOURCE_NAME)
    .eq("type", "bigquery")
    .is("folder_id", null)
    .limit(1)
    .maybeSingle();

  return data ? (data.id as string) : null;
}

/**
 * Check if a given data_source_id belongs to the system default BQ row.
 */
export async function isDefaultBqDataSourceId(dataSourceId: string): Promise<boolean> {
  const id = await getDefaultBqDataSourceId();
  return id !== null && id === dataSourceId;
}
