import { NextRequest, NextResponse } from "next/server";
import { requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_BIGQUERY_ID,
  DEFAULT_BIGQUERY_NAME,
} from "@/lib/connectors/default-bigquery";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "view_context");
  if (access.error) return access.error;

  const supabase = createAdminClient();

  const { data: context } = await supabase
    .from("folder_contexts")
    .select("id, content, updated_at")
    .eq("folder_id", id)
    .maybeSingle();

  let tables: { dataSourceId: string; dataSourceName: string; schemaName: string; tableName: string }[] = [];
  if (context) {
    const { data: contextTables } = await supabase
      .from("folder_context_tables")
      .select("id, data_source_id, schema_name, table_name")
      .eq("folder_context_id", context.id);

    if (contextTables && contextTables.length > 0) {
      const dsIds = [...new Set(contextTables.map((t) => t.data_source_id))];
      const dbDsIds = dsIds.filter((dsId) => dsId !== DEFAULT_BIGQUERY_ID);
      const { data: dsSources } = dbDsIds.length > 0
        ? await supabase.from("data_sources").select("id, name").in("id", dbDsIds)
        : { data: [] };

      const dsMap = new Map((dsSources ?? []).map((d) => [d.id, d.name]));
      dsMap.set(DEFAULT_BIGQUERY_ID, DEFAULT_BIGQUERY_NAME);

      tables = contextTables.map((t) => ({
        dataSourceId: t.data_source_id,
        dataSourceName: dsMap.get(t.data_source_id) ?? "",
        schemaName: t.schema_name,
        tableName: t.table_name,
      }));
    }
  }

  return NextResponse.json({
    content: context?.content ?? "",
    tables,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "edit_context");
  if (access.error) return access.error;

  let body: {
    content?: string;
    tables?: { dataSourceId: string; schemaName: string; tableName: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Upsert context
  const { data: existing } = await supabase
    .from("folder_contexts")
    .select("id")
    .eq("folder_id", id)
    .maybeSingle();

  let contextId: string;

  if (existing) {
    contextId = existing.id;
    await supabase
      .from("folder_contexts")
      .update({
        content: body.content ?? "",
        updated_by: access.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contextId);
  } else {
    const { data: newCtx, error } = await supabase
      .from("folder_contexts")
      .insert({
        folder_id: id,
        content: body.content ?? "",
        updated_by: access.user.id,
      })
      .select("id")
      .single();

    if (error || !newCtx) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create context" },
        { status: 500 },
      );
    }
    contextId = newCtx.id;
  }

  // Replace context tables
  if (Array.isArray(body.tables)) {
    await supabase
      .from("folder_context_tables")
      .delete()
      .eq("folder_context_id", contextId);

    if (body.tables.length > 0) {
      const rows = body.tables.map((t) => ({
        folder_context_id: contextId,
        data_source_id: t.dataSourceId,
        schema_name: t.schemaName,
        table_name: t.tableName,
      }));
      await supabase.from("folder_context_tables").insert(rows);
    }
  }

  return NextResponse.json({ ok: true });
}
