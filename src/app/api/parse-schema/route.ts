import { NextRequest, NextResponse } from "next/server";
import { parseExcelColumns } from "@/lib/parse-excel";
import { detectSchemaWithLLM } from "@/lib/llm-schema";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }
    const buffer = await file.arrayBuffer();

    try {
      const fields = await detectSchemaWithLLM(buffer);
      return NextResponse.json({ fields });
    } catch (llmError) {
      console.warn("LLM schema detection failed, falling back to header-only parsing:", llmError);
    }

    const columns = await parseExcelColumns(buffer);
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
