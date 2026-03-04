import { tool } from "@langchain/core/tools";
import { z } from "zod";

export interface DataSourceContext {
  id: string;
  name: string;
  type: string;
  tables: { schema: string; name: string; columns: { name: string; type: string }[] }[];
}

export function createAnalystTools(
  dataSources: DataSourceContext[],
  queryFn: (dataSourceId: string, sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }>,
) {
  const queryDatabaseTool = tool(
    async (input) => {
      const ds = dataSources.find((d) => d.id === input.dataSourceId);
      if (!ds) {
        return JSON.stringify({ error: `Data source "${input.dataSourceId}" not found. Available: ${dataSources.map((d) => `${d.name} (${d.id})`).join(", ")}` });
      }

      const upperSql = input.sql.trim().toUpperCase();
      if (
        !upperSql.startsWith("SELECT") &&
        !upperSql.startsWith("WITH") &&
        !upperSql.startsWith("SHOW") &&
        !upperSql.startsWith("DESCRIBE") &&
        !upperSql.startsWith("EXPLAIN")
      ) {
        return JSON.stringify({ error: "Only read-only queries are allowed (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN)" });
      }

      try {
        const result = await queryFn(input.dataSourceId, input.sql);
        if (result.error) {
          return JSON.stringify({ error: result.error });
        }
        return JSON.stringify({
          columns: result.rows.length > 0 ? Object.keys(result.rows[0]) : [],
          rows: result.rows.slice(0, 100),
          totalRows: result.rowCount,
          truncatedTo: Math.min(result.rowCount, 100),
        });
      } catch (err: unknown) {
        return JSON.stringify({ error: (err as Error).message });
      }
    },
    {
      name: "query_database",
      description: `Execute a read-only SQL query against a connected database. Use this to answer questions about data by writing appropriate SQL queries. Only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN statements are allowed. Results are limited to 100 rows.`,
      schema: z.object({
        dataSourceId: z.string().describe("The ID of the data source to query"),
        sql: z.string().describe("The SQL query to execute (read-only)"),
      }),
    },
  );

  const listAvailableTablesTool = tool(
    async () => {
      if (dataSources.length === 0) {
        return JSON.stringify({ error: "No data sources are selected. Ask the user to select databases from the right panel." });
      }
      const result = dataSources.map((ds) => ({
        dataSourceId: ds.id,
        dataSourceName: ds.name,
        type: ds.type,
        tables: ds.tables.map((t) => ({
          schema: t.schema,
          table: t.name,
          columns: t.columns.map((c) => `${c.name} (${c.type})`),
        })),
      }));
      return JSON.stringify(result, null, 2);
    },
    {
      name: "list_available_tables",
      description: `List all available tables and their columns across all selected data sources. Use this to understand the database schema before writing queries.`,
      schema: z.object({}),
    },
  );

  return [queryDatabaseTool, listAvailableTablesTool];
}
