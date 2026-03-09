"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useImpersonation } from "@/hooks/useImpersonation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserOption {
  id: string;
  email: string;
  full_name: string | null;
}

export function ImpersonationSelector({ collapsed }: { collapsed: boolean }) {
  const { impersonating, isSuperadmin, startImpersonating, stopImpersonating } =
    useImpersonation();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !isSuperadmin) return;
    setLoading(true);
    fetch("/api/impersonate/users")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setUsers(data))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [open, isSuperadmin]);

  if (!isSuperadmin) return null;

  const filtered = search
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  if (impersonating) {
    const content = (
      <button
        onClick={stopImpersonating}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors w-full",
          "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 border border-amber-500/30",
          collapsed && "justify-center px-0",
        )}
      >
        <EyeOff className="h-3.5 w-3.5 shrink-0" />
        {!collapsed && (
          <span className="truncate text-left flex-1">
            Stop: {impersonating.fullName || impersonating.email}
          </span>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right">
            Stop impersonating {impersonating.fullName || impersonating.email}
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  }

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent/50",
        collapsed ? "justify-center px-0 h-8 w-8" : "justify-start gap-2",
      )}
    >
      <Eye className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && "Impersonate"}
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">Impersonate User</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align="start"
        className="w-72 p-0"
      >
        <div className="p-2 border-b">
          <div className="flex items-center gap-2 rounded-md border px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No users found
            </p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  startImpersonating({
                    id: u.id,
                    email: u.email,
                    fullName: u.full_name ?? "",
                  });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-xs">
                    {u.full_name || u.email.split("@")[0]}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {u.email}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
