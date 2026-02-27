"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState, useEffect } from "react";
import {
  LogOut,
  Sparkles,
  FileStack,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
const nav = [
  { name: "Datasets", href: "/datasets", icon: Database },
  { name: "Schemas", href: "/schemas", icon: FileStack },
];

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  return (
    <ProtectedRoute>
      <div className="animated-bg">
        <div className="grain" />
      </div>
      <div className="relative z-10 flex min-h-screen w-full">
        <TooltipProvider delayDuration={0}>
          <aside
            className={cn(
              "fixed left-0 top-0 z-20 flex h-screen flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl transition-[width] duration-200",
              collapsed ? "w-16" : "w-64",
            )}
          >
            <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
              <Link
                href="/schemas"
                className="flex items-center gap-2 font-semibold text-sidebar-foreground min-w-0"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                  <Sparkles className="h-5 w-5 text-primary-foreground" />
                </div>
                {!collapsed && (
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent truncate">
                    AI Data Cleanser
                  </span>
                )}
              </Link>
            </div>
            <nav className="flex-1 space-y-1 p-2">
              {nav.map((item) => {
                const href = item.href;
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const link = (
                  <Link
                    key={item.href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && item.name}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.name}</TooltipContent>
                    </Tooltip>
                  );
                }
                return link;
              })}
            </nav>

            <div className="px-2 pb-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full text-sidebar-foreground",
                  collapsed ? "justify-center px-0" : "justify-start",
                )}
                onClick={toggleCollapsed}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <>
                    <PanelLeftClose className="mr-2 h-4 w-4" />
                    Collapse
                  </>
                )}
              </Button>
            </div>

            <Separator />
            <div className="p-2">
              {!collapsed && (
                <div className="mb-2 flex items-center justify-between px-2 text-xs text-muted-foreground">
                  <span className="truncate">{user?.email}</span>
                  <ThemeToggle />
                </div>
              )}
              {collapsed ? (
                <div className="flex flex-col items-center gap-2">
                  <ThemeToggle />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-sidebar-foreground"
                        onClick={() => signOut()}
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Sign Out</TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-sidebar-foreground"
                  onClick={() => signOut()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              )}
            </div>
          </aside>
        </TooltipProvider>
        <main
          className={cn(
            "flex-1 min-w-0 overflow-y-auto transition-[padding-left] duration-200",
            collapsed ? "pl-16" : "pl-64",
          )}
        >
          <div className="min-h-screen p-6">{children}</div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
