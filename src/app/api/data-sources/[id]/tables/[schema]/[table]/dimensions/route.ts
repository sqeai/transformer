import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";

type QuoteFn = (name: string) => string;

function getDialectHelpers(type: DataSourceType) {
  const backtickQuote: QuoteFn = (name) => `\`${name.replace(/`/g, "\\`")}\``;
  const doubleQuote: QuoteFn = (name) => `"${name.replace(/"/g, '""')}"`;

  switch (type) {
    case "bigquery":
      return {
        quoteId: backtickQuote,
        tableRef: (schema: string, table: string) =>
          `\`${schema}.${table}\``,
      };
    case "mysql":
      return {
        quoteId: backtickQuote,
        tableRef: (schema: string, table: string) =>
          `${backtickQuote(schema)}.${backtickQuote(table)}`,
      };
    default:
      return {
        quoteId: doubleQuote,
        tableRef: (schema: string, table: string) =>
          `${doubleQuote(schema)}.${doubleQuote(table)}`,
      };
  }
}

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

  const dsType = dsData.type as DataSourceType;
  const connector = createConnector(
    dsType,
    dsData.config as Record<string, unknown>,
  );
  const { quoteId, tableRef: buildTableRef } = getDialectHelpers(dsType);

  try {
    const columns = await connector.getColumns(schemaName, tableName);

    const dimensions: {
      column: string;
      type: string;
      distinctCount?: number;
      uniqueValues?: string[];
      sampleValues?: string[];
      nullPercentage?: number;
    }[] = [];

    for (const col of columns) {
      const dim: (typeof dimensions)[number] = {
        column: col.name,
        type: col.type ?? "unknown",
      };
      const colRef = quoteId(col.name);
      const tableRef = buildTableRef(schemaName, tableName);

      try {
        const countResult = await connector.query(
          `SELECT COUNT(*) as total, COUNT(${colRef}) as non_null FROM ${tableRef}`,
        );
        if (countResult.length > 0) {
          const total = Number(countResult[0].total) || 0;
          const nonNull = Number(countResult[0].non_null) || 0;
          dim.nullPercentage =
            total > 0 ? ((total - nonNull) / total) * 100 : 0;
        }
      } catch (err) {
        console.warn(`[dimensions] null-analysis failed for ${schemaName}.${tableName}.${col.name}:`, err instanceof Error ? err.message : err);
      }

      const important = isDimensionColumn(col.type ?? "unknown", col.name);
      const uniqueLimit = important ? 200 : 50;

      try {
        const distinctResult = await connector.query(
          `SELECT DISTINCT ${colRef} as val FROM ${tableRef} WHERE ${colRef} IS NOT NULL LIMIT ${uniqueLimit + 1}`,
        );
        const values = distinctResult.map((r) => String(r.val));
        const isLowCardinality = values.length <= uniqueLimit;

        dim.distinctCount = isLowCardinality ? values.length : undefined;

        if (isLowCardinality) {
          dim.uniqueValues = values;
        }
        dim.sampleValues = values.slice(0, 5);
      } catch (err) {
        console.warn(`[dimensions] distinct-values failed for ${schemaName}.${tableName}.${col.name}:`, err instanceof Error ? err.message : err);
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
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dimensions] Failed to refresh dimensions for ${schemaName}.${tableName}:`, err);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  } finally {
    await connector.close();
  }
}

const DIMENSION_TYPE_PATTERNS = /^(varchar|character varying|text|char|nvarchar|nchar|enum|boolean|bool|bit|smallint|tinyint|user-defined|citext)/i;
const SKIP_NAME_PATTERNS = /^(id|uuid|guid|created|updated|modified|deleted|_at$|_id$|password|hash|token|secret|salt)/i;
const IMPORTANT_NAME_PATTERNS = /(?:^|_)(class|category|categories|type|types|status|state|group|segment|tier|level|region|country|currency|channel|source|tag|tags|label|labels|key_metric|metric|department|division|role|priority|severity|phase|stage|kind|mode|plan|grade|rank|bucket|cohort|vertical|industry|sector|flag)(?:$|_|s$)/i;

function isDimensionColumn(type: string, name: string): boolean {
  if (IMPORTANT_NAME_PATTERNS.test(name)) return true;
  if (SKIP_NAME_PATTERNS.test(name)) return false;
  return DIMENSION_TYPE_PATTERNS.test(type);
}
