import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await requireAuth();
  if (result.error) return result.error;

  const supabase = createAdminClient();

  const { data: folder, error } = await supabase
    .from("folders")
    .select("id, name, parent_id, logo_url, created_by, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const { data: children } = await supabase
    .from("folders")
    .select("id, name")
    .eq("parent_id", id)
    .order("name");

  return NextResponse.json({
    folder,
    children: children ?? [],
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "manage_folder");
  if (access.error) return access.error;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("folders")
    .update({ name })
    .eq("id", id)
    .select("id, name, parent_id, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A folder with this name already exists at this level" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ folder: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "delete_folder");
  if (access.error) return access.error;

  const supabase = createAdminClient();
  const { error } = await supabase.from("folders").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
