"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function DatasetRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/datasets/${id}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const folderId = data?.dataset?.folderId;
        const schemaId = data?.dataset?.schemaId;
        if (folderId && schemaId) {
          router.replace(`/folders/${folderId}/schemas/${schemaId}/datasets/${id}`);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true));
  }, [id, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground text-lg">Dataset not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
    </div>
  );
}
