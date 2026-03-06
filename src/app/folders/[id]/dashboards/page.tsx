"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutDashboard, ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Dashboard {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export default function FolderDashboardsPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadDashboards = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboards?folderId=${folderId}`);
      if (res.ok) {
        setDashboards(await res.json());
      }
    } catch {
      toast.error("Failed to load dashboards");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

  const createDashboard = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, name: "Untitled Dashboard" }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/folders/${folderId}/dashboards/${data.id}`);
      } else {
        toast.error("Failed to create dashboard");
      }
    } catch {
      toast.error("Failed to create dashboard");
    } finally {
      setCreating(false);
    }
  };

  const deleteDashboard = async (id: string) => {
    try {
      const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDashboards((prev) => prev.filter((d) => d.id !== id));
        toast.success("Dashboard deleted");
      }
    } catch {
      toast.error("Failed to delete dashboard");
    }
  };

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/folders/${folderId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Dashboards</h1>
              <p className="text-sm text-muted-foreground">
                Charts and analytics dashboards
              </p>
            </div>
          </div>
          <Button onClick={createDashboard} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            New Dashboard
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dashboards.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutDashboard className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No dashboards yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Create your first dashboard to start building charts.
              </p>
              <Button onClick={createDashboard} disabled={creating}>
                <Plus className="h-4 w-4 mr-2" />
                Create Dashboard
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((dashboard) => (
              <Card
                key={dashboard.id}
                className="cursor-pointer hover:border-primary/50 transition-colors group"
                onClick={() => router.push(`/folders/${folderId}/dashboards/${dashboard.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <LayoutDashboard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{dashboard.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          Updated {new Date(dashboard.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDashboard(dashboard.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
  );
}
