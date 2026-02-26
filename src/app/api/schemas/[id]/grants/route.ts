import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // Owner-only: include all other activated users as grant candidates.
  const admin = createAdminClient();
  const { data: candidatesRows, error: candidatesError } = await admin
    .from("users")
    .select("id, email, full_name, is_activated")
    .neq("id", userId)
    .eq("is_activated", true)
    .order("full_name", { ascending: true })
    .order("email", { ascending: true });

  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 500 });
  }

  const grantCandidates = (candidatesRows ?? []).map((u) => ({
    id: u.id as string,
    email: (u.email ?? "") as string,
    name: (u.full_name ?? "") as string,
  }));

  return NextResponse.json({ grants: list, grantCandidates });
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

  let body: { email?: string; userId?: string; userIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const userIdBody = typeof body?.userId === "string" ? body.userId.trim() : "";
  const userIdsBody = Array.isArray(body?.userIds)
    ? body.userIds.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : [];
  const requestedUserIds = [...new Set([...(userIdBody ? [userIdBody] : []), ...userIdsBody])];

  const emailsToGrant: string[] = [];
  if (email) emailsToGrant.push(email);
  if (requestedUserIds.length > 0) {
    const admin = createAdminClient();
    const { data: users, error: usersError } = await admin
      .from("users")
      .select("id, email, is_activated")
      .in("id", requestedUserIds);
    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }
    const byId = new Map((users ?? []).map((u) => [u.id as string, u]));
    for (const uid of requestedUserIds) {
      const u = byId.get(uid);
      if (!u) continue;
      if (!u.is_activated) continue;
      if (u.email) emailsToGrant.push(u.email as string);
    }
  }

  const uniqueEmails = [...new Set(emailsToGrant.map((e) => e.trim()).filter(Boolean))];
  if (uniqueEmails.length === 0) {
    return NextResponse.json({ error: "email, userId, or userIds is required" }, { status: 400 });
  }

  const results: Array<{ ok: boolean; error?: string; grantedToUserId?: string; email?: string }> = [];
  for (const targetEmail of uniqueEmails) {
    const { data: rpcData, error: rpcError } = await supabase!.rpc("grant_schema_access", {
      p_schema_id: schemaId,
      p_grantee_email: targetEmail,
    });
    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }
    const result = rpcData as { ok?: boolean; error?: string; granted_to_user_id?: string; email?: string } | null;
    if (!result?.ok) {
      results.push({ ok: false, error: result?.error ?? "Grant failed", email: targetEmail });
      continue;
    }
    results.push({
      ok: true,
      grantedToUserId: result.granted_to_user_id,
      email: result.email ?? targetEmail,
    });
  }

  const success = results.filter((r) => r.ok);
  if (success.length === 0) {
    const firstError = results.find((r) => !r.ok)?.error ?? "Grant failed";
    return NextResponse.json(
      { error: firstError, results },
      { status: firstError === "Forbidden" ? 403 : firstError === "User not found with that email" ? 404 : 400 },
    );
  }

  return NextResponse.json({ ok: true, results });
}
