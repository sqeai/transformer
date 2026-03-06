import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { createAnalystTools, type DataSourceContext, type DimensionsLookupFn } from "./tools";
import { getSystemPrompt, type Persona } from "./personas";

export interface AnalystAgentConfig {
  apiKey: string;
}

export interface AnalystInvokeOptions {
  messages: BaseMessage[];
  dataSources: DataSourceContext[];
  queryFn: (dataSourceId: string, sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }>;
  persona?: Persona | null;
  dimensionsLookupFn?: DimensionsLookupFn;
}

function createAnalystAgent(
  config: AnalystAgentConfig,
  dataSources: DataSourceContext[],
  queryFn: AnalystInvokeOptions["queryFn"],
  persona?: Persona | null,
  dimensionsLookupFn?: DimensionsLookupFn,
) {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    anthropicApiKey: config.apiKey,
    temperature: 0,
  });

  const tools = createAnalystTools(dataSources, queryFn, dimensionsLookupFn);

  return createAgent({
    model: llm,
    tools,
    systemPrompt: getSystemPrompt(persona),
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
      inputs.persona,
      inputs.dimensionsLookupFn,
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
        inputs.persona,
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

export type { DataSourceContext, DimensionsLookupFn, Persona };
