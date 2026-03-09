"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Data sources are managed at the folder level.
 * Redirect to folders so the user can open a folder and go to its Data Sources tab.
 */
export default function DataSourcesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/folders");
  }, [router]);
  return null;
}
