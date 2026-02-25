import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { getJobById, type JobRow } from "@/lib/jobs-db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  try {
    const job = await getJobById(supabase!, id, userId!);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
    });
  } catch (e) {
    console.error("Job fetch error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch job" },
      { status: 500 },
    );
  }
}
