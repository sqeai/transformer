import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeDatasetToDataSource } from "@/lib/dataset-merge";

const VALID_STATES = ["draft", "pending_approval", "approved", "rejected", "completed"] as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "completed"],  // completed allowed when no approvers needed
  pending_approval: ["approved", "rejected", "draft"],
  approved: ["completed", "draft"],
  rejected: ["draft"],
  completed: [],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  let body: { state?: string; comment?: string; approverIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newState = body.state;
  if (!newState || !VALID_STATES.includes(newState as typeof VALID_STATES[number])) {
    return NextResponse.json({ error: `Invalid state. Must be one of: ${VALID_STATES.join(", ")}` }, { status: 400 });
  }

  const { data: dataset, error: loadError } = await supabase!
    .from("datasets")
    .select("id, state, schema_id")
    .eq("id", id)
    .single();

  if (loadError || !dataset) {
    return NextResponse.json({ error: loadError?.message ?? "Dataset not found" }, { status: 404 });
  }

  const currentState = (dataset as Record<string, unknown>).state as string || "draft";
  const allowed = VALID_TRANSITIONS[currentState] ?? [];
  if (!allowed.includes(newState)) {
    return NextResponse.json({
      error: `Cannot transition from "${currentState}" to "${newState}". Allowed: ${allowed.join(", ") || "none"}`,
    }, { status: 400 });
  }

  const admin = createAdminClient();
  const schemaId = (dataset as Record<string, unknown>).schema_id as string;

  // Allow direct completion from draft only if no mandatory approvers exist
  if (newState === "completed" && currentState === "draft") {
    const { data: mandatoryApprovers } = await admin
      .from("schema_mandatory_approvers")
      .select("id")
      .eq("schema_id", schemaId);

    if (mandatoryApprovers && mandatoryApprovers.length > 0) {
      return NextResponse.json({
        error: "Cannot complete directly: this schema has mandatory approvers. Please submit for approval first.",
      }, { status: 400 });
    }
  }

  if (newState === "pending_approval") {
    const approverIds = Array.isArray(body.approverIds)
      ? body.approverIds.filter((u) => typeof u === "string")
      : [];

    if (approverIds.length === 0) {
      const { data: existing } = await supabase!
        .from("dataset_approvers")
        .select("id")
        .eq("dataset_id", id);

      if (!existing || existing.length === 0) {
        return NextResponse.json({
          error: "Cannot submit for approval: no approvers assigned. Select at least one approver.",
        }, { status: 400 });
      }
    }

    if (approverIds.length > 0) {
      const rows = approverIds.map((uid) => ({
        dataset_id: id,
        user_id: uid,
        status: "pending",
      }));
      await admin
        .from("dataset_approvers")
        .upsert(rows, { onConflict: "dataset_id,user_id" });
    }

    await admin
      .from("dataset_approvers")
      .update({ status: "pending", comment: null, decided_at: null })
      .eq("dataset_id", id);
  }

  if (newState === "draft" && currentState === "pending_approval") {
    await admin
      .from("dataset_approvers")
      .delete()
      .eq("dataset_id", id);
  }

  // When completing, merge data to the data source
  if (newState === "completed") {
    const mergeResult = await mergeDatasetToDataSource(admin, id, userId!);
    if (!mergeResult.ok) {
      return NextResponse.json({ error: mergeResult.error }, { status: 400 });
    }
    // The merge function already logs the merge action, so we only need to update state
    const { error: updateError } = await admin
      .from("datasets")
      .update({ state: newState })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      state: newState,
      merged: mergeResult.merged,
      target: mergeResult.target,
    });
  }

  const { error: updateError } = await admin
    .from("datasets")
    .update({ state: newState })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin.from("dataset_logs").insert({
    dataset_id: id,
    user_id: userId!,
    action: "state_change",
    from_state: currentState,
    to_state: newState,
    comment: body.comment || null,
  });

  return NextResponse.json({ ok: true, state: newState });
}
