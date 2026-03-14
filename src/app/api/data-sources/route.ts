import { NextRequest, NextResponse } from "next/server";
import { getAuth, requireFolderAccess } from "@/lib/api-auth";
import {
  isDefaultBigQueryConfigured,
  getDefaultBigQueryVirtualSource,
} from "@/lib/connectors/default-bigquery";

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

/**
 * Get folderId and all descendant folder IDs (so a parent folder sees data sources from subfolders).
 * Returns both the list of IDs and a map of folderId -> folderName.
 */
async function getFolderAndDescendantIds(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>,
  folderId: string,
): Promise<{ ids: string[]; folderNames: Map<string, string> }> {
  const { data: folders, error } = await supabase
    .from("folders")
    .select("id, parent_id, name");
  if (error || !folders) return { ids: [folderId], folderNames: new Map() };
  const byParent = new Map<string | null, { id: string; name: string }[]>();
  const nameMap = new Map<string, string>();
  for (const f of folders) {
    nameMap.set(f.id, f.name);
    const list = byParent.get(f.parent_id) ?? [];
    list.push({ id: f.id, name: f.name });
    byParent.set(f.parent_id, list);
  }
  const ids: string[] = [folderId];
  const queue = [folderId];
  while (queue.length) {
    const pid = queue.shift()!;
    const children = byParent.get(pid) ?? [];
    for (const c of children) {
      ids.push(c.id);
      queue.push(c.id);
    }
  }
  return { ids, folderNames: nameMap };
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

  let folderNames = new Map<string, string>();

  if (folderId) {
    const access = await requireFolderAccess(folderId, "view_data_sources");
    if (access.error) return access.error;
    const result = await getFolderAndDescendantIds(supabase!, folderId);
    folderNames = result.folderNames;
    query = query.in("folder_id", result.ids);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dataSources = (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    config: redactSensitiveConfig(d.config),
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    folderId: d.folder_id,
    folderName: d.folder_id ? folderNames.get(d.folder_id) ?? null : null,
  }));

  if (isDefaultBigQueryConfigured()) {
    const defaultDs = getDefaultBigQueryVirtualSource();
    dataSources.unshift({
      ...defaultDs,
      folderId: undefined as unknown as typeof dataSources[number]["folderId"],
      folderName: null,
    });
  }

  return NextResponse.json({ dataSources });
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
