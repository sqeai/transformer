import { NextRequest, NextResponse } from "next/server";
import { rowsToFields, fieldsToRows } from "@/lib/schema-db";
import type { SchemaFieldRow } from "@/lib/schema-db";
import { getAuth } from "@/lib/api-auth";
import type { SchemaField } from "@/lib/types";

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId")?.trim() || null;

  let query = supabase!
    .from("schemas")
    .select("id, name, created_at, updated_at, user_id, folder_id");

  if (folderId) {
    query = query.eq("folder_id", folderId);
  }

  const { data: schemaRows, error: schemaError } = await query;

  if (schemaError) {
    console.error("Schemas list error:", schemaError);
    return NextResponse.json(
      { error: schemaError.message },
      { status: 500 },
    );
  }

  const profileIds = [...new Set((schemaRows ?? []).map((s: { user_id: string }) => s.user_id))];
  const creatorMap = new Map<string, { id: string; email: string; name: string }>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase!
      .from("users")
      .select("id, email, full_name")
      .in("id", profileIds);
    for (const p of profiles ?? []) {
      creatorMap.set(p.id, {
        id: p.id,
        email: p.email ?? "",
        name: p.full_name ?? "",
      });
    }
  }

  const schemas = (schemaRows ?? []).map((s: { id: string; name: string; created_at: string; updated_at?: string; user_id: string }) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at ?? new Date().toISOString(),
    updatedAt: s.updated_at ?? s.created_at ?? new Date().toISOString(),
    lastActivityAt: s.updated_at ?? s.created_at ?? new Date().toISOString(),
    datasetCount: 0,
    datasets: [] as Array<{ id: string; schemaId: string; name: string; rowCount: number; createdAt: string; updatedAt: string }>,
    creator: creatorMap.get(s.user_id),
    fields: [] as ReturnType<typeof rowsToFields>,
  }));

  const ids = schemas.map((s) => s.id);
  if (ids.length === 0) {
    return NextResponse.json({ schemas });
  }

  const { data: fieldRows, error: fieldError } = await supabase!
    .from("schema_fields")
    .select("*")
    .in("schema_id", ids)
    .order("level", { ascending: true })
    .order("order", { ascending: true });

  if (fieldError) {
    console.error("Schema fields list error:", fieldError);
    return NextResponse.json({ schemas });
  }

  const bySchema = new Map<string, SchemaFieldRow[]>();
  for (const row of fieldRows ?? []) {
    const list = bySchema.get(row.schema_id) ?? [];
    list.push(row as SchemaFieldRow);
    bySchema.set(row.schema_id, list);
  }

  for (const s of schemas) {
    s.fields = rowsToFields(bySchema.get(s.id) ?? []);
  }

  const { data: datasetRows } = await supabase!
    .from("datasets")
    .select("id, schema_id, name, row_count, created_at, updated_at")
    .in("schema_id", ids)
    .order("created_at", { ascending: false });

  const datasetsBySchema = new Map<string, Array<{ id: string; schema_id: string; name: string; row_count: number; created_at: string; updated_at: string }>>();
  for (const d of datasetRows ?? []) {
    const list = datasetsBySchema.get(d.schema_id) ?? [];
    list.push(d as { id: string; schema_id: string; name: string; row_count: number; created_at: string; updated_at: string });
    datasetsBySchema.set(d.schema_id, list);
  }

  for (const s of schemas) {
    const ds = datasetsBySchema.get(s.id) ?? [];
    s.datasetCount = ds.length;
    s.datasets = ds.slice(0, 5).map((d) => ({
      id: d.id,
      schemaId: d.schema_id,
      name: d.name,
      rowCount: d.row_count ?? 0,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
    const latestDatasetCreated = ds[0]?.created_at;
    if (latestDatasetCreated && new Date(latestDatasetCreated).getTime() > new Date(s.lastActivityAt ?? s.updatedAt ?? s.createdAt).getTime()) {
      s.lastActivityAt = latestDatasetCreated;
    }
  }

  schemas.sort((a, b) => {
    const ta = new Date(a.lastActivityAt ?? a.updatedAt ?? a.createdAt).getTime();
    const tb = new Date(b.lastActivityAt ?? b.updatedAt ?? b.createdAt).getTime();
    return tb - ta;
  });

  return NextResponse.json({ schemas });
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  let body: { name?: string; fields?: SchemaField[]; folderId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const fields = Array.isArray(body?.fields) ? (body.fields as SchemaField[]) : [];
  const folderId = typeof body?.folderId === "string" ? body.folderId.trim() : null;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const insertData: Record<string, unknown> = { user_id: userId!, name };
  if (folderId) insertData.folder_id = folderId;

  const { data: schema, error: schemaError } = await supabase!
    .from("schemas")
    .insert(insertData)
    .select("id, name, created_at")
    .single();

  if (schemaError) {
    console.error("Schema create error:", schemaError);
    return NextResponse.json(
      { error: schemaError.message },
      { status: 500 },
    );
  }

  if (fields.length > 0) {
    const rows = fieldsToRows(schema.id, fields);
    const { error: fieldsError } = await supabase!
      .from("schema_fields")
      .insert(rows);

    if (fieldsError) {
      console.error("Schema fields create error:", fieldsError);
      await supabase!.from("schemas").delete().eq("id", schema.id);
      return NextResponse.json(
        { error: fieldsError.message },
        { status: 500 },
      );
    }
  }

  const { data: profile } = await supabase!
    .from("users")
    .select("id, email, full_name")
    .eq("id", userId!)
    .single();

  const creator = profile
    ? { id: profile.id, email: profile.email ?? "", name: profile.full_name ?? "" }
    : undefined;

  return NextResponse.json({
    schema: {
      id: schema.id,
      name: schema.name,
      createdAt: schema.created_at ?? new Date().toISOString(),
      creator,
      fields,
    },
  });
}
