import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType, Connector } from "@/lib/connectors";
import {
  DEFAULT_BIGQUERY_ID,
  isDefaultBigQueryConfigured,
  createDefaultBigQueryConnector,
} from "@/lib/connectors/default-bigquery";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;

    const body = await req.json();
    const dataSourceId: string = body.dataSourceId;
    const sql: string = body.sql;

    if (!dataSourceId || !sql?.trim()) {
      return NextResponse.json(
        { error: "dataSourceId and sql are required" },
        { status: 400 },
      );
    }

    const upperSql = sql.trim().toUpperCase();
    if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("WITH")) {
      return NextResponse.json(
        { error: "Only SELECT/WITH queries are allowed" },
        { status: 400 },
      );
    }

    let connector: Connector;

    if (dataSourceId === DEFAULT_BIGQUERY_ID) {
      if (!isDefaultBigQueryConfigured()) {
        return NextResponse.json(
          { error: "Default BigQuery is not configured" },
          { status: 404 },
        );
      }
      connector = createDefaultBigQueryConnector();
    } else {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("data_sources")
        .select("type, config")
        .eq("id", dataSourceId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Data source not found" },
          { status: 404 },
        );
      }

      connector = createConnector(
        data.type as DataSourceType,
        data.config as Record<string, unknown>,
      );
    }

    try {
      const rows = await connector.query(sql);
      return NextResponse.json({
        rows: rows.slice(0, 200),
        rowCount: rows.length,
      });
    } catch (err: unknown) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 500 },
      );
    } finally {
      await connector.close();
    }
  } catch (e: unknown) {
    const error = e as Error & { status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
