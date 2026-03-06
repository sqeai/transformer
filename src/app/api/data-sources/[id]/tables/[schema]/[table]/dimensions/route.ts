import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; schema: string; table: string }> },
) {
  const result = await requireAuth();
  if (result.error) return result.error;

  const { id, schema, table } = await params;
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("table_dimensions")
    .select("dimensions, last_refreshed_at")
    .eq("data_source_id", id)
    .eq("schema_name", schema)
    .eq("table_name", table)
    .maybeSingle();

  return NextResponse.json({
    dimensions: data?.dimensions ?? [],
    lastRefreshedAt: data?.last_refreshed_at ?? null,
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; schema: string; table: string }> },
) {
  const result = await requireAuth();
  if (result.error) return result.error;

  const { id, schema: schemaName, table: tableName } = await params;
  const supabase = createAdminClient();

  const { data: dsData, error: dsError } = await supabase
    .from("data_sources")
    .select("type, config")
    .eq("id", id)
    .single();

  if (dsError || !dsData) {
    return NextResponse.json(
      { error: "Data source not found" },
      { status: 404 },
    );
  }

  const connector = createConnector(
    dsData.type as DataSourceType,
    dsData.config as Record<string, unknown>,
  );

  try {
    const columns = await connector.getColumns(schemaName, tableName);

    const dimensions: {
      column: string;
      type: string;
      uniqueValues?: string[];
      sampleValues?: string[];
      nullPercentage?: number;
    }[] = [];

    for (const col of columns) {
      const dim: (typeof dimensions)[number] = {
        column: col.name,
        type: col.type ?? "unknown",
      };

      try {
        const countResult = await connector.query(
          `SELECT COUNT(*) as total, COUNT(${quoteIdentifier(col.name)}) as non_null FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`,
        );
        if (countResult.length > 0) {
          const total = Number(countResult[0].total) || 0;
          const nonNull = Number(countResult[0].non_null) || 0;
          dim.nullPercentage =
            total > 0 ? ((total - nonNull) / total) * 100 : 0;
        }
      } catch {
        /* skip null analysis for this column */
      }

      try {
        const distinctResult = await connector.query(
          `SELECT DISTINCT ${quoteIdentifier(col.name)} as val FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(col.name)} IS NOT NULL LIMIT 50`,
        );
        const values = distinctResult.map((r) => String(r.val));
        if (values.length <= 20) {
          dim.uniqueValues = values;
        }
        dim.sampleValues = values.slice(0, 5);
      } catch {
        /* skip distinct analysis for this column */
      }

      dimensions.push(dim);
    }

    const { error: upsertError } = await supabase
      .from("table_dimensions")
      .upsert(
        {
          data_source_id: id,
          schema_name: schemaName,
          table_name: tableName,
          dimensions,
          last_refreshed_at: new Date().toISOString(),
          refreshed_by: result.user.id,
        },
        { onConflict: "data_source_id,schema_name,table_name" },
      );

    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ dimensions, lastRefreshedAt: new Date().toISOString() });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  } finally {
    await connector.close();
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
