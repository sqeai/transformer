import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermissionsService } from "@/lib/permissions";

export async function GET() {
  const result = await requireAuth();
  if (result.error) return result.error;

  const folders = await PermissionsService.getAccessibleFolders(result.user.id);
  return NextResponse.json({ folders });
}

export async function POST(request: NextRequest) {
  const result = await requireAuth();
  if (result.error) return result.error;

  let body: { name?: string; parentId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const parentId = body.parentId || null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // If creating a sub-folder, verify parent exists and user has manage_folder permission
  if (parentId) {
    const { data: parent } = await supabase
      .from("folders")
      .select("id")
      .eq("id", parentId)
      .maybeSingle();

    if (!parent) {
      return NextResponse.json(
        { error: "Parent folder not found" },
        { status: 404 },
      );
    }
  }

  const { data: folder, error } = await supabase
    .from("folders")
    .insert({
      name,
      parent_id: parentId,
      created_by: result.user.id,
    })
    .select("id, name, parent_id, created_at")
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

  // Auto-assign the creator as owner
  await supabase.from("folder_members").insert({
    folder_id: folder.id,
    user_id: result.user.id,
    role: "owner",
    granted_by: result.user.id,
  });

  // Auto-create an empty context
  await supabase.from("folder_contexts").insert({
    folder_id: folder.id,
    content: "",
    updated_by: result.user.id,
  });

  return NextResponse.json({ folder });
}
