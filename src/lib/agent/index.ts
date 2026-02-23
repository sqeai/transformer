import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { HumanMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";
import { createTools } from "./tools";

const SYSTEM_PROMPT = `You are an intelligent Schema & Mapping Assistant for a data cleansing application. You help users understand, modify, and improve their data schemas, column mappings, and pivot/aggregation configuration.

You have access to the following tools:

1. **get_workspace_context** — Retrieve the full current workspace: target schema fields, raw data columns, column mappings, and pivot configuration.
2. **update_schema** — Replace the target schema with an updated version. You must return ALL fields (not just changed ones).
3. **update_mappings** — Replace the column mappings with an updated version. Each mapping connects a raw column to a target schema path, with an optional aggregation function.
4. **update_pivot_config** — Update the pivot/aggregation settings (enable/disable, group-by columns).

## Data Model

### Schema
A schema has a name and a tree of fields. Each field has:
- \`id\`: UUID string
- \`name\`: display name (camelCase)
- \`path\`: dot-separated path (e.g. "address.city")
- \`level\`: nesting depth (0 = top-level)
- \`order\`: sort position among siblings
- \`children\`: optional array of nested fields

### Column Mappings
Each mapping connects one raw data column to one target schema field path:
- \`rawColumn\`: exact name from the uploaded raw data
- \`targetPath\`: schema field path (e.g. "customer.name")
- \`aggregation\`: optional — one of "sum", "concat", "count", "min", "max", "first" (used when pivot is enabled, omit for group-by columns)

### Pivot Config
Controls row grouping/aggregation:
- \`enabled\`: boolean
- \`groupByColumns\`: array of raw column names whose unique combination defines one output row

## How to Help Users

- **Viewing state:** Call get_workspace_context, then explain the current schema, mappings, and pivot config clearly.
- **Modifying the schema:** When users ask to add/remove/rename/reorder/nest fields, call get_workspace_context first, then call update_schema with the complete updated fields tree. Generate new UUIDs (use format like "field-xxx") for any new fields.
- **Modifying mappings:** When users ask to change how raw columns map to schema fields, call get_workspace_context first, then call update_mappings with the complete updated mappings array. Only map raw columns that actually exist in the workspace context.
- **Modifying pivot config:** When users ask to enable/disable pivot, change group-by columns, or change aggregation, call get_workspace_context first, then call update_pivot_config. If enabling pivot, also call update_mappings to set aggregation functions on non-group-by columns.
- **Combined changes:** If a change affects multiple things (e.g. adding a schema field AND mapping a raw column to it), call multiple update tools in sequence.

## Guidelines

- ALWAYS call get_workspace_context before making any updates.
- When updating schema, include ALL fields — not just the ones that changed.
- When updating mappings, include ALL mappings — not just the ones that changed.
- Only reference raw columns that actually exist in the workspace context.
- Only reference target paths that exist in the schema (or that you're creating in the same update).
- Explain what changes you're making and why.
- Use clear, camelCase field names for schema fields.
- If no schema is loaded, tell the user to create or select one first.
- If no raw data is uploaded, tell the user they need to upload data before mappings can be configured.`;

export interface AgentConfig {
  apiKey: string;
}

export interface InvokeOptions {
  messages: BaseMessage[];
  workspaceContext?: string | null;
}

export interface InvokeResult {
  messages: BaseMessage[];
}

function createLocalAgent(config: AgentConfig, workspaceContext: string | null) {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    anthropicApiKey: config.apiKey,
    temperature: 0,
  });

  const tools = createTools(workspaceContext);

  return createAgent({
    model: llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
  });
}

export class AgentGraph {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  private getAgent(workspaceContext: string | null) {
    return createLocalAgent(this.config, workspaceContext);
  }

  async invoke(inputs: InvokeOptions, config?: { recursionLimit?: number }): Promise<InvokeResult> {
    try {
      const agent = this.getAgent(inputs.workspaceContext ?? null);
      const result = await agent.invoke({ messages: inputs.messages }, config);

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

  async streamEvents(inputs: InvokeOptions, config?: Record<string, unknown>) {
    const agent = this.getAgent(inputs.workspaceContext ?? null);
    return agent.streamEvents({ messages: inputs.messages }, config);
  }
}

let agentGraph: AgentGraph | null = null;

export function getAgentGraph(): AgentGraph | null {
  if (agentGraph) return agentGraph;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
    return null;
  }

  try {
    agentGraph = new AgentGraph({ apiKey });
    return agentGraph;
  } catch (error) {
    console.error(`Failed to create agent: ${(error as Error).message}`);
    return null;
  }
}

export function resetAgent(): void {
  agentGraph = null;
}

export { HumanMessage, AIMessage };
