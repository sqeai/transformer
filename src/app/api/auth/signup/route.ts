import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Sign up: create auth user and set public.users.password. New users get is_activated = false. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }
    if (!fullName) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message || "Sign up failed" },
        { status: 400 },
      );
    }

    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Sign up failed" }, { status: 400 });
    }

    const passwordHash = await hash(password, 10);
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("users")
      .update({ password: passwordHash, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      console.error("Signup: failed to set password:", updateError);
      return NextResponse.json(
        { error: "Account created but password could not be stored. Please contact support." },
        { status: 500 },
      );
    }

    const user = {
      id: userId,
      email: authData.user?.email ?? email,
      name: fullName || (authData.user?.user_metadata?.full_name ?? email.split("@")[0]),
    };
    return NextResponse.json({
      user,
      message: "Account created. Your account must be activated before you can sign in.",
    });
  } catch (e) {
    console.error("Signup error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sign up failed" },
      { status: 500 },
    );
  }
}
