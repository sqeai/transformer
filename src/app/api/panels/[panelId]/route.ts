import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ panelId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { panelId } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("dashboard_panels")
    .select("*, dashboards!inner(folder_id)")
    .eq("id", panelId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  const folderId = (data.dashboards as unknown as { folder_id: string })?.folder_id;
  const access = await requireFolderAccess(folderId, "view_panels");
  if (access.error) return access.error;

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { panelId } = await params;
  const supabase = createAdminClient();

  const { data: panel } = await supabase
    .from("dashboard_panels")
    .select("dashboard_id, dashboards(folder_id)")
    .eq("id", panelId)
    .maybeSingle();

  if (!panel) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  const folderId = (panel.dashboards as unknown as { folder_id: string })?.folder_id;
  const access = await requireFolderAccess(folderId, "edit_panels");
  if (access.error) return access.error;

  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.chartType !== undefined) updates.chart_type = body.chartType;
  if (body.sqlQuery !== undefined) updates.sql_query = body.sqlQuery;
  if (body.data !== undefined) updates.data = body.data;
  if (body.config !== undefined) updates.config = body.config;
  if (body.width !== undefined) updates.width = body.width;
  if (body.height !== undefined) updates.height = body.height;
  if (body.colSpan !== undefined) updates.col_span = body.colSpan;
  if (body.prompt !== undefined) updates.prompt = body.prompt;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("dashboard_panels")
    .update(updates)
    .eq("id", panelId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { panelId } = await params;
  const supabase = createAdminClient();

  const { data: panel } = await supabase
    .from("dashboard_panels")
    .select("dashboard_id, dashboards(folder_id)")
    .eq("id", panelId)
    .maybeSingle();

  if (!panel) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  const folderId = (panel.dashboards as unknown as { folder_id: string })?.folder_id;
  const access = await requireFolderAccess(folderId, "edit_panels");
  if (access.error) return access.error;

  const { error } = await supabase
    .from("dashboard_panels")
    .delete()
    .eq("id", panelId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
