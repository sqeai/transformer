import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";

function toThreeLinePreview(value: unknown): string {
  if (value == null) return "***";

  let normalized: unknown = value;
  if (typeof value === "string") {
    try {
      normalized = JSON.parse(value);
    } catch {
      return value.split("\n").slice(0, 3).join("\n");
    }
  }

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return "***";
  }

  const redacted = { ...(normalized as Record<string, unknown>) };
  if ("private_key" in redacted) {
    redacted.private_key = "***";
  }

  return JSON.stringify(redacted, null, 2).split("\n").slice(0, 3).join("\n");
}

function redactSensitiveConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const base = { ...(config as Record<string, unknown>) };

  if ("credentials" in base) {
    base.credentials = toThreeLinePreview(base.credentials);
  }
  if ("service_account" in base) {
    base.service_account = toThreeLinePreview(base.service_account);
  }

  return base;
}

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId")?.trim() || null;

  let query = supabase!
    .from("data_sources")
    .select("id, name, type, config, created_at, updated_at, folder_id")
    .order("created_at", { ascending: false });

  if (folderId) {
    query = query.eq("folder_id", folderId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    dataSources: (data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      config: redactSensitiveConfig(d.config),
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  let body: { name?: string; type?: string; config?: Record<string, unknown>; folderId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type;
  const config = body.config ?? {};
  const folderId = typeof body.folderId === "string" ? body.folderId.trim() : null;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const validTypes = ["bigquery", "mysql", "postgres", "redshift"];
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const insertData: Record<string, unknown> = { user_id: userId!, name, type, config };
  if (folderId) insertData.folder_id = folderId;

  const { data, error } = await supabase!
    .from("data_sources")
    .insert(insertData)
    .select("id, name, type, config, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    dataSource: {
      id: data.id,
      name: data.name,
      type: data.type,
      config: data.config,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}
