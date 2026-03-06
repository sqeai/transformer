import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFieldTypeMap, normalizeRowsForStorage } from "@/lib/dataset-type-normalizer";

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  const { searchParams } = new URL(request.url);
  const schemaId = searchParams.get("schemaId")?.trim() || null;
  const folderId = searchParams.get("folderId")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "20") || 20, 1), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0") || 0, 0);

  const stateFilter = searchParams.get("state")?.trim() || null;
  const assignedToMe = searchParams.get("assignedToMe") === "true";

  const admin = createAdminClient();

  // Get dataset IDs where the user is an approver
  const { data: myApproverRows } = await admin
    .from("dataset_approvers")
    .select("dataset_id")
    .eq("user_id", userId!);
  const approverDatasetIds = new Set(
    (myApproverRows ?? []).map((a: Record<string, unknown>) => a.dataset_id as string)
  );

  // Fetch datasets the user can see via schema RLS
  let query = supabase!
    .from("datasets")
    .select("id, schema_id, name, row_count, state, created_at, updated_at, schemas(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (schemaId) query = query.eq("schema_id", schemaId);
  if (folderId) query = query.eq("folder_id", folderId);
  if (search) query = query.ilike("name", `%${search}%`);
  if (stateFilter) query = query.eq("state", stateFilter);

  const { data: rows, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rlsDatasetIds = new Set((rows ?? []).map((r: Record<string, unknown>) => r.id as string));

  // Fetch additional datasets where user is approver but doesn't have schema access
  const missingIds = [...approverDatasetIds].filter((id) => !rlsDatasetIds.has(id));
  let approverRows: Record<string, unknown>[] = [];
  if (missingIds.length > 0) {
    let approverQuery = admin
      .from("datasets")
      .select("id, schema_id, name, row_count, state, created_at, updated_at, schemas(name)")
      .in("id", missingIds)
      .order("created_at", { ascending: false });

    if (schemaId) approverQuery = approverQuery.eq("schema_id", schemaId);
    if (search) approverQuery = approverQuery.ilike("name", `%${search}%`);
    if (stateFilter) approverQuery = approverQuery.eq("state", stateFilter);

    const { data: extraRows } = await approverQuery;
    approverRows = (extraRows ?? []) as Record<string, unknown>[];
  }

  const mapRow = (r: Record<string, unknown>) => ({
    id: r.id as string,
    schemaId: r.schema_id,
    schemaName: (r.schemas as Record<string, unknown>)?.name ?? null,
    name: r.name,
    rowCount: r.row_count ?? 0,
    state: r.state ?? "draft",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    assignedToMe: approverDatasetIds.has(r.id as string) || undefined,
  });

  const allDatasets = [
    ...(rows ?? []).map((r: Record<string, unknown>) => mapRow(r)),
    ...approverRows.map((r) => mapRow(r)),
  ];

  if (assignedToMe) {
    allDatasets.sort((a, b) => {
      const aAssigned = a.assignedToMe ? 0 : 1;
      const bAssigned = b.assignedToMe ? 0 : 1;
      return aAssigned - bAssigned;
    });
  }

  return NextResponse.json({
    datasets: allDatasets,
    total: (typeof count === "number" ? count : 0) + approverRows.length,
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

  const { data: schemaFieldRows, error: schemaFieldError } = await supabase!
    .from("schema_fields")
    .select("path, data_type")
    .eq("schema_id", schemaId);
  if (schemaFieldError) {
    return NextResponse.json({ error: schemaFieldError.message }, { status: 500 });
  }
  const fieldTypeMap = buildFieldTypeMap(
    ((schemaFieldRows ?? []) as Array<{ path: string; data_type: string | null }>)
  );
  const normalizedRows = normalizeRowsForStorage(rows, fieldTypeMap);

  const { data, error } = await supabase!
    .from("datasets")
    .insert({
      schema_id: schemaId,
      name,
      rows: normalizedRows,
      row_count: normalizedRows.length,
      mapping_snapshot: mappingSnapshot,
    })
    .select("id, schema_id, name, row_count, state, created_at, updated_at")
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
      state: (data as Record<string, unknown>).state ?? "draft",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}
