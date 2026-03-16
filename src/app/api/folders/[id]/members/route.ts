import { NextRequest, NextResponse } from "next/server";
import { requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermissionsService } from "@/lib/permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "view_members");
  if (access.error) return access.error;

  const canManage = await PermissionsService.can(access.user.id, id, "manage_users");
  const members = await PermissionsService.getFolderMembers(id);
  const inherited = await PermissionsService.getDescendantMembers(id);
  const ancestorMembers = await PermissionsService.getAncestorMembers(id);

  return NextResponse.json({ members, inherited, ancestorMembers, canManage });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "manage_users");
  if (access.error) return access.error;

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role ?? "viewer";

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const validRoles = ["data_engineer", "viewer", "editor", "admin", "owner"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${validRoles.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!user) {
    return NextResponse.json(
      { error: "No user found with this email" },
      { status: 404 },
    );
  }

  const { error } = await supabase.from("folder_members").upsert(
    {
      folder_id: id,
      user_id: user.id,
      role,
      granted_by: access.user.id,
    },
    { onConflict: "folder_id,user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "manage_users");
  if (access.error) return access.error;

  let body: { userId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId;
  const role = body.role;

  if (!userId || !role) {
    return NextResponse.json(
      { error: "userId and role are required" },
      { status: 400 },
    );
  }

  const validRoles = ["data_engineer", "viewer", "editor", "admin", "owner"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${validRoles.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("folder_members")
    .update({ role })
    .eq("folder_id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "manage_users");
  if (access.error) return access.error;

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId;
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("folder_members")
    .delete()
    .eq("folder_id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
