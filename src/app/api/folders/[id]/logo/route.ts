import { NextRequest, NextResponse } from "next/server";
import { requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFileUploadUrl } from "@/lib/s3-files";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "edit_context");
  if (access.error) return access.error;

  let body: { contentType?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "image/png";
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "logo.png";

  const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: "Only image files are allowed (PNG, JPEG, GIF, WebP, SVG)" },
      { status: 400 },
    );
  }

  const ext = fileName.split(".").pop() ?? "png";

  try {
    const upload = await createFileUploadUrl(contentType, ext);

    const supabase = createAdminClient();
    await supabase
      .from("folders")
      .update({ logo_url: upload.filePath })
      .eq("id", id);

    return NextResponse.json({
      uploadUrl: upload.uploadUrl,
      logoUrl: upload.filePath,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create upload URL" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "edit_context");
  if (access.error) return access.error;

  const supabase = createAdminClient();
  await supabase
    .from("folders")
    .update({ logo_url: null })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
