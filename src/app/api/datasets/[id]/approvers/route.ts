import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifyDatasetAccess(supabase: ReturnType<typeof createAdminClient>, admin: ReturnType<typeof createAdminClient>, datasetId: string, userId: string) {
  const { data } = await supabase.from("datasets").select("id").eq("id", datasetId).single();
  if (data) return true;
  const { data: approverRow } = await admin.from("dataset_approvers").select("id").eq("dataset_id", datasetId).eq("user_id", userId).maybeSingle();
  return !!approverRow;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  const admin = createAdminClient();
  if (!(await verifyDatasetAccess(supabase!, admin, id, userId!))) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }
  const { data, error } = await admin
    .from("dataset_approvers")
    .select("id, dataset_id, user_id, status, comment, decided_at, created_at")
    .eq("dataset_id", id)
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = (data ?? []).map((a: Record<string, unknown>) => a.user_id as string);
  const userMap = new Map<string, { email: string; full_name: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, email, full_name")
      .in("id", userIds);
    for (const u of users ?? []) {
      userMap.set(u.id, { email: u.email, full_name: u.full_name });
    }
  }

  return NextResponse.json({
    approvers: (data ?? []).map((a: Record<string, unknown>) => {
      const user = userMap.get(a.user_id as string);
      return {
        id: a.id,
        datasetId: a.dataset_id,
        userId: a.user_id,
        userEmail: user?.email ?? "",
        userName: user?.full_name || user?.email || "",
        status: a.status,
        comment: a.comment,
        decidedAt: a.decided_at,
        createdAt: a.created_at,
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
  const { supabase } = auth;
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

  const { data: dataset } = await supabase!
    .from("datasets")
    .select("id, state")
    .eq("id", id)
    .single();

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const rows = userIds.map((uid) => ({
    dataset_id: id,
    user_id: uid,
    status: "pending",
  }));

  const { error } = await admin
    .from("dataset_approvers")
    .upsert(rows, { onConflict: "dataset_id,user_id" });

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
  const { supabase, userId } = auth;
  const { id } = await params;

  const { searchParams } = new URL(request.url);
  const approverId = searchParams.get("approverId");

  if (!approverId) {
    return NextResponse.json({ error: "approverId query param required" }, { status: 400 });
  }

  const adminDel = createAdminClient();
  if (!(await verifyDatasetAccess(supabase!, adminDel, id, userId!))) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }
  const { error } = await adminDel
    .from("dataset_approvers")
    .delete()
    .eq("id", approverId)
    .eq("dataset_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
