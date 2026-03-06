import { createAdminClient } from "@/lib/supabase/admin";

export type FolderRole = "viewer" | "editor" | "admin" | "owner";

export type Permission =
  | "view_resources"
  | "view_context"
  | "edit_resources"
  | "use_chatbot"
  | "view_dashboard"
  | "edit_context"
  | "manage_users"
  | "manage_folder"
  | "delete_folder";

const ROLE_PERMISSIONS: Record<FolderRole, Permission[]> = {
  viewer: ["view_resources", "view_context"],
  editor: [
    "view_resources",
    "view_context",
    "edit_resources",
    "use_chatbot",
    "view_dashboard",
  ],
  admin: ["view_context", "edit_context", "manage_users", "manage_folder"],
  owner: [
    "view_resources",
    "view_context",
    "edit_resources",
    "use_chatbot",
    "view_dashboard",
    "edit_context",
    "manage_users",
    "manage_folder",
    "delete_folder",
  ],
};

/**
 * Get the direct role a user has on a specific folder (not inherited).
 */
export async function getUserDirectRole(
  userId: string,
  folderId: string,
): Promise<FolderRole | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("folder_members")
    .select("role")
    .eq("folder_id", folderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data.role as FolderRole;
}

/**
 * Get the ancestor chain for a folder (from child to root).
 */
export async function getFolderAncestors(
  folderId: string,
): Promise<string[]> {
  const supabase = createAdminClient();
  const ancestors: string[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const { data, error } = await supabase
      .from("folders")
      .select("id, parent_id")
      .eq("id", currentId)
      .maybeSingle() as { data: { id: string; parent_id: string | null } | null; error: unknown };

    if (error || !data) break;
    if (data.parent_id) {
      ancestors.push(data.parent_id);
      currentId = data.parent_id;
    } else {
      currentId = null;
    }
  }

  return ancestors;
}

/**
 * Get the effective role for a user on a folder, considering inheritance.
 * Walks up the folder tree: if the user has a direct role on the folder, use it.
 * Otherwise, inherit the role from the nearest ancestor with a membership.
 */
export async function getUserEffectiveRole(
  userId: string,
  folderId: string,
): Promise<FolderRole | null> {
  const directRole = await getUserDirectRole(userId, folderId);
  if (directRole) return directRole;

  const ancestors = await getFolderAncestors(folderId);
  for (const ancestorId of ancestors) {
    const role = await getUserDirectRole(userId, ancestorId);
    if (role) return role;
  }

  return null;
}

/**
 * Check if a user is a superadmin.
 */
export async function isSuperadmin(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_superadmin === true;
}

/**
 * Check if a user has a specific permission on a folder.
 * Superadmins always have all permissions.
 */
export async function canUserAccess(
  userId: string,
  folderId: string,
  permission: Permission,
): Promise<boolean> {
  if (await isSuperadmin(userId)) return true;

  const role = await getUserEffectiveRole(userId, folderId);
  if (!role) return false;

  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Get all permissions for a user on a folder.
 */
export async function getUserPermissions(
  userId: string,
  folderId: string,
): Promise<Permission[]> {
  if (await isSuperadmin(userId)) {
    return Object.values(ROLE_PERMISSIONS).flat().filter(
      (v, i, a) => a.indexOf(v) === i,
    );
  }

  const role = await getUserEffectiveRole(userId, folderId);
  if (!role) return [];

  return ROLE_PERMISSIONS[role];
}

/**
 * Get all folders a user has access to (direct membership only, for listing).
 */
export async function getUserAccessibleFolderIds(
  userId: string,
): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("folder_members")
    .select("folder_id")
    .eq("user_id", userId);

  if (error || !data) return [];
  return data.map((row) => row.folder_id);
}

/**
 * Get all members of a folder (direct only).
 */
export async function getFolderMembers(
  folderId: string,
): Promise<
  { userId: string; email: string; name: string; role: FolderRole }[]
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("folder_members")
    .select("user_id, role, users:user_id(email, full_name)")
    .eq("folder_id", folderId);

  if (error || !data) return [];

  return data.map((row) => {
    const userInfo = row.users as unknown as {
      email: string;
      full_name: string;
    };
    return {
      userId: row.user_id,
      email: userInfo?.email ?? "",
      name: userInfo?.full_name ?? "",
      role: row.role as FolderRole,
    };
  });
}

/**
 * Get inherited members from ancestor folders.
 */
export async function getInheritedMembers(
  folderId: string,
): Promise<
  {
    userId: string;
    email: string;
    name: string;
    role: FolderRole;
    fromFolderId: string;
    fromFolderName: string;
  }[]
> {
  const ancestors = await getFolderAncestors(folderId);
  const supabase = createAdminClient();
  const inherited: {
    userId: string;
    email: string;
    name: string;
    role: FolderRole;
    fromFolderId: string;
    fromFolderName: string;
  }[] = [];

  for (const ancestorId of ancestors) {
    const { data: folder } = await supabase
      .from("folders")
      .select("name")
      .eq("id", ancestorId)
      .maybeSingle();

    const members = await getFolderMembers(ancestorId);
    for (const member of members) {
      if (!inherited.some((m) => m.userId === member.userId)) {
        inherited.push({
          ...member,
          fromFolderId: ancestorId,
          fromFolderName: folder?.name ?? "",
        });
      }
    }
  }

  return inherited;
}
