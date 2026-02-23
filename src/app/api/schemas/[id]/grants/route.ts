import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId } = await params;

  const { data: schema, error: schemaError } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", schemaId)
    .single();

  if (schemaError || !schema || schema.user_id !== userId) {
    return NextResponse.json(
      { error: schema?.user_id !== userId ? "Forbidden" : schemaError?.message ?? "Not found" },
      { status: schema?.user_id !== userId ? 403 : schemaError?.code === "PGRST116" ? 404 : 500 },
    );
  }

  const { data: grants, error: grantsError } = await supabase!
    .from("schema_grants")
    .select("id, granted_to_user_id, granted_at")
    .eq("schema_id", schemaId)
    .order("granted_at", { ascending: false });

  if (grantsError) {
    return NextResponse.json({ error: grantsError.message }, { status: 500 });
  }

  const userIds = [...new Set((grants ?? []).map((g) => g.granted_to_user_id))];
  const profiles =
    userIds.length > 0
      ? await supabase!.from("users").select("id, email, full_name").in("id", userIds)
      : { data: [] };
  const profileMap = new Map(
    (profiles.data ?? []).map((p) => [
      p.id,
      { id: p.id, email: p.email ?? "", name: p.full_name ?? "" },
    ]),
  );

  const list = (grants ?? []).map((g) => ({
    id: g.id,
    grantedToUserId: g.granted_to_user_id,
    grantedAt: g.granted_at,
    user: profileMap.get(g.granted_to_user_id) ?? { id: g.granted_to_user_id, email: "", name: "" },
  }));

  return NextResponse.json({ grants: list });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId } = await params;

  const { data: schema, error: schemaError } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", schemaId)
    .single();

  if (schemaError || !schema || schema.user_id !== userId) {
    return NextResponse.json(
      { error: schema?.user_id !== userId ? "Forbidden" : schemaError?.message ?? "Not found" },
      { status: schema?.user_id !== userId ? 403 : schemaError?.code === "PGRST116" ? 404 : 500 },
    );
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await supabase!.rpc("grant_schema_access", {
    p_schema_id: schemaId,
    p_grantee_email: email,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }
  const result = rpcData as { ok?: boolean; error?: string; granted_to_user_id?: string; email?: string } | null;
  if (!result?.ok) {
    return NextResponse.json(
      { error: result?.error ?? "Grant failed" },
      { status: result?.error === "Forbidden" ? 403 : result?.error === "User not found with that email" ? 404 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    grantedToUserId: result.granted_to_user_id,
    email: result.email,
  });
}
