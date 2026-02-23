import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Logout error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Logout failed" },
      { status: 500 },
    );
  }
}
