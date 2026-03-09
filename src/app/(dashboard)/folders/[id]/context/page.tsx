"use client";

import { useParams } from "next/navigation";
import { FolderContextEditor } from "@/components/folders/FolderContextEditor";
import { FolderPageGuard } from "@/components/auth/FolderPageGuard";

export default function FolderContextPage() {
  const params = useParams();
  const folderId = params.id as string;

  return (
    <FolderPageGuard folderId={folderId} requiredPermission="view_context">
      <FolderContextEditor folderId={folderId} />
    </FolderPageGuard>
  );
}
