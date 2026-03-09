"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Database,
  FileStack,
  LayoutDashboard,
  Cable,
  Bell,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  logoUrl: string | null;
  role: string | null;
  children: FolderNode[];
}

interface FolderTreeProps {
  folders: FolderNode[];
  collapsed: boolean;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onManageAccess: (folderId: string) => void;
}

const FOLDER_SECTIONS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { key: "panels", label: "Panels", icon: LayoutDashboard, href: "/panels" },
  { key: "context", label: "Context", icon: FileText, href: "/context" },
  { key: "datasets", label: "Datasets", icon: Database, href: "/datasets" },
  { key: "schemas", label: "Schemas", icon: FileStack, href: "/schemas" },
  { key: "data-sources", label: "Data Sources", icon: Cable, href: "/data-sources" },
  { key: "alerts", label: "Alerts", icon: Bell, href: "/alerts" },
];

const DATA_ENGINEER_SECTIONS = new Set(["schemas", "datasets"]);

function FolderNodeItem({
  node,
  depth,
  collapsed: sidebarCollapsed,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onManageAccess,
}: {
  node: FolderNode;
  depth: number;
  collapsed: boolean;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onManageAccess: (folderId: string) => void;
}) {
  const pathname = usePathname();
  const storageKey = `folder-expanded-${node.id}`;
  const [expanded, setExpanded] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(storageKey) !== "false";
    }
    return true;
  });

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  const folderBasePath = `/folders/${node.id}`;
  const isActive = pathname.startsWith(folderBasePath);

  if (sidebarCollapsed) {
    return null;
  }

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors hover:bg-sidebar-accent/50",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
            : "border-l-2 border-transparent",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={toggleExpanded}
          className="flex items-center gap-2 min-w-0 flex-1"
        >
          {expanded ? (
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
          ) : (
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
          )}
          {node.logoUrl ? (
            <img
              src={`/api/folder-logos/${node.id}?v=${encodeURIComponent(node.logoUrl)}`}
              alt=""
              className="h-4 w-4 shrink-0 rounded object-cover"
            />
          ) : expanded ? (
            <FolderOpen className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-amber-500")} />
          ) : (
            <Folder className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-amber-500")} />
          )}
          <span className={cn("truncate font-medium text-left", isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground")}>{node.name}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent transition-opacity">
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right">
            <DropdownMenuItem onClick={() => onCreateFolder(node.id)}>
              <Plus className="mr-2 h-4 w-4" />
              New Sub-Folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRenameFolder(node.id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onManageAccess(node.id)}>
              <Users className="mr-2 h-4 w-4" />
              Manage Access
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDeleteFolder(node.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <div>
          {FOLDER_SECTIONS
            .filter((section) =>
              node.role === "data_engineer"
                ? DATA_ENGINEER_SECTIONS.has(section.key)
                : true,
            )
            .map((section) => {
            const sectionPath = `${folderBasePath}${section.href}`;
            const isSectionActive =
              pathname === sectionPath || pathname.startsWith(sectionPath + "/");
            return (
              <Link
                key={section.key}
                href={sectionPath}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1 text-xs transition-colors",
                  isSectionActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
                style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
              >
                <section.icon className="h-3.5 w-3.5 shrink-0" />
                {section.label}
              </Link>
            );
          })}

          {node.children.map((child) => (
            <FolderNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={sidebarCollapsed}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onManageAccess={onManageAccess}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  folders,
  collapsed,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onManageAccess,
}: FolderTreeProps) {
  if (collapsed) return null;

  return (
    <div className="space-y-0.5">
      {folders.map((folder) => (
        <FolderNodeItem
          key={folder.id}
          node={folder}
          depth={0}
          collapsed={collapsed}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onManageAccess={onManageAccess}
        />
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground text-xs mt-1"
        onClick={() => onCreateFolder(null)}
      >
        <Plus className="mr-2 h-3.5 w-3.5" />
        New Folder
      </Button>
    </div>
  );
}
