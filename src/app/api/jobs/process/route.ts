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
import { createFileRecord } from "@/lib/files-db";
import type { SupabaseClient } from "@supabase/supabase-js";

interface TransformationStep {
  tool: string;
  params: Record<string, unknown>;
  phase: "cleansing" | "transformation";
  reasoning?: string;
}

async function loadDefaultTransformation(
  supabase: SupabaseClient,
  schemaId: string,
): Promise<TransformationStep[] | undefined> {
  const { data, error } = await supabase
    .from("schema_transformations")
    .select("steps")
    .eq("schema_id", schemaId)
    .eq("is_default", true)
    .maybeSingle();

  if (error || !data) {
    return undefined;
  }

  const steps = data.steps as Array<{
    id?: string;
    order?: number;
    tool: string;
    params: Record<string, unknown>;
    phase: "cleansing" | "transformation";
    reasoning?: string;
  }>;

  if (!Array.isArray(steps) || steps.length === 0) {
    return undefined;
  }

  // Return only the fields needed by the cleanser
  return steps.map((s) => ({
    tool: s.tool,
    params: s.params,
    phase: s.phase,
    reasoning: s.reasoning,
  }));
}

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
            fileName?: string;
            userDirective?: string;
            originalFilePath?: string;
            modifiedFilePath?: string;
            unstructuredMimeType?: string;
            schemaId?: string;
          };

          if (typeof payload?.filePath !== "string" || !Array.isArray(payload?.targetPaths)) {
            throw new Error("Invalid payload: missing filePath or targetPaths");
          }

          // Load default transformation pipeline if schema has one
          let initialSteps: TransformationStep[] | undefined;
          if (payload.schemaId) {
            initialSteps = await loadDefaultTransformation(supabase, payload.schemaId);
          }

          const result = await runDataCleanser({
            filePath: payload.filePath,
            targetPaths: payload.targetPaths,
            fileName: payload.fileName ?? "File",
            userDirective: payload.userDirective,
            originalFilePath: payload.originalFilePath,
            modifiedFilePath: payload.modifiedFilePath,
            fileId: job.file_id ?? undefined,
            unstructuredMimeType: payload.unstructuredMimeType,
            schemaId: payload.schemaId,
            initialSteps,
          });

          if (typeof job.file_id === "string" && job.file_id) {
            await createFileRecord(supabase, {
              userId: job.user_id,
              fileId: job.file_id,
              storageUrl: result.outputFilePath,
              name: payload.fileName ?? "File",
              dimensions: {
                rowCount: result.transformedRows.length,
                columnCount: result.transformedColumns.length,
              },
              type: "final",
            });
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
