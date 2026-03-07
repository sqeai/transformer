import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: dashboard, error } = await supabase
    .from("dashboards")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !dashboard) {
    return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
  }

  const access = await requireFolderAccess(dashboard.folder_id, "view_panels");
  if (access.error) return access.error;

  const { data: panels } = await supabase
    .from("dashboard_panels")
    .select("*")
    .eq("dashboard_id", id)
    .order("position", { ascending: true });

  return NextResponse.json({ ...dashboard, panels: panels || [] });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: dashboard } = await supabase
    .from("dashboards")
    .select("folder_id")
    .eq("id", id)
    .maybeSingle();

  if (!dashboard) {
    return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
  }

  const access = await requireFolderAccess(dashboard.folder_id, "edit_panels");
  if (access.error) return access.error;

  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;

  const { error } = await supabase
    .from("dashboards")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: dashboard } = await supabase
    .from("dashboards")
    .select("folder_id")
    .eq("id", id)
    .maybeSingle();

  if (!dashboard) {
    return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
  }

  const access = await requireFolderAccess(dashboard.folder_id, "edit_panels");
  if (access.error) return access.error;

  const { error } = await supabase.from("dashboards").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
