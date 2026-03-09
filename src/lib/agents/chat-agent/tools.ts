import { tool } from "@langchain/core/tools";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

const schemaFieldSchema: z.ZodType = z.lazy(() =>
  z.object({
    id: z.string().describe("Unique identifier for the field (UUID)"),
    name: z.string().describe("Display name of the field"),
    path: z.string().describe("Dot-separated path, e.g. 'address.city'"),
    level: z.number().describe("Nesting level (1 = topmost, 2 = first nesting, 3 = second, etc.)"),
    order: z.number().describe("Sort order among siblings"),
    children: z.array(schemaFieldSchema).optional().describe("Nested child fields"),
  }),
);

const columnMappingSchema = z.object({
  rawColumn: z.string().describe("Exact raw column name from the uploaded data"),
  targetPath: z.string().describe("Target schema field path, e.g. 'customer.name'"),
  aggregation: z
    .enum(["sum", "concat", "count", "min", "max", "first"])
    .optional()
    .describe("Aggregation function when pivot is enabled (omit for group-by columns)"),
});

const pivotConfigSchema = z.object({
  enabled: z.boolean().describe("Whether pivot/aggregation is active"),
  groupByColumns: z
    .array(z.string())
    .describe("Raw column names to group rows by"),
});

function wrapDelimiter(tag: string, payload: object): string {
  return `<!-- ${tag}:${JSON.stringify(payload)} -->`;
}

export const updateSchemaTool = tool(
  async (input) => {
    return wrapDelimiter("SCHEMA_JSON", {
      type: "schema_update",
      schema: { name: input.schemaName, fields: input.fields },
    });
  },
  {
    name: "update_schema",
    description: `Update the target schema. Return the COMPLETE updated schema fields array (not a diff). Use this when the user asks to add, remove, rename, reorder, nest/unnest, or restructure schema fields. Always include ALL fields — unchanged ones too.`,
    schema: z.object({
      schemaName: z.string().describe("The name of the schema"),
      fields: z.array(schemaFieldSchema).describe("The complete updated fields tree"),
    }),
  },
);

export const updateMappingsTool = tool(
  async (input) => {
    return wrapDelimiter("MAPPINGS_JSON", {
      type: "mappings_update",
      mappings: input.mappings,
    });
  },
  {
    name: "update_mappings",
    description: `Update the column mappings between raw data columns and target schema paths. Return the COMPLETE mappings array. Use this when the user asks to change how raw columns map to schema fields, add/remove mappings, or change aggregation functions. Each mapping connects a rawColumn to a targetPath.`,
    schema: z.object({
      mappings: z.array(columnMappingSchema).describe("The complete updated mappings array"),
    }),
  },
);

export const updatePivotConfigTool = tool(
  async (input) => {
    return wrapDelimiter("PIVOT_JSON", {
      type: "pivot_update",
      pivotConfig: input.pivotConfig,
    });
  },
  {
    name: "update_pivot_config",
    description: `Update the pivot/aggregation configuration. Use this when the user asks to enable/disable pivoting, change group-by columns, or modify how rows are aggregated. When enabling pivot, also specify which raw columns to group by.`,
    schema: z.object({
      pivotConfig: pivotConfigSchema.describe("The updated pivot configuration"),
    }),
  },
);

const edgeSchema = z.object({
  rawColumn: z.string().describe("Exact raw column name from the uploaded data (used to derive the source node ID)"),
  targetPath: z.string().describe("Target schema field path, e.g. 'customer.name' (used to derive the target node ID)"),
});

export const setPivotConfigTool = tool(
  async (input) => {
    return wrapDelimiter("PIVOT_JSON", {
      type: "set_pivot_config",
      pivotConfig: input.pivotConfig,
    });
  },
  {
    name: "set_pivot_config",
    description: `Directly set the pivot configuration on the client-side mapping page. Use this when you want to explicitly push a pivot config update to the UI — for example after analysing the schema and deciding which columns should be grouped. This is equivalent to calling setPivotConfig() on the client.`,
    schema: z.object({
      pivotConfig: pivotConfigSchema.describe("The pivot configuration to set"),
    }),
  },
);

export const setEdgesTool = tool(
  async (input) => {
    return wrapDelimiter("EDGES_JSON", {
      type: "set_edges",
      edges: input.edges,
    });
  },
  {
    name: "set_edges",
    description: `Directly set the mapping edges on the client-side mapping page. Each edge connects a raw column to a target schema field path. Use this when you want to explicitly control which visual connections appear in the mapping builder — for example after analysing the data and schema to suggest optimal mappings. This is equivalent to calling setEdges() on the client. Always provide the COMPLETE set of edges (not a diff).`,
    schema: z.object({
      edges: z.array(edgeSchema).describe("The complete set of edges to display in the mapping builder"),
    }),
  },
);

export function createGetWorkspaceContextTool(workspaceJson: string | null) {
  return tool(
    async () => {
      if (!workspaceJson) {
        return JSON.stringify({
          error: "No workspace context available. The user needs to load a schema and upload raw data first.",
        });
      }
      return workspaceJson;
    },
    {
      name: "get_workspace_context",
      description:
        "Retrieve the full current workspace state: the target schema (fields tree), raw data columns, column mappings, and pivot configuration. Always call this first before making any updates.",
      schema: z.object({}),
    },
  );
}

export const webSearchTool = tool(
  async (input) => {
    const client = new Anthropic();
    try {
      const response = await (client.messages.create as Function)({
        model: "claude-sonnet-4-6",
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
- You need external context to supplement analysis (e.g. industry benchmarks, best practices, documentation)
- The user's question cannot be answered from the workspace context alone
- You need to verify or contextualize findings with external data

Returns a succinct bullet-point summary with source citations.`,
    schema: z.object({
      query: z.string().describe("The search query to look up on the web"),
    }),
  },
);

export function createTools(workspaceContext: string | null) {
  return [
    updateSchemaTool,
    updateMappingsTool,
    updatePivotConfigTool,
    setPivotConfigTool,
    setEdgesTool,
    createGetWorkspaceContextTool(workspaceContext),
    webSearchTool,
  ];
}
