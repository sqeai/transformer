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

  // Check schema access
  const { data: schema } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", schemaId)
    .single();

  if (!schema) {
    return NextResponse.json({ error: "Schema not found" }, { status: 404 });
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

  // Fetch datasets for this schema
  const { data: datasets, error } = await supabase!
    .from("datasets")
    .select("id, name, row_count, state, created_at, updated_at")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    datasets: (datasets ?? []).map((d: Record<string, unknown>) => ({
      id: d.id,
      name: d.name,
      rowCount: d.row_count ?? 0,
      state: d.state ?? "draft",
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  });
}
