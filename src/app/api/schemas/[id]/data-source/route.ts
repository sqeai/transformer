import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";

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
    .select("id, user_id, folder_id")
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

  const { data: sds } = await supabase!
    .from("schema_data_sources")
    .select("*")
    .eq("schema_id", schemaId)
    .maybeSingle();

  let linked = null;
  if (sds) {
    const { data: ds } = await supabase!
      .from("data_sources")
      .select("id, name, type")
      .eq("id", (sds as Record<string, unknown>).data_source_id)
      .single();

    linked = {
      id: (sds as Record<string, unknown>).id,
      schemaId: (sds as Record<string, unknown>).schema_id,
      dataSourceId: (sds as Record<string, unknown>).data_source_id,
      dataSourceName: ds?.name ?? null,
      dataSourceType: ds?.type ?? null,
      tableSchema: (sds as Record<string, unknown>).table_schema,
      tableName: (sds as Record<string, unknown>).table_name,
      isNewTable: (sds as Record<string, unknown>).is_new_table,
      createdAt: (sds as Record<string, unknown>).created_at,
    };
  }

  let availableDataSources: Array<{ id: string; name: string; type: string }> = [];
  if (schema.folder_id) {
    const { data: sources } = await supabase!
      .from("data_sources")
      .select("id, name, type")
      .eq("folder_id", schema.folder_id)
      .order("name");
    availableDataSources = (sources ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      name: s.name as string,
      type: s.type as string,
    }));
  }

  return NextResponse.json({ dataSource: linked, availableDataSources });
}

export async function PUT(
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
  if (schema.user_id !== userId) {
    return NextResponse.json({ error: "Only the schema owner can configure data source" }, { status: 403 });
  }

  let body: {
    dataSourceId: string;
    tableSchema: string;
    tableName: string;
    isNewTable?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.dataSourceId || !body.tableSchema || !body.tableName) {
    return NextResponse.json({ error: "dataSourceId, tableSchema, and tableName are required" }, { status: 400 });
  }

  if (body.isNewTable) {
    const { data: ds } = await supabase!
      .from("data_sources")
      .select("type, config")
      .eq("id", body.dataSourceId)
      .single();
    if (!ds) return NextResponse.json({ error: "Data source not found" }, { status: 404 });

    const { data: fields } = await supabase!
      .from("schema_fields")
      .select("name, data_type, path, level")
      .eq("schema_id", schemaId)
      .order("order");

    const leafFields = (fields ?? []).filter(
      (f: Record<string, unknown>) => {
        const path = f.path as string;
        return !(fields ?? []).some(
          (other: Record<string, unknown>) =>
            (other.path as string).startsWith(path + ".") && other.path !== path,
        );
      },
    );

    const connector = createConnector(ds.type as DataSourceType, ds.config as Record<string, unknown>);
    try {
      const colDefs = leafFields
        .map((f: Record<string, unknown>) => {
          const colName = (f.name as string).replace(/[^a-zA-Z0-9_]/g, "_");
          const colType = (f.data_type as string) || "STRING";
          return `${colName} ${colType}`;
        })
        .join(", ");

      const fqn = `\`${body.tableSchema}.${body.tableName}\``;
      await connector.query(`CREATE TABLE IF NOT EXISTS ${fqn} (${colDefs})`);
    } catch (err: unknown) {
      return NextResponse.json({ error: `Failed to create table: ${(err as Error).message}` }, { status: 500 });
    } finally {
      await connector.close();
    }
  }

  await supabase!.from("schema_data_sources").delete().eq("schema_id", schemaId);

  const { data: inserted, error } = await supabase!
    .from("schema_data_sources")
    .insert({
      schema_id: schemaId,
      data_source_id: body.dataSourceId,
      table_schema: body.tableSchema,
      table_name: body.tableName,
      is_new_table: body.isNewTable ?? false,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    dataSource: {
      id: inserted.id,
      schemaId: inserted.schema_id,
      dataSourceId: inserted.data_source_id,
      tableSchema: inserted.table_schema,
      tableName: inserted.table_name,
      isNewTable: inserted.is_new_table,
      createdAt: inserted.created_at,
    },
  });
}

export async function DELETE(
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
  if (schema.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase!.from("schema_data_sources").delete().eq("schema_id", schemaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
