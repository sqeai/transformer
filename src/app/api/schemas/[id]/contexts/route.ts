import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import type { BigQueryConfig } from "@/lib/connectors/types";

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

  const { data: contexts, error } = await supabase!
    .from("schema_contexts")
    .select("*")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (contexts ?? []).map((c: Record<string, unknown>) => ({
    id: c.id,
    schemaId: c.schema_id,
    type: c.type,
    name: c.name,
    content: c.content ?? null,
    dataSourceId: c.data_source_id ?? null,
    bqProject: c.bq_project ?? null,
    bqDataset: c.bq_dataset ?? null,
    bqTable: c.bq_table ?? null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));

  return NextResponse.json({ contexts: list });
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

  let body: {
    type?: string;
    name?: string;
    content?: string;
    dataSourceId?: string;
    bqProject?: string;
    bqDataset?: string;
    bqTable?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validTypes = ["lookup_table", "validation", "text_instructions"];
  if (!body.type || !validTypes.includes(body.type)) {
    return NextResponse.json({ error: "type must be one of: lookup_table, validation, text_instructions" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    schema_id: schemaId,
    type: body.type,
    name: body.name.trim(),
    content: body.content ?? null,
  };

  if (body.type === "lookup_table") {
    if (!body.dataSourceId) {
      return NextResponse.json({ error: "dataSourceId is required for lookup_table" }, { status: 400 });
    }
    insert.data_source_id = body.dataSourceId;
    insert.bq_dataset = body.bqDataset ?? null;
    insert.bq_table = body.bqTable ?? null;

    let bqProject = body.bqProject ?? null;
    if (!bqProject && body.dataSourceId) {
      const { data: ds } = await supabase!
        .from("data_sources")
        .select("config")
        .eq("id", body.dataSourceId)
        .single();
      if (ds?.config) {
        bqProject = (ds.config as BigQueryConfig).projectId ?? null;
      }
    }
    insert.bq_project = bqProject;
  }

  const { data, error } = await supabase!
    .from("schema_contexts")
    .insert(insert)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    context: {
      id: data.id,
      schemaId: data.schema_id,
      type: data.type,
      name: data.name,
      content: data.content ?? null,
      dataSourceId: data.data_source_id ?? null,
      bqProject: data.bq_project ?? null,
      bqDataset: data.bq_dataset ?? null,
      bqTable: data.bq_table ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}
