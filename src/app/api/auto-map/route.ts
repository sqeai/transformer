import { NextRequest, NextResponse } from "next/server";
import { autoMapColumnsWithLLM } from "@/lib/llm-schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rawColumns, targetPaths } = body as {
      rawColumns: string[];
      targetPaths: string[];
    };

    if (!rawColumns?.length || !targetPaths?.length) {
      return NextResponse.json(
        { error: "rawColumns and targetPaths are required" },
        { status: 400 },
      );
    }

    const { mappings, pivot, verticalPivot, defaultValues } = await autoMapColumnsWithLLM(rawColumns, targetPaths);
    return NextResponse.json({ mappings, pivot, verticalPivot, defaultValues });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Auto-mapping failed" },
      { status: 500 },
    );
  }
}
