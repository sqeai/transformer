// This route is deprecated. Authentication is now handled by NextAuth.
// See /api/auth/[...nextauth]/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Use NextAuth sign-in instead." },
    { status: 410 },
  );
}
