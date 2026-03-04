import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { extractWithAnthropic } from "@/lib/ocr";

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;

  let body: { base64: string; mimeType: string; fileName: string; targetPaths?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.base64 || !body.mimeType || !body.fileName) {
    return NextResponse.json(
      { error: "base64, mimeType, and fileName are required" },
      { status: 400 },
    );
  }

  try {
    const result = await extractWithAnthropic({
      base64: body.base64,
      mimeType: body.mimeType,
      fileName: body.fileName,
      targetPaths: body.targetPaths,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("OCR extraction error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to extract content" },
      { status: 500 },
    );
  }
}
