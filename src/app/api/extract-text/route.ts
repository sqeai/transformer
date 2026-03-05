import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { extractDocumentTextAsync } from "@/lib/doc-extract";

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;

  let body: { base64: string; mimeType: string; fileName: string };
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
    const buffer = Buffer.from(body.base64, "base64");
    const text = await extractDocumentTextAsync(buffer, body.mimeType);

    if (text === null) {
      return NextResponse.json(
        { error: "Unsupported file type for local extraction" },
        { status: 400 },
      );
    }

    return NextResponse.json({ extractedText: text });
  } catch (e) {
    console.error("Text extraction error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to extract text" },
      { status: 500 },
    );
  }
}
