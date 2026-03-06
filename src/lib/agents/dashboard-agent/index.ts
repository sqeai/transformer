import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { createDashboardTools } from "./tools";
import type { DataSourceContext, DimensionsLookupFn } from "../analyst-agent/tools";

const BASE_SYSTEM_PROMPT = `You are a Dashboard Builder Assistant. You help users create beautiful, informative dashboards using natural language.

You have access to the following tools:

1. **list_available_tables** — List all available tables and columns across selected data sources.
2. **query_database** — Execute read-only SQL queries to fetch data for charts.
3. **data_lookup** — Look up table dimensions (column metadata, unique values, sample data) to understand the data before querying.
4. **add_dashboard_panel** — Add a new chart panel to the dashboard.
5. **update_dashboard_panel** — Update an existing panel.
6. **remove_dashboard_panel** — Remove a panel from the dashboard.

## Available Chart Types

- **pie** — Pie chart for proportions/distributions. Config: nameKey, valueKey
- **line** — Line chart for trends over time. Config: xKey, yKey or yKeys (for multi-series)
- **bar** — Bar chart for comparisons. Config: xKey, yKey or yKeys (for multi-series)
- **scatter** — Scatter plot for correlations. Config: xKey, yKey
- **waterfall** — Waterfall chart for cumulative effects. Config: xKey, yKey

## Response Format

Structure your FINAL response (after all tool calls are complete) using these delimiters:

1. Wrap your reasoning in thinking delimiters:
   <!-- THINKING_START -->
   Your analysis and planning...
   <!-- THINKING_END -->

2. After THINKING_END, write your user-facing response.

IMPORTANT: Do NOT output the THINKING delimiters during intermediate tool-calling steps. Only include them in your final response to the user, once all tool use is finished and you are ready to present your answer.

3. After calling add_dashboard_panel, update_dashboard_panel, or remove_dashboard_panel, you MUST include the tool result delimiter in your response verbatim. The tool returns a string like \`<!-- DASHBOARD_PANEL:{...} -->\`. Copy that entire string into your response text so the client can detect and apply the changes.

## How to Build Dashboards

1. When the user describes what they want, first call list_available_tables to understand the schema.
2. Use data_lookup to understand column distributions and data quality before writing queries.
3. Write SQL queries to fetch the needed data using query_database.
4. Transform the query results into the right format for each chart type.
5. Call add_dashboard_panel with the data and appropriate chart configuration.
6. Include the DASHBOARD_PANEL delimiter from the tool result in your response.

## Data Format Guidelines

- **Pie chart**: data should be [{nameKey: "Category A", valueKey: 100}, ...]
- **Line chart**: data should be [{xKey: "Jan", yKey: 100}, ...] or with multiple yKeys
- **Bar chart**: same as line chart format
- **Scatter plot**: data should be [{xKey: 10, yKey: 20}, ...]
- **Waterfall**: data should be [{xKey: "Revenue", yKey: 1000}, {xKey: "Costs", yKey: -500}, ...]

## Panel Sizing

- width: 1 (half width) or 2 (full width)
- height: 1 (standard) or 2 (tall)

## Guidelines

- Generate unique panel IDs (e.g. "panel-revenue-pie", "panel-monthly-trend")
- Use descriptive titles for panels
- Choose appropriate chart types for the data
- Use nice color palettes (hex colors)
- When creating multiple panels, create them one at a time
- If the user asks to modify a panel, use update_dashboard_panel
- If the user asks to remove a panel, use remove_dashboard_panel
- Explain what each panel shows
- Adapt SQL dialect to the database type`;

function getSystemPrompt(companyContext?: string): string {
  if (!companyContext?.trim()) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}

## Company / Entity Context

The user has provided the following context about their company/entity. Use this to inform your analysis, understand the domain, and provide more relevant dashboards:

${companyContext}`;
}

export interface DashboardInvokeOptions {
  messages: BaseMessage[];
  dataSources: DataSourceContext[];
  currentPanels: string;
  queryFn: (dataSourceId: string, sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }>;
  companyContext?: string;
  dimensionsLookupFn?: DimensionsLookupFn;
}

function createDashboardAgent(
  apiKey: string,
  dataSources: DataSourceContext[],
  queryFn: DashboardInvokeOptions["queryFn"],
  companyContext?: string,
  dimensionsLookupFn?: DimensionsLookupFn,
) {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    anthropicApiKey: apiKey,
    temperature: 0,
  });

  const tools = createDashboardTools(dataSources, queryFn, dimensionsLookupFn);

  return createAgent({
    model: llm,
    tools,
    systemPrompt: getSystemPrompt(companyContext),
  });
}

export class DashboardAgentGraph {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async streamEvents(
    inputs: DashboardInvokeOptions,
    config?: Record<string, unknown>,
  ) {
    const agent = createDashboardAgent(
      this.apiKey,
      inputs.dataSources,
      inputs.queryFn,
      inputs.companyContext,
      inputs.dimensionsLookupFn,
    );
    return agent.streamEvents({ messages: inputs.messages }, config);
  }

  async invoke(
    inputs: DashboardInvokeOptions,
    config?: { recursionLimit?: number },
  ) {
    try {
      const agent = createDashboardAgent(
        this.apiKey,
        inputs.dataSources,
        inputs.queryFn,
        inputs.companyContext,
        inputs.dimensionsLookupFn,
      );
      const result = await agent.invoke(
        { messages: inputs.messages },
        config,
      );

      if (result && typeof result === "object" && "messages" in result) {
        return { messages: result.messages as BaseMessage[] };
      }
      return { messages: [new AIMessage(JSON.stringify(result))] };
    } catch (error) {
      return {
        messages: [new AIMessage(`Error: ${(error as Error).message}`)],
      };
    }
  }
}

let dashboardAgent: DashboardAgentGraph | null = null;

export function getDashboardAgent(): DashboardAgentGraph | null {
  if (dashboardAgent) return dashboardAgent;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
    return null;
  }

  try {
    dashboardAgent = new DashboardAgentGraph(apiKey);
    return dashboardAgent;
  } catch (error) {
    console.error(`Failed to create dashboard agent: ${(error as Error).message}`);
    return null;
  }
}
