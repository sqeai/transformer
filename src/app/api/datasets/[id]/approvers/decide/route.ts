import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  let body: { decision?: string; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const decision = body.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const { data: approver, error: loadError } = await supabase!
    .from("dataset_approvers")
    .select("id, dataset_id, user_id, status")
    .eq("dataset_id", id)
    .eq("user_id", userId!)
    .single();

  if (loadError || !approver) {
    return NextResponse.json({ error: "You are not an approver for this dataset" }, { status: 403 });
  }

  const { error: updateError } = await supabase!
    .from("dataset_approvers")
    .update({
      status: decision,
      comment: body.comment || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", (approver as Record<string, unknown>).id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const admin = createAdminClient();

  await admin.from("dataset_logs").insert({
    dataset_id: id,
    user_id: userId!,
    action: decision === "approved" ? "approval_approved" : "approval_rejected",
    from_state: "pending_approval",
    to_state: decision === "approved" ? "pending_approval" : "rejected",
    comment: body.comment || null,
  });

  if (decision === "rejected") {
    await admin
      .from("datasets")
      .update({ state: "rejected" })
      .eq("id", id);

    await admin.from("dataset_logs").insert({
      dataset_id: id,
      user_id: userId!,
      action: "state_change",
      from_state: "pending_approval",
      to_state: "rejected",
      comment: `Rejected by approver: ${body.comment || "No comment"}`,
    });
  } else {
    const { data: allApprovers } = await admin
      .from("dataset_approvers")
      .select("status")
      .eq("dataset_id", id);

    const allApproved = allApprovers?.every((a: Record<string, unknown>) => a.status === "approved");

    if (allApproved) {
      await admin
        .from("datasets")
        .update({ state: "approved" })
        .eq("id", id);

      await admin.from("dataset_logs").insert({
        dataset_id: id,
        user_id: userId!,
        action: "state_change",
        from_state: "pending_approval",
        to_state: "approved",
        comment: "All approvers have approved",
      });
    }
  }

  return NextResponse.json({ ok: true, decision });
}
