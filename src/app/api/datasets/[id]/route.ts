import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase!
    .from("datasets")
    .select("id, schema_id, name, row_count, rows, mapping_snapshot, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    dataset: {
      id: data.id,
      schemaId: data.schema_id,
      name: data.name,
      rowCount: data.row_count ?? 0,
      rows: Array.isArray(data.rows) ? data.rows : [],
      mappingSnapshot: (data.mapping_snapshot ?? {}) as Record<string, unknown>,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  let body: {
    name?: string;
    appendRows?: Record<string, unknown>[];
    mappingSnapshot?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: existing, error: loadError } = await supabase!
    .from("datasets")
    .select("id, user_id, schema_id, name, rows, row_count")
    .eq("id", id)
    .single();
  if (loadError || !existing) {
    return NextResponse.json({ error: loadError?.message ?? "Not found" }, { status: 404 });
  }
  if (existing.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (body.mappingSnapshot && typeof body.mappingSnapshot === "object") {
    updates.mapping_snapshot = body.mappingSnapshot;
  }
  if (Array.isArray(body.appendRows) && body.appendRows.length > 0) {
    const currentRows = Array.isArray(existing.rows) ? existing.rows : [];
    const nextRows = [...currentRows, ...body.appendRows];
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
  const { supabase, userId } = auth;
  const { id } = await params;

  const { data: existing, error: loadError } = await supabase!
    .from("datasets")
    .select("id, user_id, schema_id")
    .eq("id", id)
    .single();
  if (loadError || !existing) {
    return NextResponse.json({ error: loadError?.message ?? "Not found" }, { status: 404 });
  }
  if (existing.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase!.from("datasets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase!.from("schemas").update({ updated_at: new Date().toISOString() }).eq("id", existing.schema_id);

  return NextResponse.json({ ok: true });
}
