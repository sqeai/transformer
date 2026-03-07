import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type FolderRole = "viewer" | "editor" | "admin" | "owner";

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type Permission =
  | "view_context"
  | "view_data_sources"
  | "view_datasets"
  | "view_panels"
  | "view_alerts"
  | "use_chat"
  | "edit_context"
  | "edit_data_sources"
  | "edit_datasets"
  | "edit_panels"
  | "edit_alerts"
  | "manage_users"
  | "manage_folder"
  | "delete_folder";

const ROLE_PERMISSIONS: Record<FolderRole, Permission[]> = {
  viewer: [
    "view_context",
    "view_data_sources",
    "view_datasets",
    "view_panels",
    "view_alerts",
    "use_chat",
  ],
  editor: [
    "view_context",
    "view_data_sources",
    "view_datasets",
    "view_panels",
    "view_alerts",
    "use_chat",
    "edit_context",
    "edit_data_sources",
    "edit_datasets",
    "edit_panels",
    "edit_alerts",
  ],
  admin: [
    "view_datasets",
    "view_data_sources",
    "manage_users",
    "manage_folder",
  ],
  owner: [
    "view_context",
    "view_data_sources",
    "view_datasets",
    "view_panels",
    "view_alerts",
    "use_chat",
    "edit_context",
    "edit_data_sources",
    "edit_datasets",
    "edit_panels",
    "edit_alerts",
    "manage_users",
    "manage_folder",
    "delete_folder",
  ],
};

/** All unique permissions (useful for superadmin). */
const ALL_PERMISSIONS: Permission[] = [
  ...new Set(Object.values(ROLE_PERMISSIONS).flat()),
];

// ---------------------------------------------------------------------------
// Database helpers (private)
// ---------------------------------------------------------------------------

async function fetchDirectRole(
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

async function fetchAncestorChain(folderId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const ancestors: string[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const { data, error } = await supabase
      .from("folders")
      .select("id, parent_id")
      .eq("id", currentId)
      .maybeSingle() as {
      data: { id: string; parent_id: string | null } | null;
      error: unknown;
    };

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

async function fetchIsSuperadmin(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_superadmin === true;
}

// ---------------------------------------------------------------------------
// Resolved permissions — the main output of the service
// ---------------------------------------------------------------------------

export interface ResolvedPermissions {
  role: FolderRole | null;
  isSuperadmin: boolean;
  permissions: Permission[];
  /** Where the effective role was inherited from (null = direct). */
  inheritedFrom: string | null;
}

// ---------------------------------------------------------------------------
// PermissionsService — single entry point for all permission checks
// ---------------------------------------------------------------------------

export const PermissionsService = {
  /**
   * Resolve the effective role for a user on a folder.
   *
   * Resolution order:
   * 1. Direct role on the folder itself.
   * 2. Walk up the ancestor chain; the nearest ancestor with a direct role wins.
   * 3. If a direct role exists on the target folder AND an ancestor grants a
   *    role, the **most specific** (direct) role takes precedence. This allows
   *    a viewer at the parent level to be promoted to editor on a subfolder.
   */
  async resolveRole(
    userId: string,
    folderId: string,
  ): Promise<{ role: FolderRole | null; inheritedFrom: string | null }> {
    const directRole = await fetchDirectRole(userId, folderId);
    if (directRole) return { role: directRole, inheritedFrom: null };

    const ancestors = await fetchAncestorChain(folderId);
    for (const ancestorId of ancestors) {
      const role = await fetchDirectRole(userId, ancestorId);
      if (role) return { role, inheritedFrom: ancestorId };
    }

    return { role: null, inheritedFrom: null };
  },

  /**
   * Fully resolve a user's permissions on a folder, including superadmin
   * bypass and role inheritance.
   */
  async resolve(
    userId: string,
    folderId: string,
  ): Promise<ResolvedPermissions> {
    const superadmin = await fetchIsSuperadmin(userId);
    if (superadmin) {
      return {
        role: "owner",
        isSuperadmin: true,
        permissions: ALL_PERMISSIONS,
        inheritedFrom: null,
      };
    }

    const { role, inheritedFrom } = await this.resolveRole(userId, folderId);
    return {
      role,
      isSuperadmin: false,
      permissions: role ? ROLE_PERMISSIONS[role] : [],
      inheritedFrom,
    };
  },

  /**
   * Check a single permission. Prefer `resolve()` when you need multiple
   * checks on the same folder to avoid repeated DB queries.
   */
  async can(
    userId: string,
    folderId: string,
    permission: Permission,
  ): Promise<boolean> {
    const { permissions } = await this.resolve(userId, folderId);
    return permissions.includes(permission);
  },

  /**
   * Get all folder IDs a user has direct membership on (for listing).
   */
  async getAccessibleFolderIds(userId: string): Promise<string[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("folder_members")
      .select("folder_id")
      .eq("user_id", userId);

    if (error || !data) return [];
    return data.map((row) => row.folder_id);
  },

  /**
   * Check if a user is a superadmin.
   */
  async isSuperadmin(userId: string): Promise<boolean> {
    return fetchIsSuperadmin(userId);
  },

  /**
   * Get the permissions list for a given role (useful for UI display).
   */
  getPermissionsForRole(role: FolderRole): Permission[] {
    return ROLE_PERMISSIONS[role];
  },

  /**
   * Get all direct members of a folder.
   */
  async getFolderMembers(
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
  },

  /**
   * Get members from descendant folders (shown as "inherited" in the UI).
   */
  async getDescendantMembers(
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
    const supabase = createAdminClient();
    const descendants = await getDescendantFolderIds(folderId);
    const directMembers = await this.getFolderMembers(folderId);
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

      const members = await this.getFolderMembers(descendantId);
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
  },
};

// ---------------------------------------------------------------------------
// Shared utility
// ---------------------------------------------------------------------------

async function getDescendantFolderIds(folderId: string): Promise<string[]> {
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
