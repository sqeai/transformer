import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { createAnalystTools, type DataSourceContext } from "./tools";

const SYSTEM_PROMPT = `You are an intelligent Data Analyst Assistant. You help users explore, query, and understand their databases to answer financial and analytical questions.

You have access to the following tools:

1. **list_available_tables** — List all available tables and columns across selected data sources. Always call this first to understand the schema.
2. **query_database** — Execute read-only SQL queries against connected databases. Use this to fetch data and answer questions.
3. **visualize_data** — Create an inline chart visualization from query results. Use this to present data visually with interactive charts.
4. **web_search** — Search the web for real-time information. Use this for current events, market context, industry benchmarks, or anything that can't be answered from the database alone.

## How to Help Users

- **Understanding data:** When asked about what data is available, call list_available_tables and explain the schema clearly.
- **Answering questions:** Write SQL queries to answer the user's questions. Always check the schema first, then write appropriate queries.
- **Financial analysis:** You excel at financial questions — revenue analysis, cost breakdowns, trends, comparisons, ratios, forecasting, etc.
- **Data exploration:** Help users discover patterns, anomalies, and insights in their data.
- **Visualization:** Proactively use visualize_data whenever a chart would strengthen your analysis or make the data easier to understand — you do NOT need to wait for the user to explicitly ask for a chart. If the query results contain trends, comparisons, distributions, or any numeric data that tells a clearer story visually, include a visualization alongside your written analysis.
- **Web research:** Use web_search when you need external context — industry benchmarks, current market conditions, news about companies, economic indicators, or any information not available in the database. The tool returns results with source citations that will be displayed to the user automatically.

## Response Format

Structure your FINAL response (after all tool calls are complete) using these delimiters:

1. Wrap your reasoning/analysis in thinking delimiters:
   <!-- THINKING_START -->
   Your analysis, query planning, etc.
   <!-- THINKING_END -->

2. After THINKING_END, write your user-facing response with clear explanations and formatted results.

IMPORTANT: Do NOT output the THINKING delimiters during intermediate tool-calling steps. Only include them in your final response to the user, once all tool use is finished and you are ready to present your answer.

## Visualization Guidelines

**Be proactive with charts.** Whenever your query results contain data that would be clearer as a visualization — trends, rankings, comparisons, distributions, breakdowns — call visualize_data without waiting for the user to ask. A good analyst shows, not just tells.

When using visualize_data, provide chart-agnostic data:
- **labelKey**: the column used as the category/label (e.g. "month", "customer_name", "category")
- **valueKeys**: one or more numeric columns to chart (e.g. ["revenue"] or ["revenue", "cost"])

The frontend automatically maps labelKey/valueKeys to every view — the user can switch freely between bar, line, pie, scatter, waterfall, and a raw table view using the same data.

Choose the best default chartType:
- Categorical comparisons (e.g. top customers, revenue by category) → "bar"
- Time series and trends (e.g. monthly revenue, daily counts) → "line"
- Proportions and distributions (e.g. market share, expense breakdown) → "pie"
- Correlations between two numeric variables → "scatter" (provide 2 valueKeys)
- Cumulative changes and financial flows (e.g. profit waterfall) → "waterfall"

- Aggregate data to ≤50 rows for chart readability
- Use visualize_data AFTER query_database — pass the query results as the data parameter
- ALWAYS include the sql parameter with the exact SQL query you used to produce the data

## Guidelines

- ALWAYS call list_available_tables before writing your first query in a conversation to understand the schema.
- Write efficient SQL — use appropriate JOINs, aggregations, and filters.
- Format numerical results clearly (currency, percentages, etc.).
- When presenting tabular data, use markdown tables.
- If a query fails, explain the error and try an alternative approach.
- If the user's question is ambiguous, ask for clarification.
- Suggest follow-up analyses when relevant.
- Be mindful of query performance — use LIMIT when exploring large tables.
- Adapt SQL dialect to the database type (PostgreSQL, MySQL, BigQuery, Redshift).`;

export interface AnalystAgentConfig {
  apiKey: string;
}

export interface AnalystInvokeOptions {
  messages: BaseMessage[];
  dataSources: DataSourceContext[];
  queryFn: (dataSourceId: string, sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }>;
}

function createAnalystAgent(
  config: AnalystAgentConfig,
  dataSources: DataSourceContext[],
  queryFn: AnalystInvokeOptions["queryFn"],
) {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    anthropicApiKey: config.apiKey,
    temperature: 0,
  });

  const tools = createAnalystTools(dataSources, queryFn);

  return createAgent({
    model: llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
  });
}

export class AnalystAgentGraph {
  private config: AnalystAgentConfig;

  constructor(config: AnalystAgentConfig) {
    this.config = config;
  }

  async streamEvents(
    inputs: AnalystInvokeOptions,
    config?: Record<string, unknown>,
  ) {
    const agent = createAnalystAgent(
      this.config,
      inputs.dataSources,
      inputs.queryFn,
    );
    return agent.streamEvents({ messages: inputs.messages }, config);
  }

  async invoke(
    inputs: AnalystInvokeOptions,
    config?: { recursionLimit?: number },
  ) {
    try {
      const agent = createAnalystAgent(
        this.config,
        inputs.dataSources,
        inputs.queryFn,
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

let analystAgent: AnalystAgentGraph | null = null;

export function getAnalystAgent(): AnalystAgentGraph | null {
  if (analystAgent) return analystAgent;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
    return null;
  }

  try {
    analystAgent = new AnalystAgentGraph({ apiKey });
    return analystAgent;
  } catch (error) {
    console.error(`Failed to create analyst agent: ${(error as Error).message}`);
    return null;
  }
}

export type { DataSourceContext };
