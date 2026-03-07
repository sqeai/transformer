"use client";

import { useState, useEffect, useCallback } from "react";
import type { Permission, FolderRole } from "@/lib/permissions";

interface PermissionsState {
  role: FolderRole | null;
  permissions: Permission[];
  isSuperadmin: boolean;
  inheritedFrom: string | null;
  loading: boolean;
}

export function usePermissions(folderId: string | null | undefined) {
  const [state, setState] = useState<PermissionsState>({
    role: null,
    permissions: [],
    isSuperadmin: false,
    inheritedFrom: null,
    loading: true,
  });

  const fetchPermissions = useCallback(async () => {
    if (!folderId) {
      setState({
        role: null,
        permissions: [],
        isSuperadmin: false,
        inheritedFrom: null,
        loading: false,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/folders/${folderId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        setState({
          role: data.role,
          permissions: data.permissions,
          isSuperadmin: data.isSuperadmin,
          inheritedFrom: data.inheritedFrom,
          loading: false,
        });
      } else {
        setState({
          role: null,
          permissions: [],
          isSuperadmin: false,
          inheritedFrom: null,
          loading: false,
        });
      }
    } catch {
      setState({
        role: null,
        permissions: [],
        isSuperadmin: false,
        inheritedFrom: null,
        loading: false,
      });
    }
  }, [folderId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const can = useCallback(
    (permission: Permission) => state.permissions.includes(permission),
    [state.permissions],
  );

  const canAny = useCallback(
    (...perms: Permission[]) => perms.some((p) => state.permissions.includes(p)),
    [state.permissions],
  );

  const canAll = useCallback(
    (...perms: Permission[]) => perms.every((p) => state.permissions.includes(p)),
    [state.permissions],
  );

  return {
    ...state,
    can,
    canAny,
    canAll,
    refetch: fetchPermissions,
  };
}
