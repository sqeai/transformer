import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Returns supabase client and current user id, or 401 response. */
export async function getAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, userId: null as string | null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { supabase, userId: user.id, response: null };
}
