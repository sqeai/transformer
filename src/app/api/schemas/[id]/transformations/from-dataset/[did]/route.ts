import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { randomUUID } from "crypto";
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

interface TransformationMapping {
  step: number;
  tool: string;
  params: Record<string, unknown>;
  phase: "cleansing" | "transformation";
  reasoning?: string;
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

function extractStepsFromMapping(mappings: TransformationMapping[]): SchemaTransformationStep[] {
  return mappings.map((m, index) => ({
    id: randomUUID(),
    order: index,
    tool: m.tool,
    params: m.params,
    phase: m.phase,
    reasoning: m.reasoning,
  }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; did: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId, did: datasetId } = await params;

  // Check schema access
  const { data: schema } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", schemaId)
    .single();
  if (!schema) return NextResponse.json({ error: "Schema not found" }, { status: 404 });

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

  // Fetch the dataset
  const { data: dataset } = await supabase!
    .from("datasets")
    .select("id, name, schema_id, mapping_snapshot")
    .eq("id", datasetId)
    .single();

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  // Verify dataset belongs to this schema
  if (dataset.schema_id !== schemaId) {
    return NextResponse.json({ error: "Dataset does not belong to this schema" }, { status: 400 });
  }

  // Extract mapping from snapshot
  const mappingSnapshot = dataset.mapping_snapshot as { mapping?: TransformationMapping[] } | null;
  const mappings = mappingSnapshot?.mapping ?? [];

  if (mappings.length === 0) {
    return NextResponse.json({ error: "Dataset has no transformation mappings" }, { status: 400 });
  }

  // Parse optional body for name override
  let body: { name?: string; isDefault?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional
  }

  const name = body.name?.trim() || `From: ${dataset.name}`;
  const steps = extractStepsFromMapping(mappings);

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
    description: `Extracted from dataset: ${dataset.name}`,
    is_default: body.isDefault ?? false,
    steps,
    source_dataset_id: datasetId,
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
