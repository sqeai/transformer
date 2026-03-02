import pg from "pg";
import type { Connector, PostgresConfig, TableInfo, ColumnInfo } from "./types";

export function createPostgresConnector(config: PostgresConfig): Connector {
  let pool: pg.Pool | null = null;

  function getPool() {
    if (!pool) {
      pool = new pg.Pool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        max: 2,
        connectionTimeoutMillis: 10_000,
      });
    }
    return pool;
  }

  return {
    async testConnection() {
      let client: pg.Client | undefined;
      try {
        client = new pg.Client({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 10_000,
        });
        await client.connect();
        await client.query("SELECT 1");
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: (err as Error).message };
      } finally {
        await client?.end().catch(() => {});
      }
    },

    async listTables() {
      const p = getPool();
      const { rows } = await p.query<TableInfo>(
        `SELECT table_schema AS schema, table_name AS name
         FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
           AND table_type = 'BASE TABLE'
         ORDER BY table_schema, table_name`,
      );
      return rows;
    },

    async getColumns(schema: string, table: string) {
      const p = getPool();
      const { rows } = await p.query<{ name: string; type: string; nullable: boolean }>(
        `SELECT column_name AS name,
                data_type AS type,
                is_nullable = 'YES' AS nullable
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table],
      );
      return rows as ColumnInfo[];
    },

    async previewData(_schema: string, table: string, limit = 50) {
      const p = getPool();
      const safeSchema = _schema.replace(/[^a-zA-Z0-9_]/g, "");
      const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
      const { rows } = await p.query(
        `SELECT * FROM "${safeSchema}"."${safeTable}" LIMIT $1`,
        [limit],
      );
      return rows as Record<string, unknown>[];
    },

    async close() {
      if (pool) {
        await pool.end();
        pool = null;
      }
    },
  };
}
