"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePermissions } from "@/hooks/usePermissions";

export default function FolderRedirect() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const { role, loading } = usePermissions(folderId);

  useEffect(() => {
    if (loading) return;
    const target = role === "data_engineer" ? "schemas" : "dashboard";
    router.replace(`/folders/${folderId}/${target}`);
  }, [folderId, router, role, loading]);

  return null;
}
