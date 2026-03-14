import { NextRequest, NextResponse } from "next/server";
import { rowsToFields } from "@/lib/schema-db";
import type { SchemaFieldRow } from "@/lib/schema-db";
import { getAuth } from "@/lib/api-auth";
import type { SchemaField } from "@/lib/types";
import { detectSchemaChanges, generateBigQueryDDL } from "@/lib/schema-changes";
import { isDefaultBqDataSourceId, createDefaultBigQueryConnector } from "@/lib/connectors/default-bigquery";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType, Connector } from "@/lib/connectors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  const { data: schema, error: schemaError } = await supabase!
    .from("schemas")
    .select("id, name, folder_id, created_at, updated_at, user_id")
    .eq("id", id)
    .single();

  if (schemaError || !schema) {
    return NextResponse.json(
      { error: schemaError?.message ?? "Not found" },
      { status: schemaError?.code === "PGRST116" ? 404 : 500 },
    );
  }

  const isOwner = schema.user_id === userId;
  const { data: grantRow } = await supabase!
    .from("schema_grants")
    .select("schema_id")
    .eq("schema_id", id)
    .eq("granted_to_user_id", userId!)
    .maybeSingle();
  const hasGrant = !!grantRow;
  if (!isOwner && !hasGrant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: profile } = await supabase!
    .from("users")
    .select("id, email, full_name")
    .eq("id", schema.user_id)
    .single();

  const creator = profile
    ? { id: profile.id, email: profile.email ?? "", name: profile.full_name ?? "" }
    : undefined;

  const { data: fieldRows, error: fieldError } = await supabase!
    .from("schema_fields")
    .select("*")
    .eq("schema_id", id)
    .order("level", { ascending: true })
    .order("order", { ascending: true });

  if (fieldError) {
    return NextResponse.json(
      { error: fieldError.message },
      { status: 500 },
    );
  }

  const fields = rowsToFields((fieldRows ?? []) as SchemaFieldRow[]);

  return NextResponse.json({
    schema: {
      id: schema.id,
      name: schema.name,
      folderId: (schema as Record<string, unknown>).folder_id ?? null,
      createdAt: schema.created_at ?? new Date().toISOString(),
      updatedAt: schema.updated_at ?? schema.created_at ?? new Date().toISOString(),
      creator,
      fields,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  const { data: existing } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = existing.user_id === userId;
  const { data: grantRow } = await supabase!
    .from("schema_grants")
    .select("schema_id")
    .eq("schema_id", id)
    .eq("granted_to_user_id", userId!)
    .maybeSingle();
  const hasGrant = !!grantRow;
  if (!isOwner && !hasGrant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string; fields?: SchemaField[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body?.name === "string" && body.name.trim()) {
    const { error: updateError } = await supabase!
      .from("schemas")
      .update({ name: body.name.trim() })
      .eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  if (Array.isArray(body?.fields)) {
    const { fieldsToRows } = await import("@/lib/schema-db");
    const fields = body.fields;

    // Check if schema has a linked data source and apply DDL changes
    const { data: sds } = await supabase!
      .from("schema_data_sources")
      .select("data_source_id, table_schema, table_name")
      .eq("schema_id", id)
      .maybeSingle();

    if (sds) {
      const sdsRec = sds as Record<string, unknown>;

      // Get current fields before updating
      const { data: currentFieldRows } = await supabase!
        .from("schema_fields")
        .select("*")
        .eq("schema_id", id)
        .order("level")
        .order("order");
      const currentFields = rowsToFields((currentFieldRows ?? []) as SchemaFieldRow[]);

      const changes = detectSchemaChanges(currentFields, fields);
      if (changes.length > 0) {
        const fqn = `\`${sdsRec.table_schema}.${sdsRec.table_name}\``;
        const ddlStatements = generateBigQueryDDL(fqn, changes);

        let connector: Connector | null = null;
        try {
          const isDefault = await isDefaultBqDataSourceId(sdsRec.data_source_id as string);
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
            for (const stmt of ddlStatements) {
              try {
                await connector.query(stmt);
              } catch (ddlErr: unknown) {
                console.error(`DDL failed: ${stmt}`, (ddlErr as Error).message);
              }
            }
          }
        } catch (err: unknown) {
          console.error("Schema sync DDL error:", (err as Error).message);
        } finally {
          if (connector) await connector.close();
        }
      }
    }

    await supabase!.from("schema_fields").delete().eq("schema_id", id);
    const rows = fieldsToRows(id, fields);
    if (rows.length > 0) {
      const { error: insertError } = await supabase!
        .from("schema_fields")
        .insert(rows);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
    await supabase!.from("schemas").update({ updated_at: new Date().toISOString() }).eq("id", id);
  }

  if (!Array.isArray(body?.fields) && typeof body?.name !== "string") {
    await supabase!.from("schemas").update({ updated_at: new Date().toISOString() }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  const { data: existing } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase!.from("schemas").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
