"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import type { Permission } from "@/lib/permissions";

interface FolderPageGuardProps {
  folderId: string;
  requiredPermission: Permission;
  children: React.ReactNode;
}

/**
 * Guards a folder sub-page by checking whether the current user has the
 * required permission on the folder. Redirects to the folder root (which
 * itself redirects to the first allowed section) when access is denied.
 */
export function FolderPageGuard({
  folderId,
  requiredPermission,
  children,
}: FolderPageGuardProps) {
  const { can, loading } = usePermissions(folderId);
  const router = useRouter();
  const hasAccess = can(requiredPermission);

  useEffect(() => {
    if (loading) return;
    if (!hasAccess) {
      router.replace(`/folders/${folderId}`);
    }
  }, [loading, hasAccess, folderId, router]);

  if (loading) return null;
  if (!hasAccess) return null;

  return <>{children}</>;
}
