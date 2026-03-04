import pg from "pg";
import type { Connector, RedshiftConfig, TableInfo, ColumnInfo } from "./types";

/**
 * Redshift is wire-compatible with PostgreSQL, so we use the pg driver
 * with SSL enabled by default.
 */
export function createRedshiftConnector(config: RedshiftConfig): Connector {
  let pool: pg.Pool | null = null;

  const sslConfig = { rejectUnauthorized: false };

  function getPool() {
    if (!pool) {
      pool = new pg.Pool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: sslConfig,
        max: 2,
        connectionTimeoutMillis: 15_000,
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
          ssl: sslConfig,
          connectionTimeoutMillis: 15_000,
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
        `SELECT schemaname AS schema, tablename AS name
         FROM pg_tables
         WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_internal')
         ORDER BY schemaname, tablename`,
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

    async query(sql: string) {
      const p = getPool();
      const { rows } = await p.query(sql);
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
