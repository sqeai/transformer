import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimNextPendingJobs,
  updateJobResult,
  updateJobFailed,
  type JobRow,
} from "@/lib/jobs-db";
import { AI_DATA_CLEANSER_MAX_CONCURRENCY } from "@/lib/jobs-config";
import { runDataCleanser } from "@/lib/agent/data-cleanser";

export async function POST(_request: NextRequest) {
  return processJobs();
}

export async function GET(_request: NextRequest) {
  return processJobs();
}

async function processJobs() {
  try {
    const supabase = createAdminClient();
    const limit = AI_DATA_CLEANSER_MAX_CONCURRENCY;

    const jobs = await claimNextPendingJobs(supabase, limit);

    if (jobs.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending jobs" });
    }

    const results = await Promise.allSettled(
      jobs.map(async (job: JobRow) => {
        try {
          if (job.type !== "data_cleanse") {
            throw new Error(`Unknown job type: ${job.type}`);
          }

          const payload = job.payload as {
            columns?: string[];
            rows?: Record<string, unknown>[];
            targetPaths?: string[];
            sheetName?: string;
            userDirective?: string;
            originalColumns?: string[];
            originalRows?: Record<string, unknown>[];
            modifiedColumns?: string[];
            modifiedRows?: Record<string, unknown>[];
          };

          if (!Array.isArray(payload?.columns) || !Array.isArray(payload?.rows) || !Array.isArray(payload?.targetPaths)) {
            throw new Error("Invalid payload: missing columns, rows, or targetPaths");
          }

          const result = await runDataCleanser({
            columns: payload.columns,
            rows: payload.rows,
            targetPaths: payload.targetPaths,
            sheetName: payload.sheetName ?? "Sheet",
            userDirective: payload.userDirective,
            originalColumns: payload.originalColumns,
            originalRows: payload.originalRows,
            modifiedColumns: payload.modifiedColumns,
            modifiedRows: payload.modifiedRows,
          });

          await updateJobResult(supabase, job.id, result);
          return { jobId: job.id, status: "completed" };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await updateJobFailed(supabase, job.id, errorMessage);
          return { jobId: job.id, status: "failed", error: errorMessage };
        }
      }),
    );

    const processed = results.length;
    const completed = results.filter((r) => r.status === "fulfilled" && r.value.status === "completed").length;
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.status === "failed")).length;

    return NextResponse.json({
      processed,
      completed,
      failed,
      message: `Processed ${processed} job(s)`,
    });
  } catch (e) {
    console.error("Job processing error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to process jobs" },
      { status: 500 },
    );
  }
}
