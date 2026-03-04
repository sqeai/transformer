import { tool } from "@langchain/core/tools";
import { z } from "zod";

export interface DataSourceContext {
  id: string;
  name: string;
  type: string;
  tables: { schema: string; name: string; columns: { name: string; type: string }[] }[];
}

export type VisualizationChartType = "bar" | "line" | "pie" | "scatter" | "waterfall";

export interface VisualizationPayload {
  title: string;
  chartType: VisualizationChartType;
  data: Record<string, unknown>[];
  labelKey: string;
  valueKeys: string[];
  sql?: string;
}

export const stopThinkingTool = tool(
  async () => "",
  {
    name: "stop_thinking",
    description:
      "MANDATORY — call this exactly once on EVERY response. This separates your hidden thinking from the visible answer. All text before this call is hidden; all text after is shown to the user. If you forget to call this, the user sees nothing.",
    schema: z.object({}),
  },
);

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

  const visualizeDataTool = tool(
    async (input) => {
      const payload: VisualizationPayload = {
        title: input.title,
        chartType: input.chartType as VisualizationChartType,
        data: input.data,
        labelKey: input.labelKey,
        valueKeys: input.valueKeys,
        sql: input.sql,
      };
      return `<!-- VISUALIZATION:${JSON.stringify(payload)} -->`;
    },
    {
      name: "visualize_data",
      description: `Create an inline chart visualization from data. Use this after querying data to present results visually. The frontend renders an interactive chart with tabs to switch between bar, line, pie, scatter, waterfall, and a raw table view. The user can freely switch between all views — the same data powers every one.

Provide chart-agnostic data with a labelKey (the categorical/label column) and valueKeys (one or more numeric columns). The frontend maps these universally:
- Bar/Line/Waterfall: labelKey → x-axis, valueKeys → y-axis series
- Pie: labelKey → slice names, first valueKey → slice values
- Scatter: first valueKey → x-axis, second valueKey → y-axis (falls back to first if only one)
- Table: shows all columns as raw tabular data

Always include the sql parameter with the SQL query you used to produce the data, so the user can see it.

Use this tool when:
- The user asks to "show", "plot", "chart", "visualize", or "graph" data
- Query results would benefit from visual representation (trends, comparisons, distributions)
- There are numeric values that can be meaningfully charted

Choose the best default chartType for the data shape:
- Categorical comparisons → "bar"
- Time series / trends → "line"
- Proportions / distributions → "pie"
- Correlations between two numeric fields → "scatter"
- Cumulative changes / financial flows → "waterfall"

Keep data to ≤50 rows for readability; aggregate in SQL if needed.`,
      schema: z.object({
        title: z.string().describe("Chart title displayed above the visualization"),
        chartType: z.enum(["bar", "line", "pie", "scatter", "waterfall"]).describe("Recommended default chart type"),
        data: z.array(z.record(z.string(), z.unknown())).describe("Array of data objects to chart"),
        labelKey: z.string().describe("The key in each data object used as the label/category (e.g. 'month', 'customer_name', 'category')"),
        valueKeys: z.array(z.string()).describe("One or more keys in each data object that hold numeric values to chart (e.g. ['revenue'] or ['revenue', 'cost'])"),
        sql: z.string().optional().describe("The SQL query used to produce this data (displayed to the user)"),
      }),
    },
  );

  return [queryDatabaseTool, listAvailableTablesTool, visualizeDataTool, stopThinkingTool];
}
