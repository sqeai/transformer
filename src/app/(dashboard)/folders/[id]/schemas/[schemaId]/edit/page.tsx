"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditSchemaRedirect() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const schemaId = params.schemaId as string;

  useEffect(() => {
    router.replace(`/folders/${folderId}/schemas/${schemaId}`);
  }, [folderId, schemaId, router]);

  return null;
}
