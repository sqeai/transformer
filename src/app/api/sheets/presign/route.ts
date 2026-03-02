import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createSheetUploadUrl } from "@/lib/s3-sheets";
import { createSheetRecord, generateSheetId, type SheetType } from "@/lib/sheets-db";

interface PresignBody {
  name?: unknown;
  dimensions?: unknown;
  type?: unknown;
  sheetId?: unknown;
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
  const type = body.type as SheetType | undefined;
  const sheetId = typeof body.sheetId === "string" && body.sheetId.trim() ? body.sheetId.trim() : generateSheetId();

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

  try {
    const upload = await createSheetUploadUrl("text/csv");
    const sheet = await createSheetRecord(auth.supabase!, {
      userId: auth.userId!,
      sheetId,
      name,
      storageUrl: upload.filePath,
      dimensions: { rowCount, columnCount },
      type,
    });

    return NextResponse.json({
      sheetId: sheet.sheet_id,
      recordId: sheet.id,
      filePath: sheet.storage_url,
      uploadUrl: upload.uploadUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create sheet upload URL" },
      { status: 500 },
    );
  }
}
