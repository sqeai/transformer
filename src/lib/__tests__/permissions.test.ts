import { describe, it, expect, vi } from "vitest";

// Mock the supabase admin module before importing permissions
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { PermissionsService, type FolderRole, type Permission } from "../permissions";

// ---------------------------------------------------------------------------
// getPermissionsForRole — pure synchronous function, no DB calls
// ---------------------------------------------------------------------------

describe("PermissionsService.getPermissionsForRole", () => {
  it("returns viewer permissions", () => {
    const perms = PermissionsService.getPermissionsForRole("viewer");
    expect(perms).toContain("view_datasets");
    expect(perms).toContain("view_schemas");
    expect(perms).not.toContain("edit_schemas");
    expect(perms).not.toContain("delete_folder");
  });

  it("returns editor permissions (superset of viewer)", () => {
    const perms = PermissionsService.getPermissionsForRole("editor");
    expect(perms).toContain("edit_datasets");
    expect(perms).toContain("edit_schemas");
    expect(perms).not.toContain("manage_users");
    expect(perms).not.toContain("delete_folder");
  });

  it("returns admin permissions (superset of editor)", () => {
    const perms = PermissionsService.getPermissionsForRole("admin");
    expect(perms).toContain("manage_users");
    expect(perms).not.toContain("delete_folder");
  });

  it("returns owner permissions (includes delete_folder)", () => {
    const perms = PermissionsService.getPermissionsForRole("owner");
    expect(perms).toContain("delete_folder");
    expect(perms).toContain("manage_users");
    expect(perms).toContain("edit_schemas");
  });

  it("returns data_engineer permissions", () => {
    const perms = PermissionsService.getPermissionsForRole("data_engineer");
    expect(perms).toContain("edit_datasets");
    expect(perms).toContain("edit_schemas");
    expect(perms).not.toContain("view_context");
    expect(perms).not.toContain("delete_folder");
  });

  it("returns an array for every valid role", () => {
    const roles: FolderRole[] = ["viewer", "editor", "admin", "owner", "data_engineer"];
    for (const role of roles) {
      const perms = PermissionsService.getPermissionsForRole(role);
      expect(Array.isArray(perms)).toBe(true);
      expect(perms.length).toBeGreaterThan(0);
    }
  });

  it("owner permissions are a superset of admin permissions", () => {
    const adminPerms = new Set(PermissionsService.getPermissionsForRole("admin"));
    const ownerPerms = PermissionsService.getPermissionsForRole("owner");
    for (const p of adminPerms) {
      expect(ownerPerms).toContain(p);
    }
  });

  it("all returned permissions are valid Permission types", () => {
    const allPermissions: Permission[] = [
      "view_context", "view_data_sources", "view_datasets", "view_schemas",
      "view_panels", "view_alerts", "view_members", "use_chat",
      "edit_context", "edit_data_sources", "edit_datasets", "edit_schemas",
      "edit_panels", "edit_alerts", "manage_users", "manage_folder", "delete_folder",
    ];
    const allPermSet = new Set(allPermissions);
    const roles: FolderRole[] = ["viewer", "editor", "admin", "owner", "data_engineer"];
    for (const role of roles) {
      for (const perm of PermissionsService.getPermissionsForRole(role)) {
        expect(allPermSet.has(perm)).toBe(true);
      }
    }
  });
});
