import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type FolderRole = "viewer" | "editor" | "admin" | "owner" | "data_engineer";

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type Permission =
  | "view_context"
  | "view_data_sources"
  | "view_datasets"
  | "view_schemas"
  | "view_panels"
  | "view_alerts"
  | "view_members"
  | "use_chat"
  | "edit_context"
  | "edit_data_sources"
  | "edit_datasets"
  | "edit_schemas"
  | "edit_panels"
  | "edit_alerts"
  | "manage_users"
  | "manage_folder"
  | "delete_folder";

const ROLE_PERMISSIONS: Record<FolderRole, Permission[]> = {
  data_engineer: [
    "view_datasets",
    "view_schemas",
    "view_members",
    "edit_datasets",
    "edit_schemas",
    "manage_folder",
  ],
  viewer: [
    "view_context",
    "view_data_sources",
    "view_datasets",
    "view_schemas",
    "view_panels",
    "view_alerts",
    "view_members",
    "use_chat",
    "manage_folder",
  ],
  editor: [
    "view_context",
    "view_data_sources",
    "view_datasets",
    "view_schemas",
    "view_panels",
    "view_alerts",
    "view_members",
    "use_chat",
    "edit_context",
    "edit_data_sources",
    "edit_datasets",
    "edit_schemas",
    "edit_panels",
    "edit_alerts",
    "manage_folder",
  ],
  admin: [
    "view_context",
    "view_data_sources",
    "view_datasets",
    "view_schemas",
    "view_panels",
    "view_alerts",
    "view_members",
    "use_chat",
    "edit_context",
    "edit_data_sources",
    "edit_datasets",
    "edit_schemas",
    "edit_panels",
    "edit_alerts",
    "manage_users",
    "manage_folder",
  ],
  owner: [
    "view_context",
    "view_data_sources",
    "view_datasets",
    "view_schemas",
    "view_panels",
    "view_alerts",
    "view_members",
    "use_chat",
    "edit_context",
    "edit_data_sources",
    "edit_datasets",
    "edit_schemas",
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
   * Get all folder IDs a user can access — superadmins get everything,
   * otherwise direct memberships plus all their descendant folders.
   */
  async getAccessibleFolderIds(userId: string): Promise<string[]> {
    const supabase = createAdminClient();

    const isSuperadmin = await fetchIsSuperadmin(userId);
    if (isSuperadmin) {
      const { data, error } = await supabase
        .from("folders")
        .select("id");
      if (error || !data) return [];
      return data.map((f) => f.id);
    }

    const { data, error } = await supabase
      .from("folder_members")
      .select("folder_id")
      .eq("user_id", userId);

    if (error || !data) return [];
    const directIds = data.map((row) => row.folder_id);

    const allIds = new Set(directIds);
    for (const folderId of directIds) {
      const descendants = await getDescendantFolderIds(folderId);
      for (const id of descendants) {
        allIds.add(id);
      }
    }

    return Array.from(allIds);
  },

  /**
   * Get all folders a user can access, including ancestor folders needed
   * for tree rendering. This is the single source of truth for what
   * folders should appear in the sidebar.
   *
   * Returns the full folder records so the API layer doesn't need to
   * re-query or implement its own traversal logic.
   */
  async getAccessibleFolders(
    userId: string,
  ): Promise<
    { id: string; name: string; parent_id: string | null; logo_url: string | null; created_by: string; created_at: string; updated_at: string }[]
  > {
    const supabase = createAdminClient();
    const isSuperadmin = await fetchIsSuperadmin(userId);

    if (isSuperadmin) {
      const { data, error } = await supabase
        .from("folders")
        .select("id, name, parent_id, logo_url, created_by, created_at, updated_at")
        .order("name");
      if (error) return [];
      return data ?? [];
    }

    const accessibleIds = await this.getAccessibleFolderIds(userId);
    if (accessibleIds.length === 0) return [];

    const { data: accessibleFolders, error } = await supabase
      .from("folders")
      .select("id, name, parent_id, logo_url, created_by, created_at, updated_at")
      .in("id", accessibleIds)
      .order("name");

    if (error || !accessibleFolders) return [];

    // Walk up ancestor chains so the client can render a proper tree
    const knownIds = new Set(accessibleIds);
    const ancestorIds = new Set<string>();
    const toResolve: string[] = [];

    for (const f of accessibleFolders) {
      if (f.parent_id && !knownIds.has(f.parent_id)) {
        toResolve.push(f.parent_id);
      }
    }

    while (toResolve.length > 0) {
      const parentId = toResolve.pop()!;
      if (knownIds.has(parentId) || ancestorIds.has(parentId)) continue;
      ancestorIds.add(parentId);
      const { data: parent } = await supabase
        .from("folders")
        .select("id, parent_id")
        .eq("id", parentId)
        .maybeSingle();
      if (parent?.parent_id) {
        toResolve.push(parent.parent_id);
      }
    }

    let ancestorFolders: typeof accessibleFolders = [];
    if (ancestorIds.size > 0) {
      const { data: ancestors } = await supabase
        .from("folders")
        .select("id, name, parent_id, logo_url, created_by, created_at, updated_at")
        .in("id", Array.from(ancestorIds));
      ancestorFolders = ancestors ?? [];
    }

    const allFolders = [...accessibleFolders, ...ancestorFolders];
    const seen = new Set<string>();
    return allFolders.filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  },

  /**
   * Check if a user is a superadmin.
   */
  async isSuperadmin(userId: string): Promise<boolean> {
    return fetchIsSuperadmin(userId);
  },

  /**
   * Check if a user has an admin or owner role on any folder,
   * or is a superadmin.
   */
  async canManageUsers(userId: string): Promise<boolean> {
    if (await fetchIsSuperadmin(userId)) return true;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("folder_members")
      .select("id")
      .eq("user_id", userId)
      .in("role", ["admin", "owner"])
      .limit(1);

    if (error || !data) return false;
    return data.length > 0;
  },

  /**
   * Resolve sidebar-level visibility flags for a user across all folders.
   * - canChat: true if the user holds viewer, editor, admin, or owner on any folder (or is superadmin)
   * - canManageUsers: true if admin/owner on any folder (or is superadmin)
   */
  async getSidebarAccess(userId: string): Promise<{
    canChat: boolean;
    canManageUsers: boolean;
  }> {
    if (await fetchIsSuperadmin(userId)) {
      return { canChat: true, canManageUsers: true };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("folder_members")
      .select("role")
      .eq("user_id", userId);

    if (error || !data || data.length === 0) {
      return { canChat: false, canManageUsers: false };
    }

    const roles = new Set(data.map((r) => r.role as FolderRole));
    const chatRoles: FolderRole[] = ["viewer", "editor", "admin", "owner"];
    const manageRoles: FolderRole[] = ["admin", "owner"];

    return {
      canChat: chatRoles.some((r) => roles.has(r)),
      canManageUsers: manageRoles.some((r) => roles.has(r)),
    };
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
   * Get members from all ancestor (parent) folders, walking up the hierarchy.
   * Useful for expanding the approver candidate pool beyond the direct folder.
   */
  async getAncestorMembers(
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
    const ancestors = await fetchAncestorChain(folderId);
    const directMembers = await this.getFolderMembers(folderId);
    const directUserIds = new Set(directMembers.map((m) => m.userId));

    const ancestorMembers: {
      userId: string;
      email: string;
      name: string;
      role: FolderRole;
      fromFolderId: string;
      fromFolderName: string;
    }[] = [];
    const seen = new Set<string>();

    for (const ancestorId of ancestors) {
      const { data: folder } = await supabase
        .from("folders")
        .select("name")
        .eq("id", ancestorId)
        .maybeSingle();

      const members = await this.getFolderMembers(ancestorId);
      for (const member of members) {
        if (!directUserIds.has(member.userId) && !seen.has(member.userId)) {
          seen.add(member.userId);
          ancestorMembers.push({
            ...member,
            fromFolderId: ancestorId,
            fromFolderName: folder?.name ?? "",
          });
        }
      }
    }

    return ancestorMembers;
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
