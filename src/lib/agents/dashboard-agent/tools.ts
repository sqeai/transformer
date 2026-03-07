import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DataSourceContext, DimensionsLookupFn } from "../analyst-agent/tools";

const chartConfigSchema = z.object({
  xKey: z.string().optional().describe("Key for X axis (line, bar, scatter, waterfall)"),
  yKey: z.string().optional().describe("Key for Y axis (line, bar, scatter, waterfall)"),
  yKeys: z.array(z.string()).optional().describe("Multiple Y keys for multi-series charts"),
  nameKey: z.string().optional().describe("Key for names (pie chart)"),
  valueKey: z.string().optional().describe("Key for values (pie chart)"),
  colors: z.array(z.string()).optional().describe("Array of hex color strings"),
});

const panelSchema = z.object({
  id: z.string().describe("Unique panel ID"),
  title: z.string().describe("Panel title"),
  chartType: z.enum(["pie", "line", "bar", "scatter", "waterfall"]).describe("Chart type"),
  sqlQuery: z.string().optional().describe("The SQL query used to produce the data (for re-execution)"),
  data: z.array(z.record(z.string(), z.unknown())).describe("Chart data array"),
  config: chartConfigSchema.describe("Chart configuration"),
});

function wrapDelimiter(tag: string, payload: object): string {
  return `<!-- ${tag}:${JSON.stringify(payload)} -->`;
}

export function createDashboardTools(
  dataSources: DataSourceContext[],
  queryFn: (dataSourceId: string, sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }>,
  dimensionsLookupFn?: DimensionsLookupFn,
) {
  const queryDatabaseTool = tool(
    async (input) => {
      const ds = dataSources.find((d) => d.id === input.dataSourceId);
      if (!ds) {
        return JSON.stringify({ error: `Data source "${input.dataSourceId}" not found.` });
      }

      const upperSql = input.sql.trim().toUpperCase();
      if (
        !upperSql.startsWith("SELECT") &&
        !upperSql.startsWith("WITH")
      ) {
        return JSON.stringify({ error: "Only SELECT/WITH queries are allowed" });
      }

      try {
        const result = await queryFn(input.dataSourceId, input.sql);
        if (result.error) return JSON.stringify({ error: result.error });
        return JSON.stringify({
          columns: result.rows.length > 0 ? Object.keys(result.rows[0]) : [],
          rows: result.rows.slice(0, 200),
          totalRows: result.rowCount,
        });
      } catch (err: unknown) {
        return JSON.stringify({ error: (err as Error).message });
      }
    },
    {
      name: "query_database",
      description: "Execute a read-only SQL query to fetch data for dashboard panels.",
      schema: z.object({
        dataSourceId: z.string().describe("The data source ID to query"),
        sql: z.string().describe("SQL SELECT query"),
      }),
    },
  );

  const listTablesTool = tool(
    async () => {
      if (dataSources.length === 0) {
        return JSON.stringify({ error: "No data sources selected." });
      }
      return JSON.stringify(
        dataSources.map((ds) => ({
          dataSourceId: ds.id,
          name: ds.name,
          type: ds.type,
          tables: ds.tables.map((t) => ({
            schema: t.schema,
            table: t.name,
            columns: t.columns.map((c) => `${c.name} (${c.type})`),
          })),
        })),
        null,
        2,
      );
    },
    {
      name: "list_available_tables",
      description: "List all available tables and columns to understand the schema before querying.",
      schema: z.object({}),
    },
  );

  const addPanelTool = tool(
    async (input) => {
      return wrapDelimiter("DASHBOARD_PANEL", {
        action: "add",
        panel: input.panel,
      });
    },
    {
      name: "add_dashboard_panel",
      description: `Add a new chart panel to the dashboard. Supported chart types: pie, line, bar, scatter, waterfall. You must provide the data array directly (query the database first to get the data). Always include the sqlQuery field with the SQL query used to produce the data so it can be re-executed later. The panel will be rendered using Recharts.`,
      schema: z.object({
        panel: panelSchema.describe("The panel to add"),
      }),
    },
  );

  const updatePanelTool = tool(
    async (input) => {
      return wrapDelimiter("DASHBOARD_PANEL", {
        action: "update",
        panel: input.panel,
      });
    },
    {
      name: "update_dashboard_panel",
      description: "Update an existing dashboard panel (replace it entirely).",
      schema: z.object({
        panel: panelSchema.describe("The updated panel"),
      }),
    },
  );

  const removePanelTool = tool(
    async (input) => {
      return wrapDelimiter("DASHBOARD_PANEL", {
        action: "remove",
        panelId: input.panelId,
      });
    },
    {
      name: "remove_dashboard_panel",
      description: "Remove a panel from the dashboard by its ID.",
      schema: z.object({
        panelId: z.string().describe("The ID of the panel to remove"),
      }),
    },
  );

  const dataLookupTool = tool(
    async (input) => {
      if (!dimensionsLookupFn) {
        return JSON.stringify({ error: "Dimensions lookup not available." });
      }
      const ds = dataSources.find((d) => d.id === input.dataSourceId);
      if (!ds) {
        return JSON.stringify({ error: `Data source "${input.dataSourceId}" not found.` });
      }
      try {
        const result = await dimensionsLookupFn(input.dataSourceId, input.schema, input.table);
        if (result.error) return JSON.stringify({ error: result.error });
        if (!result.dimensions) return JSON.stringify({ error: "No dimensions found for this table." });
        return JSON.stringify(result.dimensions, null, 2);
      } catch (err: unknown) {
        return JSON.stringify({ error: (err as Error).message });
      }
    },
    {
      name: "data_lookup",
      description: `Look up table dimensions — column metadata including data types, unique values, sample values, and null percentages. Use this to understand a table's data distribution before writing queries.`,
      schema: z.object({
        dataSourceId: z.string().describe("The data source ID"),
        schema: z.string().describe("The schema name (e.g. 'public')"),
        table: z.string().describe("The table name"),
      }),
    },
  );

  return [queryDatabaseTool, listTablesTool, dataLookupTool, addPanelTool, updatePanelTool, removePanelTool];
}
