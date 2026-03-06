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
 * Get all descendant folder IDs (direct children, grandchildren, etc.).
 */
async function getFolderDescendants(folderId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const descendants: string[] = [];
  const queue = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const { data, error } = await supabase
      .from("folders")
      .select("id")
      .eq("parent_id", currentId);

    if (error || !data) continue;
    for (const child of data) {
      descendants.push(child.id);
      queue.push(child.id);
    }
  }

  return descendants;
}

/**
 * Get members from subfolder (descendant) folders.
 * A parent folder's members have access to all subfolders,
 * so this shows which additional members exist in child folders.
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
  const descendants = await getFolderDescendants(folderId);
  const supabase = createAdminClient();
  const directMembers = await getFolderMembers(folderId);
  const directUserIds = new Set(directMembers.map((m) => m.userId));

  const inherited: {
    userId: string;
    email: string;
    name: string;
    role: FolderRole;
    fromFolderId: string;
    fromFolderName: string;
  }[] = [];

  for (const descendantId of descendants) {
    const { data: folder } = await supabase
      .from("folders")
      .select("name")
      .eq("id", descendantId)
      .maybeSingle();

    const members = await getFolderMembers(descendantId);
    for (const member of members) {
      if (
        !directUserIds.has(member.userId) &&
        !inherited.some((m) => m.userId === member.userId)
      ) {
        inherited.push({
          ...member,
          fromFolderId: descendantId,
          fromFolderName: folder?.name ?? "",
        });
      }
    }
  }

  return inherited;
}
