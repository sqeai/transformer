import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { tool } from "@langchain/core/tools";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { PipelineDescriptor } from "../../schema-store";
import { downloadS3FileToTmp, uploadBufferToS3 } from "../../s3-sheets";
import {
  type FileData,
  type TransformationStep,
  fileSummary,
  rowsToCsv,
  executeTransformation,
  buildPipeline,
} from "../../utils";
import { readLocalCsv, writeLocalCsv } from "../../utils/csv-fs";

const MAX_ITERATIONS = 20;
const MAX_JUDGE_RETRIES = 2;
const SAMPLE_ROWS_FOR_PLANNER = 8;
const SAMPLE_ROWS_FOR_JUDGE = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataCleanserInput {
  filePath: string;
  targetPaths: string[];
  sheetName: string;
  userDirective?: string;
  originalFilePath?: string;
  modifiedFilePath?: string;
  sheetId?: string;
}

export interface DataCleanserResult {
  transformedColumns: string[];
  transformedRows: Record<string, unknown>[];
  toolsUsed: TransformationStep[];
  pipeline: PipelineDescriptor;
  outputFilePath: string;
}

// ---------------------------------------------------------------------------
// Planner sub-agent
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

1. **filter** — remove noise rows. Params: { removeEmptyRows: boolean, removeDuplicates: boolean, duplicateKeyColumns: string[], removeMatchingKeywords: string[] }
2. **trimColumns** — drop irrelevant columns or keep only specific ones. Params: { keepColumns?: string[], dropColumns?: string[] }. Use keepColumns OR dropColumns (not both).
3. **padColumns** — forward-fill empty cells in specified columns so every row is complete. Params: { paddingColumns: string[] }
4. **handleBalanceSheet** — flatten hierarchy (star/indent convention). Params: { labelColumn?: string, maxDepth: number (2-8) }
5. **handleUnstructuredData** — collapse rows to text. Params: { textColumnName: string }
6. **unpivot** — melt wide columns into rows. Params: { unpivotColumns: string[], nameColumn: string, valueColumn: string, extractFields?: Array<{ fieldName: string, valuesBySourceColumn: Record<string, string> }> }
7. **expand** — flatten hierarchy with nesting levels. Params: { labelColumn: string, maxDepth: number }
8. **aggregate** — group and aggregate. Params: { groupByColumns: string[], aggregations: Array<{ column: string, function: "sum"|"concat"|"count"|"min"|"max"|"first" }> }
9. **map** — map columns to target schema paths (MUST be the final transformation). Params: { mappings: Array<{ sourceColumn: string, targetPath: string, defaultValue?: string }>, defaults?: Array<{ targetPath: string, value: string }> }

## Transformation Priority (follow this order strictly)

**Phase 1 — Clean: remove noise so only real data remains**
- If the CSV has title rows, metadata rows, summary/total rows, or empty rows that are NOT data, use **filter** to remove them.
- If the CSV has columns that are entirely empty, contain only row numbers, or are irrelevant padding, use **trimColumns** to drop them.

**Phase 2 — Fill: ensure every row is complete (HIGHEST PRIORITY after cleaning)**
- Check the "emptyCellsPerColumn" field in the file state. ANY column with >0% empty cells MUST be addressed.
- If a column has empty cells that follow a group/category pattern (value appears once, then blank for subsequent rows in the same group), use **padColumns** and list ALL such columns.
- You MUST include EVERY column that has empty cells in the paddingColumns list — do not skip any.
- After padColumns, re-examine the data. If any columns still have empty cells, apply padColumns again for those columns.
- Do NOT proceed to Phase 3 until ALL columns have 0% empty cells (or the empty cells are genuinely missing data with no pattern to fill).

**Phase 3 — Flatten/Reshape: make the data flat and tabular**
- If the data uses a star/indent hierarchy (balance sheets, trial balances), use **handleBalanceSheet** or **expand**.
- If the data has wide columns that represent repeating categories or time periods, use **unpivot** to melt them into rows.
- If the data has duplicate key rows that need consolidation, use **aggregate**.

**Phase 4 — Consolidate: map to the final schema**
- Once the data is clean, filled, and flat, use **map** to produce the final output matching the target schema paths.
- After map is applied, call **done**.

## Rules

- Follow the phase order: Clean → Fill → Flatten → Consolidate.
- Within each phase, you may apply multiple steps (e.g. filter then trimColumns).
- Only move to the next phase when the current phase is complete.
- Only reference columns that exist in the current file.
- Only map to target paths from the provided schema.
- The LAST transformation must always be **map**.
- After map, call **done**.
- Be conservative — don't remove data unless clearly noise.
- When padding, identify columns where values repeat for groups of rows (e.g. a category label that appears once then is blank for the next N rows belonging to that category).

## CRITICAL — Data Integrity Rules (MUST follow)

- **NEVER drop data rows.** The output must have the same number of data rows as the input (after noise removal). If a transformation would reduce the row count unexpectedly, do NOT apply it.
- **ALL cells must contain data.** After the Fill phase, every cell in every row must have a value. If you see ANY column with empty cells that can be forward-filled, you MUST apply padColumns for those columns before moving to Phase 3.
- **padColumns is mandatory** if ANY column has empty cells that follow a group/category pattern. Examine ALL columns in the sample data — if a column has some rows with values and some blank, it almost certainly needs padding.
- **In the map step, every sourceColumn MUST exactly match an existing column name** in the current file. Double-check column names against the current file state before emitting the map transformation. A typo or wrong column name will produce empty output.
- **Every target path must be mapped** to a source column or given a default value. Do not leave any target path unmapped unless there is genuinely no source data for it.`;

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
  runId?: string,
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
    lines.push("", "No transformations applied yet. Start with Phase 1 (Clean).");
  }

  if (userDirective) {
    lines.push("", `User directive (HIGHEST PRIORITY): ${userDirective}`);
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
// LLM-as-a-judge: validate output quality
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `You are a strict data quality judge. You receive:
- The target schema field paths (the columns the output MUST have).
- A sample of output rows after all transformations.
- The total row count.

Your job is to evaluate whether the output is production-ready. Check:

1. **Column completeness** — Every target path must appear as a column with meaningful data. A column filled entirely with empty strings or nulls is NOT acceptable unless the source data genuinely has no values for it.
2. **Padding correctness** — Columns that represent categories, labels, or grouping keys should be forward-filled (padded) so that every row has a value. Rows with empty category/label cells indicate a padding failure.
3. **Data integrity** — Values should be plausible for their column name (e.g. numeric columns should contain numbers, name columns should contain text, date columns should contain dates). Obvious mismatches (e.g. a name in an amount column) indicate a mapping error.
4. **Row completeness** — Rows should not be mostly empty. If many rows have most columns blank, the mapping or transformation likely failed.
5. **No data loss** — The row count should be reasonable given the source. A suspiciously low row count may indicate over-aggressive filtering.

You must call exactly ONE tool:
- **approve** — the output passes all checks. Params: { summary: string }
- **reject** — the output has quality issues. Params: { issues: string[], correctionDirective: string }
  - issues: list of specific problems found
  - correctionDirective: a concise instruction for the transformation planner to fix the problems (this will be prepended to the planner's next run)

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
      });
    },
    {
      name: "reject",
      description: "Reject the output due to quality issues.",
      schema: z.object({
        issues: z.array(z.string()).describe("List of specific quality issues found"),
        correctionDirective: z.string().describe("Instruction for the planner to fix the issues"),
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
}

async function askJudge(
  apiKey: string,
  targetPaths: string[],
  data: FileData,
  runId?: string,
): Promise<JudgeVerdict> {
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
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
          const endIdx = text.indexOf("}", text.indexOf(match[0])) + 1;
          const parsed = JSON.parse(text.slice(text.indexOf(match[0]), endIdx));
          if (parsed?.verdict) return parsed as JudgeVerdict;
        } catch { /* continue */ }
      }
    }
  }

  return { verdict: "approve", summary: "No explicit verdict returned; assuming acceptable." };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runDataCleanser(input: DataCleanserInput): Promise<DataCleanserResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const runId = input.sheetId ? input.sheetId.slice(0, 8) : randomUUID().slice(0, 8);

  const rawTmpPath = await downloadS3FileToTmp(input.filePath);
  const rawBackupPath = path.join("/tmp", `raw-backup-${randomUUID()}.csv`);
  await fs.copyFile(rawTmpPath, rawBackupPath);

  const workingPath = path.join("/tmp", `work-${randomUUID()}.csv`);
  await fs.copyFile(rawTmpPath, workingPath);
  await fs.unlink(rawTmpPath).catch(() => {});

  let history: TransformationStep[] = [];
  let judgeDirective: string | undefined;

  for (let judgeAttempt = 0; judgeAttempt <= MAX_JUDGE_RETRIES; judgeAttempt++) {
    if (judgeAttempt > 0) {
      await fs.copyFile(rawBackupPath, workingPath);
      history = [];
    }

    const combinedDirective = [input.userDirective, judgeDirective].filter(Boolean).join("\n\n");

    let preTransformRowCount = 0;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const data = await readLocalCsv(workingPath);
      if (data.columns.length === 0 || data.rows.length === 0) break;

      if (iteration === 0) preTransformRowCount = data.rows.length;

      const summary = fileSummary(data, SAMPLE_ROWS_FOR_PLANNER);
      const decision = await askPlanner(
        apiKey,
        input.targetPaths,
        summary,
        history,
        combinedDirective || undefined,
        runId,
      );

      if (decision.action === "done" || !decision.tool || !decision.params) break;

      const step: TransformationStep = { tool: decision.tool, params: decision.params };
      const transformed = executeTransformation(data, step, input.targetPaths);

      if (transformed.rows.length === 0 && data.rows.length > 0) {
        console.warn(
          `[data-cleanser] Transformation "${step.tool}" produced 0 rows from ${data.rows.length} — skipping this step.`,
        );
        continue;
      }

      await writeLocalCsv(workingPath, transformed.columns, transformed.rows);
      history.push(step);

      if (decision.tool === "map") break;
    }

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

    const verdict = await askJudge(apiKey, input.targetPaths, normalizedData, runId);

    if (verdict.verdict === "approve" || judgeAttempt === MAX_JUDGE_RETRIES) {
      const outputKey = `sheets/${randomUUID()}.csv`;
      const csvBuffer = Buffer.from(rowsToCsv(schemaColumns, normalizedRows), "utf8");
      const outputFilePath = await uploadBufferToS3(outputKey, csvBuffer, "text/csv");

      await fs.unlink(workingPath).catch(() => {});
      await fs.unlink(rawBackupPath).catch(() => {});

      const pipeline = buildPipeline(history);

      return {
        transformedColumns: schemaColumns,
        transformedRows: normalizedRows,
        toolsUsed: history,
        pipeline,
        outputFilePath,
      };
    }

    judgeDirective = [
      "QUALITY JUDGE CORRECTION (previous attempt was rejected):",
      ...(verdict.issues ?? []).map((issue, i) => `  ${i + 1}. ${issue}`),
      "",
      `Correction: ${verdict.correctionDirective ?? "Re-examine the mapping and ensure all target columns are populated with correct data."}`,
    ].join("\n");
  }

  throw new Error("Unexpected: judge retry loop exited without returning");
}
