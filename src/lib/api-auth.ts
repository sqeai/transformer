import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAccess, type Permission } from "@/lib/rbac";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperadmin: boolean;
}

/**
 * Returns the authenticated user or null.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
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
 * Checks if the authenticated user has a specific permission on a folder.
 * Returns the user or a 403 response.
 */
export async function requireFolderAccess(
  folderId: string,
  permission: Permission,
): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireAuth();
  if (result.error) return result;

  const hasAccess = await canUserAccess(result.user.id, folderId, permission);
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
