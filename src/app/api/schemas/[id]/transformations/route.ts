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

  const { data: transformations, error } = await supabase!
    .from("schema_transformations")
    .select("*")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (transformations ?? []).map((t: TransformationRow) => rowToTransformation(t));

  return NextResponse.json({ transformations: list });
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
    name?: string;
    description?: string;
    isDefault?: boolean;
    steps?: SchemaTransformationStep[];
    sourceDatasetId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim() || "New Pipeline";
  const steps = body.steps ?? [];

  // Validate steps: map step must be last if present
  const mapStepIndex = steps.findIndex((s) => s.tool === "map");
  if (mapStepIndex !== -1 && mapStepIndex !== steps.length - 1) {
    return NextResponse.json({ error: "Map step must be the last step in the pipeline" }, { status: 400 });
  }

  // If setting as default, unset any existing default
  if (body.isDefault) {
    await supabase!
      .from("schema_transformations")
      .update({ is_default: false })
      .eq("schema_id", schemaId)
      .eq("is_default", true);
  }

  const insert: Record<string, unknown> = {
    schema_id: schemaId,
    name,
    description: body.description ?? null,
    is_default: body.isDefault ?? false,
    steps,
    source_dataset_id: body.sourceDatasetId ?? null,
  };

  const { data, error } = await supabase!
    .from("schema_transformations")
    .insert(insert)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    transformation: rowToTransformation(data as TransformationRow),
  });
}
