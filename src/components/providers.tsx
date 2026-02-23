"use client";

import { type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SchemaStoreProvider } from "@/lib/schema-store";
import { ChatProvider } from "@/components/ChatProvider";
import { ChatBubble } from "@/components/ChatBubble";
import { LivingBackground } from "@/components/LivingBackground";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <LivingBackground />
        <TooltipProvider>
          <SchemaStoreProvider>
            <ChatProvider>
              {children}
              <ChatBubble />
              <Toaster richColors position="top-right" />
            </ChatProvider>
          </SchemaStoreProvider>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
