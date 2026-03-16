import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { PermissionsService } from "@/lib/permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId } = await params;

  const { data: schema } = await supabase!
    .from("schemas")
    .select("id, user_id, folder_id")
    .eq("id", schemaId)
    .single();
  if (!schema) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = schema.user_id === userId;
  const { data: grantRow } = await supabase!
    .from("schema_grants")
    .select("schema_id")
    .eq("schema_id", schemaId)
    .eq("granted_to_user_id", userId!)
    .maybeSingle();
  if (!isOwner && !grantRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: approvers, error } = await supabase!
    .from("schema_mandatory_approvers")
    .select("id, schema_id, user_id, created_at")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = [...new Set((approvers ?? []).map((a: Record<string, unknown>) => a.user_id as string))];
  const profiles =
    userIds.length > 0
      ? await supabase!.from("users").select("id, email, full_name").in("id", userIds)
      : { data: [] };
  const profileMap = new Map(
    (profiles.data ?? []).map((p: Record<string, unknown>) => [
      p.id as string,
      { email: (p.email ?? "") as string, name: (p.full_name ?? "") as string },
    ]),
  );

  const list = (approvers ?? []).map((a: Record<string, unknown>) => ({
    id: a.id,
    schemaId: a.schema_id,
    userId: a.user_id,
    userEmail: profileMap.get(a.user_id as string)?.email ?? "",
    userName: profileMap.get(a.user_id as string)?.name ?? "",
    createdAt: a.created_at,
  }));

  let folderMembers: Array<{ userId: string; email: string; name: string; role: string }> = [];
  if (schema.folder_id) {
    const directMembers = await PermissionsService.getFolderMembers(schema.folder_id);
    folderMembers = directMembers.map((m) => ({
      userId: m.userId,
      email: m.email,
      name: m.name,
      role: m.role,
    }));

    const ancestorMembers = await PermissionsService.getAncestorMembers(schema.folder_id);
    const existingIds = new Set(folderMembers.map((m) => m.userId));
    for (const am of ancestorMembers) {
      if (am.role !== "admin" && !existingIds.has(am.userId)) {
        existingIds.add(am.userId);
        folderMembers.push({
          userId: am.userId,
          email: am.email,
          name: am.name,
          role: am.role,
        });
      }
    }
  }

  return NextResponse.json({ approvers: list, folderMembers });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId } = await params;

  const { data: schema } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", schemaId)
    .single();
  if (!schema) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (schema.user_id !== userId) {
    return NextResponse.json({ error: "Only the schema owner can manage mandatory approvers" }, { status: 403 });
  }

  let body: { userIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.userIds)) {
    return NextResponse.json({ error: "userIds array is required" }, { status: 400 });
  }

  await supabase!.from("schema_mandatory_approvers").delete().eq("schema_id", schemaId);

  if (body.userIds.length > 0) {
    const rows = body.userIds.map((uid) => ({
      schema_id: schemaId,
      user_id: uid,
    }));
    const { error } = await supabase!
      .from("schema_mandatory_approvers")
      .insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
