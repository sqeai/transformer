import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase!
    .from("data_source_default_approvers")
    .select("id, user_id, created_at, users!inner(email, full_name)")
    .eq("data_source_id", id)
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    approvers: (data ?? []).map((a: Record<string, unknown>) => {
      const user = a.users as Record<string, unknown>;
      return {
        id: a.id,
        userId: a.user_id,
        email: user?.email ?? "",
        name: user?.full_name || user?.email || "",
      };
    }),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { id } = await params;

  let body: { userIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userIds = Array.isArray(body.userIds) ? body.userIds.filter((u) => typeof u === "string") : [];
  if (userIds.length === 0) {
    return NextResponse.json({ error: "userIds array is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const rows = userIds.map((uid) => ({
    data_source_id: id,
    user_id: uid,
  }));

  const { error } = await admin
    .from("data_source_default_approvers")
    .upsert(rows, { onConflict: "data_source_id,user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId query param required" }, { status: 400 });
  }

  const { error } = await supabase!
    .from("data_source_default_approvers")
    .delete()
    .eq("data_source_id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
