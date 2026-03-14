import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import {
  DEFAULT_BIGQUERY_ID,
  isDefaultBigQueryConfigured,
  getDefaultBigQueryVirtualSource,
} from "@/lib/connectors/default-bigquery";

function redactSensitiveConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const base = { ...(config as Record<string, unknown>) };

  if ("credentials" in base) {
    base.credentials = "***";
  }
  if ("service_account" in base) {
    base.service_account = "***";
  }

  return base;
}

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
    return NextResponse.json({ dataSource: getDefaultBigQueryVirtualSource() });
  }

  const { data, error } = await supabase!
    .from("data_sources")
    .select("id, name, type, config, created_at, updated_at, folder_id")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    dataSource: {
      id: data.id,
      name: data.name,
      type: data.type,
      config: redactSensitiveConfig(data.config),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      folderId: data.folder_id ?? undefined,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  if (id === DEFAULT_BIGQUERY_ID) {
    return NextResponse.json({ error: "Default BigQuery cannot be modified" }, { status: 403 });
  }

  let body: { name?: string; config?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();

  if (body.config && typeof body.config === "object") {
    const sensitiveKeys = ["credentials", "service_account", "password"] as const;
    const hasMissingSensitive = sensitiveKeys.some((k) => !(k in body.config!));

    if (hasMissingSensitive) {
      const { data: existing } = await supabase!
        .from("data_sources")
        .select("config")
        .eq("id", id)
        .single();

      if (existing?.config && typeof existing.config === "object" && !Array.isArray(existing.config)) {
        const existingConfig = existing.config as Record<string, unknown>;
        const merged = { ...body.config };
        for (const key of sensitiveKeys) {
          if (!(key in merged) && key in existingConfig) {
            merged[key] = existingConfig[key];
          }
        }
        updates.config = merged;
      } else {
        updates.config = body.config;
      }
    } else {
      updates.config = body.config;
    }
  }

  const { error } = await supabase!.from("data_sources").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  if (id === DEFAULT_BIGQUERY_ID) {
    return NextResponse.json({ error: "Default BigQuery cannot be deleted" }, { status: 403 });
  }

  const { error } = await supabase!.from("data_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
