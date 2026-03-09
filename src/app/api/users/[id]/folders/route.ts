import { NextRequest, NextResponse } from "next/server";
import { requireUserManager } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireUserManager();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: memberships, error } = await supabase
    .from("folder_members")
    .select("folder_id, role, folders:folder_id(id, name, parent_id)")
    .eq("user_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: allFolders } = await supabase
    .from("folders")
    .select("id, name, parent_id")
    .order("name");

  return NextResponse.json({
    memberships: (memberships ?? []).map((m) => {
      const folder = m.folders as unknown as { id: string; name: string; parent_id: string | null } | null;
      return {
        folderId: m.folder_id,
        role: m.role,
        folderName: folder?.name ?? "",
      };
    }),
    allFolders: allFolders ?? [],
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireUserManager();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  let body: { folderId?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const folderId = body.folderId;
  const role = body.role ?? "viewer";

  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  const validRoles = ["viewer", "editor", "admin", "owner"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${validRoles.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase.from("folder_members").upsert(
    {
      folder_id: folderId,
      user_id: id,
      role,
      granted_by: authResult.user.id,
    },
    { onConflict: "folder_id,user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireUserManager();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  let body: { folderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const folderId = body.folderId;
  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("folder_members")
    .delete()
    .eq("folder_id", folderId)
    .eq("user_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
