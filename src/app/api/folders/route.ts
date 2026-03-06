import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin, getUserAccessibleFolderIds } from "@/lib/rbac";

export async function GET() {
  const result = await requireAuth();
  if (result.error) return result.error;

  const supabase = createAdminClient();
  const userId = result.user.id;
  const isAdmin = await isSuperadmin(userId);

  if (isAdmin) {
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, parent_id, created_by, created_at, updated_at")
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ folders: data ?? [] });
  }

  const accessibleIds = await getUserAccessibleFolderIds(userId);
  if (accessibleIds.length === 0) {
    return NextResponse.json({ folders: [] });
  }

  // Fetch all folders the user has direct access to, plus their ancestors
  const { data: directFolders, error } = await supabase
    .from("folders")
    .select("id, name, parent_id, created_by, created_at, updated_at")
    .in("id", accessibleIds)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch ancestor folders for tree rendering
  const allIds = new Set(accessibleIds);
  const toFetch = (directFolders ?? [])
    .filter((f) => f.parent_id && !allIds.has(f.parent_id))
    .map((f) => f.parent_id!);

  let ancestorFolders: typeof directFolders = [];
  if (toFetch.length > 0) {
    const { data: ancestors } = await supabase
      .from("folders")
      .select("id, name, parent_id, created_by, created_at, updated_at")
      .in("id", toFetch);
    ancestorFolders = ancestors ?? [];
  }

  const allFolders = [...(directFolders ?? []), ...ancestorFolders];
  const seen = new Set<string>();
  const unique = allFolders.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  return NextResponse.json({ folders: unique });
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
