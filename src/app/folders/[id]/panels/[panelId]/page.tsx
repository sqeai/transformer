"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Save,
  Play,
  Sparkles,
  Send,
  MessageSquare,
  Settings2,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChartPanel } from "@/components/dashboard/ChartPanel";
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

export default function PanelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const panelId = params.panelId as string;

  const [loading, setLoading] = useState(true);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [allPanels, setAllPanels] = useState<DashboardPanel[]>([]);
  const [panel, setPanel] = useState<DashboardPanel | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeTab, setActiveTab] = useState<"chart" | "settings" | "chat">(
    "chart",
  );

  const [editTitle, setEditTitle] = useState("");
  const [editChartType, setEditChartType] = useState<ChartType>("bar");
  const [editSqlQuery, setEditSqlQuery] = useState("");
  const [editPrompt, setEditPrompt] = useState("");

  const appliedActions = useRef<Set<string>>(new Set());
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

  const isChatLoading = status === "streaming" || status === "submitted";

  const loadPanel = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboards?folderId=${folderId}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const dashboards = await res.json();
      const dashboard = dashboards[0];
      if (!dashboard) {
        setLoading(false);
        return;
      }

      setDashboardId(dashboard.id);
      const detailRes = await fetch(`/api/dashboards/${dashboard.id}`);
      if (!detailRes.ok) {
        setLoading(false);
        return;
      }

      const data = await detailRes.json();
      if (!Array.isArray(data.panels)) {
        setLoading(false);
        return;
      }

      const loaded: DashboardPanel[] = data.panels.map(
        (p: Record<string, unknown>) => ({
          id: p.id,
          title: p.title,
          chartType: p.chart_type || p.chartType,
          data: p.data || [],
          config: p.config || {},
          width: p.width || 1,
          height: p.height || 1,
          prompt: p.prompt || "",
          sqlQuery: p.sql_query || p.sqlQuery || "",
          colSpan: (p.col_span as number) || (p.colSpan as number) || 4,
        }),
      );

      setAllPanels(loaded);
      const found = loaded.find((p) => p.id === panelId);
      if (found) {
        setPanel(found);
        setEditTitle(found.title);
        setEditChartType(found.chartType);
        setEditSqlQuery(found.sqlQuery || "");
        setEditPrompt(found.prompt || "");
      }
    } catch {
      toast.error("Failed to load panel");
    } finally {
      setLoading(false);
    }
  }, [folderId, panelId]);

  useEffect(() => {
    loadPanel();
  }, [loadPanel]);

  const autoExecutedRef = useRef(false);
  useEffect(() => {
    if (
      autoExecutedRef.current ||
      !panel ||
      loading ||
      panel.data.length > 0 ||
      !panel.sqlQuery?.trim()
    )
      return;
    autoExecutedRef.current = true;
    executeQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, loading]);

  useEffect(() => {
    if (!panel) return;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const textParts = (msg.parts ?? []).filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const fullText = textParts.map((p) => p.text).join("");
      const actions = extractPanelActions(fullText);
      for (const action of actions) {
        const key = JSON.stringify(action);
        if (appliedActions.current.has(key)) continue;
        appliedActions.current.add(key);

        if (
          (action.action === "add" || action.action === "update") &&
          action.panel
        ) {
          const updated: DashboardPanel = {
            ...panel,
            ...action.panel,
            id: panel.id,
            colSpan: action.panel.colSpan || panel.colSpan,
          };
          setPanel(updated);
          setEditTitle(updated.title);
          setEditChartType(updated.chartType);
          setEditSqlQuery(updated.sqlQuery || "");
          setEditPrompt(updated.prompt || "");
          setActiveTab("chart");
          toast.success("Panel updated by AI");
        }
      }
    }
  }, [messages, panel]);

  const savePanel = useCallback(async () => {
    if (!dashboardId || !panel) return;
    setIsSaving(true);

    const updatedPanel: DashboardPanel = {
      ...panel,
      title: editTitle,
      chartType: editChartType,
      sqlQuery: editSqlQuery,
      prompt: editPrompt,
    };

    setPanel(updatedPanel);

    const updatedPanels = allPanels.map((p) =>
      p.id === panelId ? updatedPanel : p,
    );
    setAllPanels(updatedPanels);

    try {
      await fetch(`/api/dashboards/${dashboardId}/panels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panels: updatedPanels }),
      });
      toast.success("Panel saved");
    } catch {
      toast.error("Failed to save panel");
    } finally {
      setIsSaving(false);
    }
  }, [
    dashboardId,
    panel,
    panelId,
    allPanels,
    editTitle,
    editChartType,
    editSqlQuery,
    editPrompt,
  ]);

  const executeQuery = useCallback(async () => {
    if (!panel) return;

    const sqlToRun = editSqlQuery.trim();
    if (!sqlToRun) {
      toast.error("No SQL query to execute");
      return;
    }

    setIsExecuting(true);
    try {
      const ctxRes = await fetch("/api/contexts");
      if (!ctxRes.ok) {
        toast.error("Failed to load data sources");
        return;
      }
      const ctxData = await ctxRes.json();
      const contexts = ctxData.contexts ?? [];

      let dataSourceId: string | null = null;
      for (const ctx of contexts) {
        if (ctx.tables?.length > 0) {
          dataSourceId = ctx.tables[0].dataSourceId;
          break;
        }
      }

      if (!dataSourceId) {
        toast.error("No data source available to execute query");
        return;
      }

      const res = await fetch("/api/panel-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId, sql: sqlToRun }),
      });

      const result = await res.json();
      if (result.error) {
        toast.error(`Query error: ${result.error}`);
        return;
      }

      const rows = result.rows ?? [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      const config = { ...panel.config };
      if (columns.length >= 2 && !config.xKey && !config.nameKey) {
        if (editChartType === "pie") {
          config.nameKey = columns[0];
          config.valueKey = columns[1];
        } else {
          config.xKey = columns[0];
          config.yKey = columns[1];
          if (columns.length > 2) {
            config.yKeys = columns.slice(1);
          }
        }
      }

      const updatedPanel: DashboardPanel = {
        ...panel,
        title: editTitle,
        chartType: editChartType,
        sqlQuery: editSqlQuery,
        prompt: editPrompt,
        data: rows,
        config,
      };
      setPanel(updatedPanel);

      const updatedPanels = allPanels.map((p) =>
        p.id === panelId ? updatedPanel : p,
      );
      setAllPanels(updatedPanels);

      if (dashboardId) {
        await fetch(`/api/dashboards/${dashboardId}/panels`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panels: updatedPanels }),
        });
      }

      toast.success(`Query returned ${rows.length} row${rows.length !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(`Failed to execute query: ${(err as Error).message}`);
    } finally {
      setIsExecuting(false);
    }
  }, [
    panel,
    editSqlQuery,
    editTitle,
    editChartType,
    editPrompt,
    allPanels,
    panelId,
    dashboardId,
  ]);

  const handleChatSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isChatLoading || !panel) return;

      const currentPanels = JSON.stringify([
        {
          id: panel.id,
          title: panel.title,
          chartType: panel.chartType,
          width: panel.width,
          height: panel.height,
          sqlQuery: panel.sqlQuery,
        },
      ]);

      sendMessage(
        {
          text: `For the panel "${panel.title}" (ID: ${panel.id}): ${text.trim()}`,
        },
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
    [isChatLoading, sendMessage, panel],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/folders/${folderId}/panels`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Panel Not Found
            </h1>
            <p className="text-sm text-muted-foreground">
              This panel does not exist or has been deleted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-6 overflow-hidden flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/folders/${folderId}/panels`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold">{panel.title}</h1>
            <p className="text-xs text-muted-foreground capitalize">
              {panel.chartType} chart
              {panel.data.length > 0 &&
                ` \u00B7 ${panel.data.length} row${panel.data.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={executeQuery}
            disabled={isExecuting || !editSqlQuery.trim()}
          >
            {isExecuting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1" />
            )}
            Run Query
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={savePanel}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border bg-card/50 px-6 py-1.5">
        <button
          onClick={() => setActiveTab("chart")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
            activeTab === "chart"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Chart
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
            activeTab === "settings"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Settings
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
            activeTab === "chat"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Ask AI
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "chart" && (
          <div className="p-6">
            {panel.data.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 opacity-30 mb-4" />
                <h3 className="text-lg font-semibold">No data yet</h3>
                <p className="text-sm mt-1 max-w-md">
                  {editSqlQuery.trim()
                    ? 'Click "Run Query" to execute the SQL and load data into this panel.'
                    : "Go to Settings to add a SQL query, or use Ask AI to generate one."}
                </p>
                {editSqlQuery.trim() && (
                  <Button
                    onClick={executeQuery}
                    variant="outline"
                    className="mt-4"
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Run Query
                  </Button>
                )}
              </div>
            ) : (
              <div className="h-[500px]">
                <ChartPanel
                  panel={panel}
                  onRemove={() => {}}
                  onEdit={() => {}}
                  expanded
                />
              </div>
            )}

            {panel.data.length > 0 && (
              <div className="mt-6 border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b">
                  <h4 className="text-sm font-medium">
                    Data ({panel.data.length} rows)
                  </h4>
                </div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        {panel.data.length > 0 &&
                          Object.keys(panel.data[0]).map((key) => (
                            <th
                              key={key}
                              className="text-left px-3 py-2 text-xs font-medium text-muted-foreground"
                            >
                              {key}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {panel.data.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-t border-border/50">
                          {Object.values(row).map((val, j) => (
                            <td
                              key={j}
                              className="px-3 py-1.5 text-xs whitespace-nowrap"
                            >
                              {val == null ? (
                                <span className="text-muted-foreground italic">
                                  null
                                </span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="p-6 max-w-2xl space-y-6">
            <div className="space-y-2">
              <Label htmlFor="panel-title">Title</Label>
              <Input
                id="panel-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Panel title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="panel-prompt">Prompt / Description</Label>
              <Input
                id="panel-prompt"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Natural language description of what this panel shows"
              />
              <p className="text-xs text-muted-foreground">
                Describe what you want to visualize. The AI can use this to
                generate or update the SQL query.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Chart Type</Label>
              <Select
                value={editChartType}
                onValueChange={(v) => setEditChartType(v as ChartType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar Chart</SelectItem>
                  <SelectItem value="line">Line Chart</SelectItem>
                  <SelectItem value="pie">Pie Chart</SelectItem>
                  <SelectItem value="scatter">Scatter Plot</SelectItem>
                  <SelectItem value="waterfall">Waterfall Chart</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="panel-sql">SQL Query</Label>
              <Textarea
                id="panel-sql"
                value={editSqlQuery}
                onChange={(e) => setEditSqlQuery(e.target.value)}
                placeholder="SELECT column1, column2 FROM table_name WHERE ..."
                rows={8}
                className="font-mono text-xs"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Read-only SELECT/WITH queries only. Results limited to 200
                  rows.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={executeQuery}
                  disabled={isExecuting || !editSqlQuery.trim()}
                >
                  {isExecuting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1" />
                  )}
                  Test Query
                </Button>
              </div>
            </div>

            <Button onClick={savePanel} disabled={isSaving}>
              {isSaving && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        )}

        {activeTab === "chat" && (
          <ChatTab
            messages={messages}
            onSubmit={handleChatSubmit}
            isLoading={isChatLoading}
          />
        )}
      </div>
    </div>
  );
}

function ChatTab({
  messages,
  onSubmit,
  isLoading,
}: {
  messages: ReturnType<typeof useChat>["messages"];
  onSubmit: (text: string) => void;
  isLoading: boolean;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSubmit(input.trim());
    setInput("");
  };

  const visibleMessages = messages.filter((m) => {
    if (m.role === "user") return true;
    if (m.role === "assistant") {
      const textParts = (m.parts ?? []).filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const text = textParts.map((p) => p.text).join("");
      const cleaned = text
        .replace(/<!-- THINKING_START -->[\s\S]*?<!-- THINKING_END -->/g, "")
        .replace(/<!-- DASHBOARD_PANEL:.*? -->/g, "")
        .trim();
      return cleaned.length > 0;
    }
    return false;
  });

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {visibleMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Sparkles className="h-10 w-10 opacity-30 mb-4" />
            <h3 className="text-lg font-semibold">Ask AI about this panel</h3>
            <p className="text-sm mt-1 max-w-md">
              Ask questions like &ldquo;Generate a SQL query for this
              panel&rdquo;, &ldquo;Change the chart type to line&rdquo;, or
              &ldquo;Update the query to filter by last 12 months&rdquo;.
            </p>
          </div>
        )}

        {visibleMessages.map((msg) => {
          const isUser = msg.role === "user";
          const textParts = (msg.parts ?? []).filter(
            (p): p is { type: "text"; text: string } => p.type === "text",
          );
          let text = textParts.map((p) => p.text).join("");

          if (!isUser) {
            text = text
              .replace(
                /<!-- THINKING_START -->[\s\S]*?<!-- THINKING_END -->/g,
                "",
              )
              .replace(/<!-- DASHBOARD_PANEL:.*? -->/g, "")
              .trim();
          }

          if (!text) return null;

          return (
            <div
              key={msg.id}
              className={cn(
                "flex",
                isUser ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-xl px-4 py-2.5 text-sm",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{text}</p>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI to generate or update the query..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
