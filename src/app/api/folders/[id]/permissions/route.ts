import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { PermissionsService } from "@/lib/permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await requireAuth();
  if (result.error) return result.error;

  const resolved = await PermissionsService.resolve(result.user.id, id);

  return NextResponse.json({
    role: resolved.role,
    permissions: resolved.permissions,
    isSuperadmin: resolved.isSuperadmin,
    inheritedFrom: resolved.inheritedFrom,
  });
}
