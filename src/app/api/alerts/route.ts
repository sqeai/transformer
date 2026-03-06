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
    .from("alerts")
    .select("*")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

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
    .from("alerts")
    .insert({
      folder_id: folderId,
      name: body.name,
      description: body.description || null,
      data_source_id: body.dataSourceId || null,
      sql_query: body.sqlQuery,
      condition: body.condition || "gt",
      threshold: body.threshold,
      cron_expression: body.cronExpression || "0 * * * *",
      is_active: true,
      created_by: accessResult.user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
