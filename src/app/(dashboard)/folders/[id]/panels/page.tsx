"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  LayoutDashboard,
  Plus,
  Loader2,
  Trash2,
  BarChart3,
  TrendingUp,
  PieChart,
  ArrowLeft,
  ChevronRight,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AddPanelDialog } from "@/components/dashboard/AddPanelDialog";
import { usePanelTranslation } from "@/components/dashboard/usePanelTranslation";
import type {
  DashboardPanel,
  ChartType,
  PredefinedQuestion,
} from "@/components/dashboard/types";
import { FolderPageGuard } from "@/components/auth/FolderPageGuard";

const CHART_ICONS: Record<string, React.ElementType> = {
  bar: BarChart3,
  line: TrendingUp,
  pie: PieChart,
  scatter: BarChart3,
  waterfall: BarChart3,
};

interface PanelWithFolder extends DashboardPanel {
  folderId: string;
  folderName: string | null;
  dashboardId: string;
}

export default function FolderPanelsPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [subfolderPanels, setSubfolderPanels] = useState<PanelWithFolder[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { translateAndExecute, translatingPanels } = usePanelTranslation();

  const loadPanels = useCallback(async () => {
    try {
      const [ownRes, allRes] = await Promise.all([
        fetch(`/api/dashboards?folderId=${folderId}`),
        fetch(`/api/dashboards?folderId=${folderId}&includeSubfolders=true`),
      ]);

      // Load own panels (current folder)
      if (ownRes.ok) {
        const dashboards = await ownRes.json();
        let dashboard = dashboards[0];

        if (!dashboard) {
          const createRes = await fetch("/api/dashboards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId, name: "Dashboard" }),
          });
          if (createRes.ok) {
            dashboard = await createRes.json();
          }
        }

        if (dashboard) {
          setDashboardId(dashboard.id);
          const detailRes = await fetch(`/api/dashboards/${dashboard.id}`);
          if (detailRes.ok) {
            const data = await detailRes.json();
            if (Array.isArray(data.panels)) {
              const loaded = data.panels.map((p: Record<string, unknown>) => ({
                id: p.id,
                title: p.title,
                chartType: p.chart_type || p.chartType,
                data: p.data || [],
                config: p.config || {},
                prompt: p.prompt || "",
                sqlQuery: p.sql_query || p.sqlQuery || "",
              }));
              setPanels(loaded);
            }
          }
        }
      }

      // Load subfolder panels
      if (allRes.ok) {
        const allDashboards: {
          id: string;
          folder_id: string;
          folderName: string | null;
        }[] = await allRes.json();

        const subDashboards = allDashboards.filter(
          (d) => d.folder_id !== folderId,
        );

        const subPanels: PanelWithFolder[] = [];
        await Promise.all(
          subDashboards.map(async (db) => {
            try {
              const detailRes = await fetch(`/api/dashboards/${db.id}`);
              if (!detailRes.ok) return;
              const data = await detailRes.json();
              if (Array.isArray(data.panels)) {
                for (const p of data.panels) {
                  subPanels.push({
                    id: p.id,
                    title: p.title || "",
                    chartType: p.chart_type || p.chartType || "bar",
                    data: p.data || [],
                    config: p.config || {},
                    prompt: p.prompt || "",
                    sqlQuery: p.sql_query || p.sqlQuery || "",
                    folderId: db.folder_id,
                    folderName: db.folderName,
                    dashboardId: db.id,
                  });
                }
              }
            } catch {
              // skip failed dashboard loads
            }
          }),
        );

        setSubfolderPanels(subPanels);
      }
    } catch {
      toast.error("Failed to load panels");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    loadPanels();
  }, [loadPanels]);

  const savePanels = useCallback(
    async (updatedPanels: DashboardPanel[]) => {
      if (!dashboardId) return;
      try {
        await fetch(`/api/dashboards/${dashboardId}/panels`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panels: updatedPanels }),
        });
      } catch {
        toast.error("Failed to save panels");
      }
    },
    [dashboardId],
  );

  const handleAddPredefined = useCallback(
    (question: PredefinedQuestion) => {
      const newPanel: DashboardPanel = {
        id: crypto.randomUUID(),
        title: question.label,
        chartType: question.defaultChartType,
        data: [],
        config: {},
        prompt: question.label,
        sqlQuery: "",
      };
      const updated = [...panels, newPanel];
      setPanels(updated);
      savePanels(updated);
      toast.success(`Panel "${question.label}" added — generating query...`);

      translateAndExecute(newPanel).then((translated) => {
        if (translated !== newPanel) {
          setPanels((prev) =>
            prev.map((p) => (p.id === newPanel.id ? translated : p)),
          );
          savePanels(
            updated.map((p) => (p.id === newPanel.id ? translated : p)),
          );
        }
      });
    },
    [panels, savePanels, translateAndExecute],
  );

  const handleAddCustom = useCallback(
    (prompt: string, sqlQuery?: string) => {
      const newPanel: DashboardPanel = {
        id: crypto.randomUUID(),
        title: prompt,
        chartType: "bar" as ChartType,
        data: [],
        config: {},
        prompt,
        sqlQuery: sqlQuery || "",
      };
      const updated = [...panels, newPanel];
      setPanels(updated);
      savePanels(updated);
      toast.success("Panel added — generating query...");

      translateAndExecute(newPanel).then((translated) => {
        if (translated !== newPanel) {
          setPanels((prev) =>
            prev.map((p) => (p.id === newPanel.id ? translated : p)),
          );
          savePanels(
            updated.map((p) => (p.id === newPanel.id ? translated : p)),
          );
        }
      });
    },
    [panels, savePanels, translateAndExecute],
  );

  const deletePanel = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDeletingId(id);
      const updated = panels.filter((p) => p.id !== id);
      setPanels(updated);
      await savePanels(updated);
      setDeletingId(null);
      toast.success("Panel deleted");
    },
    [panels, savePanels],
  );

  const navigateToPanel = useCallback(
    (panelId: string, panelFolderId?: string) => {
      const targetFolder = panelFolderId || folderId;
      router.push(`/folders/${targetFolder}/panels/${panelId}`);
    },
    [folderId, router],
  );

  const totalPanels = panels.length + subfolderPanels.length;

  const subfolderGroups = subfolderPanels.reduce<
    Record<string, { folderName: string; folderId: string; panels: PanelWithFolder[] }>
  >((acc, panel) => {
    if (!acc[panel.folderId]) {
      acc[panel.folderId] = {
        folderName: panel.folderName || "Unknown Folder",
        folderId: panel.folderId,
        panels: [],
      };
    }
    acc[panel.folderId].panels.push(panel);
    return acc;
  }, {});

  if (loading) {
    return (
      <FolderPageGuard folderId={folderId} requiredPermission="view_panels">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FolderPageGuard>
    );
  }

  return (
    <FolderPageGuard folderId={folderId} requiredPermission="view_panels">
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
            <h1 className="text-2xl font-bold tracking-tight">Panels</h1>
            <p className="text-sm text-muted-foreground">
              {totalPanels} panel{totalPanels !== 1 ? "s" : ""} in this folder
              {subfolderPanels.length > 0 &&
                ` (${subfolderPanels.length} from subfolders)`}
            </p>
          </div>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Panel
        </Button>
      </div>

      {totalPanels === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <LayoutDashboard className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No panels yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Add panels to visualize your data. Each panel runs a query against
              your data sources and displays the results as a chart.
            </p>
            <Button
              onClick={() => setAddDialogOpen(true)}
              variant="outline"
              className="mt-4"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Panel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {panels.length > 0 && (
            <div className="space-y-2">
              {Object.keys(subfolderGroups).length > 0 && (
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">
                  This Folder
                </h2>
              )}
              {panels.map((panel) => (
                <PanelCard
                  key={panel.id}
                  panel={panel}
                  deletingId={deletingId}
                  translatingPanels={translatingPanels}
                  onNavigate={() => navigateToPanel(panel.id)}
                  onDelete={(e) => deletePanel(e, panel.id)}
                />
              ))}
            </div>
          )}

          {Object.values(subfolderGroups).map((group) => (
            <div key={group.folderId} className="space-y-2">
              <button
                onClick={() => router.push(`/folders/${group.folderId}/panels`)}
                className="flex items-center gap-2 px-1 group cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                  {group.folderName}
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({group.panels.length})
                </span>
              </button>
              {group.panels.map((panel) => (
                <PanelCard
                  key={panel.id}
                  panel={panel}
                  deletingId={null}
                  translatingPanels={translatingPanels}
                  onNavigate={() => navigateToPanel(panel.id, panel.folderId)}
                  isSubfolder
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <AddPanelDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAddPredefined={handleAddPredefined}
        onAddCustom={handleAddCustom}
      />
    </div>
    </FolderPageGuard>
  );
}

function PanelCard({
  panel,
  deletingId,
  translatingPanels,
  onNavigate,
  onDelete,
  isSubfolder,
}: {
  panel: DashboardPanel;
  deletingId: string | null;
  translatingPanels: Set<string>;
  onNavigate: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  isSubfolder?: boolean;
}) {
  const Icon = CHART_ICONS[panel.chartType] ?? BarChart3;
  const hasData = panel.data && panel.data.length > 0;
  const hasQuery = !!panel.sqlQuery?.trim();
  const isTranslatingPanel = translatingPanels.has(panel.id);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-muted/50",
        isSubfolder && "border-dashed",
      )}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              hasData
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{panel.title}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground capitalize">
                {panel.chartType} chart
              </span>
              {hasQuery && (
                <span className="text-xs text-muted-foreground">
                  &middot; Has SQL query
                </span>
              )}
              {isTranslatingPanel ? (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating query...
                </span>
              ) : hasData ? (
                <span className="text-xs text-green-600">
                  &middot; {panel.data.length} row
                  {panel.data.length !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <Sparkles className="h-3 w-3" />
                  Needs data
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                disabled={deletingId === panel.id}
              >
                {deletingId === panel.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
