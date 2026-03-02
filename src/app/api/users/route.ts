import { NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { userId } = auth;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("users")
    .select("id, email, full_name")
    .eq("is_activated", true)
    .neq("id", userId!)
    .order("email");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    users: (data ?? []).map((u: Record<string, unknown>) => ({
      id: u.id,
      email: u.email,
      name: u.full_name || u.email,
    })),
  });
}
