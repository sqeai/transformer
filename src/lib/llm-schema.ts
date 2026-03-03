import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { SQL_COMPATIBLE_TYPES, type SqlCompatibleType } from "./types";
import type { ColumnMapping, DefaultValues, PivotConfig, AggregationFunction, VerticalPivotConfig, VerticalPivotColumn } from "./types";
import {
  extractWorkbookPreview,
  extractExcelGrid,
} from "./parse-excel-preview";

const RAW_DATA_ANALYSIS_PROMPT = `You are the "Header detection agent", a data analyst specialising in messy spreadsheet data. You will receive a raw preview of an Excel/CSV file that may contain:
- Title rows, disclaimers, or metadata rows above the actual data
- Empty padding rows/columns
- Merged header rows spanning multiple lines
- Multi-line cell values where text within a single cell contains newlines (shown as " / " in the preview, e.g. "Tên Công Ty / Company Name")
- Headers that span TWO consecutive rows (e.g. row 3 has Vietnamese names, row 4 has English names for the same columns)
- Noise columns (row numbers, internal IDs, empty columns)
- Placeholder auto-generated labels for empty columns/rows (e.g. "Column 1", "Column 35"). Treat these as EMPTY/NOISE, not real headers.

You will also receive totalRows and totalColumns for the entire file. Use totalRows to set a sensible dataEndRowIndex.

Your job is to:
1. Identify the HEADER ROW(S) — the row(s) that contain column names for the actual data. Common header fields include: Kode Nasabah, Nama Nasabah, Asset class, key_metrics_level_1, tenor, and similar financial/business terms. Headers may also be bilingual (Vietnamese/English) such as: "Tên Công Ty / Company Name", "Mã Khách Hàng EVN / EVN Customer's Code", "Đơn Vị Tính / Unit", "Sản Lượng / Generation", "Đơn Giá / Unit Price", "Thành Tiền / Amount", "Thuế GTGT / VAT", "Tổng Cộng / Total Amount", "Tiền thuê mái (chưa thuế GTGT) / Roof Rental fee (Excluding VAT)".
   - If headers are in a SINGLE row (possibly with multi-line cell values shown as " / "), set headerRowIndex to that row.
   - If headers span TWO rows (e.g. Vietnamese on row N, English on row N+1), set headerRowIndex to the FIRST header row.
   - The header row is usually the first row where most cells contain short descriptive text (not data values or long sentences).
   - A row made mostly of generic placeholders like "Column 1", "Column 2", ... is NOT a real header row and should be ignored.
2. Identify which rows ABOVE the header are noise/metadata that should be trimmed.
3. Identify which columns are meaningful vs noise (empty columns, row-number columns, padding). Columns whose header text is only a generic placeholder like /^Column\\s+\\d+$/i should be treated as empty/noise unless adjacent header rows provide a real label for that same column. When in doubt, be INCLUSIVE and keep the column — but do NOT treat placeholder labels alone as meaningful headers.
4. Return the detected data boundaries. Choose startColumn and endColumn so that AS MANY potentially meaningful columns as possible are included; avoid over-trimming on the right-hand side of the table.

Respond ONLY with a JSON object (no markdown fences, no commentary):
{
  "headerRowIndex": number,       // 0-based index of the FIRST header row in the provided rows
  "dataStartRowIndex": number,    // 0-based index where actual data rows begin (usually headerRowIndex + 1, or headerRowIndex + 2 if headers span two rows)
  "dataEndRowIndex": number,      // 0-based index of the last data row (usually totalRows - 1)
  "startColumn": number,          // 0-based index of the first meaningful column
  "endColumn": number,            // 0-based index of the last meaningful column
  "notes": string                 // brief explanation of what was detected and why
}`;

const AUTO_MAP_PROMPT = `You are a data mapping specialist. Given a list of raw column headers from uploaded data and a list of target schema field paths, determine the best mapping between them. Also recommend whether the data should be pivoted (grouped and aggregated).

Rules for column mapping:
1. Match columns by semantic meaning, not just exact name. E.g. "Kode Nasabah" should match "customerCode" or "nasabahCode", "Nama Nasabah" should match "customerName" or "nasabahName". Bilingual headers like "Tên Công Ty\nCompany Name" should match "companyName", "Sản Lượng\nGeneration" should match "generation", "Đơn Giá\nUnit Price" should match "unitPrice", "Thành Tiền\nAmount" should match "amount", "Thuế GTGT\nVAT" should match "vat", "Tổng Cộng\nTotal Amount" should match "totalAmount", "Tiền thuê mái (chưa thuế GTGT)\nRoof Rental fee (Excluding VAT)" should match "roofRentalFee".
2. Consider abbreviations, language differences (Indonesian ↔ English, Vietnamese ↔ English), and formatting differences (camelCase, snake_case, spaces, etc.). Headers may contain both Vietnamese and English text separated by newlines.
3. Only create mappings where you are reasonably confident (>70% match). Leave ambiguous ones unmapped.
4. Each target path should have at most one source column.
5. Each source column should map to at most one target path.

Rules for default values:
10. Default values apply ONLY to target schema fields that have NO mapping (no raw column maps to them). For mapped fields, do NOT suggest a default — set defaultValue to null.
11. For unmapped target fields, analyse the field name/path to determine if a sensible static default value should be applied to every output row.
12. Common examples: a status field might default to "active", a currency field might default to "IDR" or "USD", a country field might default to the most likely country based on the data context, a boolean might default to "false".
13. Only suggest a default when it is clearly reasonable. For most unmapped fields (names, IDs, descriptions) do NOT set a default — leave it as null.
14. For target fields that have a mapping (a rawColumn), always set defaultValue to null.

Rules for pivot & aggregation:
6. Analyse whether the data likely has repeated key columns (e.g. customer ID, account code) with multiple detail rows that should be rolled up. If so, recommend enabling pivot.
7. Choose group-by columns: these are the identifier/key columns whose unique combination defines a single output row (e.g. customer code, customer name, account number).
8. For every mapped column that is NOT a group-by column, recommend an aggregation function:
   - "sum" for numeric/monetary values (amounts, balances, quantities)
   - "concat" for text values that should be combined (descriptions, notes)
   - "count" for columns where the count of occurrences matters
   - "min" or "max" for date or numeric range values
   - "first" for columns where any single value is representative
9. If the data does not appear to need pivoting (each row is already unique), set pivot.enabled to false with empty groupByColumns.

Rules for vertical pivot (unpivot/melt):
15. Look for multiple raw columns that represent repeating categories or time periods — e.g. "January 2025", "Feb 2026", "Mar-2026", "Q1 2025", "2025-01", or similar patterns. These are common in financial statements, budgets, and forecasts.
16. If such columns exist, recommend a vertical pivot. This "unpivots" those columns into rows: each source column becomes a separate row with output fields populated from fieldValues.
17. For each detected source column, provide a fieldValues object mapping target schema paths to the value for that field. Use the special token "$RAW" for exactly one field to mean "use the actual cell value from this source column". All other fields get static strings. For example, column "January 2025" with outputTargetPaths ["year", "month", "amount"] would have fieldValues: {"year": "2025", "month": "January", "amount": "$RAW"}.
18. Choose outputTargetPaths: target schema paths that each source column will populate (e.g. ["year", "month", "amount"]). Include the field that should receive the raw cell data. Look for paths like "month", "year", "period", "date", "quarter", "amount", "value", "balance", or semantically similar fields.
19. Do NOT include vertical-pivot columns in the regular mappings array — they are handled separately.
20. If no repeating-category columns are detected, set verticalPivot.enabled to false with empty columns and outputTargetPaths arrays.

Rules for type recommendations:
21. Recommend a SQL/BigQuery-compatible type for EVERY target schema path.
22. Use only these values: "STRING", "INTEGER", "FLOAT", "NUMERIC", "BOOLEAN", "DATE", "DATETIME", "TIMESTAMP".
23. Choose practical generic types:
   - IDs/codes/names/descriptions => STRING
   - counts => INTEGER
   - decimal money/amount/rate/ratio => NUMERIC (or FLOAT when clearly approximate)
   - true/false flags => BOOLEAN
   - date-like fields => DATE
   - date+time without timezone => DATETIME
   - event/log times with timezone semantics => TIMESTAMP

Respond ONLY with a JSON object (no markdown fences, no commentary):
{
  "mappings": [
    {
      "rawColumn": string,       // exact raw column name as provided
      "targetPath": string,      // exact target schema path as provided
      "confidence": number,      // 0.0 to 1.0 confidence score
      "aggregation": string|null, // one of: "sum", "concat", "count", "min", "max", "first", or null for group-by columns
      "defaultValue": string|null // default value to use when raw cell is empty/missing, or null if no default
    }
  ],
  "pivot": {
    "enabled": boolean,          // true if data should be pivoted
    "groupByColumns": string[]   // raw column names to group by (subset of mapped rawColumns)
  },
  "verticalPivot": {
    "enabled": boolean,              // true if repeating-category columns were detected
    "outputTargetPaths": string[],   // target schema paths for field values (e.g. ["year", "month", "amount"])
    "columns": [                     // one entry per detected source column
      {
        "rawColumn": string,         // exact raw column name
        "fieldValues": {             // maps each outputTargetPath to its value
          "[targetPath]": string     // static string or "$RAW" for cell value, e.g. {"year": "2025", "month": "January", "amount": "$RAW"}
        }
      }
    ]
  },
  "typeRecommendations": [
    {
      "targetPath": string,        // exact target schema path
      "dataType": string,          // one of: STRING, INTEGER, FLOAT, NUMERIC, BOOLEAN, DATE, DATETIME, TIMESTAMP
      "confidence": number         // 0.0 to 1.0 confidence score
    }
  ]
}

Only include mappings with confidence >= 0.7. If no good mappings exist, return empty mappings array with pivot disabled.`;

const DATA_CLEANSING_PLAN_PROMPT = `You are an AI data cleansing planner for tabular financial data.

You will receive:
- A list of column names.
- Sample rows represented as objects.

Return a conservative cleansing plan for:
1) Row padding: identify columns where empty cells should be forward-filled from the previous non-empty value (typical for parent category labels in statements).
2) Row filtering: identify if empty rows and total/subtotal rows should be removed.
3) Hierarchy flattening: decide if parent/child rows should be flattened into columns nesting_level_1 (topmost), nesting_level_2, nesting_level_3, … and value. Level 1 is the top of the hierarchy; deeper nesting uses 2, 3, etc.

Hierarchy detection guidelines:
- Financial statements (trial balances, balance sheets, income statements) typically use a star/asterisk convention to indicate hierarchy depth.
- MORE stars = HIGHER / BROADER level (closer to root). For example:
  - "*** ASET" (3 stars) → nesting_level_1 (topmost category)
  - "** Kas dan setara kas" (2 stars) → nesting_level_2 (sub-category)
  - "* Current accounts" (1 star) → nesting_level_3 (sub-sub-category)
  - "1111011 Petty Cash - Balikpapan" (no stars, starts with account code) → deepest leaf level (individual line items)
- Rows starting with a numeric account code (e.g. "1111011", "2101001") are leaf-level line items (the deepest nesting level).
- Rows with stars or special markers that do NOT start with a numeric code are parent/header rows.
- The hierarchyMaxDepth should match the number of distinct nesting levels present (e.g. 3 if you see ***, **, and leaf items; 4 if you also see * rows).
- When hierarchy is detected, set flattenHierarchy to true.

Rules:
- Only include a column in paddingColumns when forward-fill is likely correct.
- Prefer removing obviously redundant rows (empty rows, total/subtotal/grand total rows).
- Use lowercase, human-readable keywords in totalRowKeywords.
- Be conservative to avoid deleting real data rows.

Respond ONLY JSON:
{
  "paddingColumns": string[],
  "removeEmptyRows": boolean,
  "removeTotalRows": boolean,
  "totalRowKeywords": string[],
  "flattenHierarchy": boolean,
  "hierarchyMaxDepth": number,
  "hierarchyLabelColumn": string,
  "hierarchyValueColumn": string
}`;

export interface RawDataAnalysis {
  headerRowIndex: number;
  dataStartRowIndex: number;
  dataEndRowIndex: number;
  startColumn: number;
  endColumn: number;
  notes: string;
}

export interface AutoMapResult {
  rawColumn: string;
  targetPath: string;
  confidence: number;
  aggregation?: string | null;
  defaultValue?: string | null;
}

export interface AutoMapResponse {
  mappings: ColumnMapping[];
  pivot: PivotConfig;
  verticalPivot: VerticalPivotConfig;
  defaultValues: DefaultValues;
  typeRecommendations: Record<string, SqlCompatibleType>;
}

export interface DataCleansingPlan {
  paddingColumns: string[];
  removeEmptyRows: boolean;
  removeTotalRows: boolean;
  totalRowKeywords: string[];
  flattenHierarchy?: boolean;
  hierarchyMaxDepth?: number;
  hierarchyLabelColumn?: string;
  hierarchyValueColumn?: string;
}

export interface InferredSchemaField {
  name: string;
  dataType: SqlCompatibleType;
}

export interface InferredSchemaFromText {
  schemaName: string;
  fields: InferredSchemaField[];
}

const PLACEHOLDER_COLUMN_HEADER_RE = /^Column\s+\d+$/i;

const SCHEMA_FROM_TEXT_PROMPT = `You are a schema design agent for a data cleansing application.

You will receive unstructured user input that may include:
- sample headers
- sample rows
- natural language requirements
- JSON, CSV-like text, or copied spreadsheet fragments

Your task:
1. Infer a practical schema name.
2. Infer the target output fields needed for this data.
3. Return concise field names in lower_snake_case.
4. Recommend SQL-compatible data types.
5. Be inclusive: if uncertain, still propose useful fields.

Use only these data types:
- STRING
- INTEGER
- FLOAT
- NUMERIC
- BOOLEAN
- DATE
- DATETIME
- TIMESTAMP

Respond ONLY JSON:
{
  "schemaName": string,
  "fields": [
    { "name": string, "dataType": string }
  ]
}`;

function stringifyForHeader(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      return json && json !== "{}" ? json : "";
    } catch {
      return "";
    }
  }
  return String(value);
}

async function callLlm(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    anthropicApiKey: apiKey,
    temperature: 0,
  });

  const agent = createAgent({
    model: llm,
    tools: [],
    systemPrompt,
  });

  const result = await agent.invoke({
    messages: [new HumanMessage(userMessage)],
  });

  const messages = result.messages as BaseMessage[];
  const lastMessage = messages[messages.length - 1];
  return typeof lastMessage.content === "string"
    ? lastMessage.content
    : JSON.stringify(lastMessage.content);
}

function cleanJsonResponse(text: string): string {
  return text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
}

/**
 * Analyses raw uploaded data to find the real header row, trim noise rows/columns,
 * and extract clean headers using the "Header detection agent". Works on the full
 * raw preview (not just row 1).
 */
export async function analyzeRawDataWithLLM(
  buffer: ArrayBuffer,
  totalRows: number,
  totalColumns: number,
): Promise<RawDataAnalysis> {
  const preview = await extractWorkbookPreview(buffer, { useAllRows: true });
  if (preview.sampleRows.length === 0) {
    throw new Error("Workbook appears to be empty");
  }

  const lines: string[] = [];
  lines.push(`Sheet: "${preview.sheetName}" (${totalRows} total rows, ${totalColumns} columns)`);
  lines.push("");
  lines.push("All rows (including potential metadata/title rows above the header):");
  for (let i = 0; i < preview.sampleRows.length; i++) {
    lines.push(`Row ${i}: ${preview.sampleRows[i].join(" | ")}`);
  }

  const text = await callLlm(
    RAW_DATA_ANALYSIS_PROMPT,
    `Analyse this raw spreadsheet data and identify the data boundaries (header row, data start/end rows, and column range):\n\n${lines.join("\n")}`,
  );

  let parsed: RawDataAnalysis;
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON for raw data analysis. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  return parsed;
}

/**
 * Uses the header-detection LLM to locate header row(s) and returns a
 * best-effort header list for schema generation:
 * - respects LLM-selected column bounds
 * - combines multi-row headers when dataStartRowIndex indicates >1 header row
 * - ignores placeholder labels like "Column 12" unless a real label exists
 */
export async function detectHeaderRowValuesWithLLM(
  buffer: ArrayBuffer,
  sheetIndex = 0,
): Promise<string[]> {
  const { grid, totalRows, totalColumns } = await extractExcelGrid(
    buffer,
    50,
    200,
    sheetIndex,
  );
  if (grid.length === 0) {
    throw new Error("Workbook appears to be empty");
  }

  const lines: string[] = [];
  lines.push(
    `Sheet index ${sheetIndex} (${totalRows} total rows, ${totalColumns} columns)`,
  );
  lines.push("");
  lines.push("All rows (including potential metadata/title rows above the header):");
  for (let i = 0; i < grid.length; i++) {
    lines.push(`Row ${i}: ${grid[i].join(" | ")}`);
  }

  const text = await callLlm(
    RAW_DATA_ANALYSIS_PROMPT,
    `Analyse this raw spreadsheet data and identify the data boundaries (header row, data start/end rows, and column range):\n\n${lines.join("\n")}`,
  );

  let parsed: RawDataAnalysis;
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON for raw data analysis. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  const totalGridRows = grid.length;
  const totalGridCols = grid.reduce((max, row) => Math.max(max, row.length), 0);
  if (totalGridCols === 0) return [];
  const headerStart = Math.max(0, Math.min(parsed.headerRowIndex ?? 0, totalGridRows - 1));

  const inferredHeaderEndExclusive = (() => {
    const candidate = parsed.dataStartRowIndex ?? (headerStart + 1);
    if (!Number.isFinite(candidate)) return headerStart + 1;
    return Math.max(headerStart + 1, Math.min(candidate, totalGridRows));
  })();

  const startCol = Math.max(0, Math.min(parsed.startColumn ?? 0, Math.max(0, totalGridCols - 1)));
  const endCol = Math.max(startCol, Math.min(parsed.endColumn ?? (totalGridCols - 1), Math.max(0, totalGridCols - 1)));

  const headers: string[] = [];
  for (let c = startCol; c <= endCol; c++) {
    const parts: string[] = [];

    for (let r = headerStart; r < inferredHeaderEndExclusive; r++) {
      const raw = stringifyForHeader(grid[r]?.[c]).trim();
      if (!raw) continue;
      if (PLACEHOLDER_COLUMN_HEADER_RE.test(raw)) continue;
      if (parts[parts.length - 1]?.toLowerCase() === raw.toLowerCase()) continue;
      parts.push(raw);
    }

    headers.push(parts.join(" / "));
  }

  return headers;
}

const VALID_AGGREGATIONS = new Set<string>(["sum", "concat", "count", "min", "max", "first"]);
const SQL_COMPATIBLE_TYPE_SET = new Set<string>(SQL_COMPATIBLE_TYPES);

function normalizeSqlCompatibleType(value: unknown): SqlCompatibleType {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SQL_COMPATIBLE_TYPE_SET.has(normalized) ? (normalized as SqlCompatibleType) : "STRING";
}

function inferSqlTypeFromPath(path: string): SqlCompatibleType {
  const p = String(path ?? "").toLowerCase();
  if (/(^|[._])(is|has|can|enabled|active|deleted|valid|approved|flag)([._]|$)/.test(p)) return "BOOLEAN";
  if (/(^|[._])(count|qty|quantity|number|num|totalcount)([._]|$)/.test(p)) return "INTEGER";
  if (/(^|[._])(date|dob|birthdate)([._]|$)/.test(p)) return "DATE";
  if (/(^|[._])(datetime)([._]|$)/.test(p)) return "DATETIME";
  if (/(^|[._])(timestamp|createdat|updatedat|occurredat|eventtime|time)([._]|$)/.test(p)) return "TIMESTAMP";
  if (/(^|[._])(amount|price|cost|balance|total|subtotal|tax|vat|fee|rate|percent|percentage|ratio|score)([._]|$)/.test(p)) return "NUMERIC";
  return "STRING";
}

const FIELD_TYPE_RECOMMENDATION_PROMPT = `You are a schema typing specialist.

Given a list of schema field paths, recommend a practical SQL/BigQuery-compatible data type for each field.

Use only:
- STRING
- INTEGER
- FLOAT
- NUMERIC
- BOOLEAN
- DATE
- DATETIME
- TIMESTAMP

Guidance:
- IDs/codes/names/descriptions => STRING
- counts/integer quantities => INTEGER
- money/amount/rate/ratio => NUMERIC
- booleans/flags => BOOLEAN
- date-only => DATE
- date+time (no timezone semantics) => DATETIME
- event timestamps/log times => TIMESTAMP

Respond ONLY JSON:
{
  "recommendations": [
    { "path": string, "dataType": string, "confidence": number }
  ]
}`;

/**
 * Auto-maps raw column headers to target schema paths using LLM semantic matching.
 * Also recommends pivot configuration and aggregation functions.
 */
export async function autoMapColumnsWithLLM(
  rawColumns: string[],
  targetPaths: string[],
): Promise<AutoMapResponse> {
  const text = await callLlm(
    AUTO_MAP_PROMPT,
    `Map these raw columns to the target schema paths and recommend pivot/aggregation settings.\n\nRaw columns:\n${rawColumns.map((c, i) => `${i + 1}. "${c}"`).join("\n")}\n\nTarget schema paths:\n${targetPaths.map((p, i) => `${i + 1}. "${p}"`).join("\n")}`,
  );

  let parsed: {
    mappings: AutoMapResult[];
    pivot?: { enabled?: boolean; groupByColumns?: string[] };
    verticalPivot?: {
      enabled?: boolean;
      outputTargetPaths?: string[];
      columns?: { rawColumn: string; fieldValues: Record<string, string> }[];
    };
    typeRecommendations?: Array<{ targetPath: string; dataType: string; confidence: number }>;
  };
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON for auto-mapping. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  const rawMappings = Array.isArray(parsed.mappings) ? parsed.mappings : [];

  const groupBySet = new Set(parsed.pivot?.groupByColumns ?? []);

  const vpColumns: VerticalPivotColumn[] = (parsed.verticalPivot?.columns ?? [])
    .filter((c) => rawColumns.includes(c.rawColumn) && c.fieldValues && typeof c.fieldValues === "object")
    .map((c) => ({ rawColumn: c.rawColumn, fieldValues: c.fieldValues }));
  const vpRawColumnSet = new Set(vpColumns.map((c) => c.rawColumn));

  const mappings: ColumnMapping[] = rawMappings
    .filter((m) => m.confidence >= 0.7)
    .filter((m) => rawColumns.includes(m.rawColumn) && targetPaths.includes(m.targetPath))
    .filter((m) => !vpRawColumnSet.has(m.rawColumn))
    .map(({ rawColumn, targetPath, aggregation }) => {
      const mapping: ColumnMapping = { rawColumn, targetPath };
      if (aggregation && VALID_AGGREGATIONS.has(aggregation) && !groupBySet.has(rawColumn)) {
        mapping.aggregation = aggregation as AggregationFunction;
      }
      return mapping;
    });

  const mappedTargetPaths = new Set(mappings.map((m) => m.targetPath));
  const defaultValues: DefaultValues = {};
  for (const m of rawMappings) {
    if (
      m.defaultValue != null &&
      String(m.defaultValue).trim() !== "" &&
      targetPaths.includes(m.targetPath) &&
      !mappedTargetPaths.has(m.targetPath)
    ) {
      defaultValues[m.targetPath] = String(m.defaultValue);
    }
  }

  const validGroupByColumns = (parsed.pivot?.groupByColumns ?? []).filter(
    (col) => mappings.some((m) => m.rawColumn === col),
  );

  const pivot: PivotConfig = {
    enabled: parsed.pivot?.enabled === true && validGroupByColumns.length > 0,
    groupByColumns: validGroupByColumns,
  };

  const vpOutputTargetPaths = (parsed.verticalPivot?.outputTargetPaths ?? []).filter(
    (p) => targetPaths.includes(p),
  );

  const verticalPivot: VerticalPivotConfig = {
    enabled: parsed.verticalPivot?.enabled === true && vpColumns.length > 0,
    outputTargetPaths: vpOutputTargetPaths,
    columns: vpColumns,
  };

  const typeRecommendations: Record<string, SqlCompatibleType> = {};
  for (const recommendation of parsed.typeRecommendations ?? []) {
    if (!targetPaths.includes(recommendation.targetPath)) continue;
    typeRecommendations[recommendation.targetPath] = normalizeSqlCompatibleType(recommendation.dataType);
  }
  for (const targetPath of targetPaths) {
    if (!typeRecommendations[targetPath]) {
      typeRecommendations[targetPath] = inferSqlTypeFromPath(targetPath);
    }
  }

  return { mappings, pivot, verticalPivot, defaultValues, typeRecommendations };
}

export async function recommendFieldTypesWithLLM(paths: string[]): Promise<Record<string, SqlCompatibleType>> {
  if (!paths.length) return {};
  const text = await callLlm(
    FIELD_TYPE_RECOMMENDATION_PROMPT,
    `Recommend SQL-compatible data types for these fields:\n${paths.map((p, i) => `${i + 1}. "${p}"`).join("\n")}`,
  );

  let parsed: { recommendations?: Array<{ path: string; dataType: string; confidence: number }> };
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    parsed = {};
  }

  const output: Record<string, SqlCompatibleType> = {};
  for (const recommendation of parsed.recommendations ?? []) {
    if (!paths.includes(recommendation.path)) continue;
    output[recommendation.path] = normalizeSqlCompatibleType(recommendation.dataType);
  }
  for (const path of paths) {
    if (!output[path]) output[path] = inferSqlTypeFromPath(path);
  }
  return output;
}

export async function buildDataCleansingPlanWithLLM(
  columns: string[],
  rows: Record<string, unknown>[],
  userInstructions?: string,
): Promise<DataCleansingPlan> {
  const safeRows = rows.slice(0, 120).map((row) => {
    const normalized: Record<string, string> = {};
    for (const column of columns) {
      const raw = row[column];
      const text = String(raw ?? "").replace(/\s+/g, " ").trim();
      normalized[column] = text.length > 120 ? `${text.slice(0, 117)}...` : text;
    }
    return normalized;
  });

  const promptParts: string[] = [];
  if (userInstructions) {
    promptParts.push(
      "=== USER INSTRUCTIONS (HIGHEST PRIORITY — follow these first) ===",
      userInstructions,
      "=== END USER INSTRUCTIONS ===\n",
    );
  }
  promptParts.push(
    `Columns (${columns.length}): ${JSON.stringify(columns)}`,
    `Sample rows (${safeRows.length}):`,
    JSON.stringify(safeRows),
  );
  const prompt = promptParts.join("\n\n");

  const systemPrompt = userInstructions
    ? `${DATA_CLEANSING_PLAN_PROMPT}\n\nCRITICAL: The user has provided explicit instructions for how to cleanse the data. You MUST treat these as the primary source of truth. Prioritise the user's instructions over any default heuristics or assumptions. If the user specifies column roles, structure, or transformations, apply them exactly. Only fall back to the generic rules above for aspects the user did not specify.`
    : DATA_CLEANSING_PLAN_PROMPT;

  const text = await callLlm(systemPrompt, prompt);

  let parsed: Partial<DataCleansingPlan>;
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON for data cleansing plan. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  const paddingColumns = Array.isArray(parsed.paddingColumns)
    ? parsed.paddingColumns
        .map((value) => String(value))
        .filter((column) => columns.includes(column))
    : [];
  const totalRowKeywords = Array.isArray(parsed.totalRowKeywords)
    ? parsed.totalRowKeywords.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    paddingColumns,
    removeEmptyRows: parsed.removeEmptyRows !== false,
    removeTotalRows: parsed.removeTotalRows !== false,
    totalRowKeywords,
    flattenHierarchy: parsed.flattenHierarchy === true,
    hierarchyMaxDepth:
      typeof parsed.hierarchyMaxDepth === "number" && Number.isFinite(parsed.hierarchyMaxDepth)
        ? Math.max(2, Math.min(8, Math.floor(parsed.hierarchyMaxDepth)))
        : undefined,
    hierarchyLabelColumn:
      typeof parsed.hierarchyLabelColumn === "string" && columns.includes(parsed.hierarchyLabelColumn)
        ? parsed.hierarchyLabelColumn
        : undefined,
    hierarchyValueColumn:
      typeof parsed.hierarchyValueColumn === "string" && columns.includes(parsed.hierarchyValueColumn)
        ? parsed.hierarchyValueColumn
        : undefined,
  };
}

export async function inferSchemaFromTextWithLLM(input: string): Promise<InferredSchemaFromText> {
  const text = await callLlm(
    SCHEMA_FROM_TEXT_PROMPT,
    `Infer a data schema from this input:\n\n${input}`,
  );

  let parsed: { schemaName?: unknown; fields?: Array<{ name?: unknown; dataType?: unknown }> };
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON for schema inference. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  const schemaName =
    typeof parsed.schemaName === "string" && parsed.schemaName.trim()
      ? parsed.schemaName.trim()
      : "generated_schema";

  const fields: InferredSchemaField[] = Array.isArray(parsed.fields)
    ? parsed.fields
        .map((field) => {
          const name = String(field.name ?? "").trim();
          if (!name) return null;
          return {
            name,
            dataType: normalizeSqlCompatibleType(field.dataType),
          };
        })
        .filter((field): field is InferredSchemaField => field !== null)
    : [];

  if (fields.length === 0) {
    throw new Error("Could not infer any fields from your input");
  }

  return { schemaName, fields };
}

