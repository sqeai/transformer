import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { createAnalystTools, type DataSourceContext, type DimensionsLookupFn } from "./tools";
import { getSystemPrompt, type Persona } from "./personas";
import { FILES_BETA } from "@/lib/anthropic-files";

export interface AnalystAgentConfig {
  apiKey: string;
}

export interface AnalystInvokeOptions {
  messages: BaseMessage[];
  dataSources: DataSourceContext[];
  queryFn: (dataSourceId: string, sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }>;
  persona?: Persona | null;
  dimensionsLookupFn?: DimensionsLookupFn;
  companyContext?: string;
  hasFileAttachments?: boolean;
}

function createAnalystAgent(
  config: AnalystAgentConfig,
  dataSources: DataSourceContext[],
  queryFn: AnalystInvokeOptions["queryFn"],
  persona?: Persona | null,
  dimensionsLookupFn?: DimensionsLookupFn,
  companyContext?: string,
  hasFileAttachments?: boolean,
) {
  const betas: string[] = [];
  if (hasFileAttachments) betas.push(FILES_BETA);

  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    anthropicApiKey: config.apiKey,
    temperature: 0,
    ...(betas.length > 0 ? { betas } : {}),
  });

  const tools = createAnalystTools(dataSources, queryFn, dimensionsLookupFn);

  let systemPrompt = getSystemPrompt(persona);
  if (companyContext?.trim()) {
    systemPrompt += `\n\n## Company / Entity Context\n\nThe user has provided the following context about their company/entity. Use this to inform your analysis, understand the domain, and provide more relevant insights:\n\n${companyContext}`;
  }

  return createAgent({
    model: llm,
    tools,
    systemPrompt,
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
      inputs.companyContext,
      inputs.hasFileAttachments,
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
        inputs.companyContext,
        inputs.hasFileAttachments,
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
