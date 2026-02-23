import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !authUser) {
      return NextResponse.json({ user: null });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("id, email, full_name")
      .eq("id", authUser.id)
      .single();

    const user = {
      id: authUser.id,
      email: profile?.email ?? authUser.email ?? "",
      name:
        profile?.full_name ??
        (authUser.user_metadata?.full_name as string | undefined) ??
        (authUser.email?.split("@")[0] ?? ""),
    };

    return NextResponse.json({ user });
  } catch (e) {
    console.error("Session error:", e);
    return NextResponse.json({ user: null });
  }
}
