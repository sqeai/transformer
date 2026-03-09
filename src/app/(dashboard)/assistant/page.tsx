"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnalystChat } from "@/components/analyst/AnalystChat";
import { Loader2 } from "lucide-react";

export default function AssistantPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/users/me/sidebar-access");
        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;

        if (data.canChat) {
          setAllowed(true);
          return;
        }

        const foldersRes = await fetch("/api/folders");
        if (!foldersRes.ok) return;
        const foldersData = await foldersRes.json();
        const folders = foldersData.folders ?? [];

        if (cancelled) return;

        if (folders.length > 0) {
          router.replace(`/folders/${folders[0].id}`);
        }
      } catch {
        /* ignore */
      }
    }

    check();
    return () => { cancelled = true; };
  }, [router]);

  if (allowed === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <AnalystChat />;
}
