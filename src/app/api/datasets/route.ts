import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const schemaId = searchParams.get("schemaId")?.trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "5") || 5, 1), 50);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0") || 0, 0);

  if (!schemaId) {
    return NextResponse.json({ error: "schemaId is required" }, { status: 400 });
  }

  const { data: rows, error } = await supabase!
    .from("datasets")
    .select("id, schema_id, name, row_count, created_at, updated_at", { count: "exact" })
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = (rows as unknown as { count?: number })?.count; // defensive no-op for TS shape variance
  return NextResponse.json({
    datasets: (rows ?? []).map((r: { id: string; schema_id: string; name: string; row_count: number; created_at: string; updated_at: string }) => ({
      id: r.id,
      schemaId: r.schema_id,
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

  // bump schema.updated_at so schema list ordering reflects dataset creation
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
