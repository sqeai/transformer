"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  LayoutDashboard,
  Plus,
  Trash2,
  Loader2,
  Settings2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import { ChartPanel } from "@/components/dashboard/ChartPanel";
import {
  ContextSelector,
  type ContextSelection,
} from "@/components/dashboard/ContextSelector";
import { StarlightInput } from "@/components/dashboard/StarlightInput";
import type { DashboardPanel, ChartType } from "@/components/dashboard/types";

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

export default function FolderPanelsPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextSelection, setContextSelection] =
    useState<ContextSelection | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);
  const appliedActions = useRef<Set<string>>(new Set());

  const transport = useRef(
    new DefaultChatTransport({ api: "/api/dashboard-chat" }),
  );

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: transport.current,
    onError: (e: Error) => {
      console.error(e);
      toast.error("Error while processing your request", {
        description: e.message,
      });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

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

  const applyPanelAction = useCallback((action: PanelAction) => {
    const key = JSON.stringify(action);
    if (appliedActions.current.has(key)) return;
    appliedActions.current.add(key);

    if (action.action === "add" && action.panel) {
      setPanels((prev) => [...prev, action.panel!]);
      toast.success(`Panel "${action.panel.title}" added`);
    } else if (action.action === "update" && action.panel) {
      setPanels((prev) =>
        prev.map((p) => (p.id === action.panel!.id ? action.panel! : p)),
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

  const savePanels = useCallback(async () => {
    if (!dashboardId) return;
    try {
      await fetch(`/api/dashboards/${dashboardId}/panels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panels }),
      });
      toast.success("Panels saved");
    } catch {
      toast.error("Failed to save panels");
    }
  }, [dashboardId, panels]);

  useEffect(() => {
    if (!dashboardId || panels.length === 0) return;
    const timeout = setTimeout(() => {
      savePanels();
    }, 2000);
    return () => clearTimeout(timeout);
  }, [panels, dashboardId, savePanels]);

  const removePanel = useCallback(
    (id: string) => {
      setPanels((prev) => prev.filter((p) => p.id !== id));
      toast.success("Panel removed");
    },
    [],
  );

  const editPanel = useCallback(
    (id: string) => {
      const panel = panels.find((p) => p.id === id);
      if (panel) {
        toast.info(`Use Starlight to update "${panel.title}"`);
      }
    },
    [panels],
  );

  const createManualPanel = useCallback(() => {
    const newPanel: DashboardPanel = {
      id: crypto.randomUUID(),
      title: "New Panel",
      chartType: "bar" as ChartType,
      data: [],
      config: {},
      width: 1,
      height: 1,
    };
    setPanels((prev) => [...prev, newPanel]);
    toast.success("Empty panel created. Use Starlight to populate it.");
  }, []);

  const handleStarlightSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return;

      const dataSources = contextSelection?.dataSources ?? [];
      const dataSourceIds = dataSources.map((s) => s.id);
      const dataSourceContexts = dataSources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        tables: s.tables,
      }));

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
            dataSourceIds,
            dataSourceContexts,
            currentPanels,
            companyContext: contextSelection?.companyContext ?? "",
          },
        },
      );
    },
    [isLoading, sendMessage, contextSelection, panels],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-6 overflow-hidden">
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Panels</h1>
              <p className="text-xs text-muted-foreground">
                {panels.length} panel{panels.length !== 1 ? "s" : ""} in this
                dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={createManualPanel}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Panel
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setContextPanelOpen((o) => !o)}
              title={contextPanelOpen ? "Hide contexts" : "Show contexts"}
            >
              {contextPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Panels list */}
        <div className="flex-1 overflow-y-auto p-4 pb-24">
          {panels.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <LayoutDashboard className="mb-4 h-12 w-12 opacity-30" />
              <h3 className="text-lg font-semibold">No panels yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-md">
                Create panels using Starlight below, or add an empty panel
                manually.
              </p>
              <Button onClick={createManualPanel} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create Empty Panel
              </Button>
            </div>
          ) : (
            <>
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
                          panel={
                            panels.find((p) => p.id === expandedPanel)!
                          }
                          onRemove={removePanel}
                          onEdit={editPanel}
                          expanded
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {panels.map((panel) => (
                  <Card
                    key={panel.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors group overflow-hidden"
                  >
                    <CardContent className="p-0">
                      <div className="h-[200px] p-3">
                        <ChartPanel
                          panel={panel}
                          onRemove={removePanel}
                          onEdit={editPanel}
                        />
                      </div>
                      <div className="flex items-center justify-between border-t border-border/50 px-4 py-2">
                        <div>
                          <h3 className="text-sm font-medium truncate">
                            {panel.title}
                          </h3>
                          <p className="text-[10px] text-muted-foreground capitalize">
                            {panel.chartType} chart
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPanel(panel.id);
                            }}
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePanel(panel.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right panel - Context Selector */}
      {contextPanelOpen && (
        <div className="w-72 flex-shrink-0">
          <ContextSelector onSelectionChange={setContextSelection} />
        </div>
      )}

      {/* Starlight Input */}
      <StarlightInput
        onSubmit={handleStarlightSubmit}
        isLoading={isLoading}
        placeholder="Ask Starlight anything (⌘K)"
      />
    </div>
  );
}
