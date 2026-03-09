"use client";

import { useParams } from "next/navigation";
import { FolderContextEditor } from "@/components/folders/FolderContextEditor";

export default function FolderContextPage() {
  const params = useParams();
  const folderId = params.id as string;

  return <FolderContextEditor folderId={folderId} />;
}
