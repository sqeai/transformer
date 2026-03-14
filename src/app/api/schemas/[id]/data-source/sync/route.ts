import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType, ColumnInfo } from "@/lib/connectors";
import { rowsToFields } from "@/lib/schema-db";
import type { SchemaFieldRow } from "@/lib/schema-db";
import type { SchemaField } from "@/lib/types";

function columnsToFields(columns: ColumnInfo[]): SchemaField[] {
  return columns.map((col, i) => ({
    id: crypto.randomUUID(),
    name: col.name,
    path: col.name,
    level: 1,
    order: i,
    dataType: mapColumnType(col.type),
  }));
}

function mapColumnType(dbType: string): SchemaField["dataType"] {
  const t = dbType.toUpperCase();
  if (t.includes("INT")) return "INTEGER";
  if (t.includes("FLOAT") || t.includes("DOUBLE") || t.includes("REAL")) return "FLOAT";
  if (t.includes("NUMERIC") || t.includes("DECIMAL")) return "NUMERIC";
  if (t.includes("BOOL")) return "BOOLEAN";
  if (t.includes("DATETIME")) return "DATETIME";
  if (t.includes("TIMESTAMP")) return "TIMESTAMP";
  if (t === "DATE") return "DATE";
  return "STRING";
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
  if (schema.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { direction: "push" | "pull" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!["push", "pull"].includes(body.direction)) {
    return NextResponse.json({ error: "direction must be 'push' or 'pull'" }, { status: 400 });
  }

  const { data: sds } = await supabase!
    .from("schema_data_sources")
    .select("*")
    .eq("schema_id", schemaId)
    .single();
  if (!sds) return NextResponse.json({ error: "No data source linked to this schema" }, { status: 400 });

  const { data: ds } = await supabase!
    .from("data_sources")
    .select("type, config")
    .eq("id", (sds as Record<string, unknown>).data_source_id)
    .single();
  if (!ds) return NextResponse.json({ error: "Data source not found" }, { status: 404 });

  const connector = createConnector(ds.type as DataSourceType, ds.config as Record<string, unknown>);
  try {
    if (body.direction === "pull") {
      const columns = await connector.getColumns(
        (sds as Record<string, unknown>).table_schema as string,
        (sds as Record<string, unknown>).table_name as string,
      );
      const newFields = columnsToFields(columns);

      const { fieldsToRows } = await import("@/lib/schema-db");
      await supabase!.from("schema_fields").delete().eq("schema_id", schemaId);
      const rows = fieldsToRows(schemaId, newFields);
      if (rows.length > 0) {
        const { error: insertError } = await supabase!.from("schema_fields").insert(rows);
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      await supabase!.from("schemas").update({ updated_at: new Date().toISOString() }).eq("id", schemaId);

      return NextResponse.json({ ok: true, fields: newFields, direction: "pull" });
    }

    // push: schema fields -> DB columns
    const { data: fieldRows } = await supabase!
      .from("schema_fields")
      .select("*")
      .eq("schema_id", schemaId)
      .order("level")
      .order("order");

    const fields = rowsToFields((fieldRows ?? []) as SchemaFieldRow[]);
    const flatFields = flattenForSync(fields);

    const existingColumns = await connector.getColumns(
      (sds as Record<string, unknown>).table_schema as string,
      (sds as Record<string, unknown>).table_name as string,
    );
    const existingNames = new Set(existingColumns.map((c) => c.name.toLowerCase()));

    const fqn = `\`${(sds as Record<string, unknown>).table_schema}.${(sds as Record<string, unknown>).table_name}\``;
    for (const f of flatFields) {
      const colName = f.name.replace(/[^a-zA-Z0-9_]/g, "_");
      if (!existingNames.has(colName.toLowerCase())) {
        const colType = f.dataType || "STRING";
        await connector.query(`ALTER TABLE ${fqn} ADD COLUMN ${colName} ${colType}`);
      }
    }

    return NextResponse.json({ ok: true, direction: "push" });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await connector.close();
  }
}

function flattenForSync(fields: SchemaField[]): SchemaField[] {
  const result: SchemaField[] = [];
  for (const f of fields) {
    if (f.children?.length) {
      result.push(...flattenForSync(f.children));
    } else {
      result.push(f);
    }
  }
  return result;
}
