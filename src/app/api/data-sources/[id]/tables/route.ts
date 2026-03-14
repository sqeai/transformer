import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";
import {
  DEFAULT_BIGQUERY_ID,
  isDefaultBigQueryConfigured,
  createDefaultBigQueryConnector,
} from "@/lib/connectors/default-bigquery";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  if (id === DEFAULT_BIGQUERY_ID) {
    if (!isDefaultBigQueryConfigured()) {
      return NextResponse.json({ error: "Default BigQuery is not configured" }, { status: 404 });
    }
    const connector = createDefaultBigQueryConnector();
    try {
      const tables = await connector.listTables();
      return NextResponse.json({ tables });
    } catch (err: unknown) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    } finally {
      await connector.close();
    }
  }

  const { data, error } = await supabase!
    .from("data_sources")
    .select("type, config")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Data source not found" }, { status: 404 });
  }

  const connector = createConnector(data.type as DataSourceType, data.config as Record<string, unknown>);
  try {
    const tables = await connector.listTables();
    return NextResponse.json({ tables });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await connector.close();
  }
}
