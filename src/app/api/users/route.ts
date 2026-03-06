import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const authResult = await requireSuperadmin();
  if (authResult.error) return authResult.error;

  const supabase = createAdminClient();
  const search = req.nextUrl.searchParams.get("search") || "";

  let query = supabase
    .from("users")
    .select("id, email, full_name, is_activated, is_superadmin, created_at")
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
