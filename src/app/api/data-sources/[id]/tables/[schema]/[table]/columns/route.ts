import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; schema: string; table: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id, schema, table } = await params;

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
    const columns = await connector.getColumns(schema, table);
    return NextResponse.json({ columns });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await connector.close();
  }
}
