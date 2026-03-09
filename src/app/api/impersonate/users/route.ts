import { NextResponse } from "next/server";
import { requireRealAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const authResult = await requireRealAuth();
  if (authResult.error) return authResult.error;

  if (!authResult.user.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("is_activated", true)
    .is("deleted_at", null)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
