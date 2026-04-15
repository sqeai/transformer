import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { tool } from "@langchain/core/tools";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { PipelineDescriptor } from "../../schema-store";
import { downloadS3FileToTmp, uploadBufferToS3 } from "../../s3-files";
import {
  type FileData,
  type TransformationStep,
  fileSummary,
  rowsToCsv,
  executeTransformation,
  buildPipeline,
} from "../../utils";
import { readLocalCsv, writeLocalCsv } from "../../utils/csv-fs";
import { createAdminClient } from "../../supabase/admin";
import { createConnector } from "../../connectors";
import type { DataSourceType } from "../../connectors";

const MAX_PLAN_STEPS = 30;
const MAX_JUDGE_RETRIES = 2;
const SAMPLE_ROWS_FOR_PLANNER = 8;
const SAMPLE_ROWS_FOR_JUDGE = 10;
const LOOKUP_SAMPLE_ROWS = 50;
const LOOKUP_MAX_ROWS = 10000;

// ---------------------------------------------------------------------------
// Schema context types & fetching
// ---------------------------------------------------------------------------

interface SchemaContextRow {
  id: string;
  schema_id: string;
  type: "lookup_table" | "validation" | "text_instructions" | "memory";
  name: string;
  content: string | null;
  data_source_id: string | null;
  bq_project: string | null;
  bq_dataset: string | null;
  bq_table: string | null;
}

interface LookupTableData {
  contextName: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

interface ResolvedContexts {
  textContext: string;
  lookupTables: LookupTableData[];
}

async function fetchSchemaContexts(schemaId: string): Promise<SchemaContextRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("schema_contexts")
    .select("*")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn(`[data-cleanser] Failed to fetch contexts for schema ${schemaId}: ${error.message}`);
    return [];
  }
  return (data ?? []) as SchemaContextRow[];
}

async function fetchLookupTableRows(ctx: SchemaContextRow): Promise<LookupTableData | null> {
  if (!ctx.data_source_id || !ctx.bq_dataset || !ctx.bq_table) return null;

  const supabase = createAdminClient();
  const { data: ds, error } = await supabase
    .from("data_sources")
    .select("type, config")
    .eq("id", ctx.data_source_id)
    .single();
  if (error || !ds) {
    console.warn(`[data-cleanser] Could not load data source ${ctx.data_source_id}: ${error?.message}`);
    return null;
  }

  const connector = createConnector(ds.type as DataSourceType, ds.config as Record<string, unknown>);
  try {
    const allRows = await connector.previewData(ctx.bq_dataset, ctx.bq_table, LOOKUP_MAX_ROWS);
    if (!allRows.length) return null;
    return { contextName: ctx.name, columns: Object.keys(allRows[0]), rows: allRows };
  } catch (err) {
    console.warn(`[data-cleanser] Failed to fetch lookup table ${ctx.bq_dataset}.${ctx.bq_table}: ${(err as Error).message}`);
    return null;
  } finally {
    await connector.close();
  }
}

async function resolveContexts(schemaId: string): Promise<ResolvedContexts> {
  const contexts = await fetchSchemaContexts(schemaId);
  const textParts: string[] = [];
  const lookupTables: LookupTableData[] = [];

  for (const ctx of contexts) {
    if (ctx.type === "validation" || ctx.type === "text_instructions" || ctx.type === "memory") {
      if (ctx.content?.trim()) {
        const label = ctx.type === "validation"
          ? "Validation Rule"
          : ctx.type === "memory"
            ? "Memory"
            : "Additional Instructions";
        textParts.push(`[${label}: ${ctx.name}]\n${ctx.content.trim()}`);
      }
    } else if (ctx.type === "lookup_table") {
      const tableData = await fetchLookupTableRows(ctx);
      if (tableData) lookupTables.push(tableData);
    }
  }

  return { textContext: textParts.join("\n\n"), lookupTables };
}

// ---------------------------------------------------------------------------
// Lookup-key identification subagent
// ---------------------------------------------------------------------------

interface LookupKeyResult {
  lookupKeyColumn: string;
  sourceKeyColumn: string;
  appendColumns: string[];
}

const LOOKUP_KEY_SYSTEM_PROMPT = `You are a data analyst. You receive sample rows from two datasets:
1. The "source" dataset (the file being cleansed)
2. A "lookup" table

Your job is to identify:
- Which column in the SOURCE data and which column in the LOOKUP table share overlapping values (i.e. they represent the same entity and can be used as a join key).
- Which additional columns from the LOOKUP table should be appended to the source data via this key.

Call **emitLookupKey** with your findings. If no meaningful overlap exists, still call emitLookupKey with empty appendColumns.`;

function createLookupKeyTools() {
  const emitLookupKeyTool = tool(
    async (input) => JSON.stringify(input),
    {
      name: "emitLookupKey",
      description: "Emit the identified lookup key and columns to append.",
      schema: z.object({
        sourceKeyColumn: z.string().describe("Column name in the source data that matches the lookup key"),
        lookupKeyColumn: z.string().describe("Column name in the lookup table that matches the source key"),
        appendColumns: z.array(z.string()).describe("Columns from the lookup table to append to source data (excluding the key itself)"),
      }),
    },
  );
  return [emitLookupKeyTool];
}

async function identifyLookupKeys(
  apiKey: string,
  sourceData: FileData,
  lookup: LookupTableData,
  runId?: string,
): Promise<LookupKeyResult | null> {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    anthropicApiKey: apiKey,
    temperature: 0,
  });

  const tools = createLookupKeyTools();
  const agent = createAgent({ model: llm, tools, systemPrompt: LOOKUP_KEY_SYSTEM_PROMPT });

  const sourceSample = sourceData.rows.slice(0, SAMPLE_ROWS_FOR_PLANNER);
  const lookupSample = lookup.rows.slice(0, SAMPLE_ROWS_FOR_PLANNER);

  const lines: string[] = [
    `Lookup table: "${lookup.contextName}"`,
    `Lookup columns: ${lookup.columns.map((c) => `"${c}"`).join(", ")}`,
    `Lookup sample rows (${lookupSample.length}):`,
    JSON.stringify(lookupSample, null, 2),
    "",
    `Source columns: ${sourceData.columns.map((c) => `"${c}"`).join(", ")}`,
    `Source sample rows (${sourceSample.length}):`,
    JSON.stringify(sourceSample, null, 2),
  ];

  const runName = runId ? `lookup-key-${runId}` : "lookup-key";
  const result = await agent.invoke(
    { messages: [new HumanMessage(lines.join("\n"))] },
    { recursionLimit: 20, runName },
  );

  const messages = result.messages as Array<{ content: unknown }>;
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    const text = typeof content === "string" ? content : JSON.stringify(content);
    try {
      const parsed = JSON.parse(text);
      if (parsed?.sourceKeyColumn && parsed?.lookupKeyColumn) return parsed as LookupKeyResult;
    } catch { /* continue */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Horizontal append: join lookup columns onto source data
// ---------------------------------------------------------------------------

function appendLookupColumns(
  sourceData: FileData,
  lookup: LookupTableData,
  keyResult: LookupKeyResult,
): { columns: string[]; rows: Record<string, unknown>[] } {
  const lookupIndex = new Map<string, Record<string, unknown>>();
  for (const row of lookup.rows) {
    const key = String(row[keyResult.lookupKeyColumn] ?? "").trim().toLowerCase();
    if (key && !lookupIndex.has(key)) lookupIndex.set(key, row);
  }

  const newColumns = keyResult.appendColumns.filter(
    (c) => !sourceData.columns.includes(c),
  );
  const allColumns = [...sourceData.columns, ...newColumns];

  const enrichedRows = sourceData.rows.map((row) => {
    const key = String(row[keyResult.sourceKeyColumn] ?? "").trim().toLowerCase();
    const lookupRow = lookupIndex.get(key);
    const out: Record<string, unknown> = { ...row };
    for (const col of newColumns) {
      out[col] = lookupRow?.[col] ?? "";
    }
    return out;
  });

  return { columns: allColumns, rows: enrichedRows };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataCleanserInput {
  filePath: string;
  targetPaths: string[];
  fileName: string;
  userDirective?: string;
  originalFilePath?: string;
  modifiedFilePath?: string;
  fileId?: string;
  /** When set, the file is unstructured and needs OCR before processing */
  unstructuredMimeType?: string;
  /** Schema ID — used to fetch contexts (lookup tables, validation, instructions) */
  schemaId?: string;
  /** Initial transformation steps from saved pipeline — used as guidance for the planner */
  initialSteps?: Array<{
    tool: string;
    params: Record<string, unknown>;
    phase: "cleansing" | "transformation";
    reasoning?: string;
  }>;
}

const SNAPSHOT_SAMPLE_ROWS = 20;

export interface TransformationSnapshot {
  columns: string[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
}

export interface TransformationMapping {
  step: number;
  tool: string;
  params: Record<string, unknown>;
  phase: "cleansing" | "transformation";
  reasoning?: string;
  inputColumns: string[];
  outputColumns: string[];
  rowCountBefore: number;
  rowCountAfter: number;
  before: TransformationSnapshot;
  after: TransformationSnapshot;
}

export interface DataCleanserResult {
  transformedColumns: string[];
  transformedRows: Record<string, unknown>[];
  toolsUsed: TransformationStep[];
  pipeline: PipelineDescriptor;
  outputFilePath: string;
  mapping: TransformationMapping[];
}

// ---------------------------------------------------------------------------
// Phase 1 — Planner: generates a full plan (Cleansing then Transformation)
// ---------------------------------------------------------------------------

const PLANNER_SYSTEM_PROMPT = `You are a data transformation planner. You generate a COMPLETE ordered plan of transformations to convert a CSV file from its uploaded schema to a target schema.

You will receive:
- The target schema field paths
- The current file dimensions + a small sample of rows
- An optional user directive
- An optional schema context section containing validation rules, additional instructions, and/or notes about lookup-table columns that were pre-joined to the data. When present, treat validation rules and instructions as constraints on how data should be transformed. Lookup-enrichment notes describe extra columns already appended to the data that you should leverage.

You must generate the plan by calling **emitPlan** with the full ordered list of steps.

## Available transformation types:

1. **filter** — remove noise rows. Params: { removeEmptyRows: boolean, removeDuplicates: boolean, duplicateKeyColumns: string[], removeMatchingKeywords: string[] }
2. **filterRows** — remove or keep rows matching a regex pattern on a specific column. Use this when the user asks to remove/keep rows based on a condition (e.g. "remove rows where status is inactive", "keep only rows where amount > 0"). Params: { column: string, pattern: string (JavaScript regex), mode: "remove" | "keep" (default "remove"), caseInsensitive: boolean (default true) }. mode "remove" discards matching rows; mode "keep" retains only matching rows.
3. **trimColumns** — drop irrelevant columns or keep only specific ones. Params: { keepColumns?: string[], dropColumns?: string[] }. Use keepColumns OR dropColumns (not both).
4. **padColumns** — forward-fill empty cells in specified columns so every row is complete. Params: { paddingColumns: string[] }
5. **handleBalanceSheet** — flatten hierarchy (star/indent convention). Params: { labelColumn?: string, maxDepth: number (2-8) }
6. **handleUnstructuredData** — collapse rows to text. Params: { textColumnName: string }
7. **unpivot** — melt wide columns into rows. Params: { unpivotColumns: string[], nameColumn: string, valueColumn: string, extractFields?: Array<{ fieldName: string, valuesBySourceColumn: Record<string, string> }> }
8. **expand** — flatten hierarchy with nesting levels. Params: { labelColumn: string, maxDepth: number }
9. **aggregate** — group and aggregate. Params: { groupByColumns: string[], aggregations: Array<{ column: string, function: "sum"|"concat"|"count"|"min"|"max"|"first" }> }
10. **mapRows** — apply row-by-row conditional transformations, lookups, and custom TypeScript expressions. Use this when you need to derive a column's value based on conditions in other columns, populate a column via a lookup table, or apply a flexible computed transformation (formatting, math, string manipulation, etc.). Params:
    - rules: Array<{ conditions: Array<{ column: string, operator: "eq"|"neq"|"contains"|"not_contains"|"gt"|"gte"|"lt"|"lte"|"regex"|"is_empty"|"is_not_empty", value?: any }>, conditionLogic?: "and"|"or" (default "and"), targetColumn: string, value: any, valueFromColumn?: string }>
    - lookups: Array<{ sourceColumn: string, lookupData: Record<string, any>, targetColumn: string, defaultValue?: any }>
    - customTransforms: Array<{ expression: string, targetColumn: string, sourceColumn?: string }>
    Rules are evaluated in order per row. If a rule's conditions match, targetColumn is set to value (or to the row's valueFromColumn if specified). Lookups map sourceColumn values through a lookup table to produce targetColumn values. customTransforms run a JavaScript expression per row; the expression receives three variables: "value" (from sourceColumn or current targetColumn), "row" (full row object), and "columns" (column name array) and must return the new value. customTransforms are applied AFTER rules and lookups.
    Examples:
      - Set "is_active" to TRUE when "status" equals "active": { rules: [{ conditions: [{ column: "status", operator: "eq", value: "active" }], targetColumn: "is_active", value: "TRUE" }] }
      - Copy "full_name" from "first_name" when "last_name" is empty: { rules: [{ conditions: [{ column: "last_name", operator: "is_empty" }], targetColumn: "full_name", valueFromColumn: "first_name" }] }
      - Map country codes to country names: { lookups: [{ sourceColumn: "country_code", lookupData: { "US": "United States", "GB": "United Kingdom" }, targetColumn: "country_name", defaultValue: "Unknown" }] }
      - Trim decimals to 2 places: { customTransforms: [{ expression: "Number(value) === Number(value) ? Number(value).toFixed(2) : value", targetColumn: "price", sourceColumn: "price" }] }
      - Pad decimals to 4 places: { customTransforms: [{ expression: "Number(value) === Number(value) ? Number(value).toFixed(4) : value", targetColumn: "measurement" }] }
      - Uppercase a column: { customTransforms: [{ expression: "String(value ?? '').toUpperCase()", targetColumn: "name" }] }
      - Concatenate two columns: { customTransforms: [{ expression: "String(row['first_name'] ?? '') + ' ' + String(row['last_name'] ?? '')", targetColumn: "full_name" }] }
      - Extract year from date: { customTransforms: [{ expression: "String(value ?? '').slice(0, 4)", targetColumn: "year", sourceColumn: "date" }] }
      - Replace commas with dots in numbers: { customTransforms: [{ expression: "String(value ?? '').replace(/,/g, '.')", targetColumn: "amount" }] }
11. **reduce** — aggregate multiple columns by key columns, with explicit control over output column names. Similar to aggregate but allows renaming output columns and optionally includes a count. Params: { keyColumns: string[], aggregations: Array<{ sourceColumn: string, function: "sum"|"count"|"min"|"max"|"concat"|"first"|"avg", outputColumn?: string }>, includeCount?: boolean }
    If outputColumn is omitted, defaults to "{sourceColumn}_{function}". When includeCount is true, a "_count" column is added.
    Examples:
      - Sum revenue by region: { keyColumns: ["region"], aggregations: [{ sourceColumn: "revenue", function: "sum", outputColumn: "total_revenue" }] }
      - Combine metrics by product: { keyColumns: ["product_id"], aggregations: [{ sourceColumn: "quantity", function: "sum", outputColumn: "total_qty" }, { sourceColumn: "price", function: "max", outputColumn: "max_price" }], includeCount: true }
12. **map** — map columns to target schema paths (MUST be the final transformation). Params: { mappings: Array<{ sourceColumn: string, targetPath: string, defaultValue?: string }>, defaults?: Array<{ targetPath: string, value: string }> }

### When to use filterRows vs filter
- Use **filter** for generic noise removal (empty rows, duplicates, keyword-based removal).
- Use **filterRows** when the user explicitly asks to remove or keep rows based on a condition on a specific column. Translate the user's condition into a regex pattern. Examples:
  - "Remove rows where status is inactive" → { column: "status", pattern: "^inactive$", mode: "remove" }
  - "Keep only rows where amount is not 0" → { column: "amount", pattern: "^0(\\\\.0+)?$", mode: "remove" }
  - "Remove rows where name contains test" → { column: "name", pattern: "test", mode: "remove" }
  - "Keep rows where category is Food or Drink" → { column: "category", pattern: "^(Food|Drink)$", mode: "keep" }

## Plan Structure — TWO PHASES (follow this order STRICTLY)

### PHASE 1: Cleansing (data preservation is paramount)
Goal: Prepare and enrich the data WITHOUT losing any information.
Priority order within this phase:
1. **filter** — remove only obvious noise (empty rows, title/summary rows). Be conservative.
2. **filterRows** — if the user directive asks to remove or keep specific rows based on column values, apply this step. This is the PRIMARY tool for user-requested row removal/filtering.
3. **padColumns** — forward-fill empty cells. Check ALL columns for empty cells. ANY column with >0% empty cells that follows a group/category pattern MUST be padded. Include ALL such columns.
4. **mapRows** — derive new columns or fill existing columns based on conditional logic, lookups, or custom expressions. Use this when the user wants to set a column's value based on another column's value (e.g., "set X to TRUE if Y is Z"), map values through a lookup table, or apply computed transformations like formatting numbers, manipulating strings, or combining columns. This is safe — it only adds/modifies columns, never removes rows.
5. **unpivot** — if wide columns represent repeating categories or time periods, melt them into rows. This ADDS rows and is safe.
6. **expand** / **handleBalanceSheet** — flatten hierarchies. This restructures but preserves data.

### PHASE 2: Transformation (reshaping and finalizing)
Goal: Reshape the cleansed data into the target schema.
1. **filterRows** — can also be used here if filtering depends on columns created during cleansing.
2. **mapRows** — can also be used here for post-cleansing conditional transformations or lookups.
3. **trimColumns** — drop columns no longer needed (only AFTER cleansing is complete).
4. **aggregate** — group and aggregate if needed.
5. **reduce** — aggregate columns by key with explicit output column naming. Use when you need more control over output column names than aggregate provides, or when combining multiple metrics.
6. **map** — map to final schema (MUST be the last step).

## CRITICAL Rules

- **Data preservation is the #1 priority.** The Cleansing phase must NOT lose any data. Prefer adding temporary columns and unpivoting over deleting.
- **padColumns BEFORE trimColumns.** Never trim columns that still have empty cells that could be forward-filled.
- **unpivot BEFORE aggregate/trim.** Unpivoting adds rows and new columns — do it in Cleansing.
- **trimColumns and aggregate belong ONLY in the Transformation phase.**
- The LAST step must always be **map**.
- Only reference columns that exist in the current file (or that a prior step in the plan will create).
- Only map to target paths from the provided schema.
- Be conservative — don't remove data unless clearly noise.
- When padding, identify columns where values repeat for groups of rows.
- In the map step, every sourceColumn MUST exactly match an existing column name.
- Every target path must be mapped to a source column or given a default value.

Mark each step with its phase: "cleansing" or "transformation".`;

function createPlannerTools() {
  const emitPlanTool = tool(
    async (input) => {
      return JSON.stringify({ action: "plan", steps: input.steps });
    },
    {
      name: "emitPlan",
      description: "Emit the complete transformation plan.",
      schema: z.object({
        steps: z.array(
          z.object({
            tool: z.string().describe("Transformation type name"),
            params: z.record(z.string(), z.unknown()).describe("Parameters for the transformation"),
            phase: z.enum(["cleansing", "transformation"]).describe("Which phase this step belongs to"),
            reasoning: z.string().describe("Brief explanation of why this step is needed"),
          }),
        ).describe("Ordered list of transformation steps"),
      }),
    },
  );

  return [emitPlanTool];
}

interface PlannedStep {
  tool: string;
  params: Record<string, unknown>;
  phase: "cleansing" | "transformation";
  reasoning: string;
}

interface PlannerResult {
  action: "plan";
  steps: PlannedStep[];
}

async function generatePlan(
  apiKey: string,
  targetPaths: string[],
  fileSummaryText: string,
  userDirective?: string,
  judgeDirective?: string,
  runId?: string,
  contextText?: string,
  initialSteps?: Array<{
    tool: string;
    params: Record<string, unknown>;
    phase: "cleansing" | "transformation";
    reasoning?: string;
  }>,
): Promise<PlannerResult> {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    anthropicApiKey: apiKey,
    temperature: 0,
  });

  const tools = createPlannerTools();
  const agent = createAgent({ model: llm, tools, systemPrompt: PLANNER_SYSTEM_PROMPT });

  const lines: string[] = [
    `Target schema paths: ${targetPaths.map((p) => `"${p}"`).join(", ")}`,
    "",
    `Current file state:`,
    fileSummaryText,
  ];

  if (contextText) {
    lines.push("", "## Schema Context (validation rules, instructions, and enrichment notes):", contextText);
  }

  if (initialSteps && initialSteps.length > 0) {
    lines.push(
      "",
      "## Default Pipeline (RIGID — follow exactly with minimal changes):",
      "The following transformation steps are the DEFAULT PIPELINE for this schema. You MUST follow this pipeline as closely as possible.",
      "- Use the EXACT same steps, in the EXACT same order.",
      "- Use the EXACT same params for each step unless the actual column names in the data differ, in which case adjust only the column references to match.",
      "- Do NOT add new steps, remove steps, or reorder steps unless absolutely necessary to avoid a runtime error (e.g. a referenced column does not exist).",
      "- Do NOT change aggregation functions, filter logic, regex patterns, or mapping targets unless they would cause an error with the current data.",
      "- The only acceptable modifications are: correcting column names to match the actual data, and fixing values that would cause a type mismatch or runtime failure.",
      "- If a user directive is provided, apply it as a minor overlay on top of this pipeline — do not let it override the pipeline's structure.",
      "",
      JSON.stringify(initialSteps, null, 2),
    );
  }

  if (userDirective) {
    lines.push("", `User directive (HIGHEST PRIORITY): ${userDirective}`);
  }

  if (judgeDirective) {
    lines.push("", judgeDirective);
  }

  const runName = runId ? `planner-${runId}` : "planner";
  const result = await agent.invoke(
    { messages: [new HumanMessage(lines.join("\n"))] },
    { recursionLimit: 50, runName },
  );

  const messages = result.messages as Array<{ content: unknown }>;
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    const text = typeof content === "string" ? content : JSON.stringify(content);
    try {
      const parsed = JSON.parse(text);
      if (parsed?.action === "plan" && Array.isArray(parsed.steps)) return parsed as PlannerResult;
    } catch {
      const match = text.match(/\{[^{}]*"action"\s*:\s*"plan"/);
      if (match) {
        try {
          const startIdx = text.indexOf(match[0]);
          let depth = 0;
          let endIdx = startIdx;
          for (let j = startIdx; j < text.length; j++) {
            if (text[j] === "{") depth++;
            else if (text[j] === "}") { depth--; if (depth === 0) { endIdx = j + 1; break; } }
          }
          const parsed = JSON.parse(text.slice(startIdx, endIdx));
          if (parsed?.action === "plan" && Array.isArray(parsed.steps)) return parsed as PlannerResult;
        } catch { /* continue */ }
      }
    }
  }

  return { action: "plan", steps: [] };
}

// ---------------------------------------------------------------------------
// Phase 2 — Executor subagent: runs steps one-by-one
// ---------------------------------------------------------------------------

function takeSnapshot(data: FileData): TransformationSnapshot {
  return {
    columns: [...data.columns],
    sampleRows: data.rows.slice(0, SNAPSHOT_SAMPLE_ROWS),
    totalRows: data.rows.length,
  };
}

async function executeStepByStep(
  workingPath: string,
  steps: PlannedStep[],
  targetPaths: string[],
): Promise<{
  history: TransformationStep[];
  mappings: TransformationMapping[];
}> {
  const history: TransformationStep[] = [];
  const mappings: TransformationMapping[] = [];

  for (let i = 0; i < Math.min(steps.length, MAX_PLAN_STEPS); i++) {
    const planned = steps[i];
    const data = await readLocalCsv(workingPath);
    if (data.columns.length === 0 || data.rows.length === 0) break;

    const beforeSnapshot = takeSnapshot(data);
    const inputColumns = [...data.columns];
    const rowCountBefore = data.rows.length;

    const step: TransformationStep = { tool: planned.tool, params: planned.params };
    const transformed = executeTransformation(data, step, targetPaths);

    if (transformed.rows.length === 0 && data.rows.length > 0) {
      console.warn(
        `[data-cleanser] Step ${i + 1} "${step.tool}" produced 0 rows from ${data.rows.length} — skipping.`,
      );
      continue;
    }

    const afterSnapshot = takeSnapshot(transformed);

    await writeLocalCsv(workingPath, transformed.columns, transformed.rows);
    history.push(step);

    mappings.push({
      step: mappings.length + 1,
      tool: planned.tool,
      params: planned.params,
      phase: planned.phase,
      reasoning: planned.reasoning,
      inputColumns,
      outputColumns: [...transformed.columns],
      rowCountBefore,
      rowCountAfter: transformed.rows.length,
      before: beforeSnapshot,
      after: afterSnapshot,
    });

    if (planned.tool === "map") break;
  }

  return { history, mappings };
}

// ---------------------------------------------------------------------------
// LLM-as-a-judge: validate output quality and suggest further plan
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `You are a lenient data quality judge. You receive:
- The target schema field paths (the columns the output MUST have).
- A sample of output rows after all transformations.
- The total row count.
- The list of transformations that were applied.

Your job is to evaluate whether the output is minimally acceptable. You should APPROVE the output in most cases. Only reject if one of these critical failures is present:

1. **No rows** — The output has zero rows (the entire dataset was lost).
2. **100% empty** — Every single cell across all rows and all target columns is empty/null, meaning the transformations produced no meaningful data whatsoever.

Everything else should be APPROVED. Partial data, some empty columns, imperfect mappings, missing padding, data type mismatches — these are all acceptable and should NOT cause a rejection. The user can fix minor issues later.

You must call exactly ONE tool:
- **approve** — the output is acceptable. Params: { summary: string }
- **reject** — the output is completely empty or has no rows. Params: { issues: string[], correctionDirective: string, additionalSteps: Array<{ tool: string, params: object, phase: "cleansing" | "transformation", reasoning: string }> }
  - issues: list of specific problems found
  - correctionDirective: a concise instruction for the transformation planner to fix the problems
  - additionalSteps: optional further transformation steps to apply (if the fix is clear). These will be executed directly. Leave empty if a full re-plan is needed.

Be strict but fair. Minor issues (a few empty cells in optional fields) are acceptable. Systemic issues (entire columns empty, wrong data in columns, missing padding) should be rejected.`;

function createJudgeTools() {
  const approveTool = tool(
    async (input) => {
      return JSON.stringify({ verdict: "approve", summary: input.summary });
    },
    {
      name: "approve",
      description: "Approve the output as production-ready.",
      schema: z.object({
        summary: z.string().describe("Brief summary of why the output is acceptable"),
      }),
    },
  );

  const rejectTool = tool(
    async (input) => {
      return JSON.stringify({
        verdict: "reject",
        issues: input.issues,
        correctionDirective: input.correctionDirective,
        additionalSteps: input.additionalSteps,
      });
    },
    {
      name: "reject",
      description: "Reject the output due to quality issues.",
      schema: z.object({
        issues: z.array(z.string()).describe("List of specific quality issues found"),
        correctionDirective: z.string().describe("Instruction for the planner to fix the issues"),
        additionalSteps: z.array(
          z.object({
            tool: z.string(),
            params: z.record(z.string(), z.unknown()),
            phase: z.enum(["cleansing", "transformation"]),
            reasoning: z.string(),
          }),
        ).optional().describe("Additional steps to apply directly if the fix is clear"),
      }),
    },
  );

  return [approveTool, rejectTool];
}

interface JudgeVerdict {
  verdict: "approve" | "reject";
  summary?: string;
  issues?: string[];
  correctionDirective?: string;
  additionalSteps?: PlannedStep[];
}

async function askJudge(
  apiKey: string,
  targetPaths: string[],
  data: FileData,
  appliedSteps: TransformationMapping[],
  runId?: string,
): Promise<JudgeVerdict> {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    anthropicApiKey: apiKey,
    temperature: 0,
  });

  const tools = createJudgeTools();
  const agent = createAgent({ model: llm, tools, systemPrompt: JUDGE_SYSTEM_PROMPT });

  const sampleRows = data.rows.slice(0, SAMPLE_ROWS_FOR_JUDGE);
  const emptyColumnStats: Record<string, number> = {};
  for (const col of targetPaths) {
    let emptyCount = 0;
    for (const row of data.rows) {
      if (String(row[col] ?? "").trim() === "") emptyCount++;
    }
    emptyColumnStats[col] = Math.round((emptyCount / Math.max(data.rows.length, 1)) * 100);
  }

  const lines: string[] = [
    `Target schema paths: ${targetPaths.map((p) => `"${p}"`).join(", ")}`,
    "",
    `Output columns: ${data.columns.map((c) => `"${c}"`).join(", ")}`,
    `Total output rows: ${data.rows.length}`,
    "",
    `Empty-cell percentage per column:`,
    ...Object.entries(emptyColumnStats).map(([col, pct]) => `  "${col}": ${pct}% empty`),
    "",
    `Transformations applied (${appliedSteps.length}):`,
    ...appliedSteps.map((s, i) =>
      `  ${i + 1}. [${s.phase}] ${s.tool}: ${JSON.stringify(s.params)} (rows: ${s.rowCountBefore} → ${s.rowCountAfter})`,
    ),
    "",
    `Sample output rows (first ${sampleRows.length}):`,
    JSON.stringify(sampleRows, null, 2),
  ];

  const runName = runId ? `judge-${runId}` : "judge";
  const result = await agent.invoke(
    { messages: [new HumanMessage(lines.join("\n"))] },
    { recursionLimit: 50, runName },
  );

  const messages = result.messages as Array<{ content: unknown }>;
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    const text = typeof content === "string" ? content : JSON.stringify(content);
    try {
      const parsed = JSON.parse(text);
      if (parsed?.verdict) return parsed as JudgeVerdict;
    } catch {
      const match = text.match(/\{[^{}]*"verdict"\s*:\s*"[^"]+"/);
      if (match) {
        try {
          const startIdx = text.indexOf(match[0]);
          let depth = 0;
          let endIdx = startIdx;
          for (let j = startIdx; j < text.length; j++) {
            if (text[j] === "{") depth++;
            else if (text[j] === "}") { depth--; if (depth === 0) { endIdx = j + 1; break; } }
          }
          const parsed = JSON.parse(text.slice(startIdx, endIdx));
          if (parsed?.verdict) return parsed as JudgeVerdict;
        } catch { /* continue */ }
      }
    }
  }

  return { verdict: "approve", summary: "No explicit verdict returned; assuming acceptable." };
}

// ---------------------------------------------------------------------------
// Pipeline builder (extended with mapping data)
// ---------------------------------------------------------------------------

function buildPipelineWithMapping(
  toolsUsed: TransformationStep[],
  mappings: TransformationMapping[],
): PipelineDescriptor {
  const pipeline = buildPipeline(toolsUsed);

  for (const node of pipeline.nodes) {
    if (node.id === "source" || node.id === "target") continue;
    const stepIndex = parseInt(node.id.split("_").pop() ?? "-1", 10);
    const mapping = mappings[stepIndex];
    if (mapping) {
      node.data = {
        ...node.data,
        mapping: {
          phase: mapping.phase,
          inputColumns: mapping.inputColumns,
          outputColumns: mapping.outputColumns,
          rowCountBefore: mapping.rowCountBefore,
          rowCountAfter: mapping.rowCountAfter,
        },
      };
    }
  }

  return pipeline;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runDataCleanser(input: DataCleanserInput): Promise<DataCleanserResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const runId = input.fileId ? input.fileId.slice(0, 8) : randomUUID().slice(0, 8);

  let rawTmpPath: string;

  if (input.unstructuredMimeType) {
    const { extractFileFromS3 } = await import("../../ocr");
    const ocrResult = await extractFileFromS3(
      input.filePath,
      input.fileName,
      input.unstructuredMimeType,
      input.targetPaths,
    );

    const csvPath = path.join("/tmp", `ocr-${randomUUID()}.csv`);
    if (ocrResult.columns.length > 0 && ocrResult.rows.length > 0) {
      const { writeLocalCsv: writeCsv } = await import("../../utils/csv-fs");
      await writeCsv(csvPath, ocrResult.columns, ocrResult.rows);
    } else {
      const fallbackCols = ["content"];
      const fallbackRows = ocrResult.extractedText
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => ({ content: line }));
      const { writeLocalCsv: writeCsv } = await import("../../utils/csv-fs");
      await writeCsv(csvPath, fallbackCols, fallbackRows.length > 0 ? fallbackRows : [{ content: ocrResult.extractedText }]);
    }
    rawTmpPath = csvPath;
  } else {
    rawTmpPath = await downloadS3FileToTmp(input.filePath);
  }

  const rawBackupPath = path.join("/tmp", `raw-backup-${randomUUID()}.csv`);
  await fs.copyFile(rawTmpPath, rawBackupPath);

  const workingPath = path.join("/tmp", `work-${randomUUID()}.csv`);
  await fs.copyFile(rawTmpPath, workingPath);
  await fs.unlink(rawTmpPath).catch(() => {});

  // -----------------------------------------------------------------------
  // Resolve schema contexts (validation, instructions, lookup tables)
  // -----------------------------------------------------------------------
  let contextText = "";
  const appendedLookupNotes: string[] = [];

  if (input.schemaId) {
    const resolved = await resolveContexts(input.schemaId);
    contextText = resolved.textContext;

    if (resolved.lookupTables.length > 0) {
      const sourceData = await readLocalCsv(workingPath);

      for (const lookup of resolved.lookupTables) {
        const keyResult = await identifyLookupKeys(apiKey, sourceData, lookup, runId);
        if (!keyResult || keyResult.appendColumns.length === 0) {
          console.warn(`[data-cleanser] No joinable key found for lookup "${lookup.contextName}" — skipping append.`);
          continue;
        }

        const enriched = appendLookupColumns(sourceData, lookup, keyResult);
        sourceData.columns = enriched.columns;
        sourceData.rows = enriched.rows;

        appendedLookupNotes.push(
          `Lookup table "${lookup.contextName}" was joined via source column "${keyResult.sourceKeyColumn}" ↔ lookup column "${keyResult.lookupKeyColumn}". ` +
          `Appended columns: ${keyResult.appendColumns.map((c) => `"${c}"`).join(", ")}. ` +
          `These columns are now available in the data and should be considered during planning.`,
        );
      }

      // Write enriched data back to the working file
      await writeLocalCsv(workingPath, sourceData.columns, sourceData.rows);
    }

    if (appendedLookupNotes.length > 0) {
      const lookupSection = appendedLookupNotes.join("\n");
      contextText = contextText
        ? `${contextText}\n\n## Enrichment from lookup tables:\n${lookupSection}`
        : `## Enrichment from lookup tables:\n${lookupSection}`;
    }
  }

  // Also write back the enriched file as the new raw backup for judge retries
  if (appendedLookupNotes.length > 0) {
    await fs.copyFile(workingPath, rawBackupPath);
  }

  let allMappings: TransformationMapping[] = [];
  let allHistory: TransformationStep[] = [];
  let judgeDirective: string | undefined;

  for (let judgeAttempt = 0; judgeAttempt <= MAX_JUDGE_RETRIES; judgeAttempt++) {
    if (judgeAttempt > 0) {
      await fs.copyFile(rawBackupPath, workingPath);
      allMappings = [];
      allHistory = [];
    }

    // Step 1: Read current file state and generate a full plan
    const data = await readLocalCsv(workingPath);
    if (data.columns.length === 0 || data.rows.length === 0) {
      throw new Error("Input file is empty or has no columns");
    }

    const summary = fileSummary(data, SAMPLE_ROWS_FOR_PLANNER);
    const plan = await generatePlan(
      apiKey,
      input.targetPaths,
      summary,
      input.userDirective,
      judgeDirective,
      runId,
      contextText || undefined,
      input.initialSteps,
    );

    if (plan.steps.length === 0) {
      throw new Error("Planner generated an empty plan");
    }

    // Validate phase ordering: all cleansing steps before transformation steps
    const firstTransformIdx = plan.steps.findIndex((s) => s.phase === "transformation");
    const lastCleansingIdx = plan.steps.reduce(
      (last, s, i) => (s.phase === "cleansing" ? i : last),
      -1,
    );
    if (firstTransformIdx !== -1 && lastCleansingIdx > firstTransformIdx) {
      console.warn("[data-cleanser] Plan has cleansing steps after transformation steps — reordering.");
      const cleansing = plan.steps.filter((s) => s.phase === "cleansing");
      const transformation = plan.steps.filter((s) => s.phase === "transformation");
      plan.steps = [...cleansing, ...transformation];
    }

    // Step 2: Execute the plan step-by-step via the executor subagent
    const { history, mappings } = await executeStepByStep(
      workingPath,
      plan.steps,
      input.targetPaths,
    );

    allHistory = history;
    allMappings = mappings;

    // Step 3: Normalize output to target schema columns
    const finalData = await readLocalCsv(workingPath);
    const schemaColumns = input.targetPaths;
    const normalizedRows: Record<string, unknown>[] = finalData.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const tp of schemaColumns) {
        out[tp] = tp in row ? row[tp] : "";
      }
      return out;
    });

    const normalizedData: FileData = { columns: schemaColumns, rows: normalizedRows };

    // Step 4: LLM-as-a-judge evaluates the output
    const verdict = await askJudge(apiKey, input.targetPaths, normalizedData, allMappings, runId);

    if (verdict.verdict === "approve" || judgeAttempt === MAX_JUDGE_RETRIES) {
      // If judge provided additional steps on the last retry, try to apply them
      if (
        verdict.verdict === "reject" &&
        verdict.additionalSteps &&
        verdict.additionalSteps.length > 0 &&
        judgeAttempt === MAX_JUDGE_RETRIES
      ) {
        const { history: extraHistory, mappings: extraMappings } = await executeStepByStep(
          workingPath,
          verdict.additionalSteps,
          input.targetPaths,
        );
        allHistory.push(...extraHistory);
        allMappings.push(...extraMappings);

        const patchedData = await readLocalCsv(workingPath);
        const patchedRows: Record<string, unknown>[] = patchedData.rows.map((row) => {
          const out: Record<string, unknown> = {};
          for (const tp of schemaColumns) {
            out[tp] = tp in row ? row[tp] : "";
          }
          return out;
        });

        return buildFinalResult(schemaColumns, patchedRows, allHistory, allMappings, workingPath, rawBackupPath);
      }

      return buildFinalResult(schemaColumns, normalizedRows, allHistory, allMappings, workingPath, rawBackupPath);
    }

    // Judge rejected — if it provided direct additional steps, apply them before re-planning
    if (verdict.additionalSteps && verdict.additionalSteps.length > 0) {
      const { history: extraHistory, mappings: extraMappings } = await executeStepByStep(
        workingPath,
        verdict.additionalSteps,
        input.targetPaths,
      );
      allHistory.push(...extraHistory);
      allMappings.push(...extraMappings);

      const patchedData = await readLocalCsv(workingPath);
      const patchedNormalized: Record<string, unknown>[] = patchedData.rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const tp of schemaColumns) {
          out[tp] = tp in row ? row[tp] : "";
        }
        return out;
      });

      const reVerdict = await askJudge(
        apiKey,
        input.targetPaths,
        { columns: schemaColumns, rows: patchedNormalized },
        allMappings,
        runId,
      );

      if (reVerdict.verdict === "approve") {
        return buildFinalResult(schemaColumns, patchedNormalized, allHistory, allMappings, workingPath, rawBackupPath);
      }
    }

    // Full re-plan needed
    judgeDirective = [
      "QUALITY JUDGE CORRECTION (previous attempt was rejected):",
      ...(verdict.issues ?? []).map((issue, i) => `  ${i + 1}. ${issue}`),
      "",
      `Correction: ${verdict.correctionDirective ?? "Re-examine the mapping and ensure all target columns are populated with correct data."}`,
    ].join("\n");
  }

  throw new Error("Unexpected: judge retry loop exited without returning");
}

async function buildFinalResult(
  schemaColumns: string[],
  normalizedRows: Record<string, unknown>[],
  history: TransformationStep[],
  mappings: TransformationMapping[],
  workingPath: string,
  rawBackupPath: string,
): Promise<DataCleanserResult> {
  const outputKey = `files/${randomUUID()}.csv`;
  const csvBuffer = Buffer.from(rowsToCsv(schemaColumns, normalizedRows), "utf8");
  const outputFilePath = await uploadBufferToS3(outputKey, csvBuffer, "text/csv");

  await fs.unlink(workingPath).catch(() => {});
  await fs.unlink(rawBackupPath).catch(() => {});

  const pipeline = buildPipelineWithMapping(history, mappings);

  return {
    transformedColumns: schemaColumns,
    transformedRows: normalizedRows,
    toolsUsed: history,
    pipeline,
    outputFilePath,
    mapping: mappings,
  };
}
