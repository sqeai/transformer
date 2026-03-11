import { NextRequest, NextResponse } from "next/server";
import { parseExcelColumns } from "@/lib/parse-excel";
import { detectHeaderRowValuesWithLLM, recommendFieldTypesWithLLM, inferSchemaFromTextWithLLM } from "@/lib/llm-schema";
import { parseCsvContent } from "@/lib/utils/csv";
import { extractDocumentTextAsync } from "@/lib/doc-extract";
import Anthropic from "@anthropic-ai/sdk";

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function guessMimeType(ext: string): string {
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

function normalizeHeader(value: unknown): string {
  return (value ?? "")
    .toString()
    .replace(/\s+/g, " ")
    .trim();
}

function toSnakeCase(value: string): string {
  return normalizeHeader(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function uniqueSnakeCaseValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((value, index) => {
    const base = toSnakeCase(value) || `field_${index + 1}`;
    let next = base;
    let suffix = 2;
    while (seen.has(next)) {
      next = `${base}_${suffix}`;
      suffix += 1;
    }
    seen.add(next);
    return next;
  });
}

function uniqueHeaderValues(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const trimmed = normalizeHeader(value);
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const SCHEMA_FROM_IMAGE_PROMPT = `You are a schema design agent. Extract ALL visible text and structured data from this image, then infer a practical data schema from it.

Your task:
1. OCR all visible text from the image.
2. Identify column headers, field names, or data structure patterns.
3. Infer the target output fields needed for this data.
4. Return concise field names in lower_snake_case.
5. Recommend SQL-compatible data types.

Use only these data types: STRING, INTEGER, FLOAT, NUMERIC, BOOLEAN, DATE, DATETIME, TIMESTAMP.

Respond ONLY with valid JSON:
{
  "schemaName": "string",
  "fields": [
    { "name": "string", "dataType": "string" }
  ]
}`;

async function extractSchemaFromImage(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ fields: Array<{ name: string; dataType: string }> }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as ImageMediaType,
            data: buffer.toString("base64"),
          },
        },
        { type: "text", text: SCHEMA_FROM_IMAGE_PROMPT },
      ],
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const fields: Array<{ name: string; dataType: string }> = Array.isArray(parsed.fields)
    ? parsed.fields
        .map((f: { name?: string; dataType?: string }) => ({
          name: String(f.name ?? "").trim(),
          dataType: String(f.dataType ?? "STRING").trim().toUpperCase(),
        }))
        .filter((f: { name: string }) => f.name.length > 0)
    : [];

  if (fields.length === 0) throw new Error("Could not infer any fields from the image");
  return { fields };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const worksheetIndexRaw = formData.get("sheetIndex") as string | null;
    const sheetIndex = worksheetIndexRaw != null ? Number(worksheetIndexRaw) || 0 : 0;
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }
    const buffer = await file.arrayBuffer();
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const isCsv = ext === "csv";
    const isExcel = ext === "xlsx" || ext === "xls";

    if (isCsv) {
      const text = new TextDecoder().decode(buffer);
      const parsed = parseCsvContent(text);
      const headerRow = parsed[0] ?? [];
      const rawHeaders = headerRow.map((h) => h.trim()).filter(Boolean);
      const deduped = uniqueHeaderValues(rawHeaders);
      const snakeCaseFields = uniqueSnakeCaseValues(deduped);
      let typeByPath: Record<string, string> = {};
      try {
        typeByPath = await recommendFieldTypesWithLLM(snakeCaseFields);
      } catch {
        typeByPath = {};
      }
      const fields = snakeCaseFields.map((name, order) => ({
        id: crypto.randomUUID(),
        name,
        path: name,
        level: 0,
        order,
        dataType: typeByPath[name] ?? "STRING",
        children: [],
      }));
      return NextResponse.json({ fields });
    }

    if (!isExcel) {
      const mimeType = file.type || guessMimeType(ext);
      const nodeBuffer = Buffer.from(buffer);
      const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
      const isImage = IMAGE_TYPES.has(mimeType);

      if (isImage) {
        const inferred = await extractSchemaFromImage(nodeBuffer, file.name, mimeType);
        const fields = inferred.fields.map((f, order) => ({
          id: crypto.randomUUID(),
          name: f.name,
          path: f.name,
          level: 0,
          order,
          dataType: f.dataType ?? "STRING",
          children: [],
        }));
        return NextResponse.json({ fields });
      }

      let extractedText: string | null = null;
      try {
        extractedText = await extractDocumentTextAsync(nodeBuffer, mimeType);
      } catch (err) {
        console.error("Local text extraction failed for", file.name, err);
        extractedText = null;
      }

      if (!extractedText || !extractedText.trim()) {
        return NextResponse.json(
          { error: "Could not extract text from this file. The file may be empty or corrupted." },
          { status: 400 },
        );
      }

      const inferred = await inferSchemaFromTextWithLLM(extractedText);
      const fields = inferred.fields.map((f, order) => ({
        id: crypto.randomUUID(),
        name: f.name,
        path: f.name,
        level: 0,
        order,
        dataType: f.dataType ?? "STRING",
        children: [],
      }));
      return NextResponse.json({ fields });
    }

    try {
      const headerValues = await detectHeaderRowValuesWithLLM(buffer, sheetIndex);
      const deduped = uniqueHeaderValues(headerValues);
      const snakeCaseFields = uniqueSnakeCaseValues(deduped);
      let typeByPath: Record<string, string> = {};
      try {
        typeByPath = await recommendFieldTypesWithLLM(snakeCaseFields);
      } catch {
        typeByPath = {};
      }
      const fields = snakeCaseFields.map((name, order) => {
        return {
          id: crypto.randomUUID(),
          name,
          path: name,
          level: 0,
          order,
          dataType: typeByPath[name] ?? "STRING",
          children: [],
        };
      });
      if (fields.length > 0) {
        return NextResponse.json({ fields });
      }
    } catch (llmError) {
      console.warn("LLM header detection failed, falling back to header-only parsing:", llmError);
    }

    const columns = await parseExcelColumns(buffer, sheetIndex);
    const deduped = uniqueHeaderValues(columns);
    const snakeCaseFields = uniqueSnakeCaseValues(deduped);
    let typeByPath: Record<string, string> = {};
    try {
      typeByPath = await recommendFieldTypesWithLLM(snakeCaseFields);
    } catch {
      typeByPath = {};
    }
    const fields = snakeCaseFields.map((name, order) => ({
      id: crypto.randomUUID(),
      name,
      path: name,
      level: 0,
      order,
      dataType: typeByPath[name] ?? "STRING",
      children: [],
    }));
    return NextResponse.json({ fields });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Parse failed" },
      { status: 500 },
    );
  }
}
