import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { rowsToFields } from "@/lib/schema-db";
import type { SchemaFieldRow } from "@/lib/schema-db";
import type { SchemaField } from "@/lib/types";
import { detectSchemaChanges, describeChanges } from "@/lib/schema-changes";
import { isDefaultBqDataSourceId, createDefaultBigQueryConnector } from "@/lib/connectors/default-bigquery";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";

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

  let body: { fields: SchemaField[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.fields)) {
    return NextResponse.json({ error: "fields array is required" }, { status: 400 });
  }

  const { data: sds } = await supabase!
    .from("schema_data_sources")
    .select("data_source_id, table_schema, table_name")
    .eq("schema_id", schemaId)
    .maybeSingle();

  if (!sds) {
    return NextResponse.json({
      hasDataSource: false,
      changes: [],
      descriptions: [],
    });
  }

  const { data: fieldRows } = await supabase!
    .from("schema_fields")
    .select("*")
    .eq("schema_id", schemaId)
    .order("level")
    .order("order");

  const currentFields = rowsToFields((fieldRows ?? []) as SchemaFieldRow[]);
  const changes = detectSchemaChanges(currentFields, body.fields);
  const descriptions = describeChanges(changes);

  const sdsRec = sds as Record<string, unknown>;
  const isDefault = await isDefaultBqDataSourceId(sdsRec.data_source_id as string);

  let hasData = false;
  if (changes.length > 0) {
    try {
      let connector;
      if (isDefault) {
        connector = createDefaultBigQueryConnector();
      } else {
        const { data: ds } = await supabase!
          .from("data_sources")
          .select("type, config")
          .eq("id", sdsRec.data_source_id)
          .single();
        if (ds) {
          connector = createConnector(
            ds.type as DataSourceType,
            ds.config as Record<string, unknown>,
          );
        }
      }

      if (connector) {
        try {
          const fqn = `\`${sdsRec.table_schema}.${sdsRec.table_name}\``;
          const result = await connector.query(`SELECT COUNT(*) as cnt FROM ${fqn}`);
          hasData = Number(result?.[0]?.cnt ?? 0) > 0;
        } finally {
          await connector.close();
        }
      }
    } catch {
      // If we can't check, assume no data
    }
  }

  return NextResponse.json({
    hasDataSource: true,
    isDefault,
    changes,
    descriptions,
    hasData,
  });
}
