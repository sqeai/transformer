import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    // Guard: validate password against public.users.password (bypasses RLS via admin client)
    try {
      const admin = createAdminClient();
      const { data: profile, error: fetchError } = await admin
        .from("users")
        .select("id, email, password, is_activated")
        .eq("email", email)
        .maybeSingle();

      if (fetchError) {
        console.error("Login guard fetch error:", fetchError);
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 },
        );
      }
      if (!profile) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 },
        );
      }
      if (!profile.is_activated) {
        return NextResponse.json(
          { error: "Account not activated. Please contact an administrator." },
          { status: 403 },
        );
      }
      if (!profile.password) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 },
        );
      }
      const passwordMatch = await compare(password, profile.password);
      if (!passwordMatch) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 },
        );
      }
    } catch (adminErr) {
      console.error("Login guard error:", adminErr);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message || "Invalid credentials" },
        { status: 401 },
      );
    }

    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Sign in failed" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("id, email, full_name")
      .eq("id", userId)
      .single();

    const user = {
      id: userId,
      email: profile?.email ?? authData.user.email ?? email,
      name: profile?.full_name ?? authData.user.user_metadata?.full_name ?? email.split("@")[0],
    };

    return NextResponse.json({ user });
  } catch (e) {
    console.error("Login error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 500 },
    );
  }
}
