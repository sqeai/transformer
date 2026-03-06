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

const CHART_ICONS: Record<string, React.ElementType> = {
  bar: BarChart3,
  line: TrendingUp,
  pie: PieChart,
  scatter: BarChart3,
  waterfall: BarChart3,
};

export default function FolderPanelsPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { translateAndExecute, translatingPanels } = usePanelTranslation();

  const loadPanels = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboards?folderId=${folderId}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const dashboards = await res.json();
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
              width: p.width || 1,
              height: p.height || 1,
              prompt: p.prompt || "",
              sqlQuery: p.sql_query || p.sqlQuery || "",
              colSpan:
                (p.col_span as number) ||
                (p.colSpan as number) ||
                4,
            }));
            setPanels(loaded);
          }
        }
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
        width: 1,
        height: 1,
        prompt: question.label,
        sqlQuery: question.sqlHint || "",
        colSpan: 4,
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
        width: 1,
        height: 1,
        prompt,
        sqlQuery: sqlQuery || "",
        colSpan: 4,
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
    (panelId: string) => {
      router.push(`/folders/${folderId}/panels/${panelId}`);
    },
    [folderId, router],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold tracking-tight">Panels</h1>
            <p className="text-sm text-muted-foreground">
              {panels.length} panel{panels.length !== 1 ? "s" : ""} in this
              folder
            </p>
          </div>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Panel
        </Button>
      </div>

      {panels.length === 0 ? (
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
        <div className="space-y-2">
          {panels.map((panel) => {
            const Icon = CHART_ICONS[panel.chartType] ?? BarChart3;
            const hasData = panel.data && panel.data.length > 0;
            const hasQuery = !!panel.sqlQuery?.trim();
            const isTranslatingPanel = translatingPanels.has(panel.id);

            return (
              <Card
                key={panel.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => navigateToPanel(panel.id)}
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => deletePanel(e, panel.id)}
                        disabled={deletingId === panel.id}
                      >
                        {deletingId === panel.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddPanelDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAddPredefined={handleAddPredefined}
        onAddCustom={handleAddCustom}
      />
    </div>
  );
}
