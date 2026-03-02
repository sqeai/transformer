import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimNextPendingJobs,
  updateJobResult,
  updateJobFailed,
  type JobRow,
} from "@/lib/jobs-db";
import { AI_DATA_CLEANSER_MAX_CONCURRENCY } from "@/lib/jobs-config";
import { runDataCleanser } from "@/lib/agents/data-cleanser";
import { getS3ObjectVersionId } from "@/lib/s3-sheets";
import { updateSheetVersionId } from "@/lib/sheets-db";

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
            filePath?: string;
            targetPaths?: string[];
            sheetName?: string;
            sheetId?: string;
            userDirective?: string;
            originalFilePath?: string;
            modifiedFilePath?: string;
          };

          if (typeof payload?.filePath !== "string" || !Array.isArray(payload?.targetPaths)) {
            throw new Error("Invalid payload: missing filePath or targetPaths");
          }

          const result = await runDataCleanser({
            filePath: payload.filePath,
            targetPaths: payload.targetPaths,
            sheetName: payload.sheetName ?? "Sheet",
            userDirective: payload.userDirective,
            originalFilePath: payload.originalFilePath,
            modifiedFilePath: payload.modifiedFilePath,
          });

          if (typeof payload.sheetId === "string" && payload.sheetId) {
            const versionId = await getS3ObjectVersionId(payload.filePath);
            await updateSheetVersionId(supabase, payload.sheetId, versionId);
          }

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
