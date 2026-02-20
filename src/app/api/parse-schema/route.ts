import { NextRequest, NextResponse } from "next/server";
import { parseExcelColumns } from "@/lib/parse-excel";

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
    const columns = await parseExcelColumns(buffer);
    // Placeholder "agent": use first row as final mapping (in real app, AI would suggest structure)
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
