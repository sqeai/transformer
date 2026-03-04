import { NextRequest, NextResponse } from "next/server";
import { parseExcelColumns } from "@/lib/parse-excel";
import { detectHeaderRowValuesWithLLM, recommendFieldTypesWithLLM } from "@/lib/llm-schema";
import { parseCsvContent } from "@/lib/utils/csv";

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
    const isCsv = file.name.toLowerCase().endsWith(".csv");

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
