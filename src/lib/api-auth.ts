import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermissionsService, type Permission } from "@/lib/permissions";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperadmin: boolean;
}

/**
 * Returns the real authenticated user (ignoring impersonation).
 */
async function getRealAuthUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isSuperadmin: session.user.isSuperadmin,
  };
}

/**
 * If the real user is a superadmin and the X-Impersonate-User-Id header is
 * present, return the impersonated user's identity. The returned user will
 * have `isSuperadmin: false` so permission checks run as the target user.
 */
async function resolveImpersonation(
  realUser: AuthUser,
): Promise<AuthUser> {
  if (!realUser.isSuperadmin) return realUser;

  const hdrs = await headers();
  const targetId = hdrs.get("x-impersonate-user-id");
  if (!targetId || targetId === realUser.id) return realUser;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, is_superadmin")
    .eq("id", targetId)
    .maybeSingle();

  if (error || !data) return realUser;

  return {
    id: data.id,
    email: data.email,
    name: data.full_name ?? data.email.split("@")[0],
    isSuperadmin: data.is_superadmin ?? false,
  };
}

/**
 * Returns the authenticated user or null.
 * Supports superadmin impersonation via X-Impersonate-User-Id header.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const realUser = await getRealAuthUser();
  if (!realUser) return null;
  return resolveImpersonation(realUser);
}

/**
 * Backward-compatible auth helper used by existing API routes.
 * Returns a Supabase admin client (bypasses RLS), the userId, and an optional
 * 401 response if the user is not authenticated.
 */
export async function getAuth() {
  const user = await getAuthUser();
  if (!user) {
    return {
      supabase: null,
      userId: null as string | null,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }
  const supabase = createAdminClient();
  return { supabase, userId: user.id, response: null };
}

/**
 * Returns the authenticated user or a 401 response.
 */
export async function requireAuth(): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}

/**
 * Returns the real authenticated user (no impersonation), or a 401 response.
 * Use this for operations that must always run as the real user (e.g. sign out).
 */
export async function requireRealAuth(): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getRealAuthUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}

/**
 * Returns the authenticated superadmin user or a 403 response.
 */
export async function requireSuperadmin(): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireAuth();
  if (result.error) return result;
  if (!result.user.isSuperadmin) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user: result.user };
}

/**
 * Returns the authenticated user if they are a superadmin or have an
 * admin/owner role on at least one folder. Otherwise returns a 403 response.
 */
export async function requireUserManager(): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireAuth();
  if (result.error) return result;

  const canManage = await PermissionsService.canManageUsers(result.user.id);
  if (!canManage) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user: result.user };
}

/**
 * Checks if the authenticated user has a specific permission on a folder.
 * Uses the PermissionsService which handles role inheritance and superadmin bypass.
 */
export async function requireFolderAccess(
  folderId: string,
  permission: Permission,
): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireAuth();
  if (result.error) return result;

  const hasAccess = await PermissionsService.can(
    result.user.id,
    folderId,
    permission,
  );
  if (!hasAccess) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission to perform this action" },
        { status: 403 },
      ),
    };
  }
  return { user: result.user };
}
