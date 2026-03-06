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
  { key: "context", label: "Context", icon: FileText, href: "/context" },
  { key: "data-sources", label: "Data Sources", icon: Cable, href: "/data-sources" },
  { key: "schemas", label: "Schemas", icon: FileStack, href: "/schemas" },
  { key: "datasets", label: "Datasets", icon: Database, href: "/datasets" },
  { key: "panels", label: "Panels", icon: LayoutDashboard, href: "/panels" },
  { key: "alerts", label: "Alerts", icon: Bell, href: "/alerts" },
];

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
          isActive && "bg-sidebar-accent/30",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={toggleExpanded}
          className="shrink-0 p-0.5 rounded hover:bg-sidebar-accent"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        <Link
          href={folderBasePath}
          className="flex items-center gap-2 min-w-0 flex-1"
        >
          {expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
          )}
          <span className="truncate text-sidebar-foreground">{node.name}</span>
        </Link>
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
          {FOLDER_SECTIONS.map((section) => {
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
