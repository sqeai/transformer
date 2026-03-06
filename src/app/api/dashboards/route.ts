import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const supabase = createAdminClient();
  const folderId = req.nextUrl.searchParams.get("folderId");

  if (!folderId) {
    return NextResponse.json({ error: "folderId required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("dashboards")
    .select("id, name, created_by, created_at, updated_at")
    .eq("folder_id", folderId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const folderId = body.folderId;
  if (!folderId) {
    return NextResponse.json({ error: "folderId required" }, { status: 400 });
  }

  const accessResult = await requireFolderAccess(folderId, "edit_resources");
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
