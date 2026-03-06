"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState, useEffect, useCallback } from "react";
import {
  LogOut,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Loader2,
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
import { FolderTree, type FolderNode } from "@/components/folders/FolderTree";
import { CreateFolderDialog } from "@/components/folders/CreateFolderDialog";
import { ManageAccessDialog } from "@/components/folders/ManageAccessDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";

function buildTree(
  flat: { id: string; name: string; parent_id: string | null }[],
): FolderNode[] {
  const map = new Map<string, FolderNode>();
  for (const f of flat) {
    map.set(f.id, { id: f.id, name: f.name, parentId: f.parent_id, children: [] });
  }
  const roots: FolderNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);

  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [accessFolderId, setAccessFolderId] = useState("");
  const [accessFolderName, setAccessFolderName] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      if (res.ok) {
        const data = await res.json();
        setFolders(buildTree(data.folders ?? []));
      }
    } catch {
      /* ignore */
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  const handleCreateFolder = (parentId: string | null) => {
    setCreateParentId(parentId);
    setCreateDialogOpen(true);
  };

  const handleManageAccess = (folderId: string) => {
    const findFolder = (nodes: FolderNode[]): FolderNode | undefined => {
      for (const n of nodes) {
        if (n.id === folderId) return n;
        const found = findFolder(n.children);
        if (found) return found;
      }
      return undefined;
    };
    const folder = findFolder(folders);
    setAccessFolderId(folderId);
    setAccessFolderName(folder?.name ?? "");
    setAccessDialogOpen(true);
  };

  const handleDeleteFolder = (folderId: string) => {
    setDeleteFolderId(folderId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch(`/api/folders/${deleteFolderId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Folder deleted");
        fetchFolders();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to delete folder");
      }
    } catch {
      toast.error("Failed to delete folder");
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const isAssistantActive =
    pathname === "/assistant" || pathname.startsWith("/assistant/");

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
                href="/folders"
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

            <nav className="flex-1 overflow-y-auto p-2 space-y-1">
              {!collapsed && (
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Folders
                </p>
              )}
              {foldersLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <FolderTree
                  folders={folders}
                  collapsed={collapsed}
                  onCreateFolder={handleCreateFolder}
                  onDeleteFolder={handleDeleteFolder}
                  onManageAccess={handleManageAccess}
                />
              )}

              {!collapsed && <Separator className="my-2" />}

              {(() => {
                const link = (
                  <Link
                    href="/assistant"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isAssistantActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    {!collapsed && "Assistant"}
                  </Link>
                );
                if (collapsed) {
                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">Assistant</TooltipContent>
                    </Tooltip>
                  );
                }
                return link;
              })()}
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
            "flex-1 min-w-0 overflow-auto transition-[padding-left] duration-200 h-screen",
            collapsed ? "pl-16" : "pl-64",
          )}
        >
          <div className="h-full p-6">{children}</div>
        </main>
      </div>

      <CreateFolderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        parentId={createParentId}
        onCreated={fetchFolders}
      />

      <ManageAccessDialog
        open={accessDialogOpen}
        onOpenChange={setAccessDialogOpen}
        folderId={accessFolderId}
        folderName={accessFolderName}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this folder and all its contents,
              including sub-folders, schemas, datasets, and dashboards. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}
