import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { PermissionsService } from "@/lib/permissions";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const [access, isSuperadmin] = await Promise.all([
    PermissionsService.getSidebarAccess(authResult.user.id),
    PermissionsService.isSuperadmin(authResult.user.id),
  ]);
  return NextResponse.json({ ...access, isSuperadmin });
}
