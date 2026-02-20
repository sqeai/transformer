"use client";

import { type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SchemaStoreProvider } from "@/lib/schema-store";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <SchemaStoreProvider>
            {children}
          </SchemaStoreProvider>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
