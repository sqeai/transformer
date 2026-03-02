import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { tool } from "@langchain/core/tools";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { PipelineDescriptor } from "../schema-store";
import { downloadS3FileToTmp, uploadBufferToS3 } from "../s3-sheets";

const MAX_ITERATIONS = 20;
const SAMPLE_ROWS_FOR_PLANNER = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransformationStep {
  tool: string;
  params: Record<string, unknown>;
}

export interface DataCleanserInput {
  filePath: string;
  targetPaths: string[];
  sheetName: string;
  userDirective?: string;
  originalFilePath?: string;
  modifiedFilePath?: string;
}

export interface DataCleanserResult {
  transformedColumns: string[];
  transformedRows: Record<string, unknown>[];
  toolsUsed: TransformationStep[];
  pipeline: PipelineDescriptor;
  outputFilePath: string;
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function parseCsvContent(input: string): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const nextCh = i + 1 < input.length ? input[i + 1] : "";

    if (ch === "\"") {
      if (inQuotes && nextCh === "\"") {
        currentField += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && nextCh === "\n") i += 1;
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += ch;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [columns.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvCell(row[col])).join(","));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// File I/O (local tmp)
// ---------------------------------------------------------------------------

interface FileData {
  columns: string[];
  rows: Record<string, unknown>[];
}

async function readLocalCsv(localPath: string): Promise<FileData> {
  const csvText = await fs.readFile(localPath, "utf8");
  const matrix = parseCsvContent(csvText);
  if (matrix.length === 0) return { columns: [], rows: [] };

  const rawColumns = matrix[0].map((c, idx) => {
    const name = String(c ?? "").trim();
    return name || `column_${idx + 1}`;
  });
  const seen = new Map<string, number>();
  const columns = rawColumns.map((col) => {
    const count = seen.get(col) ?? 0;
    seen.set(col, count + 1);
    return count === 0 ? col : `${col}_${count + 1}`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const source = matrix[r];
    const out: Record<string, unknown> = {};
    let hasAnyValue = false;
    for (let c = 0; c < columns.length; c++) {
      const value = source[c] ?? "";
      out[columns[c]] = value;
      if (String(value).trim() !== "") hasAnyValue = true;
    }
    if (hasAnyValue) rows.push(out);
  }
  return { columns, rows };
}

function writeLocalCsv(localPath: string, columns: string[], rows: Record<string, unknown>[]): Promise<void> {
  return fs.writeFile(localPath, rowsToCsv(columns, rows), "utf8");
}

function fileSummary(data: FileData, sampleCount: number): string {
  const sample = data.rows.slice(0, sampleCount);
  return JSON.stringify({
    columns: data.columns,
    rowCount: data.rows.length,
    columnCount: data.columns.length,
    sampleRows: sample,
  });
}

// ---------------------------------------------------------------------------
// Transformation executors (pure functions, no LLM)
// ---------------------------------------------------------------------------

function aggregateValues(values: unknown[], fn: string): unknown {
  switch (fn) {
    case "sum": {
      let total = 0;
      for (const v of values) { const n = Number(v); if (!Number.isNaN(n)) total += n; }
      return total;
    }
    case "count": return values.length;
    case "min": { const nums = values.map(Number).filter((n) => !Number.isNaN(n)); return nums.length > 0 ? Math.min(...nums) : ""; }
    case "max": { const nums = values.map(Number).filter((n) => !Number.isNaN(n)); return nums.length > 0 ? Math.max(...nums) : ""; }
    case "concat": return [...new Set(values.map((v) => String(v ?? "")).filter(Boolean))].join(", ");
    case "first": return values[0] ?? "";
    default: return values[0] ?? "";
  }
}

function inferLabelColumn(columns: string[], rows: Record<string, unknown>[]): string {
  let best = columns[0] ?? "";
  let bestScore = -1;
  for (const col of columns) {
    let score = 0;
    for (const row of rows) {
      const v = String(row[col] ?? "").trim();
      if (v && !/^-?\d+([.,]\d+)?$/.test(v.replace(/[\s,]/g, ""))) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = col; }
  }
  return best;
}

function applyFilter(data: FileData, params: Record<string, unknown>): FileData {
  let filtered = [...data.rows];
  if (params.removeEmptyRows) {
    filtered = filtered.filter((row) =>
      data.columns.some((col) => { const v = row[col]; return v != null && String(v).trim() !== ""; }),
    );
  }
  const dupCols = Array.isArray(params.duplicateKeyColumns) ? params.duplicateKeyColumns as string[] : [];
  if (params.removeDuplicates && dupCols.length > 0) {
    const seen = new Set<string>();
    filtered = filtered.filter((row) => {
      const key = dupCols.map((col) => String(row[col] ?? "")).join("|||");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const keywords = Array.isArray(params.removeMatchingKeywords) ? (params.removeMatchingKeywords as string[]).map((k) => String(k).toLowerCase()) : [];
  if (keywords.length > 0) {
    filtered = filtered.filter((row) => {
      const first = data.columns.map((col) => row[col]).find((v) => v != null && String(v).trim() !== "");
      if (first == null) return true;
      const text = String(first).toLowerCase().trim();
      return !keywords.some((kw) => text.includes(kw));
    });
  }
  return { columns: data.columns, rows: filtered };
}

function applyUnpivot(data: FileData, params: Record<string, unknown>): FileData {
  const unpivotCols = params.unpivotColumns as string[];
  const nameCol = params.nameColumn as string;
  const valueCol = params.valueColumn as string;
  const extractFields = params.extractFields as Array<{ fieldName: string; valuesBySourceColumn: Record<string, string> }> | undefined;
  const keepCols = data.columns.filter((c) => !unpivotCols.includes(c));
  const result: Record<string, unknown>[] = [];

  for (const row of data.rows) {
    for (const col of unpivotCols) {
      const newRow: Record<string, unknown> = {};
      for (const kc of keepCols) newRow[kc] = row[kc];
      newRow[nameCol] = col;
      newRow[valueCol] = row[col];
      if (extractFields) {
        for (const ef of extractFields) {
          const extracted = ef.valuesBySourceColumn?.[col];
          if (extracted !== undefined) newRow[ef.fieldName] = extracted;
        }
      }
      result.push(newRow);
    }
  }

  const newColumns = [...keepCols, nameCol, valueCol];
  if (extractFields) {
    for (const ef of extractFields) {
      if (!newColumns.includes(ef.fieldName)) newColumns.push(ef.fieldName);
    }
  }
  return { columns: newColumns, rows: result };
}

function applyExpand(data: FileData, params: Record<string, unknown>): FileData {
  const labelCol = params.labelColumn as string;
  const maxDepth = Math.max(2, Math.min(8, Number(params.maxDepth) || 4));
  const valueCols = data.columns.filter((c) => c !== labelCol);
  const nestingCols = Array.from({ length: maxDepth }, (_, i) => `nesting_level_${i + 1}`);
  const stack: string[] = Array(maxDepth).fill("");
  const result: Record<string, unknown>[] = [];

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const rawLabel = String(row[labelCol] ?? "");
    const label = rawLabel.replace(/^\s*[*#\-\u2022]+\s*/, "").replace(/\s+/g, " ").trim();
    if (!label) continue;

    let level = maxDepth;
    const starMatch = rawLabel.match(/^\s*(\*+)\s*/);
    if (starMatch) {
      level = Math.max(1, Math.min(maxDepth, maxDepth - starMatch[1].length + 1));
    } else if (/^\d{3,}/.test(label)) {
      level = maxDepth;
    } else if (/^\s+/.test(rawLabel)) {
      const indent = rawLabel.match(/^\s+/)?.[0]?.length ?? 0;
      level = Math.max(1, Math.min(maxDepth, Math.floor(indent / 2) + 1));
    }

    stack[level - 1] = label;
    for (let d = level; d < maxDepth; d++) stack[d] = "";

    let nextLevel = 0;
    for (let j = i + 1; j < data.rows.length; j++) {
      const nextRaw = String(data.rows[j][labelCol] ?? "");
      const nextLabel = nextRaw.replace(/^\s*[*#\-\u2022]+\s*/, "").trim();
      if (!nextLabel) continue;
      const nextStar = nextRaw.match(/^\s*(\*+)\s*/);
      if (nextStar) {
        nextLevel = Math.max(1, Math.min(maxDepth, maxDepth - nextStar[1].length + 1));
      } else if (/^\d{3,}/.test(nextLabel)) {
        nextLevel = maxDepth;
      } else {
        nextLevel = level;
      }
      break;
    }

    if (nextLevel > level) continue;

    const out: Record<string, unknown> = {};
    for (let d = 0; d < maxDepth; d++) out[nestingCols[d]] = stack[d] ?? "";
    for (const vc of valueCols) out[vc] = row[vc] ?? "";
    result.push(out);
  }

  return { columns: [...nestingCols, ...valueCols], rows: result };
}

function applyAggregate(data: FileData, params: Record<string, unknown>): FileData {
  const groupByCols = params.groupByColumns as string[];
  const aggregations = params.aggregations as Array<{ column: string; function: string }>;
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const row of data.rows) {
    const key = groupByCols.map((col) => String(row[col] ?? "")).join("|||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const result: Record<string, unknown>[] = [];
  for (const rows of groups.values()) {
    const out: Record<string, unknown> = {};
    for (const col of groupByCols) out[col] = rows[0][col];
    for (const agg of aggregations) {
      out[agg.column] = aggregateValues(rows.map((r) => r[agg.column]), agg.function);
    }
    for (const col of data.columns) { if (!(col in out)) out[col] = rows[0][col]; }
    result.push(out);
  }
  return { columns: data.columns, rows: result };
}

function applyMap(data: FileData, params: Record<string, unknown>, targetPaths: string[]): FileData {
  const mappings = params.mappings as Array<{ sourceColumn: string; targetPath: string; defaultValue?: string }>;
  const defaults = (params.defaults ?? []) as Array<{ targetPath: string; value: string }>;
  const result: Record<string, unknown>[] = [];

  for (const row of data.rows) {
    const out: Record<string, unknown> = {};
    for (const m of mappings) out[m.targetPath] = row[m.sourceColumn] ?? m.defaultValue ?? "";
    for (const tp of targetPaths) {
      if (!(tp in out)) {
        const def = defaults.find((d) => d.targetPath === tp);
        out[tp] = def?.value ?? "";
      }
    }
    result.push(out);
  }
  return { columns: targetPaths, rows: result };
}

function applyBalanceSheet(data: FileData, params: Record<string, unknown>): FileData {
  const labelColumn = (params.labelColumn as string | undefined) && data.columns.includes(params.labelColumn as string)
    ? params.labelColumn as string
    : inferLabelColumn(data.columns, data.rows);
  return applyExpand(data, { ...params, labelColumn });
}

function applyUnstructured(data: FileData, params: Record<string, unknown>): FileData {
  const textColumn = String(params.textColumnName ?? "raw_text").trim() || "raw_text";
  const flattened = data.rows.map((row) => ({
    [textColumn]: data.columns.map((col) => String(row[col] ?? "").trim()).filter(Boolean).join(" | "),
  }));
  return { columns: [textColumn], rows: flattened };
}

function executeTransformation(data: FileData, step: TransformationStep, targetPaths: string[]): FileData {
  switch (step.tool) {
    case "filter": return applyFilter(data, step.params);
    case "unpivot": return applyUnpivot(data, step.params);
    case "expand": return applyExpand(data, step.params);
    case "aggregate": return applyAggregate(data, step.params);
    case "map": return applyMap(data, step.params, targetPaths);
    case "handleBalanceSheet": return applyBalanceSheet(data, step.params);
    case "handleUnstructuredData": return applyUnstructured(data, step.params);
    case "handleStructuredData": return data;
    default: return data;
  }
}

// ---------------------------------------------------------------------------
// Pipeline builder
// ---------------------------------------------------------------------------

function buildPipeline(toolsUsed: TransformationStep[]): PipelineDescriptor {
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

// ---------------------------------------------------------------------------
// Planner sub-agent (fresh context each iteration)
// ---------------------------------------------------------------------------

const PLANNER_SYSTEM_PROMPT = `You are a data transformation planner. You decide the NEXT SINGLE transformation to apply to a CSV file, or declare the job done.

You will receive:
- The target schema field paths
- The current file dimensions + a small sample of rows
- The history of transformations already applied

You must call exactly ONE tool:
- **nextTransformation** — emit the next transformation step
- **done** — signal that no more transformations are needed

## Available transformation types (use as the "tool" field in nextTransformation):

1. **determineFormattingType** — classify the data. Params: { formattingType: "structuredData"|"balanceSheet"|"unstructuredData", reason: string }
2. **handleStructuredData** — no-op marker for structured data. Params: {}
3. **handleBalanceSheet** — flatten hierarchy. Params: { labelColumn?: string, maxDepth: number (2-8) }
4. **handleUnstructuredData** — collapse rows to text. Params: { textColumnName: string }
5. **filter** — remove rows. Params: { removeEmptyRows: boolean, removeDuplicates: boolean, duplicateKeyColumns: string[], removeMatchingKeywords: string[] }
6. **unpivot** — melt wide columns into rows. Params: { unpivotColumns: string[], nameColumn: string, valueColumn: string, extractFields?: Array<{ fieldName: string, valuesBySourceColumn: Record<string, string> }> }
7. **expand** — flatten hierarchy with nesting levels. Params: { labelColumn: string, maxDepth: number }
8. **aggregate** — group and aggregate. Params: { groupByColumns: string[], aggregations: Array<{ column: string, function: "sum"|"concat"|"count"|"min"|"max"|"first" }> }
9. **map** — map columns to target schema paths (MUST be the final transformation). Params: { mappings: Array<{ sourceColumn: string, targetPath: string, defaultValue?: string }>, defaults?: Array<{ targetPath: string, value: string }> }

## Rules

- The FIRST transformation should always be determineFormattingType.
- After determineFormattingType, call the matching handler (handleStructuredData / handleBalanceSheet / handleUnstructuredData).
- Apply filter/expand/unpivot/aggregate as needed based on the data.
- The LAST transformation must always be map.
- After map is applied, call done.
- Only reference columns that exist in the current file.
- Only map to target paths from the provided schema.
- Be conservative — don't remove data unless clearly noise.`;

function createPlannerTools() {
  const nextTransformationTool = tool(
    async (input) => {
      return JSON.stringify({ action: "transform", tool: input.tool, params: input.params });
    },
    {
      name: "nextTransformation",
      description: "Emit the next transformation step to apply.",
      schema: z.object({
        tool: z.string().describe("Transformation type name"),
        params: z.record(z.string(), z.unknown()).describe("Parameters for the transformation"),
      }),
    },
  );

  const doneTool = tool(
    async () => {
      return JSON.stringify({ action: "done" });
    },
    {
      name: "done",
      description: "Signal that all transformations are complete.",
      schema: z.object({}),
    },
  );

  return [nextTransformationTool, doneTool];
}

interface PlannerDecision {
  action: "transform" | "done";
  tool?: string;
  params?: Record<string, unknown>;
}

async function askPlanner(
  apiKey: string,
  targetPaths: string[],
  fileSummaryText: string,
  history: TransformationStep[],
  userDirective?: string,
): Promise<PlannerDecision> {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
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

  if (history.length > 0) {
    lines.push("", `Transformations applied so far (${history.length}):`);
    for (let i = 0; i < history.length; i++) {
      lines.push(`  ${i + 1}. ${history[i].tool}: ${JSON.stringify(history[i].params)}`);
    }
  } else {
    lines.push("", "No transformations applied yet. Start with determineFormattingType.");
  }

  if (userDirective) {
    lines.push("", `User directive (HIGHEST PRIORITY): ${userDirective}`);
  }

  const result = await agent.invoke(
    { messages: [new HumanMessage(lines.join("\n"))] },
    { recursionLimit: 50 },
  );

  const messages = result.messages as Array<{ content: unknown }>;
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    const text = typeof content === "string" ? content : JSON.stringify(content);
    try {
      const parsed = JSON.parse(text);
      if (parsed?.action) return parsed as PlannerDecision;
    } catch {
      const match = text.match(/\{[^{}]*"action"\s*:\s*"[^"]+"/);
      if (match) {
        try {
          const endIdx = text.indexOf("}", text.indexOf(match[0])) + 1;
          const parsed = JSON.parse(text.slice(text.indexOf(match[0]), endIdx));
          if (parsed?.action) return parsed as PlannerDecision;
        } catch { /* continue */ }
      }
    }
  }

  return { action: "done" };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runDataCleanser(input: DataCleanserInput): Promise<DataCleanserResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const tmpPath = await downloadS3FileToTmp(input.filePath);
  const workingPath = path.join("/tmp", `work-${randomUUID()}.csv`);
  await fs.copyFile(tmpPath, workingPath);
  await fs.unlink(tmpPath).catch(() => {});

  const history: TransformationStep[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const data = await readLocalCsv(workingPath);
    if (data.columns.length === 0 || data.rows.length === 0) break;

    const summary = fileSummary(data, SAMPLE_ROWS_FOR_PLANNER);
    const decision = await askPlanner(apiKey, input.targetPaths, summary, history, input.userDirective);

    if (decision.action === "done" || !decision.tool || !decision.params) break;

    const step: TransformationStep = { tool: decision.tool, params: decision.params };
    const transformed = executeTransformation(data, step, input.targetPaths);

    await writeLocalCsv(workingPath, transformed.columns, transformed.rows);
    history.push(step);

    if (decision.tool === "map") break;
  }

  const finalData = await readLocalCsv(workingPath);

  // Normalize output to schema format: columns = targetPaths in order, rows keyed by those paths only
  const schemaColumns = input.targetPaths;
  const normalizedRows: Record<string, unknown>[] = finalData.rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const path of schemaColumns) {
      out[path] = path in row ? row[path] : "";
    }
    return out;
  });

  const outputKey = `sheets/${randomUUID()}.csv`;
  const csvBuffer = Buffer.from(rowsToCsv(schemaColumns, normalizedRows), "utf8");
  const outputFilePath = await uploadBufferToS3(outputKey, csvBuffer, "text/csv");

  await fs.unlink(workingPath).catch(() => {});

  const pipeline = buildPipeline(history);

  return {
    transformedColumns: schemaColumns,
    transformedRows: normalizedRows,
    toolsUsed: history,
    pipeline,
    outputFilePath,
  };
}
