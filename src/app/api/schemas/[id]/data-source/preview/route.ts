import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType, Connector } from "@/lib/connectors";
import { isDefaultBqDataSourceId, createDefaultBigQueryConnector } from "@/lib/connectors/default-bigquery";

export async function GET(
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

  const { data: sds } = await supabase!
    .from("schema_data_sources")
    .select("*")
    .eq("schema_id", schemaId)
    .single();
  if (!sds) return NextResponse.json({ error: "No data source linked" }, { status: 400 });

  const sdsRec = sds as Record<string, unknown>;
  let connector: Connector;

  const isDefault = await isDefaultBqDataSourceId(sdsRec.data_source_id as string);
  if (isDefault) {
    const defaultConn = createDefaultBigQueryConnector();
    if (!defaultConn) return NextResponse.json({ error: "Default BigQuery not configured" }, { status: 500 });
    connector = defaultConn;
  } else {
    const { data: ds } = await supabase!
      .from("data_sources")
      .select("type, config")
      .eq("id", sdsRec.data_source_id)
      .single();
    if (!ds) return NextResponse.json({ error: "Data source not found" }, { status: 404 });
    connector = createConnector(ds.type as DataSourceType, ds.config as Record<string, unknown>);
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const filterCol = searchParams.get("filterColumn");
  const filterVal = searchParams.get("filterValue");

  try {
    const tSchema = sdsRec.table_schema as string;
    const tName = sdsRec.table_name as string;

    let rows: Record<string, unknown>[];
    if (filterCol && filterVal) {
      const colSafe = filterCol.replace(/[^a-zA-Z0-9_]/g, "_");
      const fqn = `\`${tSchema}.${tName}\``;
      rows = await connector.query(
        `SELECT * FROM ${fqn} WHERE CAST(${colSafe} AS STRING) LIKE '%${filterVal.replace(/'/g, "''")}%' LIMIT ${limit}`,
      );
    } else {
      rows = await connector.previewData(tSchema, tName, limit);
    }

    return NextResponse.json({ rows });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await connector.close();
  }
}
