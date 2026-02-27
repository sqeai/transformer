import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import type { SchemaField, ColumnMapping, DefaultValues, PivotConfig, AggregationFunction, VerticalPivotConfig, VerticalPivotColumn } from "./types";
import {
  extractWorkbookPreview,
  formatPreviewAsText,
  extractExcelGrid,
} from "./parse-excel-preview";

const SYSTEM_PROMPT = `You are a data-schema analyst. Given a preview of an Excel workbook (headers + sample rows), produce the best possible target schema.

Rules:
1. Identify which columns are meaningful data fields vs noise (row numbers, empty padding, internal IDs that are clearly auto-generated).
2. Group related columns under a common parent when it makes semantic sense (e.g. "First Name" and "Last Name" → parent "name" with children "first" and "last"; or "Address Line 1", "City", "State", "Zip" → parent "address").
3. Normalise field names to clean camelCase (e.g. "CUST_EMAIL" → "customerEmail", "Addr Line 1" → "addressLine1"). For bilingual headers (Vietnamese/English), prefer the English portion for the camelCase name (e.g. "Tên Công Ty\nCompany Name" → "companyName", "Đơn Giá\nUnit Price" → "unitPrice", "Thuế GTGT\nVAT" → "vat", "Tổng Cộng\nTotal Amount" → "totalAmount").
4. Assign a nesting level: 1 for top-level, 2 for first level of nesting, 3 for second, and so on. Use as many levels as the structure needs (e.g. 1–4 or more for deeply nested data).
5. Preserve a logical ordering that groups related fields together.
6. Keep the schema practical — nest where it adds clarity, but avoid unnecessary depth.

Respond ONLY with a JSON array (no markdown fences, no commentary). Each element must have:
- "name": string (clean display name)
- "path": string (dot-separated path, e.g. "address.city")
- "level": number (nesting level: 1 = topmost, 2 = first nesting, 3 = second, etc.)
- "originalColumn": string (the raw header this maps to, or "" for group parents)

Example output:
[
  {"name":"id","path":"id","level":1,"originalColumn":"Customer ID"},
  {"name":"name","path":"name","level":1,"originalColumn":""},
  {"name":"first","path":"name.first","level":2,"originalColumn":"First Name"},
  {"name":"last","path":"name.last","level":2,"originalColumn":"Last Name"},
  {"name":"email","path":"email","level":1,"originalColumn":"Email Address"}
]`;

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
  }
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

interface LlmSchemaField {
  name: string;
  path: string;
  level: number;
  originalColumn: string;
}

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

const PLACEHOLDER_COLUMN_HEADER_RE = /^Column\s+\d+$/i;

function buildFieldTree(flat: LlmSchemaField[]): SchemaField[] {
  const result: SchemaField[] = [];
  const parentStack: SchemaField[] = [];

  for (let i = 0; i < flat.length; i++) {
    const f = flat[i];
    const field: SchemaField = {
      id: crypto.randomUUID(),
      name: f.name,
      path: f.path,
      level: f.level,
      order: i,
      children: [],
    };

    if (f.level === 1) {
      result.push(field);
      parentStack.length = 0;
      parentStack.push(field);
    } else {
      while (parentStack.length >= f.level) {
        parentStack.pop();
      }
      const parent = parentStack[parentStack.length - 1];
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(field);
      } else {
        result.push(field);
      }
      parentStack.push(field);
    }
  }

  return result;
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

export async function detectSchemaWithLLM(
  buffer: ArrayBuffer,
  sheetIndex = 0,
): Promise<SchemaField[]> {
  const preview = await extractWorkbookPreview(buffer, { sheetIndex });
  if (preview.headers.length === 0) {
    throw new Error("Workbook has no headers to analyse");
  }

  const previewText = formatPreviewAsText(preview);
  const text = await callLlm(
    SYSTEM_PROMPT,
    `Analyse this workbook preview and produce the target schema:\n\n${previewText}`,
  );

  let parsed: LlmSchemaField[];
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("LLM returned an empty or non-array schema");
  }

  return buildFieldTree(parsed);
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
      const raw = (grid[r]?.[c] ?? "").toString().trim();
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

  return { mappings, pivot, verticalPivot, defaultValues };
}

export async function buildDataCleansingPlanWithLLM(
  columns: string[],
  rows: Record<string, unknown>[],
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

  const prompt = [
    `Columns (${columns.length}): ${JSON.stringify(columns)}`,
    `Sample rows (${safeRows.length}):`,
    JSON.stringify(safeRows),
  ].join("\n\n");

  const text = await callLlm(DATA_CLEANSING_PLAN_PROMPT, prompt);

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

const EXTRACT_UNSTRUCTURED_PROMPT = `You are an AI Data Cleanser agent. You will receive a raw dump of an entire Excel sheet (all rows and columns) and a list of target schema field paths. Your job is to extract exactly ONE record from this sheet that matches the target schema.

The sheet may contain:
- Title rows, disclaimers, or metadata rows
- Multiple tables or sections
- Merged cells
- Empty padding rows/columns
- Unstructured data (not in a clean table format)

Your task:
1. Analyze the entire sheet content to understand what data is present
2. Extract values that correspond to each target schema field path
3. Return a single record (object) where keys are the target schema paths and values are the extracted data
4. Also provide a mapping showing where each value came from (e.g. "Cell B3", "Row 5, column 'Company Name'", "Found in title section")

Rules:
- Extract exactly ONE record per sheet (not multiple rows)
- If a field cannot be found, use null or an empty string
- For numeric fields, extract as numbers
- For text fields, extract as strings
- Try to be smart about finding data even if it's not in a standard table format
- Cite the source location for each field in the mapping

Respond ONLY with a JSON object (no markdown fences, no commentary):
{
  "record": {
    "fieldPath1": value1,
    "fieldPath2": value2,
    ...
  },
  "mapping": [
    {
      "targetPath": "fieldPath1",
      "source": "description of where this value came from (e.g. 'Cell B3', 'Row 5, column Company Name')"
    },
    ...
  ]
}`;

export interface UnstructuredExtractionResult {
  record: Record<string, unknown>;
  mapping: Array<{ targetPath: string; source: string }>;
}

/**
 * Extracts a single record from an unstructured Excel sheet dump.
 * Takes the entire sheet as text and target schema paths, returns one record
 * with values mapped to those paths, plus a mapping showing where each value came from.
 */
export async function extractUnstructuredRecordWithLLM(
  sheetText: string,
  targetPaths: string[],
): Promise<UnstructuredExtractionResult> {
  if (!sheetText || !targetPaths || targetPaths.length === 0) {
    throw new Error("sheetText and targetPaths are required");
  }

  const prompt = `Extract a single record from this unstructured Excel sheet that matches the target schema fields.\n\nSheet content:\n${sheetText}\n\nTarget schema paths:\n${targetPaths.map((p, i) => `${i + 1}. "${p}"`).join("\n")}\n\nExtract one record with values for each target path, and provide a mapping showing where each value came from in the sheet.`;

  const text = await callLlm(EXTRACT_UNSTRUCTURED_PROMPT, prompt);

  let parsed: { record?: Record<string, unknown>; mapping?: Array<{ targetPath: string; source: string }> };
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON for unstructured extraction. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  if (!parsed.record || typeof parsed.record !== "object") {
    throw new Error("LLM did not return a valid record object");
  }

  const mapping = Array.isArray(parsed.mapping) ? parsed.mapping : [];

  return {
    record: parsed.record,
    mapping,
  };
}
