import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { PermissionsService } from "@/lib/permissions";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const access = await PermissionsService.getSidebarAccess(authResult.user.id);
  return NextResponse.json(access);
}
