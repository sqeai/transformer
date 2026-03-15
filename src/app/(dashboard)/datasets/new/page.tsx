"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function RedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(false);

  useEffect(() => {
    const schemaId = searchParams.get("schemaId");
    const folderId = searchParams.get("folderId");

    if (schemaId && folderId) {
      const qs = searchParams.toString();
      router.replace(`/folders/${folderId}/schemas/${schemaId}/datasets/new?${qs}`);
      return;
    }

    if (schemaId) {
      fetch(`/api/schemas/${schemaId}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const resolvedFolderId = data?.schema?.folderId;
          if (resolvedFolderId) {
            const qs = searchParams.toString();
            router.replace(`/folders/${resolvedFolderId}/schemas/${schemaId}/datasets/new?${qs}`);
          } else {
            setError(true);
          }
        })
        .catch(() => setError(true));
      return;
    }

    setError(true);
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground text-lg">Missing schema or folder information.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
    </div>
  );
}

export default function NewDatasetRedirect() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <RedirectContent />
    </Suspense>
  );
}
