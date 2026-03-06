import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireSuperadmin();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const supabase = createAdminClient();
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.isActivated !== undefined) updates.is_activated = body.isActivated;
  if (body.isSuperadmin !== undefined) updates.is_superadmin = body.isSuperadmin;
  if (body.fullName !== undefined) updates.full_name = body.fullName;

  const { error } = await supabase.from("users").update(updates).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireSuperadmin();
  if (authResult.error) return authResult.error;

  const { id } = await params;

  if (id === authResult.user.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
