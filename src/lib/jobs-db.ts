import type { SupabaseClient } from "@supabase/supabase-js";

export interface JobRow {
  id: string;
  user_id: string;
  sheet_id: string | null;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  payload: unknown;
  result: unknown | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CreateJobParams {
  type: string;
  payload: unknown;
  sheetId?: string;
}

/**
 * Create a new job. Returns the job id.
 */
export async function createJob(
  supabase: SupabaseClient,
  userId: string,
  params: CreateJobParams,
): Promise<string> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      type: params.type,
      payload: params.payload,
      status: "pending",
      ...(params.sheetId ? { sheet_id: params.sheetId } : {}),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create job: ${error.message}`);
  }

  return data.id;
}

/**
 * Get a single job by id. User can only see their own jobs.
 */
export async function getJobById(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
): Promise<JobRow | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw new Error(`Failed to get job: ${error.message}`);
  }

  return data as JobRow;
}

/**
 * Get multiple jobs by ids. User can only see their own jobs.
 */
export async function getJobsByIds(
  supabase: SupabaseClient,
  jobIds: string[],
  userId: string,
): Promise<JobRow[]> {
  if (jobIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .in("id", jobIds)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to get jobs: ${error.message}`);
  }

  return (data ?? []) as JobRow[];
}

/**
 * Claim up to `limit` pending jobs and mark them as running.
 * This is used by the processor to pick jobs to run.
 * Uses a transaction-like pattern: select pending jobs, then update them to running.
 * Note: This should be called with a service-role client (bypasses RLS).
 */
export async function claimNextPendingJobs(
  supabase: SupabaseClient,
  limit: number,
): Promise<JobRow[]> {
  // First, select pending jobs ordered by created_at
  const { data: pendingJobs, error: selectError } = await supabase
    .from("jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selectError) {
    throw new Error(`Failed to select pending jobs: ${selectError.message}`);
  }

  if (!pendingJobs || pendingJobs.length === 0) {
    return [];
  }

  const ids = pendingJobs.map((j) => j.id);
  const now = new Date().toISOString();

  // Update them to running status
  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      status: "running",
      started_at: now,
    })
    .in("id", ids)
    .eq("status", "pending"); // Only update if still pending (prevents race conditions)

  if (updateError) {
    throw new Error(`Failed to claim jobs: ${updateError.message}`);
  }

  // Return the jobs that were successfully claimed
  return pendingJobs.map((j) => ({
    ...j,
    status: "running" as const,
    started_at: now,
  })) as JobRow[];
}

/**
 * Update a job with successful result.
 * Note: This should be called with a service-role client (bypasses RLS).
 */
export async function updateJobResult(
  supabase: SupabaseClient,
  jobId: string,
  result: unknown,
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "completed",
      result,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to update job result: ${error.message}`);
  }
}

/**
 * Update a job with failure error.
 * Note: This should be called with a service-role client (bypasses RLS).
 */
export async function updateJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "failed",
      error: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to update job error: ${error.message}`);
  }
}
