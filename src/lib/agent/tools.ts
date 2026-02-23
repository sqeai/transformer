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

/**
 * Tool: update_schema
 *
 * Returns the complete updated schema fields. The client applies this directly.
 */
export const updateSchemaTool = tool(
  async (input) => {
    return JSON.stringify({
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

/**
 * Tool: update_mappings
 *
 * Returns the complete updated column mappings. The client applies this directly.
 */
export const updateMappingsTool = tool(
  async (input) => {
    return JSON.stringify({
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

/**
 * Tool: update_pivot_config
 *
 * Returns the updated pivot/aggregation configuration.
 */
export const updatePivotConfigTool = tool(
  async (input) => {
    return JSON.stringify({
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
    createGetWorkspaceContextTool(workspaceContext),
  ];
}
