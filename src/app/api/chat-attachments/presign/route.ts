import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createFileUploadUrl } from "@/lib/s3-files";

const EXTENSION_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;

  let body: { fileName?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "application/octet-stream";

  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  const ext = EXTENSION_MAP[contentType] ?? fileName.split(".").pop() ?? "bin";

  try {
    const upload = await createFileUploadUrl(contentType, ext);
    return NextResponse.json({
      filePath: upload.filePath,
      uploadUrl: upload.uploadUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create upload URL" },
      { status: 500 },
    );
  }
}
