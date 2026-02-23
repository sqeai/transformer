import { NextRequest, NextResponse } from "next/server";
import { analyzeRawDataWithLLM } from "@/lib/llm-schema";

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
    const analysis = await analyzeRawDataWithLLM(buffer);
    return NextResponse.json(analysis);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
