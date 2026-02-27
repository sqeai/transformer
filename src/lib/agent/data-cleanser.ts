import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { PipelineDescriptor } from "../schema-store";

const VALID_AGGREGATIONS = ["sum", "concat", "count", "min", "max", "first"] as const;

function aggregate(values: unknown[], fn: string): unknown {
  switch (fn) {
    case "sum": {
      let total = 0;
      for (const v of values) {
        const n = Number(v);
        if (!Number.isNaN(n)) total += n;
      }
      return total;
    }
    case "count":
      return values.length;
    case "min": {
      const nums = values.map(Number).filter((n) => !Number.isNaN(n));
      return nums.length > 0 ? Math.min(...nums) : "";
    }
    case "max": {
      const nums = values.map(Number).filter((n) => !Number.isNaN(n));
      return nums.length > 0 ? Math.max(...nums) : "";
    }
    case "concat": {
      const unique = [...new Set(values.map((v) => String(v ?? "")).filter(Boolean))];
      return unique.join(", ");
    }
    case "first":
      return values[0] ?? "";
    default:
      return values[0] ?? "";
  }
}

export interface DataCleanserInput {
  columns: string[];
  rows: Record<string, unknown>[];
  targetPaths: string[];
  sheetName: string;
  userDirective?: string;
  originalColumns?: string[];
  originalRows?: Record<string, unknown>[];
  modifiedColumns?: string[];
  modifiedRows?: Record<string, unknown>[];
}

export interface DataCleanserResult {
  transformedColumns: string[];
  transformedRows: Record<string, unknown>[];
  toolsUsed: Array<{ tool: string; params: Record<string, unknown> }>;
  pipeline: PipelineDescriptor;
}

interface AgentState {
  columns: string[];
  rows: Record<string, unknown>[];
  targetPaths: string[];
  toolsUsed: Array<{ tool: string; params: Record<string, unknown> }>;
}

let agentState: AgentState = {
  columns: [],
  rows: [],
  targetPaths: [],
  toolsUsed: [],
};

const filterTool = tool(
  async (input) => {
    const before = agentState.rows.length;
    let filtered = agentState.rows;

    if (input.removeEmptyRows) {
      filtered = filtered.filter((row) =>
        agentState.columns.some((col) => {
          const v = row[col];
          return v != null && String(v).trim() !== "";
        }),
      );
    }

    if (input.removeDuplicates && input.duplicateKeyColumns.length > 0) {
      const seen = new Set<string>();
      filtered = filtered.filter((row) => {
        const key = input.duplicateKeyColumns.map((col) => String(row[col] ?? "")).join("|||");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    if (input.removeMatchingKeywords.length > 0) {
      const keywords = input.removeMatchingKeywords.map((k) => k.toLowerCase());
      filtered = filtered.filter((row) => {
        const firstNonEmpty = agentState.columns
          .map((col) => row[col])
          .find((v) => v != null && String(v).trim() !== "");
        if (firstNonEmpty == null) return true;
        const text = String(firstNonEmpty).toLowerCase().trim();
        return !keywords.some((kw) => text.includes(kw));
      });
    }

    agentState.rows = filtered;
    const removed = before - filtered.length;
    agentState.toolsUsed.push({
      tool: "filter",
      params: {
        removeEmptyRows: input.removeEmptyRows,
        removeDuplicates: input.removeDuplicates,
        duplicateKeyColumns: input.duplicateKeyColumns,
        removeMatchingKeywords: input.removeMatchingKeywords,
        removedCount: removed,
      },
    });
    return `Filtered: removed ${removed} rows. ${filtered.length} rows remaining.`;
  },
  {
    name: "filter",
    description: "Remove empty rows, duplicate rows, and rows matching keywords (like totals/subtotals). Use this to clean the data before other transformations.",
    schema: z.object({
      removeEmptyRows: z.boolean().describe("Remove rows where all cells are empty"),
      removeDuplicates: z.boolean().describe("Remove duplicate rows based on key columns"),
      duplicateKeyColumns: z.array(z.string()).describe("Columns to use for duplicate detection"),
      removeMatchingKeywords: z.array(z.string()).describe("Remove rows where first non-empty cell contains any of these keywords (e.g. 'total', 'subtotal')"),
    }),
  },
);

const unpivotTool = tool(
  async (input) => {
    const result: Record<string, unknown>[] = [];
    const keepCols = agentState.columns.filter((c) => !input.unpivotColumns.includes(c));

    for (const row of agentState.rows) {
      for (const col of input.unpivotColumns) {
        const newRow: Record<string, unknown> = {};
        for (const kc of keepCols) {
          newRow[kc] = row[kc];
        }
        newRow[input.nameColumn] = col;
        newRow[input.valueColumn] = row[col];

        if (input.extractFields) {
          for (const ef of input.extractFields) {
            const extracted = ef.valuesBySourceColumn?.[col];
            if (extracted !== undefined) {
              newRow[ef.fieldName] = extracted;
            }
          }
        }

        result.push(newRow);
      }
    }

    const newColumns = [...keepCols, input.nameColumn, input.valueColumn];
    if (input.extractFields) {
      for (const ef of input.extractFields) {
        if (!newColumns.includes(ef.fieldName)) {
          newColumns.push(ef.fieldName);
        }
      }
    }

    agentState.columns = newColumns;
    agentState.rows = result;
    agentState.toolsUsed.push({
      tool: "unpivot",
      params: {
        unpivotColumns: input.unpivotColumns,
        nameColumn: input.nameColumn,
        valueColumn: input.valueColumn,
        extractFields: input.extractFields ?? [],
        resultRowCount: result.length,
      },
    });
    return `Unpivoted ${input.unpivotColumns.length} columns into rows. Now have ${result.length} rows and columns: ${newColumns.join(", ")}`;
  },
  {
    name: "unpivot",
    description: "Melt wide-format columns (e.g. monthly columns like 'Jan 2025', 'Feb 2025') into rows. Each source column becomes a separate row with a name and value column. Optionally extract additional fields from column names (e.g. year, month from 'January 2025').",
    schema: z.object({
      unpivotColumns: z.array(z.string()).describe("Column names to unpivot (melt into rows)"),
      nameColumn: z.string().describe("Name for the new column that will hold the original column names"),
      valueColumn: z.string().describe("Name for the new column that will hold the cell values"),
      extractFields: z.array(z.object({
        fieldName: z.string().describe("Name of the extracted field (e.g. 'year', 'month')"),
        valuesBySourceColumn: z.record(z.string(), z.string()).describe("Map of source column name to extracted value"),
      })).optional().describe("Additional fields to extract from column names"),
    }),
  },
);

const expandTool = tool(
  async (input) => {
    const labelCol = input.labelColumn;
    const maxDepth = Math.max(2, Math.min(8, input.maxDepth));
    const valueCols = agentState.columns.filter((c) => c !== labelCol);

    const nestingCols = Array.from({ length: maxDepth }, (_, i) => `nesting_level_${i + 1}`);
    const stack: string[] = Array(maxDepth).fill("");
    const result: Record<string, unknown>[] = [];

    for (let i = 0; i < agentState.rows.length; i++) {
      const row = agentState.rows[i];
      const rawLabel = String(row[labelCol] ?? "");
      const label = rawLabel.replace(/^\s*[*#\-\u2022]+\s*/, "").replace(/\s+/g, " ").trim();
      if (!label) continue;

      let level = maxDepth;
      const starMatch = rawLabel.match(/^\s*(\*+)\s*/);
      if (starMatch) {
        const starCount = starMatch[1].length;
        level = Math.max(1, Math.min(maxDepth, maxDepth - starCount + 1));
      } else if (/^\d{3,}/.test(label)) {
        level = maxDepth;
      } else if (/^\s+/.test(rawLabel)) {
        const indent = (rawLabel.match(/^\s+/)?.[0]?.length ?? 0);
        level = Math.max(1, Math.min(maxDepth, Math.floor(indent / 2) + 1));
      }

      stack[level - 1] = label;
      for (let d = level; d < maxDepth; d++) stack[d] = "";

      let nextLevel = 0;
      for (let j = i + 1; j < agentState.rows.length; j++) {
        const nextLabel = String(agentState.rows[j][labelCol] ?? "").replace(/^\s*[*#\-\u2022]+\s*/, "").trim();
        if (!nextLabel) continue;
        const nextStar = String(agentState.rows[j][labelCol] ?? "").match(/^\s*(\*+)\s*/);
        if (nextStar) {
          nextLevel = Math.max(1, Math.min(maxDepth, maxDepth - nextStar[1].length + 1));
        } else if (/^\d{3,}/.test(nextLabel)) {
          nextLevel = maxDepth;
        } else {
          nextLevel = level;
        }
        break;
      }

      const isLeaf = nextLevel <= level;
      if (!isLeaf) continue;

      const out: Record<string, unknown> = {};
      for (let d = 0; d < maxDepth; d++) {
        out[nestingCols[d]] = stack[d] ?? "";
      }
      for (const vc of valueCols) {
        out[vc] = row[vc] ?? "";
      }
      result.push(out);
    }

    agentState.columns = [...nestingCols, ...valueCols];
    agentState.rows = result;
    agentState.toolsUsed.push({
      tool: "expand",
      params: { labelColumn: labelCol, maxDepth, resultRowCount: result.length },
    });
    return `Expanded hierarchical data: ${result.length} leaf rows with ${maxDepth} nesting levels. Columns: ${agentState.columns.join(", ")}`;
  },
  {
    name: "expand",
    description: "Flatten hierarchical/tree-structured data (like financial statements with star-marked categories) into flat rows with nesting level columns. Identifies parent/child relationships and expands leaf nodes with their full hierarchy path.",
    schema: z.object({
      labelColumn: z.string().describe("Column containing the hierarchical labels (with stars, indentation, etc.)"),
      maxDepth: z.number().describe("Maximum nesting depth to support (2-8)"),
    }),
  },
);

const aggregateTool = tool(
  async (input) => {
    const groups = new Map<string, Record<string, unknown>[]>();

    for (const row of agentState.rows) {
      const key = input.groupByColumns.map((col) => String(row[col] ?? "")).join("|||");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const result: Record<string, unknown>[] = [];
    for (const rows of groups.values()) {
      const out: Record<string, unknown> = {};
      for (const col of input.groupByColumns) {
        out[col] = rows[0][col];
      }
      for (const agg of input.aggregations) {
        const values = rows.map((r) => r[agg.column]);
        out[agg.column] = aggregate(values, agg.function);
      }
      for (const col of agentState.columns) {
        if (!(col in out)) {
          out[col] = rows[0][col];
        }
      }
      result.push(out);
    }

    agentState.rows = result;
    agentState.toolsUsed.push({
      tool: "aggregate",
      params: {
        groupByColumns: input.groupByColumns,
        aggregations: input.aggregations,
        groupCount: result.length,
      },
    });
    return `Aggregated into ${result.length} groups using columns: ${input.groupByColumns.join(", ")}`;
  },
  {
    name: "aggregate",
    description: "Group rows by key columns and aggregate other columns using functions like sum, count, concat, min, max, first. Use when multiple rows should be combined into one (e.g. multiple transactions per customer).",
    schema: z.object({
      groupByColumns: z.array(z.string()).describe("Columns that define unique groups"),
      aggregations: z.array(z.object({
        column: z.string().describe("Column to aggregate"),
        function: z.enum(["sum", "concat", "count", "min", "max", "first"]).describe("Aggregation function"),
      })).describe("How to aggregate non-group-by columns"),
    }),
  },
);

const mapTool = tool(
  async (input) => {
    const result: Record<string, unknown>[] = [];

    for (const row of agentState.rows) {
      const out: Record<string, unknown> = {};
      for (const m of input.mappings) {
        out[m.targetPath] = row[m.sourceColumn] ?? m.defaultValue ?? "";
      }
      for (const tp of agentState.targetPaths) {
        if (!(tp in out)) {
          const def = input.defaults?.find((d) => d.targetPath === tp);
          out[tp] = def?.value ?? "";
        }
      }
      result.push(out);
    }

    const newColumns = agentState.targetPaths;
    agentState.columns = newColumns;
    agentState.rows = result;
    agentState.toolsUsed.push({
      tool: "map",
      params: {
        mappings: input.mappings,
        defaults: input.defaults ?? [],
      },
    });
    return `Mapped ${input.mappings.length} columns to target schema paths. ${result.length} rows with columns: ${newColumns.join(", ")}`;
  },
  {
    name: "map",
    description: "Map source columns to target schema field paths. This is typically the final step that transforms the intermediate data into the target schema format. Each mapping connects a source column to a target path.",
    schema: z.object({
      mappings: z.array(z.object({
        sourceColumn: z.string().describe("Current column name in the data"),
        targetPath: z.string().describe("Target schema field path"),
        defaultValue: z.string().optional().describe("Default value if source is empty"),
      })).describe("Column to target path mappings"),
      defaults: z.array(z.object({
        targetPath: z.string(),
        value: z.string(),
      })).optional().describe("Default values for unmapped target paths"),
    }),
  },
);

const getDataPreviewTool = tool(
  async () => {
    const preview = agentState.rows.slice(0, 20);
    return JSON.stringify({
      columns: agentState.columns,
      rowCount: agentState.rows.length,
      sampleRows: preview,
    }, null, 2);
  },
  {
    name: "get_data_preview",
    description: "Get a preview of the current data state: columns, total row count, and first 20 rows. Use this to inspect data before deciding which transformations to apply.",
    schema: z.object({}),
  },
);

function buildPipeline(toolsUsed: Array<{ tool: string; params: Record<string, unknown> }>): PipelineDescriptor {
  const nodes: PipelineDescriptor["nodes"] = [
    { id: "source", type: "source", label: "Raw Data", data: {} },
  ];
  const edges: PipelineDescriptor["edges"] = [];
  let prevId = "source";

  for (let i = 0; i < toolsUsed.length; i++) {
    const t = toolsUsed[i];
    const nodeId = `${t.tool}_${i}`;
    const nodeType = t.tool as PipelineDescriptor["nodes"][0]["type"];
    nodes.push({
      id: nodeId,
      type: nodeType,
      label: t.tool.charAt(0).toUpperCase() + t.tool.slice(1),
      data: t.params,
    });
    edges.push({ id: `e_${prevId}_${nodeId}`, source: prevId, target: nodeId });
    prevId = nodeId;
  }

  nodes.push({ id: "target", type: "target", label: "Target Schema", data: {} });
  edges.push({ id: `e_${prevId}_target`, source: prevId, target: "target" });

  return { nodes, edges };
}

const DATA_CLEANSER_SYSTEM_PROMPT = `You are the AI Data Cleanser agent. Your job is to take raw spreadsheet data and transform it into a clean dataset matching a target schema.

You have access to these tools:
1. **get_data_preview** - View current data state (columns, row count, sample rows). ALWAYS call this first.
2. **filter** - Remove empty rows, duplicates, and rows with keywords like "total"/"subtotal"
3. **unpivot** - Melt wide-format columns (e.g. monthly columns) into rows
4. **expand** - Flatten hierarchical/tree-structured data into flat rows with nesting levels
5. **aggregate** - Group rows by key columns and aggregate others (sum, concat, count, etc.)
6. **map** - Map current columns to target schema paths (typically the final step)

## Process

1. First call get_data_preview to understand the data structure
2. Analyze the data and decide which transformations are needed
3. Apply transformations in order: filter -> expand/unpivot -> aggregate -> map
4. Not all steps are needed - only apply what makes sense for the data
5. The map step should always be last to produce the final schema format

## Rules

- ALWAYS start with get_data_preview
- Only use columns that actually exist in the data
- Only map to target paths that are in the provided target schema
- Be conservative - don't remove data unless it's clearly noise
- For financial data with star markers (*** ASSETS, ** Cash), use the expand tool
- For wide-format data with repeating time columns, use unpivot
- For data with duplicate key rows, use aggregate
- The final map step should cover as many target paths as possible

When done, respond with a JSON summary:
{"status": "complete", "rowCount": <number>, "mappedPaths": [<list of target paths that were mapped>]}`;

export async function runDataCleanser(input: DataCleanserInput): Promise<DataCleanserResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  agentState = {
    columns: [...input.columns],
    rows: input.rows.map((r) => ({ ...r })),
    targetPaths: [...input.targetPaths],
    toolsUsed: [],
  };

  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    anthropicApiKey: apiKey,
    temperature: 0,
  });

  const tools = [getDataPreviewTool, filterTool, unpivotTool, expandTool, aggregateTool, mapTool];

  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt: DATA_CLEANSER_SYSTEM_PROMPT,
  });

  const userMessage = [
    `Process this sheet "${input.sheetName}" and transform it to match the target schema.`,
    "",
    `Target schema paths: ${input.targetPaths.map((p) => `"${p}"`).join(", ")}`,
    "",
    `The data has ${input.columns.length} columns and ${input.rows.length} rows.`,
    `Columns: ${input.columns.join(", ")}`,
  ];

  if (input.userDirective) {
    userMessage.push("", `User directive (HIGHEST PRIORITY): ${input.userDirective}`);
  }

  if (
    Array.isArray(input.originalColumns) &&
    Array.isArray(input.originalRows) &&
    Array.isArray(input.modifiedColumns) &&
    Array.isArray(input.modifiedRows)
  ) {
    userMessage.push(
      "",
      "Context for modify request:",
      `Original sheet: ${input.originalRows.length} rows, ${input.originalColumns.length} columns`,
      `Original columns: ${input.originalColumns.join(", ")}`,
      `Modified sheet before this run: ${input.modifiedRows.length} rows, ${input.modifiedColumns.length} columns`,
      `Modified columns: ${input.modifiedColumns.join(", ")}`,
      "Apply the directive to the modified sheet while using the original sheet as reference context.",
    );
  }

  const result = await agent.invoke(
    { messages: [new HumanMessage(userMessage.join("\n"))] },
    { recursionLimit: 25 },
  );

  const pipeline = buildPipeline(agentState.toolsUsed);

  return {
    transformedColumns: agentState.columns,
    transformedRows: agentState.rows,
    toolsUsed: agentState.toolsUsed,
    pipeline,
  };
}
