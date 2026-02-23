import { NextRequest, NextResponse } from "next/server";
import { rowsToFields, fieldsToRows } from "@/lib/schema-db";
import type { SchemaFieldRow } from "@/lib/schema-db";
import { getAuth } from "@/lib/api-auth";
import type { SchemaField } from "@/lib/types";

export async function GET() {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  const { data: schemaRows, error: schemaError } = await supabase!
    .from("schemas")
    .select("id, name, created_at, user_id")
    .eq("user_id", userId!)
    .order("created_at", { ascending: false });

  if (schemaError) {
    console.error("Schemas list error:", schemaError);
    return NextResponse.json(
      { error: schemaError.message },
      { status: 500 },
    );
  }

  const { data: profile } = await supabase!
    .from("users")
    .select("id, email, full_name")
    .eq("id", userId!)
    .single();

  const creator = profile
    ? { id: profile.id, email: profile.email ?? "", name: profile.full_name ?? "" }
    : undefined;

  const schemas = (schemaRows ?? []).map((s: { id: string; name: string; created_at: string }) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at ?? new Date().toISOString(),
    creator,
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

  return NextResponse.json({ schemas });
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  let body: { name?: string; fields?: SchemaField[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const fields = Array.isArray(body?.fields) ? (body.fields as SchemaField[]) : [];
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: schema, error: schemaError } = await supabase!
    .from("schemas")
    .insert({ user_id: userId!, name })
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
