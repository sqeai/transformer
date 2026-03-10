import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { createDataQualityTools } from "./tools";
import { getDataQualitySystemPrompt } from "./prompt";

export interface DataQualityAgentConfig {
  apiKey: string;
}

export interface DataQualityScanResult {
  datasetId: string;
  scannedAt: string;
  totalRows: number;
  totalColumns: number;
  missingDataSummary: MissingDataColumn[];
  abnormalities: Abnormality[];
  overallScore: number;
  hasMissingData: boolean;
  hasAbnormalities: boolean;
}

export interface MissingDataColumn {
  column: string;
  missingCount: number;
  missingPercentage: number;
  totalRows: number;
}

export interface Abnormality {
  type: "outlier" | "type_mismatch" | "duplicate" | "inconsistent_format" | "suspicious_value";
  column: string;
  description: string;
  affectedRows: number;
  severity: "low" | "medium" | "high";
}

export interface DataQualityInvokeOptions {
  messages: BaseMessage[];
  datasetId: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

function createDataQualityAgent(config: DataQualityAgentConfig) {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    anthropicApiKey: config.apiKey,
    temperature: 0,
  });

  const tools = createDataQualityTools();

  return createAgent({
    model: llm,
    tools,
    systemPrompt: getDataQualitySystemPrompt(),
  });
}

export class DataQualityAgentGraph {
  private config: DataQualityAgentConfig;

  constructor(config: DataQualityAgentConfig) {
    this.config = config;
  }

  async invoke(
    inputs: DataQualityInvokeOptions,
    config?: { recursionLimit?: number },
  ) {
    try {
      const agent = createDataQualityAgent(this.config);
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

let dataQualityAgent: DataQualityAgentGraph | null = null;

export function getDataQualityAgent(): DataQualityAgentGraph | null {
  if (dataQualityAgent) return dataQualityAgent;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
    return null;
  }

  try {
    dataQualityAgent = new DataQualityAgentGraph({ apiKey });
    return dataQualityAgent;
  } catch (error) {
    console.error(`Failed to create data quality agent: ${(error as Error).message}`);
    return null;
  }
}
