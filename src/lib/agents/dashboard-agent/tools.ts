import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DataSourceContext } from "../analyst-agent/tools";

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
  data: z.array(z.record(z.string(), z.unknown())).describe("Chart data array"),
  config: chartConfigSchema.describe("Chart configuration"),
  width: z.union([z.literal(1), z.literal(2)]).describe("Grid width (1 or 2 columns)"),
  height: z.union([z.literal(1), z.literal(2)]).describe("Grid height (1 or 2 rows)"),
});

function wrapDelimiter(tag: string, payload: object): string {
  return `<!-- ${tag}:${JSON.stringify(payload)} -->`;
}

const stopThinkingTool = tool(
  async () => "",
  {
    name: "stop_thinking",
    description:
      "MANDATORY — call this exactly once on EVERY response. This separates your hidden thinking from the visible answer. All text before this call is hidden; all text after is shown to the user. If you forget to call this, the user sees nothing.",
    schema: z.object({}),
  },
);

export function createDashboardTools(
  dataSources: DataSourceContext[],
  queryFn: (dataSourceId: string, sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }>,
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
      description: `Add a new chart panel to the dashboard. Supported chart types: pie, line, bar, scatter, waterfall. You must provide the data array directly (query the database first to get the data). The panel will be rendered using Recharts.`,
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

  return [queryDatabaseTool, listTablesTool, addPanelTool, updatePanelTool, removePanelTool, stopThinkingTool];
}
