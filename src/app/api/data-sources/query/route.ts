import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType, Connector } from "@/lib/connectors";
import {
  DEFAULT_BIGQUERY_ID,
  isDefaultBigQueryConfigured,
  createDefaultBigQueryConnector,
} from "@/lib/connectors/default-bigquery";

const MAX_ROWS = 500;

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let body: { dataSourceId: string; sql: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { dataSourceId, sql } = body;
  if (!dataSourceId || !sql) {
    return NextResponse.json(
      { error: "dataSourceId and sql are required" },
      { status: 400 },
    );
  }

  const upperSql = sql.trim().toUpperCase();
  if (
    !upperSql.startsWith("SELECT") &&
    !upperSql.startsWith("WITH") &&
    !upperSql.startsWith("SHOW") &&
    !upperSql.startsWith("DESCRIBE") &&
    !upperSql.startsWith("EXPLAIN")
  ) {
    return NextResponse.json(
      { error: "Only read-only queries (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN) are allowed" },
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
    const { data, error } = await supabase!
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
    const truncated = rows.length > MAX_ROWS;
    return NextResponse.json({
      rows: rows.slice(0, MAX_ROWS),
      rowCount: rows.length,
      truncated,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  } finally {
    await connector.close();
  }
}
