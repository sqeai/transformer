import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { requireUserManager } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function generatePassword(length = 16): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireUserManager();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", id)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const plainPassword = generatePassword();
  const passwordHash = await hash(plainPassword, 10);

  const { error } = await supabase
    .from("users")
    .update({ password: passwordHash })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ generatedPassword: plainPassword });
}
