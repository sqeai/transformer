"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Folder, Plus, Users, Loader2 } from "lucide-react";
import { CreateFolderDialog } from "@/components/folders/CreateFolderDialog";
import { Badge } from "@/components/ui/badge";

interface FolderSummary {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  member_count?: number;
  children_count?: number;
}

export default function FoldersPage() {
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const router = useRouter();

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      if (res.ok) {
        const data = await res.json();
        const rootFolders = (data.folders ?? []).filter(
          (f: FolderSummary) => !f.parent_id,
        );
        setFolders(rootFolders);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Folders</h1>
            <p className="text-sm text-muted-foreground">
              Manage your organization structure and resources
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Folder
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : folders.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Folder className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No folders yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Create your first folder to organize your data resources.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Folder
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder) => (
              <Card
                key={folder.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/folders/${folder.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <Folder className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">
                        {folder.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Created {new Date(folder.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    {folder.member_count !== undefined && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Users className="h-3 w-3" />
                        {folder.member_count} members
                      </Badge>
                    )}
                    {folder.children_count !== undefined && folder.children_count > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Folder className="h-3 w-3" />
                        {folder.children_count} sub-folders
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={null}
        onCreated={fetchFolders}
      />
    </>
  );
}
