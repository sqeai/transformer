"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Loader2,
  LayoutDashboard,
  Save,
  Trash2,
  Maximize2,
  Minimize2,
  Pencil,
  X,
  Plus,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChartPanel } from "@/components/dashboard/ChartPanel";
import { StarlightInput } from "@/components/dashboard/StarlightInput";
import { AddPanelDialog } from "@/components/dashboard/AddPanelDialog";
import { usePanelQueryExecution } from "@/components/dashboard/usePanelQueryExecution";
import { usePanelTranslation } from "@/components/dashboard/usePanelTranslation";
import type {
  DashboardPanel,
  ChartType,
  PredefinedQuestion,
} from "@/components/dashboard/types";

const PANEL_REGEX = /<!-- DASHBOARD_PANEL:(.*?) -->/g;

interface PanelAction {
  action: "add" | "update" | "remove";
  panel?: DashboardPanel;
  panelId?: string;
}

function extractPanelActions(text: string): PanelAction[] {
  const actions: PanelAction[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(PANEL_REGEX);
  while ((match = regex.exec(text)) !== null) {
    try {
      actions.push(JSON.parse(match[1]));
    } catch {
      // skip
    }
  }
  return actions;
}

function getDefaultColSpan(width: 1 | 2): number {
  if (width === 2) return 8;
  return 4;
}

export default function FolderDashboardPage() {
  const params = useParams();
  const folderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [dashboardName, setDashboardName] = useState("Dashboard");
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const appliedActions = useRef<Set<string>>(new Set());
  const { executePanelsOnLoad, executingPanels } = usePanelQueryExecution();
  const { translateAndExecute, isTranslating } = usePanelTranslation();

  const transport = useRef(
    new DefaultChatTransport({ api: "/api/dashboard-chat" }),
  );

  const { messages, sendMessage, status } = useChat({
    transport: transport.current,
    onError: (e: Error) => {
      console.error(e);
      toast.error("Error while processing your request", {
        description: e.message,
      });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  const ensureDashboard = useCallback(async () => {
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
        setDashboardName(dashboard.name || "Dashboard");

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
              colSpan: (p.col_span as number) || (p.colSpan as number) || getDefaultColSpan((p.width as 1 | 2) || 1),
            }));
            setPanels(loaded);
          }
        }
      }
    } catch {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    ensureDashboard();
  }, [ensureDashboard]);

  const panelsLoadedRef = useRef(false);
  useEffect(() => {
    if (panelsLoadedRef.current || panels.length === 0 || loading) return;
    const needsData = panels.some(
      (p) => p.sqlQuery?.trim() && (!p.data || p.data.length === 0),
    );
    if (!needsData) return;
    panelsLoadedRef.current = true;
    executePanelsOnLoad(panels).then((updated) => {
      if (updated !== panels) setPanels(updated);
    });
  }, [panels, loading, executePanelsOnLoad]);

  const applyPanelAction = useCallback((action: PanelAction) => {
    const key = JSON.stringify(action);
    if (appliedActions.current.has(key)) return;
    appliedActions.current.add(key);

    if (action.action === "add" && action.panel) {
      const panel = {
        ...action.panel,
        colSpan: action.panel.colSpan || getDefaultColSpan(action.panel.width),
      };
      setPanels((prev) => [...prev, panel]);
      toast.success(`Panel "${panel.title}" added`);
    } else if (action.action === "update" && action.panel) {
      setPanels((prev) =>
        prev.map((p) => (p.id === action.panel!.id ? { ...action.panel!, colSpan: action.panel!.colSpan || p.colSpan } : p)),
      );
      toast.success(`Panel "${action.panel.title}" updated`);
    } else if (action.action === "remove" && action.panelId) {
      setPanels((prev) => prev.filter((p) => p.id !== action.panelId));
      toast.success("Panel removed");
    }
  }, []);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const textParts = (msg.parts ?? []).filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const fullText = textParts.map((p) => p.text).join("");
      const actions = extractPanelActions(fullText);
      for (const action of actions) {
        applyPanelAction(action);
      }
    }
  }, [messages, applyPanelAction]);

  const saveDashboard = useCallback(async () => {
    if (!dashboardId) return;
    setIsSaving(true);
    try {
      await fetch(`/api/dashboards/${dashboardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: dashboardName }),
      });
      await fetch(`/api/dashboards/${dashboardId}/panels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panels }),
      });
      toast.success("Dashboard saved");
    } catch {
      toast.error("Failed to save dashboard");
    } finally {
      setIsSaving(false);
    }
  }, [dashboardId, dashboardName, panels]);

  const clearDashboard = useCallback(() => {
    setPanels([]);
    appliedActions.current.clear();
  }, []);

  const removePanel = useCallback((id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const editPanel = useCallback(
    (id: string) => {
      const panel = panels.find((p) => p.id === id);
      if (panel) {
        toast.info(`To edit "${panel.title}", use the Starlight input below.`);
      }
    },
    [panels],
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
      setPanels((prev) => [...prev, newPanel]);
      toast.success(`Panel "${question.label}" added — generating query...`);

      translateAndExecute(newPanel).then((translated) => {
        if (translated !== newPanel) {
          setPanels((prev) =>
            prev.map((p) => (p.id === newPanel.id ? translated : p)),
          );
        }
      });
    },
    [translateAndExecute],
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
      setPanels((prev) => [...prev, newPanel]);
      toast.success("Panel added — generating query...");

      translateAndExecute(newPanel).then((translated) => {
        if (translated !== newPanel) {
          setPanels((prev) =>
            prev.map((p) => (p.id === newPanel.id ? translated : p)),
          );
        }
      });
    },
    [translateAndExecute],
  );

  const handleResizePanel = useCallback((id: string, delta: number) => {
    setPanels((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const newSpan = Math.max(2, Math.min(12, (p.colSpan || 4) + delta));
        return { ...p, colSpan: newSpan };
      }),
    );
  }, []);

  const handleStarlightSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return;

      const currentPanels = JSON.stringify(
        panels.map((p) => ({
          id: p.id,
          title: p.title,
          chartType: p.chartType,
          width: p.width,
          height: p.height,
        })),
      );

      sendMessage(
        { text: text.trim() },
        {
          body: {
            dataSourceIds: [],
            dataSourceContexts: [],
            currentPanels,
            companyContext: "",
          },
        },
      );
    },
    [isLoading, sendMessage, panels],
  );

  const toggleEditMode = useCallback(() => {
    if (editMode) {
      saveDashboard();
    }
    setEditMode((prev) => !prev);
  }, [editMode, saveDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-6 overflow-hidden flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold">{dashboardName}</h1>
            <p className="text-xs text-muted-foreground">
              {panels.length > 0
                ? `${panels.length} panel${panels.length > 1 ? "s" : ""}`
                : "Add panels to get started"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Panel
              </Button>
              {panels.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-destructive"
                  onClick={clearDashboard}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </>
          )}
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={toggleEditMode}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : editMode ? (
              <Save className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Pencil className="h-3.5 w-3.5 mr-1" />
            )}
            {editMode ? "Save & Exit" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Dashboard grid */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {panels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <LayoutDashboard className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">No panels yet</p>
            <p className="mt-2 text-sm max-w-md">
              Click the Edit button to enter edit mode and add panels to your
              dashboard.
            </p>
            <Button
              onClick={() => {
                setEditMode(true);
                setAddDialogOpen(true);
              }}
              variant="outline"
              className="mt-4"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Panel
            </Button>
          </div>
        ) : (
          <>
            {/* Expanded panel overlay */}
            {expandedPanel && (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
                <div className="w-full max-w-5xl h-full max-h-[80vh] bg-card rounded-xl border shadow-2xl flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="font-semibold">
                      {panels.find((p) => p.id === expandedPanel)?.title}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setExpandedPanel(null)}
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 p-4">
                    {panels.find((p) => p.id === expandedPanel) && (
                      <ChartPanel
                        panel={panels.find((p) => p.id === expandedPanel)!}
                        onRemove={removePanel}
                        onEdit={editPanel}
                        expanded
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 12-column grid */}
            <div
              className={cn(
                "grid gap-4 auto-rows-[280px]",
                editMode
                  ? "grid-cols-12"
                  : "grid-cols-12",
              )}
            >
              {panels.map((panel) => {
                const span = panel.colSpan || getDefaultColSpan(panel.width);
                return (
                  <div
                    key={panel.id}
                    className={cn(
                      "relative group",
                      panel.height === 2 && "row-span-2",
                      editMode && "ring-1 ring-border ring-dashed rounded-xl",
                    )}
                    style={{
                      gridColumn: `span ${span} / span ${span}`,
                    }}
                  >
                    <ChartPanel
                      panel={panel}
                      onRemove={removePanel}
                      onEdit={editPanel}
                      isLoading={executingPanels.has(panel.id)}
                    />

                    {/* Edit mode overlay controls */}
                    {editMode && (
                      <div className="absolute inset-0 rounded-xl">
                        {/* Top-right controls */}
                        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 shadow-sm"
                            onClick={() => setExpandedPanel(panel.id)}
                            title="Expand"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 shadow-sm text-destructive hover:text-destructive"
                            onClick={() => removePanel(panel.id)}
                            title="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Bottom resize controls */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 px-2 text-[10px] shadow-sm"
                            onClick={() => handleResizePanel(panel.id, -2)}
                            disabled={span <= 2}
                          >
                            Narrower
                          </Button>
                          <span className="text-[10px] text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded">
                            {span}/12
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 px-2 text-[10px] shadow-sm"
                            onClick={() => handleResizePanel(panel.id, 2)}
                            disabled={span >= 12}
                          >
                            Wider
                          </Button>
                        </div>

                        {/* Drag handle */}
                        <div className="absolute top-2 left-2 z-10">
                          <div className="flex h-7 w-7 items-center justify-center rounded bg-secondary/80 shadow-sm cursor-grab">
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* View mode expand on hover */}
                    {!editMode && (
                      <button
                        onClick={() => setExpandedPanel(panel.id)}
                        className="absolute top-2 right-12 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-background/80 hover:bg-muted z-10"
                        title="Expand"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add panel placeholder in edit mode */}
              {editMode && (
                <button
                  onClick={() => setAddDialogOpen(true)}
                  className="col-span-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <Plus className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-sm font-medium">Add Panel</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Starlight Input */}
      <StarlightInput
        onSubmit={handleStarlightSubmit}
        isLoading={isLoading}
        placeholder="Ask Starlight anything (⌘K)"
      />

      {/* Add Panel Dialog */}
      <AddPanelDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAddPredefined={handleAddPredefined}
        onAddCustom={handleAddCustom}
      />
    </div>
  );
}
