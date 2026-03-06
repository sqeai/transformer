import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DataSourceContext, DimensionsLookupFn } from "../analyst-agent/tools";

const SYSTEM_PROMPT = `You are a Panel Query Translator. Your job is to translate a natural-language panel description into a SQL query and chart configuration that can be rendered as a dashboard panel.

You have access to tools to explore the database schema and understand the data before writing queries.

## Your Task

Given a panel prompt (natural language description of what the user wants to see), you must:

1. Use list_available_tables to understand what tables and columns are available.
2. Optionally use data_lookup to understand column distributions and data quality.
3. Write a SQL query that answers the user's question.
4. Execute the query using query_database to verify it works and get the data.
5. Return the result in the exact JSON format specified below.

## Response Format

You MUST respond with ONLY a JSON object (no markdown, no explanation, no code fences). The JSON must have this structure:

{
  "title": "Human-readable panel title",
  "chartType": "bar" | "line" | "pie" | "scatter" | "waterfall",
  "sqlQuery": "The SQL query that produces the data",
  "data": [...the query result rows...],
  "config": {
    "xKey": "column name for x-axis (bar, line, scatter, waterfall)",
    "yKey": "column name for y-axis",
    "yKeys": ["multiple y columns for multi-series"],
    "nameKey": "column name for pie chart names",
    "valueKey": "column name for pie chart values",
    "colors": ["#hex1", "#hex2"]
  }
}

## Chart Type Selection

Choose the best chart type for the data:
- Categorical comparisons → "bar"
- Time series / trends → "line"
- Proportions / distributions → "pie"
- Correlations between two numeric fields → "scatter"
- Cumulative changes / financial flows → "waterfall"

## Config Guidelines

- For bar/line/waterfall: set xKey and yKey (or yKeys for multi-series)
- For pie: set nameKey and valueKey
- For scatter: set xKey and yKey
- Always provide nice colors as hex strings

## SQL Guidelines

- Write read-only SELECT/WITH queries only
- Limit results to 50 rows max for readability
- Aggregate data appropriately for the chart type
- Adapt SQL dialect to the database type (BigQuery, MySQL, PostgreSQL, etc.)
- Use meaningful column aliases

IMPORTANT: Your entire response must be valid JSON. Nothing else.`;

export interface PanelQueryInvokeOptions {
  prompt: string;
  dataSources: DataSourceContext[];
  queryFn: (dataSourceId: string, sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }>;
  dimensionsLookupFn?: DimensionsLookupFn;
}

export interface PanelQueryResult {
  title: string;
  chartType: "pie" | "line" | "bar" | "scatter" | "waterfall";
  sqlQuery: string;
  data: Record<string, unknown>[];
  config: {
    xKey?: string;
    yKey?: string;
    yKeys?: string[];
    nameKey?: string;
    valueKey?: string;
    colors?: string[];
  };
  error?: string;
}

function createPanelQueryTools(
  dataSources: DataSourceContext[],
  queryFn: PanelQueryInvokeOptions["queryFn"],
  dimensionsLookupFn?: DimensionsLookupFn,
) {
  const queryDatabaseTool = tool(
    async (input) => {
      const ds = dataSources.find((d) => d.id === input.dataSourceId);
      if (!ds) {
        return JSON.stringify({ error: `Data source "${input.dataSourceId}" not found.` });
      }
      const upperSql = input.sql.trim().toUpperCase();
      if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("WITH")) {
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
      description: "Execute a read-only SQL query to fetch data for the panel.",
      schema: z.object({
        dataSourceId: z.string().describe("The data source ID to query"),
        sql: z.string().describe("SQL SELECT query"),
      }),
    },
  );

  const listTablesTool = tool(
    async () => {
      if (dataSources.length === 0) {
        return JSON.stringify({ error: "No data sources available." });
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
        if (!result.dimensions) return JSON.stringify({ error: "No dimensions found." });
        return JSON.stringify(result.dimensions, null, 2);
      } catch (err: unknown) {
        return JSON.stringify({ error: (err as Error).message });
      }
    },
    {
      name: "data_lookup",
      description: "Look up table dimensions — column metadata, unique values, sample values, and null percentages.",
      schema: z.object({
        dataSourceId: z.string().describe("The data source ID"),
        schema: z.string().describe("The schema name (e.g. 'public')"),
        table: z.string().describe("The table name"),
      }),
    },
  );

  return [queryDatabaseTool, listTablesTool, dataLookupTool];
}

export class PanelQueryAgent {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async translate(options: PanelQueryInvokeOptions): Promise<PanelQueryResult> {
    const { prompt, dataSources, queryFn, dimensionsLookupFn } = options;

    if (dataSources.length === 0) {
      return {
        title: prompt,
        chartType: "bar",
        sqlQuery: "",
        data: [],
        config: {},
        error: "No data sources available",
      };
    }

    const llm = new ChatAnthropic({
      model: "claude-sonnet-4-20250514",
      anthropicApiKey: this.apiKey,
      temperature: 0,
    });

    const tools = createPanelQueryTools(dataSources, queryFn, dimensionsLookupFn);

    const agent = createAgent({
      model: llm,
      tools,
      systemPrompt: SYSTEM_PROMPT,
    });

    try {
      const messages: BaseMessage[] = [
        new HumanMessage(`Translate this panel description into a query and chart config:\n\n"${prompt}"`),
      ];

      const result = await agent.invoke(
        { messages },
        { recursionLimit: 30 },
      );

      const resultMessages: BaseMessage[] = result && typeof result === "object" && "messages" in result
        ? (result.messages as BaseMessage[])
        : [];

      const lastMessage = resultMessages[resultMessages.length - 1];
      if (!lastMessage) {
        return { title: prompt, chartType: "bar", sqlQuery: "", data: [], config: {}, error: "No response from agent" };
      }

      const content = typeof lastMessage.content === "string"
        ? lastMessage.content
        : Array.isArray(lastMessage.content)
          ? lastMessage.content.map((c: { type?: string; text?: string }) => c.type === "text" ? c.text : "").join("")
          : String(lastMessage.content);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { title: prompt, chartType: "bar", sqlQuery: "", data: [], config: {}, error: "Could not parse agent response" };
      }

      const parsed = JSON.parse(jsonMatch[0]) as PanelQueryResult;
      return {
        title: parsed.title || prompt,
        chartType: parsed.chartType || "bar",
        sqlQuery: parsed.sqlQuery || "",
        data: Array.isArray(parsed.data) ? parsed.data : [],
        config: parsed.config || {},
      };
    } catch (error) {
      return {
        title: prompt,
        chartType: "bar",
        sqlQuery: "",
        data: [],
        config: {},
        error: (error as Error).message,
      };
    }
  }
}

let panelQueryAgent: PanelQueryAgent | null = null;

export function getPanelQueryAgent(): PanelQueryAgent | null {
  if (panelQueryAgent) return panelQueryAgent;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
    return null;
  }

  panelQueryAgent = new PanelQueryAgent(apiKey);
  return panelQueryAgent;
}
