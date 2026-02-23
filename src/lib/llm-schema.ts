import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import type { SchemaField, ColumnMapping, PivotConfig, AggregationFunction } from "./types";
import {
  extractWorkbookPreview,
  formatPreviewAsText,
} from "./parse-excel-preview";

const SYSTEM_PROMPT = `You are a data-schema analyst. Given a preview of an Excel workbook (headers + sample rows), produce the best possible target schema.

Rules:
1. Identify which columns are meaningful data fields vs noise (row numbers, empty padding, internal IDs that are clearly auto-generated).
2. Group related columns under a common parent when it makes semantic sense (e.g. "First Name" and "Last Name" → parent "name" with children "first" and "last"; or "Address Line 1", "City", "State", "Zip" → parent "address").
3. Normalise field names to clean camelCase (e.g. "CUST_EMAIL" → "customerEmail", "Addr Line 1" → "addressLine1"). For bilingual headers (Vietnamese/English), prefer the English portion for the camelCase name (e.g. "Tên Công Ty\nCompany Name" → "companyName", "Đơn Giá\nUnit Price" → "unitPrice", "Thuế GTGT\nVAT" → "vat", "Tổng Cộng\nTotal Amount" → "totalAmount").
4. Assign a nesting level: 0 for top-level, 1 for children of a group, etc.
5. Preserve a logical ordering that groups related fields together.
6. Keep the schema practical — don't over-nest. One level of nesting is usually enough.

Respond ONLY with a JSON array (no markdown fences, no commentary). Each element must have:
- "name": string (clean display name)
- "path": string (dot-separated path, e.g. "address.city")
- "level": number (nesting depth, 0 = top)
- "originalColumn": string (the raw header this maps to, or "" for group parents)

Example output:
[
  {"name":"id","path":"id","level":0,"originalColumn":"Customer ID"},
  {"name":"name","path":"name","level":0,"originalColumn":""},
  {"name":"first","path":"name.first","level":1,"originalColumn":"First Name"},
  {"name":"last","path":"name.last","level":1,"originalColumn":"Last Name"},
  {"name":"email","path":"email","level":0,"originalColumn":"Email Address"}
]`;

const RAW_DATA_ANALYSIS_PROMPT = `You are a data analyst specialising in messy spreadsheet data. You will receive a raw preview of an Excel/CSV file that may contain:
- Title rows, disclaimers, or metadata rows above the actual data
- Empty padding rows/columns
- Merged header rows spanning multiple lines
- Multi-line cell values where text within a single cell contains newlines (shown as " / " in the preview, e.g. "Tên Công Ty / Company Name")
- Headers that span TWO consecutive rows (e.g. row 3 has Vietnamese names, row 4 has English names for the same columns)
- Noise columns (row numbers, internal IDs, empty columns)

You will also receive totalRows and totalColumns for the entire file. Use totalRows to set a sensible dataEndRowIndex.

Your job is to:
1. Identify the HEADER ROW(S) — the row(s) that contain column names for the actual data. Common header fields include: Kode Nasabah, Nama Nasabah, Asset class, key_metrics_level_1, tenor, and similar financial/business terms. Headers may also be bilingual (Vietnamese/English) such as: "Tên Công Ty / Company Name", "Mã Khách Hàng EVN / EVN Customer's Code", "Đơn Vị Tính / Unit", "Sản Lượng / Generation", "Đơn Giá / Unit Price", "Thành Tiền / Amount", "Thuế GTGT / VAT", "Tổng Cộng / Total Amount", "Tiền thuê mái (chưa thuế GTGT) / Roof Rental fee (Excluding VAT)".
   - If headers are in a SINGLE row (possibly with multi-line cell values shown as " / "), set headerRowIndex to that row.
   - If headers span TWO rows (e.g. Vietnamese on row N, English on row N+1), set headerRowIndex to the FIRST header row.
   - The header row is usually the first row where most cells contain short descriptive text (not data values or long sentences).
2. Identify which rows ABOVE the header are noise/metadata that should be trimmed.
3. Identify which columns are meaningful vs noise (empty columns, row-number columns, padding).
4. Return the detected data boundaries.

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
10. For each mapping, analyse the raw column name and the target field semantics to determine if a sensible default value should be applied when the raw data cell is empty or missing.
11. Default values are used as fallback — they fill in when the raw data has blank/null cells for that column.
12. Common examples: a status field might default to "active", a currency field might default to "IDR" or "USD", a country field might default to the most likely country based on the data context, a boolean might default to "false", a numeric amount might default to "0".
13. Only suggest a default when it is clearly reasonable. For most columns (names, IDs, descriptions) do NOT set a default — leave it as null.
14. Use the raw column names and target path names as context clues for what the default should be.

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
  }
}

Only include mappings with confidence >= 0.7. If no good mappings exist, return empty mappings array with pivot disabled.`;

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
}

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

    if (f.level === 0) {
      result.push(field);
      parentStack.length = 0;
      parentStack.push(field);
    } else {
      while (parentStack.length > f.level) {
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
): Promise<SchemaField[]> {
  const preview = await extractWorkbookPreview(buffer);
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
 * and extract clean headers. Works on the full raw preview (not just row 1).
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

  let parsed: { mappings: AutoMapResult[]; pivot?: { enabled?: boolean; groupByColumns?: string[] } };
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON for auto-mapping. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  const rawMappings = Array.isArray(parsed.mappings) ? parsed.mappings : [];

  const groupBySet = new Set(parsed.pivot?.groupByColumns ?? []);

  const mappings: ColumnMapping[] = rawMappings
    .filter((m) => m.confidence >= 0.7)
    .filter((m) => rawColumns.includes(m.rawColumn) && targetPaths.includes(m.targetPath))
    .map(({ rawColumn, targetPath, aggregation, defaultValue }) => {
      const mapping: ColumnMapping = { rawColumn, targetPath };
      if (aggregation && VALID_AGGREGATIONS.has(aggregation) && !groupBySet.has(rawColumn)) {
        mapping.aggregation = aggregation as AggregationFunction;
      }
      if (defaultValue != null && String(defaultValue).trim() !== "") {
        mapping.defaultValue = String(defaultValue);
      }
      return mapping;
    });

  const validGroupByColumns = (parsed.pivot?.groupByColumns ?? []).filter(
    (col) => mappings.some((m) => m.rawColumn === col),
  );

  const pivot: PivotConfig = {
    enabled: parsed.pivot?.enabled === true && validGroupByColumns.length > 0,
    groupByColumns: validGroupByColumns,
  };

  return { mappings, pivot };
}
