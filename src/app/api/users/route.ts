import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { requireUserManager } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function generatePassword(length = 16): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

export async function GET(req: NextRequest) {
  const authResult = await requireUserManager();
  if (authResult.error) return authResult.error;

  const supabase = createAdminClient();
  const search = req.nextUrl.searchParams.get("search") || "";

  let query = supabase
    .from("users")
    .select("id, email, full_name, is_activated, is_superadmin, created_at, deleted_at")
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

export async function POST(req: NextRequest) {
  const authResult = await requireUserManager();
  if (authResult.error) return authResult.error;

  let body: { email?: string; fullName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("users")
    .select("id, deleted_at")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const hint = existing.deleted_at
      ? " This email belongs to a deleted user — restore them instead."
      : "";
    return NextResponse.json(
      { error: `A user with this email already exists.${hint}` },
      { status: 409 },
    );
  }

  const plainPassword = generatePassword();
  const passwordHash = await hash(plainPassword, 10);

  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      email,
      full_name: fullName,
      password: passwordHash,
      is_activated: true,
      is_superadmin: false,
    })
    .select("id, email, full_name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    user: newUser,
    generatedPassword: plainPassword,
  });
}
