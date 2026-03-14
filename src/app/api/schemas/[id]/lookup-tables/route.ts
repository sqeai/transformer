import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";

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
    .select("id, user_id")
    .eq("id", schemaId)
    .single();

  if (!schema) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const { data: rows, error } = await supabase!
    .from("schema_lookup_tables")
    .select("*")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lookupTables = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    schemaId: r.schema_id,
    name: r.name,
    dimensions: r.dimensions ?? [],
    values: r.values ?? [],
    rows: r.rows ?? [],
    createdAt: r.created_at,
  }));

  return NextResponse.json({ lookupTables });
}

export async function POST(
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

  if (!schema) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  let body: { name?: string; dimensions?: string[]; values?: string[]; rows?: Record<string, string>[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const dimensions = Array.isArray(body?.dimensions) ? body.dimensions : [];
  const values = Array.isArray(body?.values) ? body.values : [];
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  const { data: inserted, error } = await supabase!
    .from("schema_lookup_tables")
    .insert({
      schema_id: schemaId,
      name,
      dimensions,
      values,
      rows,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    lookupTable: {
      id: inserted.id,
      schemaId: inserted.schema_id,
      name: inserted.name,
      dimensions: inserted.dimensions ?? [],
      values: inserted.values ?? [],
      rows: inserted.rows ?? [],
      createdAt: inserted.created_at,
    },
  });
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

  if (!schema) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  let body: { id?: string; name?: string; dimensions?: string[]; values?: string[]; rows?: Record<string, string>[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lookupTableId = body?.id;
  if (!lookupTableId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (Array.isArray(body.dimensions)) updates.dimensions = body.dimensions;
  if (Array.isArray(body.values)) updates.values = body.values;
  if (Array.isArray(body.rows)) updates.rows = body.rows;

  const { data: updated, error } = await supabase!
    .from("schema_lookup_tables")
    .update(updates)
    .eq("id", lookupTableId)
    .eq("schema_id", schemaId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    lookupTable: {
      id: updated.id,
      schemaId: updated.schema_id,
      name: updated.name,
      dimensions: updated.dimensions ?? [],
      values: updated.values ?? [],
      rows: updated.rows ?? [],
      createdAt: updated.created_at,
    },
  });
}

export async function DELETE(
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

  if (!schema) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const { searchParams } = new URL(request.url);
  const lookupTableId = searchParams.get("lookupTableId");
  if (!lookupTableId) {
    return NextResponse.json({ error: "lookupTableId query param is required" }, { status: 400 });
  }

  const { error } = await supabase!
    .from("schema_lookup_tables")
    .delete()
    .eq("id", lookupTableId)
    .eq("schema_id", schemaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
