import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createFileUploadUrl } from "@/lib/s3-files";
import { createFileRecord, generateFileId, type FileRecordType } from "@/lib/files-db";

interface PresignBody {
  name?: unknown;
  dimensions?: unknown;
  type?: unknown;
  fileId?: unknown;
  contentType?: unknown;
  fileExtension?: unknown;
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;

  let body: PresignBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const dimensions = body.dimensions as { rowCount?: unknown; columnCount?: unknown } | undefined;
  const type = body.type as FileRecordType | undefined;
  const fileId = typeof body.fileId === "string" && body.fileId.trim() ? body.fileId.trim() : generateFileId();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (type !== "raw" && type !== "processed" && type !== "intermediary") {
    return NextResponse.json({ error: "type must be one of raw, processed, intermediary" }, { status: 400 });
  }

  const rowCount = Number(dimensions?.rowCount ?? 0);
  const columnCount = Number(dimensions?.columnCount ?? 0);
  if (!Number.isFinite(rowCount) || !Number.isFinite(columnCount) || rowCount < 0 || columnCount < 0) {
    return NextResponse.json({ error: "dimensions.rowCount and dimensions.columnCount must be non-negative numbers" }, { status: 400 });
  }

  const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "text/csv";
  const fileExtension = typeof body.fileExtension === "string" ? body.fileExtension.trim() : undefined;

  try {
    const upload = await createFileUploadUrl(contentType, fileExtension);
    const fileRecord = await createFileRecord(auth.supabase!, {
      userId: auth.userId!,
      fileId,
      name,
      storageUrl: upload.filePath,
      dimensions: { rowCount, columnCount },
      type,
    });

    return NextResponse.json({
      fileId: fileRecord.file_id,
      recordId: fileRecord.id,
      filePath: fileRecord.storage_url,
      uploadUrl: upload.uploadUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create file upload URL" },
      { status: 500 },
    );
  }
}
