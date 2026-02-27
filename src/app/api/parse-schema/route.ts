import { NextRequest, NextResponse } from "next/server";
import { parseExcelColumns } from "@/lib/parse-excel";
import { detectHeaderRowValuesWithLLM, recommendFieldTypesWithLLM } from "@/lib/llm-schema";

function normalizeHeader(value: unknown): string {
  return (value ?? "")
    .toString()
    .replace(/\s+/g, " ")
    .trim();
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
    const sheetIndexRaw = formData.get("sheetIndex") as string | null;
    const sheetIndex = sheetIndexRaw != null ? Number(sheetIndexRaw) || 0 : 0;
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }
    const buffer = await file.arrayBuffer();

    try {
      // Use the LLM to detect header boundaries and build the best header list
      // (including multi-row headers merged into a single label per column).
      const headerValues = await detectHeaderRowValuesWithLLM(buffer, sheetIndex);
      const deduped = uniqueHeaderValues(headerValues);
      let typeByPath: Record<string, string> = {};
      try {
        typeByPath = await recommendFieldTypesWithLLM(deduped);
      } catch {
        typeByPath = {};
      }
      const fields = deduped.map((name, order) => {
        const base = normalizeHeader(name) || `Field_${order + 1}`;
        return {
          id: crypto.randomUUID(),
          name: base,
          path: base,
          level: 0,
          order,
          dataType: typeByPath[base] ?? "STRING",
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
    let typeByPath: Record<string, string> = {};
    try {
      typeByPath = await recommendFieldTypesWithLLM(deduped);
    } catch {
      typeByPath = {};
    }
    const fields = deduped.map((name, order) => ({
      id: crypto.randomUUID(),
      name: normalizeHeader(name) || `Field_${order + 1}`,
      path: normalizeHeader(name) || `Field_${order + 1}`,
      level: 0,
      order,
      dataType: typeByPath[normalizeHeader(name) || `Field_${order + 1}`] ?? "STRING",
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
