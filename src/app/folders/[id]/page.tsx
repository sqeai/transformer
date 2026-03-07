"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Settings2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChartPanel } from "@/components/dashboard/ChartPanel";
import { InlineChart, type ChartData, type ViewType } from "@/components/analyst/InlineChart";
import { StarlightInput } from "@/components/dashboard/StarlightInput";
import { AddPanelDialog } from "@/components/dashboard/AddPanelDialog";
import { usePanelQueryExecution } from "@/components/dashboard/usePanelQueryExecution";
import { usePanelTranslation } from "@/components/dashboard/usePanelTranslation";
import type {
  DashboardPanel,
  PanelLayout,
  ChartType,
  PredefinedQuestion,
} from "@/components/dashboard/types";

const PANEL_REGEX = /<!-- DASHBOARD_PANEL:(.*?) -->/g;
const DEFAULT_COL_SPAN = 4;
const MIN_COL_SPAN = 2;
const MAX_COL_SPAN = 12;

interface DataSourceContext {
  id: string;
  name: string;
  type: string;
  tables: { schema: string; name: string; columns: { name: string; type: string }[] }[];
}

interface ContextTable {
  dataSourceId: string;
  dataSourceName: string;
  dataSourceType: string;
  schemaName: string;
  tableName: string;
  columns: { name: string; type: string }[];
}

interface FolderContext {
  tables: ContextTable[];
}

async function fetchDataSourceContexts(): Promise<DataSourceContext[]> {
  try {
    const res = await fetch("/api/contexts");
    if (!res.ok) return [];
    const data = await res.json();
    const contexts: FolderContext[] = data.contexts ?? [];

    const dsMap = new Map<string, DataSourceContext>();
    for (const ctx of contexts) {
      for (const t of ctx.tables) {
        let ds = dsMap.get(t.dataSourceId);
        if (!ds) {
          ds = { id: t.dataSourceId, name: t.dataSourceName, type: t.dataSourceType, tables: [] };
          dsMap.set(t.dataSourceId, ds);
        }
        const exists = ds.tables.some((tb) => tb.schema === t.schemaName && tb.name === t.tableName);
        if (!exists) {
          ds.tables.push({ schema: t.schemaName, name: t.tableName, columns: t.columns });
        }
      }
    }
    return Array.from(dsMap.values());
  } catch {
    return [];
  }
}

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

function getLayoutForPanel(panelId: string, layout: PanelLayout[]): PanelLayout {
  const existing = layout.find((l) => l.panelId === panelId);
  if (existing) return existing;
  return { panelId, colSpan: DEFAULT_COL_SPAN, rowSpan: 1, order: layout.length };
}

// --- Sortable panel wrapper ---

interface SortablePanelProps {
  panel: DashboardPanel;
  panelLayout: PanelLayout;
  editMode: boolean;
  isExecuting: boolean;
  onExpand: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, delta: number) => void;
}

function SortablePanel({
  panel,
  panelLayout,
  editMode,
  isExecuting,
  onExpand,
  onEdit,
  onRemove,
  onResize,
}: SortablePanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: panel.id, disabled: !editMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${panelLayout.colSpan} / span ${panelLayout.colSpan}`,
    gridRow: panelLayout.rowSpan > 1 ? `span ${panelLayout.rowSpan} / span ${panelLayout.rowSpan}` : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group",
        isDragging && "z-50 opacity-80",
        editMode && "ring-1 ring-border ring-dashed rounded-xl",
      )}
    >
      <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden h-full">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {editMode && (
              <div
                {...attributes}
                {...listeners}
                className="flex h-6 w-6 items-center justify-center rounded cursor-grab active:cursor-grabbing hover:bg-muted/60"
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
            )}
            <h3 className="text-sm font-medium truncate">{panel.title}</h3>
          </div>
          <div className="flex items-center gap-0.5">
            {!editMode && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(panel.id)}
                  className="p-1 rounded bg-background/80 hover:bg-muted"
                  title="Edit panel"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onExpand(panel.id)}
                  className="p-1 rounded bg-background/80 hover:bg-muted"
                  title="Expand"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {editMode && (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onEdit(panel.id)}
                  title="Edit panel"
                >
                  <Settings2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onExpand(panel.id)}
                  title="Expand"
                >
                  <Maximize2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(panel.id)}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 p-3 min-h-[200px]">
          <ChartPanel panel={panel} isLoading={isExecuting} />
        </div>
      </div>

      {editMode && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-[10px] shadow-sm"
            onClick={() => onResize(panel.id, -2)}
            disabled={panelLayout.colSpan <= MIN_COL_SPAN}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-[10px] text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded">
            {panelLayout.colSpan}/12
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-[10px] shadow-sm"
            onClick={() => onResize(panel.id, 2)}
            disabled={panelLayout.colSpan >= MAX_COL_SPAN}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Main page ---

export default function FolderDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [dashboardName, setDashboardName] = useState("Dashboard");
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [layout, setLayout] = useState<PanelLayout[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const appliedActions = useRef<Set<string>>(new Set());
  const dsContextsCache = useRef<DataSourceContext[] | null>(null);
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

  const currentPanelIds = useMemo(
    () => new Set(panels.map((p) => p.id)),
    [panels],
  );

  const sortedPanels = useMemo(() => {
    return [...panels].sort((a, b) => {
      const la = getLayoutForPanel(a.id, layout);
      const lb = getLayoutForPanel(b.id, layout);
      return la.order - lb.order;
    });
  }, [panels, layout]);

  const panelIds = useMemo(() => sortedPanels.map((p) => p.id), [sortedPanels]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
            const loadedPanels: DashboardPanel[] = [];
            const loadedLayout: PanelLayout[] = [];

            data.panels.forEach((p: Record<string, unknown>, i: number) => {
              const panelId = p.id as string;
              loadedPanels.push({
                id: panelId,
                title: (p.title as string) || "",
                chartType: ((p.chart_type || p.chartType) as ChartType) || "bar",
                data: (p.data as Record<string, unknown>[]) || [],
                config: (p.config as DashboardPanel["config"]) || {},
                prompt: (p.prompt as string) || "",
                sqlQuery: ((p.sql_query || p.sqlQuery) as string) || "",
              });
              loadedLayout.push({
                panelId,
                colSpan: (p.col_span as number) || (p.colSpan as number) || DEFAULT_COL_SPAN,
                rowSpan: 1,
                order: (p.position as number) ?? i,
              });
            });

            setPanels(loadedPanels);
            setLayout(loadedLayout);
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

  const initialLoadDone = useRef(false);
  const snapshotRef = useRef<string>("");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading || !dashboardId) return;

    const snapshot = JSON.stringify({ panels, layout });

    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      snapshotRef.current = snapshot;
      return;
    }

    if (snapshot === snapshotRef.current) return;
    snapshotRef.current = snapshot;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/dashboards/${dashboardId}/panels`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panels, layout }),
        });
      } catch {
        // silent
      }
    }, 1500);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [panels, layout, loading, dashboardId]);

  const applyPanelAction = useCallback((action: PanelAction) => {
    const key = JSON.stringify(action);
    if (appliedActions.current.has(key)) return;
    appliedActions.current.add(key);

    if (action.action === "add" && action.panel) {
      const panel: DashboardPanel = {
        id: action.panel.id,
        title: action.panel.title,
        chartType: action.panel.chartType,
        data: action.panel.data,
        config: action.panel.config,
        prompt: action.panel.prompt,
        sqlQuery: action.panel.sqlQuery,
      };
      setPanels((prev) => [...prev, panel]);
      setLayout((prev) => [
        ...prev,
        { panelId: panel.id, colSpan: DEFAULT_COL_SPAN, rowSpan: 1, order: prev.length },
      ]);
      toast.success(`Panel "${panel.title}" added`);
    } else if (action.action === "update" && action.panel) {
      const updated: DashboardPanel = {
        id: action.panel.id,
        title: action.panel.title,
        chartType: action.panel.chartType,
        data: action.panel.data,
        config: action.panel.config,
        prompt: action.panel.prompt,
        sqlQuery: action.panel.sqlQuery,
      };
      setPanels((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      toast.success(`Panel "${updated.title}" updated`);
    } else if (action.action === "remove" && action.panelId) {
      const id = action.panelId;
      setPanels((prev) => prev.filter((p) => p.id !== id));
      setLayout((prev) => prev.filter((l) => l.panelId !== id));
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
        body: JSON.stringify({ panels, layout }),
      });
      snapshotRef.current = JSON.stringify({ panels, layout });
      toast.success("Dashboard saved");
    } catch {
      toast.error("Failed to save dashboard");
    } finally {
      setIsSaving(false);
    }
  }, [dashboardId, dashboardName, panels, layout]);

  const clearDashboard = useCallback(() => {
    setPanels([]);
    setLayout([]);
    appliedActions.current.clear();
  }, []);

  const removePanel = useCallback((id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
    setLayout((prev) => prev.filter((l) => l.panelId !== id));
  }, []);

  const navigateToEditPanel = useCallback(
    (id: string) => {
      router.push(`/folders/${folderId}/panels/${id}`);
    },
    [folderId, router],
  );

  const handleResizePanel = useCallback((id: string, delta: number) => {
    setLayout((prev) =>
      prev.map((l) => {
        if (l.panelId !== id) return l;
        const newSpan = Math.max(MIN_COL_SPAN, Math.min(MAX_COL_SPAN, l.colSpan + delta));
        return { ...l, colSpan: newSpan };
      }),
    );
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLayout((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const oldIndex = sorted.findIndex((l) => l.panelId === active.id);
      const newIndex = sorted.findIndex((l) => l.panelId === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = [...sorted];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      return reordered.map((l, i) => ({ ...l, order: i }));
    });
  }, []);

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
      setPanels((prev) => [...prev, newPanel]);
      setLayout((prev) => [
        ...prev,
        { panelId: newPanel.id, colSpan: DEFAULT_COL_SPAN, rowSpan: 1, order: prev.length },
      ]);
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
        prompt,
        sqlQuery: sqlQuery || "",
      };
      setPanels((prev) => [...prev, newPanel]);
      setLayout((prev) => [
        ...prev,
        { panelId: newPanel.id, colSpan: DEFAULT_COL_SPAN, rowSpan: 1, order: prev.length },
      ]);
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

  const handleAddExisting = useCallback((panel: DashboardPanel) => {
    setPanels((prev) => {
      if (prev.some((p) => p.id === panel.id)) return prev;
      return [...prev, panel];
    });
    setLayout((prev) => {
      if (prev.some((l) => l.panelId === panel.id)) return prev;
      return [...prev, { panelId: panel.id, colSpan: DEFAULT_COL_SPAN, rowSpan: 1, order: prev.length }];
    });
    toast.success(`Panel "${panel.title}" added`);
  }, []);

  const handleStarlightSubmit = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      if (!dsContextsCache.current) {
        dsContextsCache.current = await fetchDataSourceContexts();
      }
      const dsContexts = dsContextsCache.current;

      const currentPanels = JSON.stringify(
        panels.map((p) => ({
          id: p.id,
          title: p.title,
          chartType: p.chartType,
        })),
      );

      sendMessage(
        { text: text.trim() },
        {
          body: {
            dataSourceIds: dsContexts.map((ds) => ds.id),
            dataSourceContexts: dsContexts,
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

  const expandedPanelData = useMemo(() => {
    if (!expandedPanel) return null;
    const panel = panels.find((p) => p.id === expandedPanel);
    if (!panel) return null;

    let labelKey: string;
    let valueKeys: string[];

    if (panel.chartType === "pie") {
      labelKey = panel.config.nameKey ?? panel.config.xKey ?? "name";
      valueKeys = panel.config.valueKey ? [panel.config.valueKey] : panel.config.yKeys ?? (panel.config.yKey ? [panel.config.yKey] : ["value"]);
    } else {
      labelKey = panel.config.xKey ?? panel.config.nameKey ?? "name";
      valueKeys = panel.config.yKeys ?? (panel.config.yKey ? [panel.config.yKey] : panel.config.valueKey ? [panel.config.valueKey] : ["value"]);
    }

    return {
      panel,
      chartData: {
        title: panel.title,
        chartType: panel.chartType as ViewType,
        data: panel.data,
        labelKey,
        valueKeys,
        sql: panel.sqlQuery,
      } satisfies ChartData,
    };
  }, [expandedPanel, panels]);

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
            {/* Expanded panel overlay — uses full InlineChart with type selector */}
            {expandedPanelData && (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
                <div className="w-full max-w-5xl h-full max-h-[80vh] bg-card rounded-xl border shadow-2xl flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="font-semibold">{expandedPanelData.panel.title}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setExpandedPanel(null)}
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 p-4 overflow-hidden">
                    <InlineChart
                      chartData={expandedPanelData.chartData}
                      mode="full"
                      height="100%"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 12-column grid with drag-and-drop */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={panelIds} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-12 gap-4 auto-rows-[280px]">
                  {sortedPanels.map((panel) => {
                    const panelLayout = getLayoutForPanel(panel.id, layout);
                    return (
                      <SortablePanel
                        key={panel.id}
                        panel={panel}
                        panelLayout={panelLayout}
                        editMode={editMode}
                        isExecuting={executingPanels.has(panel.id)}
                        onExpand={setExpandedPanel}
                        onEdit={navigateToEditPanel}
                        onRemove={removePanel}
                        onResize={handleResizePanel}
                      />
                    );
                  })}

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
              </SortableContext>
            </DndContext>
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
        onAddExisting={handleAddExisting}
        currentPanelIds={currentPanelIds}
        dashboardId={dashboardId}
      />
    </div>
  );
}
