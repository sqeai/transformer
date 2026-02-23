import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import type { SchemaField, ColumnMapping } from "./types";
import {
  extractWorkbookPreview,
  formatPreviewAsText,
} from "./parse-excel-preview";

const SYSTEM_PROMPT = `You are a data-schema analyst. Given a preview of an Excel workbook (headers + sample rows), produce the best possible target schema.

Rules:
1. Identify which columns are meaningful data fields vs noise (row numbers, empty padding, internal IDs that are clearly auto-generated).
2. Group related columns under a common parent when it makes semantic sense (e.g. "First Name" and "Last Name" → parent "name" with children "first" and "last"; or "Address Line 1", "City", "State", "Zip" → parent "address").
3. Normalise field names to clean camelCase (e.g. "CUST_EMAIL" → "customerEmail", "Addr Line 1" → "addressLine1").
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
- Noise columns (row numbers, internal IDs, empty columns)

Your job is to:
1. Identify the HEADER ROW — the row that contains column names for the actual data. Common header fields include: Kode Nasabah, Nama Nasabah, Asset class, key_metrics_level_1, tenor, and similar financial/business terms. The header row is usually the first row where most cells contain short descriptive text (not data values or long sentences).
2. Identify which rows ABOVE the header are noise/metadata that should be trimmed.
3. Identify which columns are meaningful vs noise (empty columns, row-number columns, padding).
4. Return the cleaned structure.

Respond ONLY with a JSON object (no markdown fences, no commentary):
{
  "headerRowIndex": number,       // 0-based index of the header row in the provided rows
  "headers": string[],            // the cleaned header names from that row
  "dataStartRowIndex": number,    // 0-based index where actual data rows begin (usually headerRowIndex + 1)
  "columnsToKeep": number[],      // 0-based column indices to keep (exclude noise/empty columns)
  "trimmedRowCount": number,      // how many top rows to skip (metadata/title rows)
  "notes": string                 // brief explanation of what was trimmed and why
}`;

const AUTO_MAP_PROMPT = `You are a data mapping specialist. Given a list of raw column headers from uploaded data and a list of target schema field paths, determine the best mapping between them.

Rules:
1. Match columns by semantic meaning, not just exact name. E.g. "Kode Nasabah" should match "customerCode" or "nasabahCode", "Nama Nasabah" should match "customerName" or "nasabahName".
2. Consider abbreviations, language differences (Indonesian ↔ English), and formatting differences (camelCase, snake_case, spaces, etc.).
3. Only create mappings where you are reasonably confident (>70% match). Leave ambiguous ones unmapped.
4. Each target path should have at most one source column.
5. Each source column should map to at most one target path.

Respond ONLY with a JSON array (no markdown fences, no commentary). Each element:
{
  "rawColumn": string,    // exact raw column name as provided
  "targetPath": string,   // exact target schema path as provided
  "confidence": number    // 0.0 to 1.0 confidence score
}

Only include mappings with confidence >= 0.7. If no good mappings exist, return an empty array [].`;

interface LlmSchemaField {
  name: string;
  path: string;
  level: number;
  originalColumn: string;
}

export interface RawDataAnalysis {
  headerRowIndex: number;
  headers: string[];
  dataStartRowIndex: number;
  columnsToKeep: number[];
  trimmedRowCount: number;
  notes: string;
}

export interface AutoMapResult {
  rawColumn: string;
  targetPath: string;
  confidence: number;
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
): Promise<RawDataAnalysis> {
  const preview = await extractWorkbookPreview(buffer, { useAllRows: true });
  if (preview.sampleRows.length === 0) {
    throw new Error("Workbook appears to be empty");
  }

  const lines: string[] = [];
  lines.push(`Sheet: "${preview.sheetName}" (${preview.totalRows} total rows, ${preview.totalColumns} columns)`);
  lines.push("");
  lines.push("All rows (including potential metadata/title rows above the header):");
  for (let i = 0; i < preview.sampleRows.length; i++) {
    lines.push(`Row ${i}: ${preview.sampleRows[i].join(" | ")}`);
  }

  const text = await callLlm(
    RAW_DATA_ANALYSIS_PROMPT,
    `Analyse this raw spreadsheet data and identify the header row, noise rows, and columns to keep:\n\n${lines.join("\n")}`,
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
 * Auto-maps raw column headers to target schema paths using LLM semantic matching.
 */
export async function autoMapColumnsWithLLM(
  rawColumns: string[],
  targetPaths: string[],
): Promise<ColumnMapping[]> {
  const text = await callLlm(
    AUTO_MAP_PROMPT,
    `Map these raw columns to the target schema paths.\n\nRaw columns:\n${rawColumns.map((c, i) => `${i + 1}. "${c}"`).join("\n")}\n\nTarget schema paths:\n${targetPaths.map((p, i) => `${i + 1}. "${p}"`).join("\n")}`,
  );

  let parsed: AutoMapResult[];
  try {
    parsed = JSON.parse(cleanJsonResponse(text));
  } catch {
    throw new Error(
      `LLM returned invalid JSON for auto-mapping. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("LLM returned non-array for auto-mapping");
  }

  return parsed
    .filter((m) => m.confidence >= 0.7)
    .filter((m) => rawColumns.includes(m.rawColumn) && targetPaths.includes(m.targetPath))
    .map(({ rawColumn, targetPath }) => ({ rawColumn, targetPath }));
}
