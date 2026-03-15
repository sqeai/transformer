"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FolderPageGuard } from "@/components/auth/FolderPageGuard";

export default function DashboardDetailRedirect() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;

  useEffect(() => {
    router.replace(`/folders/${folderId}/dashboard`);
  }, [folderId, router]);

  return (
    <FolderPageGuard folderId={folderId} requiredPermission="view_panels">
      {null}
    </FolderPageGuard>
  );
}
