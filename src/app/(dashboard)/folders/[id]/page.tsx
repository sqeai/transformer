"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function FolderRedirect() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;

  useEffect(() => {
    router.replace(`/folders/${folderId}/dashboard`);
  }, [folderId, router]);

  return null;
}
