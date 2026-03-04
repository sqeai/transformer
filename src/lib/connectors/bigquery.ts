import { BigQuery } from "@google-cloud/bigquery";
import type { Connector, BigQueryConfig, TableInfo, ColumnInfo } from "./types";

export function createBigQueryConnector(config: BigQueryConfig): Connector {
  const client = new BigQuery({
    projectId: config.projectId,
    ...(config.credentials ? { credentials: config.credentials } : {}),
    ...(config.keyFilename ? { keyFilename: config.keyFilename } : {}),
  });

  return {
    async testConnection() {
      try {
        await client.query({ query: "SELECT 1", location: "US" });
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async listTables() {
      const [datasets] = await client.getDatasets();
      const tables: TableInfo[] = [];
      for (const ds of datasets) {
        const [tbls] = await ds.getTables();
        for (const t of tbls) {
          tables.push({ schema: ds.id!, name: t.id! });
        }
      }
      tables.sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`));
      return tables;
    },

    async getColumns(schema: string, table: string) {
      const [metadata] = await client.dataset(schema).table(table).getMetadata();
      const fields = metadata.schema?.fields ?? [];
      return fields.map((f: { name: string; type: string; mode?: string }) => ({
        name: f.name,
        type: f.type,
        nullable: f.mode !== "REQUIRED",
      })) as ColumnInfo[];
    },

    async previewData(schema: string, table: string, limit = 50) {
      const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, "");
      const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
      const [rows] = await client.query({
        query: `SELECT * FROM \`${config.projectId}.${safeSchema}.${safeTable}\` LIMIT @limit`,
        params: { limit },
      });
      return rows as Record<string, unknown>[];
    },

    async query(sql: string) {
      const [rows] = await client.query({ query: sql });
      return rows as Record<string, unknown>[];
    },

    async close() {
      // BigQuery client doesn't need explicit close
    },
  };
}
