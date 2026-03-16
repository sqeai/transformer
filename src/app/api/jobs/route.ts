import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createJob, getJobsByIds, type JobRow } from "@/lib/jobs-db";

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  let body: { type?: string; payload?: unknown; fileId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = typeof body?.type === "string" ? body.type.trim() : "";
  const payload = body?.payload;
  const fileId = typeof body?.fileId === "string" ? body.fileId.trim() : undefined;

  if (!type) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  if (payload === undefined) {
    return NextResponse.json({ error: "payload is required" }, { status: 400 });
  }

  try {
    const jobId = await createJob(supabase!, userId!, { type, payload, fileId });
    return NextResponse.json({ jobId });
  } catch (e) {
    console.error("Job creation error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create job" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json({ error: "ids query parameter is required" }, { status: 400 });
  }

  const ids = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ jobs: [] });
  }

  try {
    const jobs = await getJobsByIds(supabase!, ids, userId!);
    return NextResponse.json({
      jobs: jobs.map((j: JobRow) => ({
        id: j.id,
        status: j.status,
        result: j.result,
        error: j.error,
        created_at: j.created_at,
        started_at: j.started_at,
        completed_at: j.completed_at,
      })),
    });
  } catch (e) {
    console.error("Jobs fetch error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch jobs" },
      { status: 500 },
    );
  }
}
