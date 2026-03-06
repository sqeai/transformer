// This route is deprecated. Registration is now handled by /api/auth/register.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Use /api/auth/register instead." },
    { status: 410 },
  );
}
