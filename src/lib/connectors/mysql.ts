import mysql from "mysql2/promise";
import type { Connector, MySQLConfig, TableInfo, ColumnInfo } from "./types";

export function createMySQLConnector(config: MySQLConfig): Connector {
  let pool: mysql.Pool | null = null;

  function getPool() {
    if (!pool) {
      pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionLimit: 2,
        connectTimeout: 10_000,
      });
    }
    return pool;
  }

  return {
    async testConnection() {
      try {
        const conn = await mysql.createConnection({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          connectTimeout: 10_000,
        });
        await conn.ping();
        await conn.end();
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async listTables() {
      const p = getPool();
      const [rows] = await p.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_SCHEMA as \`schema\`, TABLE_NAME as name
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
        [config.database],
      );
      return rows as TableInfo[];
    },

    async getColumns(schema: string, table: string) {
      const p = getPool();
      const [rows] = await p.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME as name, COLUMN_TYPE as type,
                IS_NULLABLE = 'YES' as nullable
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [schema, table],
      );
      return (rows as Array<{ name: string; type: string; nullable: number }>).map((r) => ({
        name: r.name,
        type: r.type,
        nullable: !!r.nullable,
      }));
    },

    async previewData(_schema: string, table: string, limit = 50) {
      const p = getPool();
      const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
      const [rows] = await p.query<mysql.RowDataPacket[]>(
        `SELECT * FROM \`${safeTable}\` LIMIT ?`,
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
