import { NextRequest, NextResponse } from "next/server";
import { requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function getFolderAndDescendantIds(
  supabase: ReturnType<typeof createAdminClient>,
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

export async function GET(req: NextRequest) {
  const folderId = req.nextUrl.searchParams.get("folderId");
  const includeSubfolders = req.nextUrl.searchParams.get("includeSubfolders") === "true";

  if (!folderId) {
    return NextResponse.json({ error: "folderId required" }, { status: 400 });
  }

  const accessResult = await requireFolderAccess(folderId, "view_panels");
  if (accessResult.error) return accessResult.error;

  const supabase = createAdminClient();

  let folderIds: string[];
  let folderNames = new Map<string, string>();

  if (includeSubfolders) {
    const result = await getFolderAndDescendantIds(supabase, folderId);
    folderIds = result.ids;
    folderNames = result.folderNames;
  } else {
    folderIds = [folderId];
  }

  const { data, error } = await supabase
    .from("dashboards")
    .select("id, name, folder_id, created_by, created_at, updated_at")
    .in("folder_id", folderIds)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (includeSubfolders) {
    return NextResponse.json(
      (data ?? []).map((d) => ({
        ...d,
        folderName: d.folder_id ? folderNames.get(d.folder_id) ?? null : null,
      })),
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const folderId = body.folderId;
  if (!folderId) {
    return NextResponse.json({ error: "folderId required" }, { status: 400 });
  }

  const accessResult = await requireFolderAccess(folderId, "edit_panels");
  if (accessResult.error) return accessResult.error;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("dashboards")
    .insert({
      folder_id: folderId,
      name: body.name || "Untitled Dashboard",
      created_by: accessResult.user.id,
    })
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
