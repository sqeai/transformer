import { NextRequest, NextResponse } from "next/server";
import { requireUserManager } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireUserManager();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("users")
    .update({ deleted_at: null })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
