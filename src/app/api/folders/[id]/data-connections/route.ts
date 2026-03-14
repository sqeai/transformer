import { NextRequest, NextResponse } from "next/server";
import { requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_BIGQUERY_ID,
  DEFAULT_BIGQUERY_NAME,
  isDefaultBigQueryConfigured,
} from "@/lib/connectors/default-bigquery";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "view_data_sources");
  if (access.error) return access.error;

  const supabase = createAdminClient();

  const { data: connections, error } = await supabase
    .from("folder_data_connections")
    .select("id, data_source_id, data_sources(id, name, type)")
    .eq("folder_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dataSources: { id: string; name: string; type: string; connectionId?: string; isDefault?: boolean }[] = [];

  if (isDefaultBigQueryConfigured()) {
    dataSources.push({
      id: DEFAULT_BIGQUERY_ID,
      name: DEFAULT_BIGQUERY_NAME,
      type: "bigquery",
      isDefault: true,
    });
  }

  for (const c of connections ?? []) {
    const ds = c.data_sources as unknown as {
      id: string;
      name: string;
      type: string;
    };
    dataSources.push({
      id: ds?.id ?? c.data_source_id,
      name: ds?.name ?? "",
      type: ds?.type ?? "",
      connectionId: c.id,
    });
  }

  return NextResponse.json({ dataSources });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireFolderAccess(id, "manage_folder");
  if (access.error) return access.error;

  let body: { dataSourceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dataSourceId = body.dataSourceId;
  if (!dataSourceId) {
    return NextResponse.json(
      { error: "dataSourceId is required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: ds } = await supabase
    .from("data_sources")
    .select("id")
    .eq("id", dataSourceId)
    .maybeSingle();

  if (!ds) {
    return NextResponse.json(
      { error: "Data source not found" },
      { status: 404 },
    );
  }

  const { error } = await supabase.from("folder_data_connections").insert({
    folder_id: id,
    data_source_id: dataSourceId,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Data source already linked to this folder" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
