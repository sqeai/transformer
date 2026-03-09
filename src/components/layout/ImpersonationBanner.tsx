"use client";

import { Eye, X } from "lucide-react";
import { useImpersonation } from "@/hooks/useImpersonation";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const { impersonating, stopImpersonating } = useImpersonation();

  if (!impersonating) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2">
      <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          Viewing as{" "}
          <strong>{impersonating.fullName || impersonating.email}</strong>
          {impersonating.fullName && (
            <span className="text-amber-600/70 dark:text-amber-400/70">
              {" "}({impersonating.email})
            </span>
          )}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={stopImpersonating}
        className="h-7 gap-1.5 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 hover:text-amber-800 dark:hover:text-amber-200"
      >
        <X className="h-3.5 w-3.5" />
        Stop Impersonating
      </Button>
    </div>
  );
}
