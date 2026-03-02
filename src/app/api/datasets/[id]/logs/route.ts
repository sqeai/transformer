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
  const { id } = await params;

  const admin = createAdminClient();

  // Verify access: schema RLS or approver
  const { data: rlsCheck } = await supabase!.from("datasets").select("id").eq("id", id).single();
  if (!rlsCheck) {
    const { data: approverRow } = await admin.from("dataset_approvers").select("id").eq("dataset_id", id).eq("user_id", userId!).maybeSingle();
    if (!approverRow) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }
  }
  const { data, error } = await admin
    .from("dataset_logs")
    .select("id, dataset_id, user_id, action, from_state, to_state, comment, metadata, created_at")
    .eq("dataset_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = [...new Set((data ?? []).map((l: Record<string, unknown>) => l.user_id as string))];
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
    logs: (data ?? []).map((l: Record<string, unknown>) => {
      const user = userMap.get(l.user_id as string);
      return {
        id: l.id,
        datasetId: l.dataset_id,
        userId: l.user_id,
        userEmail: user?.email ?? "",
        userName: user?.full_name || user?.email || "",
        action: l.action,
        fromState: l.from_state,
        toState: l.to_state,
        comment: l.comment,
        metadata: l.metadata ?? {},
        createdAt: l.created_at,
      };
    }),
  });
}
