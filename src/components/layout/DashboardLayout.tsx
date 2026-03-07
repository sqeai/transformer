"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState, useEffect, useCallback } from "react";
import {
  LogOut,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
  Loader2,
  UserCircle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
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
import { RenameFolderDialog } from "@/components/folders/RenameFolderDialog";
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
const FOLDERS_COLLAPSED_KEY = "sidebar-folders-collapsed";

interface ChatHistoryItem {
  id: string;
  title: string;
  agent_type: string;
  persona: string | null;
  created_at: string;
  updated_at: string;
}

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
  const [foldersCollapsed, setFoldersCollapsed] = useState(false);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);

  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [accessFolderId, setAccessFolderId] = useState("");
  const [accessFolderName, setAccessFolderName] = useState("");

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) setCollapsed(stored === "true");
    const fStored = localStorage.getItem(FOLDERS_COLLAPSED_KEY);
    if (fStored !== null) setFoldersCollapsed(fStored === "true");
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

  const loadChatHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-history?agentType=analyst");
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchFolders();
    loadChatHistory();
  }, [fetchFolders, loadChatHistory]);

  useEffect(() => {
    const handler = () => loadChatHistory();
    window.addEventListener("chat-history-updated", handler);
    return () => window.removeEventListener("chat-history-updated", handler);
  }, [loadChatHistory]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  const toggleFoldersCollapsed = () => {
    setFoldersCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        localStorage.setItem(FOLDERS_COLLAPSED_KEY, String(next));
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

  const handleRenameFolder = (folderId: string) => {
    const findFolder = (nodes: FolderNode[]): FolderNode | undefined => {
      for (const n of nodes) {
        if (n.id === folderId) return n;
        const found = findFolder(n.children);
        if (found) return found;
      }
      return undefined;
    };
    const folder = findFolder(folders);
    setRenameFolderId(folderId);
    setRenameFolderName(folder?.name ?? "");
    setRenameDialogOpen(true);
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
  const isProfileActive = pathname === "/profile";
  const isAdminActive = pathname.startsWith("/admin");

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
            {/* Header: Logo + Collapse toggle */}
            <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-sidebar-foreground mx-auto"
                      onClick={toggleCollapsed}
                    >
                      <PanelLeftOpen className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <Link
                    href="/folders"
                    className="flex items-center gap-2 font-semibold text-sidebar-foreground min-w-0 flex-1"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                      <Sparkles className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent truncate">
                      Starlight
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-sidebar-foreground"
                    onClick={toggleCollapsed}
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Scrollable middle section */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Collapsible Folders panel */}
              <div className="p-2 space-y-1 flex-1 min-h-0 overflow-y-auto">
                {!collapsed ? (
                  <button
                    onClick={toggleFoldersCollapsed}
                    className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {foldersCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    Folders
                  </button>
                ) : null}

                {!foldersCollapsed && (
                  <>
                    {foldersLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <FolderTree
                        folders={folders}
                        collapsed={collapsed}
                        onCreateFolder={handleCreateFolder}
                        onRenameFolder={handleRenameFolder}
                        onDeleteFolder={handleDeleteFolder}
                        onManageAccess={handleManageAccess}
                      />
                    )}
                  </>
                )}
              </div>

              {!collapsed && <Separator className="mx-2" />}

              {/* New Chat link + Chat history */}
              <div className="p-2 space-y-1 flex flex-col min-h-[300px] shrink-0">
                {(() => {
                  const newChatLink = (
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
                      <SquarePen className="h-4 w-4 shrink-0" />
                      {!collapsed && "New Chat"}
                    </Link>
                  );
                  if (collapsed) {
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>{newChatLink}</TooltipTrigger>
                        <TooltipContent side="right">New Chat</TooltipContent>
                      </Tooltip>
                    );
                  }
                  return newChatLink;
                })()}

                {/* Chat history */}
                {!collapsed && (
                  <div className="flex-1 overflow-y-auto -mx-2 mt-1">
                    {chatHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No saved chats</p>
                    ) : (
                      <div className="space-y-0.5 px-2">
                        {chatHistory.map((chat) => (
                          <Link
                            key={chat.id}
                            href={`/assistant?chat=${chat.id}`}
                            className="block rounded-lg px-2 py-1.5 hover:bg-sidebar-accent/50 transition-colors"
                          >
                            <p className="text-xs font-medium truncate text-sidebar-foreground">{chat.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {chat.persona && <span className="capitalize">{chat.persona.replace("_", " ")} · </span>}
                              {new Date(chat.updated_at).toLocaleDateString()}
                            </p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {user?.isSuperadmin && (() => {
                  const adminLink = (
                    <Link
                      href="/admin/users"
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isAdminActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      {!collapsed && "User Management"}
                    </Link>
                  );
                  if (collapsed) {
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>{adminLink}</TooltipTrigger>
                        <TooltipContent side="right">User Management</TooltipContent>
                      </Tooltip>
                    );
                  }
                  return adminLink;
                })()}
              </div>
            </div>

            {/* Sticky bottom: Profile */}
            <div className="shrink-0 border-t border-sidebar-border">
              <div className="p-2 space-y-1">
                {(() => {
                  const profileLink = (
                    <Link
                      href="/profile"
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isProfileActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <UserCircle className="h-4 w-4 shrink-0" />
                      {!collapsed && "Profile"}
                    </Link>
                  );
                  if (collapsed) {
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>{profileLink}</TooltipTrigger>
                        <TooltipContent side="right">Profile</TooltipContent>
                      </Tooltip>
                    );
                  }
                  return profileLink;
                })()}
              </div>

              {!collapsed && (
                <div className="px-4 pb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{user?.email}</span>
                  <ThemeToggle />
                </div>
              )}

              <div className="p-2">
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

      <RenameFolderDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        folderId={renameFolderId}
        currentName={renameFolderName}
        onRenamed={fetchFolders}
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
