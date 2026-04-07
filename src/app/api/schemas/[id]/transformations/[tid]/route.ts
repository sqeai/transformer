import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import type { SchemaTransformation, SchemaTransformationStep } from "@/lib/types";

interface TransformationRow {
  id: string;
  schema_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  steps: SchemaTransformationStep[];
  source_dataset_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTransformation(row: TransformationRow): SchemaTransformation {
  return {
    id: row.id,
    schemaId: row.schema_id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
    steps: row.steps ?? [],
    sourceDatasetId: row.source_dataset_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId, tid } = await params;

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
    name?: string;
    description?: string | null;
    isDefault?: boolean;
    steps?: SchemaTransformationStep[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate steps if provided: map step must be last if present
  if (body.steps) {
    const mapStepIndex = body.steps.findIndex((s) => s.tool === "map");
    if (mapStepIndex !== -1 && mapStepIndex !== body.steps.length - 1) {
      return NextResponse.json({ error: "Map step must be the last step in the pipeline" }, { status: 400 });
    }
  }

  // If setting as default, unset any existing default first
  if (body.isDefault) {
    await supabase!
      .from("schema_transformations")
      .update({ is_default: false })
      .eq("schema_id", schemaId)
      .eq("is_default", true)
      .neq("id", tid);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description;
  if (typeof body.isDefault === "boolean") updates.is_default = body.isDefault;
  if (body.steps !== undefined) updates.steps = body.steps;

  const { data, error } = await supabase!
    .from("schema_transformations")
    .update(updates)
    .eq("id", tid)
    .eq("schema_id", schemaId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    transformation: rowToTransformation(data as TransformationRow),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId, tid } = await params;

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

  const { error } = await supabase!
    .from("schema_transformations")
    .delete()
    .eq("id", tid)
    .eq("schema_id", schemaId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
