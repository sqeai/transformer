import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFieldTypeMap, normalizeRowsForStorage } from "@/lib/dataset-type-normalizer";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  const admin = createAdminClient();

  // Try via RLS first (schema owner / grantee)
  let data: Record<string, unknown> | null = null;
  const { data: rlsData, error } = await supabase!
    .from("datasets")
    .select("id, schema_id, name, row_count, state, rows, mapping_snapshot, created_at, updated_at, schemas(name)")
    .eq("id", id)
    .single();

  if (rlsData) {
    data = rlsData as Record<string, unknown>;
  } else {
    // Fallback: check if the user is an approver on this dataset
    const { data: approverRow } = await admin
      .from("dataset_approvers")
      .select("id")
      .eq("dataset_id", id)
      .eq("user_id", userId!)
      .maybeSingle();

    if (approverRow) {
      const { data: adminData } = await admin
        .from("datasets")
        .select("id, schema_id, name, row_count, state, rows, mapping_snapshot, created_at, updated_at, schemas(name)")
        .eq("id", id)
        .single();
      data = adminData as Record<string, unknown> | null;
    }
  }

  if (!data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  const { data: approvers } = await admin
    .from("dataset_approvers")
    .select("id, dataset_id, user_id, status, comment, decided_at, created_at")
    .eq("dataset_id", id)
    .order("created_at");

  const { data: logs } = await admin
    .from("dataset_logs")
    .select("id, dataset_id, user_id, action, from_state, to_state, comment, metadata, created_at")
    .eq("dataset_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Collect all unique user IDs from approvers + logs and fetch profiles in one query
  const userIds = [
    ...new Set([
      ...(approvers ?? []).map((a: Record<string, unknown>) => a.user_id as string),
      ...(logs ?? []).map((l: Record<string, unknown>) => l.user_id as string),
    ]),
  ];
  const userMap = new Map<string, { email: string; full_name: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, email, full_name")
      .in("id", userIds);
    for (const u of users ?? []) {
      userMap.set(u.id, { email: u.email, full_name: u.full_name });
    }
  }

  return NextResponse.json({
    dataset: {
      id: data.id,
      schemaId: data.schema_id,
      schemaName: (data.schemas as Record<string, unknown>)?.name ?? null,
      name: data.name,
      rowCount: data.row_count ?? 0,
      state: data.state ?? "draft",
      rows: Array.isArray(data.rows) ? data.rows : [],
      mappingSnapshot: (data.mapping_snapshot ?? {}) as Record<string, unknown>,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      approvers: (approvers ?? []).map((a: Record<string, unknown>) => {
        const user = userMap.get(a.user_id as string);
        return {
          id: a.id,
          datasetId: a.dataset_id,
          userId: a.user_id,
          userEmail: user?.email ?? "",
          userName: user?.full_name || user?.email || "",
          status: a.status,
          comment: a.comment,
          decidedAt: a.decided_at,
          createdAt: a.created_at,
        };
      }),
      logs: (logs ?? []).map((l: Record<string, unknown>) => {
        const user = userMap.get(l.user_id as string);
        return {
          id: l.id,
          datasetId: l.dataset_id,
          userId: l.user_id,
          userEmail: user?.email ?? "",
          userName: user?.full_name || user?.email || "",
          action: l.action,
          fromState: l.from_state,
          toState: l.to_state,
          comment: l.comment,
          metadata: l.metadata ?? {},
          createdAt: l.created_at,
        };
      }),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  let body: {
    name?: string;
    appendRows?: Record<string, unknown>[];
    replaceRows?: Record<string, unknown>[];
    mappingSnapshot?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: existing, error: loadError } = await supabase!
    .from("datasets")
    .select("id, schema_id, name, rows, row_count")
    .eq("id", id)
    .single();
  if (loadError || !existing) {
    return NextResponse.json({ error: loadError?.message ?? "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (body.mappingSnapshot && typeof body.mappingSnapshot === "object") {
    updates.mapping_snapshot = body.mappingSnapshot;
  }
  const hasReplaceRows = Array.isArray(body.replaceRows);
  const hasAppendRows = Array.isArray(body.appendRows) && body.appendRows.length > 0;

  if (hasReplaceRows && hasAppendRows) {
    return NextResponse.json(
      { error: "Provide either replaceRows or appendRows, not both" },
      { status: 400 },
    );
  }

  if (hasReplaceRows || hasAppendRows) {
    const { data: schemaFieldRows, error: schemaFieldError } = await supabase!
      .from("schema_fields")
      .select("path, data_type")
      .eq("schema_id", existing.schema_id);
    if (schemaFieldError) {
      return NextResponse.json({ error: schemaFieldError.message }, { status: 500 });
    }
    const fieldTypeMap = buildFieldTypeMap(
      ((schemaFieldRows ?? []) as Array<{ path: string; data_type: string | null }>)
    );
    const normalizedIncoming = normalizeRowsForStorage(
      hasReplaceRows ? (body.replaceRows ?? []) : (body.appendRows ?? []),
      fieldTypeMap,
    );
    const currentRows = Array.isArray(existing.rows) ? existing.rows : [];
    const nextRows = hasReplaceRows ? normalizedIncoming : [...currentRows, ...normalizedIncoming];
    updates.rows = nextRows;
    updates.row_count = nextRows.length;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await supabase!
    .from("datasets")
    .update(updates)
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase!.from("schemas").update({ updated_at: new Date().toISOString() }).eq("id", existing.schema_id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  const { data: existing, error: loadError } = await supabase!
    .from("datasets")
    .select("id, schema_id")
    .eq("id", id)
    .single();
  if (loadError || !existing) {
    return NextResponse.json({ error: loadError?.message ?? "Not found" }, { status: 404 });
  }

  const { error } = await supabase!.from("datasets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase!.from("schemas").update({ updated_at: new Date().toISOString() }).eq("id", existing.schema_id);

  return NextResponse.json({ ok: true });
}
