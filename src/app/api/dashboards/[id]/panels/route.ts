import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { id: dashboardId } = await params;
  const supabase = createAdminClient();
  const body = await req.json();

  const { data: maxPos } = await supabase
    .from("dashboard_panels")
    .select("position")
    .eq("dashboard_id", dashboardId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (maxPos?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("dashboard_panels")
    .insert({
      dashboard_id: dashboardId,
      title: body.title || "Untitled Panel",
      chart_type: body.chartType || "bar",
      sql_query: body.sqlQuery || null,
      data: body.data || [],
      config: body.config || {},
      width: body.width || 1,
      height: body.height || 1,
      position: nextPosition,
      prompt: body.prompt || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { id: dashboardId } = await params;
  const supabase = createAdminClient();
  const body = await req.json();

  if (!Array.isArray(body.panels)) {
    return NextResponse.json({ error: "panels array required" }, { status: 400 });
  }

  await supabase
    .from("dashboard_panels")
    .delete()
    .eq("dashboard_id", dashboardId);

  if (body.panels.length > 0) {
    const panels = body.panels.map((p: Record<string, unknown>, i: number) => ({
      dashboard_id: dashboardId,
      id: p.id,
      title: p.title || "Untitled",
      chart_type: p.chartType || p.chart_type || "bar",
      sql_query: p.sqlQuery || p.sql_query || null,
      data: p.data || [],
      config: p.config || {},
      width: p.width || 1,
      height: p.height || 1,
      position: i,
      prompt: p.prompt || null,
    }));

    const { error } = await supabase.from("dashboard_panels").insert(panels);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
