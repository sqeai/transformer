"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { FolderContextEditor } from "@/components/folders/FolderContextEditor";

export default function FolderContextPage() {
  const params = useParams();
  const folderId = params.id as string;

  return (
    <DashboardLayout>
      <FolderContextEditor folderId={folderId} />
    </DashboardLayout>
  );
}
