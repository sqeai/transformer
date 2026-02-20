"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import {
  LogOut,
  Sparkles,
  FileStack,
  Database,
  ArrowRightLeft,
  Eye,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";

const nav = [
  { name: "Final Schemas", href: "/schemas", icon: FileStack },
  { name: "Upload raw data", href: "/upload", icon: Database },
  { name: "Mapping Builder", href: "/mapping", icon: ArrowRightLeft },
  { name: "Preview", href: "/preview", icon: Eye },
  { name: "Export", href: "/export", icon: Download },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <ProtectedRoute>
      <div className="animated-bg">
        <div className="grain" />
      </div>
      <div className="relative z-10 flex min-h-screen w-full">
        <aside className="fixed left-0 top-0 z-20 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
            <Link
              href="/schemas"
              className="flex items-center gap-2 font-semibold text-sidebar-foreground"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                AI Data Cleanser
              </span>
            </Link>
          </div>
          <nav className="flex-1 space-y-1 p-2">
            {nav.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <Separator />
          <div className="p-2">
            <div className="mb-2 flex items-center justify-between px-2 text-xs text-muted-foreground">
              <span>{user?.email}</span>
              <ThemeToggle />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground"
              onClick={() => signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </aside>
        <main className="flex-1 pl-64">
          <div className="min-h-screen p-6">{children}</div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
