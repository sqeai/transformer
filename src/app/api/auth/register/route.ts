import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password =
      typeof body?.password === "string" ? body.password : "";
    const fullName =
      typeof body?.full_name === "string" ? body.full_name.trim() : "";

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

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await hash(password, 10);

    const { data: newUser, error: insertError } = await admin
      .from("users")
      .insert({
        email,
        full_name: fullName,
        password: passwordHash,
        is_activated: false,
        is_superadmin: false,
      })
      .select("id, email, full_name")
      .single();

    if (insertError) {
      console.error("Register: insert error:", insertError);
      return NextResponse.json(
        { error: "Registration failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.full_name,
      },
      message:
        "Account created. Your account must be activated before you can sign in.",
    });
  } catch (e) {
    console.error("Register error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Registration failed" },
      { status: 500 },
    );
  }
}
