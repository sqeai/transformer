import { tool } from "@langchain/core/tools";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

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
      description: `Execute a read-only SQL query against a connected database. Use when the user asks about database data or when you need DB data to supplement analysis (e.g. from attached files). Only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN allowed. Results limited to 100 rows.`,
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
      description: `List all available tables and their columns across selected data sources. Use only when you need to query the database (e.g. user asks about DB data or you need DB context); not required when the user's question is about attached file content.`,
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

Use this tool proactively when:
- The user asks to "show", "plot", "chart", "visualize", or "graph" data
- Query results would benefit from visual representation (trends, comparisons, distributions, rankings)
- A chart would strengthen your analysis or make the data easier to understand — do NOT wait for the user to explicitly request a chart
- There are numeric values that can be meaningfully charted
- You are presenting a comparison, trend, breakdown, or ranking that is better understood visually

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

  const webSearchTool = tool(
    async (input) => {
      const client = new Anthropic();
      try {
        const response = await (client.messages.create as Function)({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5,
            },
          ],
          messages: [
            {
              role: "user",
              content: `Search the web for: ${input.query}\n\nReply with a SHORT bullet-point summary only (3–6 bullets, one line each). Be succinct; no paragraphs.`,
            },
          ],
        }) as Anthropic.Message;

        const outputLines: string[] = [`**Web Search Results for '${input.query}':**\n`];
        const citations: { title: string; url: string }[] = [];

        for (const block of response.content) {
          if (block.type === "text") {
            outputLines.push(block.text);

            const blockAny = block as unknown as Record<string, unknown>;
            if (blockAny.citations && Array.isArray(blockAny.citations)) {
              for (const citation of blockAny.citations as Array<{ url?: string; title?: string }>) {
                if (citation.url && !citations.some(c => c.url === citation.url)) {
                  citations.push({
                    title: citation.title || citation.url,
                    url: citation.url,
                  });
                }
              }
            }
          }

          const blockAny = block as unknown as Record<string, unknown>;
          if (blockAny.type === "web_search_tool_result") {
            const content = blockAny.content;
            if (Array.isArray(content)) {
              for (const item of content as Array<{ type?: string; url?: string; title?: string }>) {
                if (item.type === "web_search_result" && item.url) {
                  if (!citations.some(c => c.url === item.url)) {
                    citations.push({
                      title: item.title || item.url,
                      url: item.url,
                    });
                  }
                }
              }
            }
          }
        }

        if (citations.length > 0) {
          outputLines.push("\n\n---\n**Sources:**");
          citations.forEach((c, i) => {
            outputLines.push(`${i + 1}. [${c.title}](${c.url})`);
          });

          outputLines.push(`\n\n<!-- CITATIONS_JSON:${JSON.stringify(citations)} -->`);
        }

        return outputLines.length > 1 ? outputLines.join("\n") : "No results found.";
      } catch (err: unknown) {
        return `Web search error: ${(err as Error).message}`;
      }
    },
    {
      name: "web_search",
      description: `Search the web for real-time information. Use this when:
- The user asks about current events, market data, news, or anything requiring up-to-date information
- You need external context to supplement database analysis (e.g. industry benchmarks, economic indicators, company news)
- The user's question cannot be answered from the database alone
- You need to verify or contextualize findings with external data
- Market comparisons, industry benchmarks, valuation multiples, competitor analysis
- Any question containing: "market", "industry", "benchmark", "comparable", "peers", "external"

Returns a succinct bullet-point summary with source citations.`,
      schema: z.object({
        query: z.string().describe("The search query to look up on the web"),
      }),
    },
  );

  return [queryDatabaseTool, listAvailableTablesTool, visualizeDataTool, webSearchTool];
}
