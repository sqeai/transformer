import { NextRequest, NextResponse } from "next/server";
import { parseExcelColumns } from "@/lib/parse-excel";
import { detectHeaderRowValuesWithLLM } from "@/lib/llm-schema";

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
      const fields = headerValues.map((raw, order) => {
        const trimmed = (raw ?? "").toString().trim();
        const base = trimmed || `Field_${order + 1}`;
        return {
          id: crypto.randomUUID(),
          name: base,
          path: base,
          level: 0,
          order,
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
    const fields = columns.map((name, order) => ({
      id: crypto.randomUUID(),
      name: name.trim() || `Field_${order + 1}`,
      path: name.trim() || `Field_${order + 1}`,
      level: 0,
      order,
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
