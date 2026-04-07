import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeDatasetToDataSource } from "@/lib/dataset-merge";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  // Validate dataset exists and is approved
  const { data: dataset, error: dsError } = await supabase!
    .from("datasets")
    .select("id, name, state")
    .eq("id", id)
    .single();

  if (dsError || !dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const ds = dataset as Record<string, unknown>;

  if (ds.state !== "approved") {
    return NextResponse.json(
      { error: "Dataset must be approved before merging" },
      { status: 400 },
    );
  }

  // Check all approvers have approved
  const { data: approvers } = await supabase!
    .from("dataset_approvers")
    .select("status")
    .eq("dataset_id", id);

  if (approvers && approvers.length > 0) {
    const allApproved = approvers.every(
      (a: Record<string, unknown>) => a.status === "approved",
    );
    if (!allApproved) {
      return NextResponse.json(
        { error: "Cannot merge: not all approvers have approved this dataset" },
        { status: 400 },
      );
    }
  }

  // Perform the merge using shared function
  const admin = createAdminClient();
  const mergeResult = await mergeDatasetToDataSource(admin, id, userId!);

  if (!mergeResult.ok) {
    return NextResponse.json({ error: mergeResult.error }, { status: 400 });
  }

  // Update state to completed
  await supabase!
    .from("datasets")
    .update({ state: "completed" })
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    merged: mergeResult.merged,
    target: mergeResult.target,
  });
}
