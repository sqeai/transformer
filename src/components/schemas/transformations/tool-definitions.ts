import type { TransformationPhase } from "@/lib/types";

export interface ToolParamDefinition {
  name: string;
  type: "string" | "boolean" | "number" | "string[]" | "object[]" | "select";
  label: string;
  description: string;
  required?: boolean;
  default?: unknown;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  phase: TransformationPhase;
  params: ToolParamDefinition[];
  icon?: string;
}

export const TRANSFORMATION_TOOLS: ToolDefinition[] = [
  // Cleansing Phase Tools
  {
    id: "filter",
    name: "Filter",
    description: "Remove noise rows (empty, duplicates, keywords)",
    phase: "cleansing",
    params: [
      {
        name: "removeEmptyRows",
        type: "boolean",
        label: "Remove Empty Rows",
        description: "Remove rows where all cells are empty",
        default: true,
      },
      {
        name: "removeDuplicates",
        type: "boolean",
        label: "Remove Duplicates",
        description: "Remove duplicate rows",
        default: false,
      },
      {
        name: "duplicateKeyColumns",
        type: "string[]",
        label: "Duplicate Key Columns",
        description: "Columns to check for duplicates (leave empty for all columns)",
        default: [],
      },
      {
        name: "removeMatchingKeywords",
        type: "string[]",
        label: "Remove Matching Keywords",
        description: "Remove rows containing these keywords",
        default: [],
      },
    ],
  },
  {
    id: "filterRows",
    name: "Filter Rows",
    description: "Remove or keep rows matching a regex pattern",
    phase: "cleansing",
    params: [
      {
        name: "column",
        type: "string",
        label: "Column",
        description: "Column to match against",
        required: true,
        placeholder: "e.g., status",
      },
      {
        name: "pattern",
        type: "string",
        label: "Pattern",
        description: "JavaScript regex pattern to match",
        required: true,
        placeholder: "e.g., ^inactive$",
      },
      {
        name: "mode",
        type: "select",
        label: "Mode",
        description: "Remove matching rows or keep only matching rows",
        default: "remove",
        options: [
          { value: "remove", label: "Remove matching rows" },
          { value: "keep", label: "Keep only matching rows" },
        ],
      },
      {
        name: "caseInsensitive",
        type: "boolean",
        label: "Case Insensitive",
        description: "Match case-insensitively",
        default: true,
      },
    ],
  },
  {
    id: "padColumns",
    name: "Pad Columns",
    description: "Forward-fill empty cells in specified columns",
    phase: "cleansing",
    params: [
      {
        name: "paddingColumns",
        type: "string[]",
        label: "Columns to Pad",
        description: "Columns to forward-fill empty values",
        required: true,
      },
    ],
  },
  {
    id: "mapRows",
    name: "Map Rows",
    description: "Apply row-by-row transformations, lookups, and expressions",
    phase: "cleansing",
    params: [
      {
        name: "rules",
        type: "object[]",
        label: "Rules",
        description: "Conditional rules for setting column values",
        default: [],
      },
      {
        name: "lookups",
        type: "object[]",
        label: "Lookups",
        description: "Lookup tables for mapping values",
        default: [],
      },
      {
        name: "customTransforms",
        type: "object[]",
        label: "Custom Transforms",
        description: "Custom TypeScript expressions",
        default: [],
      },
    ],
  },

  // Transformation Phase Tools
  {
    id: "trimColumns",
    name: "Trim Columns",
    description: "Drop or keep specific columns",
    phase: "transformation",
    params: [
      {
        name: "keepColumns",
        type: "string[]",
        label: "Keep Columns",
        description: "Only keep these columns (leave empty to use dropColumns instead)",
        default: [],
      },
      {
        name: "dropColumns",
        type: "string[]",
        label: "Drop Columns",
        description: "Drop these columns (ignored if keepColumns is set)",
        default: [],
      },
    ],
  },
  {
    id: "unpivot",
    name: "Unpivot",
    description: "Melt wide columns into rows (unpivot/melt)",
    phase: "transformation",
    params: [
      {
        name: "unpivotColumns",
        type: "string[]",
        label: "Columns to Unpivot",
        description: "Wide columns to melt into rows",
        required: true,
      },
      {
        name: "nameColumn",
        type: "string",
        label: "Name Column",
        description: "Name for the new column containing original column names",
        required: true,
        placeholder: "e.g., period",
      },
      {
        name: "valueColumn",
        type: "string",
        label: "Value Column",
        description: "Name for the new column containing values",
        required: true,
        placeholder: "e.g., amount",
      },
      {
        name: "extractFields",
        type: "object[]",
        label: "Extract Fields",
        description: "Additional fields to extract from column names",
        default: [],
      },
    ],
  },
  {
    id: "expand",
    name: "Expand",
    description: "Flatten hierarchy with nesting levels",
    phase: "transformation",
    params: [
      {
        name: "labelColumn",
        type: "string",
        label: "Label Column",
        description: "Column containing hierarchical labels",
        required: true,
      },
      {
        name: "maxDepth",
        type: "number",
        label: "Max Depth",
        description: "Maximum depth levels to expand (2-8)",
        default: 4,
      },
    ],
  },
  {
    id: "handleBalanceSheet",
    name: "Handle Balance Sheet",
    description: "Flatten hierarchy using star/indent convention",
    phase: "transformation",
    params: [
      {
        name: "labelColumn",
        type: "string",
        label: "Label Column",
        description: "Column containing hierarchical labels (optional)",
      },
      {
        name: "maxDepth",
        type: "number",
        label: "Max Depth",
        description: "Maximum depth levels (2-8)",
        default: 4,
      },
    ],
  },
  {
    id: "aggregate",
    name: "Aggregate",
    description: "Group and aggregate data",
    phase: "transformation",
    params: [
      {
        name: "groupByColumns",
        type: "string[]",
        label: "Group By Columns",
        description: "Columns to group by",
        required: true,
      },
      {
        name: "aggregations",
        type: "object[]",
        label: "Aggregations",
        description: "Aggregation functions to apply",
        required: true,
      },
    ],
  },
  {
    id: "reduce",
    name: "Reduce",
    description: "Aggregate with explicit output column names",
    phase: "transformation",
    params: [
      {
        name: "keyColumns",
        type: "string[]",
        label: "Key Columns",
        description: "Columns to use as keys for grouping",
        required: true,
      },
      {
        name: "aggregations",
        type: "object[]",
        label: "Aggregations",
        description: "Aggregation operations with output column names",
        required: true,
      },
      {
        name: "includeCount",
        type: "boolean",
        label: "Include Count",
        description: "Add a count column",
        default: false,
      },
    ],
  },
  {
    id: "map",
    name: "Map to Schema",
    description: "Map columns to target schema paths (MUST be last)",
    phase: "transformation",
    params: [
      {
        name: "mappings",
        type: "object[]",
        label: "Column Mappings",
        description: "Map source columns to target schema paths",
        required: true,
      },
      {
        name: "defaults",
        type: "object[]",
        label: "Default Values",
        description: "Default values for unmapped target paths",
        default: [],
      },
    ],
  },
];

export function getToolDefinition(toolId: string): ToolDefinition | undefined {
  return TRANSFORMATION_TOOLS.find((t) => t.id === toolId);
}

export function getToolsByPhase(phase: TransformationPhase): ToolDefinition[] {
  return TRANSFORMATION_TOOLS.filter((t) => t.phase === phase);
}
