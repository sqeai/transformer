import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const schemaId = searchParams.get("schemaId")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "20") || 20, 1), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0") || 0, 0);

  let query = supabase!
    .from("datasets")
    .select("id, schema_id, name, row_count, created_at, updated_at, schemas!inner(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (schemaId) {
    query = query.eq("schema_id", schemaId);
  }

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data: rows, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    datasets: (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      schemaId: r.schema_id,
      schemaName: (r.schemas as Record<string, unknown>)?.name ?? null,
      name: r.name,
      rowCount: r.row_count ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total: typeof count === "number" ? count : undefined,
    offset,
    limit,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let body: {
    schemaId?: string;
    name?: string;
    rows?: Record<string, unknown>[];
    mappingSnapshot?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const schemaId = typeof body.schemaId === "string" ? body.schemaId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const mappingSnapshot = body.mappingSnapshot && typeof body.mappingSnapshot === "object" ? body.mappingSnapshot : {};

  if (!schemaId) return NextResponse.json({ error: "schemaId is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data: schemaRow, error: schemaError } = await supabase!
    .from("schemas")
    .select("id")
    .eq("id", schemaId)
    .single();
  if (schemaError || !schemaRow) {
    return NextResponse.json({ error: schemaError?.message ?? "Schema not found" }, { status: 404 });
  }

  const { data, error } = await supabase!
    .from("datasets")
    .insert({
      schema_id: schemaId,
      name,
      rows,
      row_count: rows.length,
      mapping_snapshot: mappingSnapshot,
    })
    .select("id, schema_id, name, row_count, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase!.from("schemas").update({ updated_at: new Date().toISOString() }).eq("id", schemaId);

  return NextResponse.json({
    dataset: {
      id: data.id,
      schemaId: data.schema_id,
      name: data.name,
      rowCount: data.row_count ?? 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}
