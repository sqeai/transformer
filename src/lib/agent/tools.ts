import { tool } from "@langchain/core/tools";
import { z } from "zod";

const schemaFieldSchema: z.ZodType = z.lazy(() =>
  z.object({
    id: z.string().describe("Unique identifier for the field (UUID)"),
    name: z.string().describe("Display name of the field"),
    path: z.string().describe("Dot-separated path, e.g. 'address.city'"),
    level: z.number().describe("Nesting depth (0 = top-level)"),
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

/**
 * Tool: get_workspace_context
 *
 * Returns the full current workspace state (schema, mappings, pivot config, raw columns).
 */
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

export function createTools(workspaceContext: string | null) {
  return [
    updateSchemaTool,
    updateMappingsTool,
    updatePivotConfigTool,
    setPivotConfigTool,
    setEdgesTool,
    createGetWorkspaceContextTool(workspaceContext),
  ];
}
