import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const supabase = createAdminClient();
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.sqlQuery !== undefined) updates.sql_query = body.sqlQuery;
  if (body.condition !== undefined) updates.condition = body.condition;
  if (body.threshold !== undefined) updates.threshold = body.threshold;
  if (body.cronExpression !== undefined) updates.cron_expression = body.cronExpression;
  if (body.isActive !== undefined) updates.is_active = body.isActive;

  const { error } = await supabase.from("alerts").update(updates).eq("id", id);
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

  const { error } = await supabase.from("alerts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
