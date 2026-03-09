"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowLeft,
  Loader2,
  Save,
  Play,
  BarChart3,
  TrendingUp,
  PieChart,
  Trash2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineChart, type ChartData, type ViewType } from "@/components/analyst/InlineChart";
import { StarlightInput } from "@/components/dashboard/StarlightInput";
import type { ChartType, DashboardPanel } from "@/components/dashboard/types";

const PANEL_REGEX = /<!-- DASHBOARD_PANEL:(.*?) -->/g;

interface DataSourceContext {
  id: string;
  name: string;
  type: string;
  tables: { schema: string; name: string; columns: { name: string; type: string }[] }[];
}

interface FolderContext {
  tables: {
    dataSourceId: string;
    dataSourceName: string;
    dataSourceType: string;
    schemaName: string;
    tableName: string;
    columns: { name: string; type: string }[];
  }[];
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
        if (!ds.tables.some((tb) => tb.schema === t.schemaName && tb.name === t.tableName)) {
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

const CHART_TYPES: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: "bar", label: "Bar Chart", icon: BarChart3 },
  { value: "line", label: "Line Chart", icon: TrendingUp },
  { value: "pie", label: "Pie Chart", icon: PieChart },
  { value: "scatter", label: "Scatter Plot", icon: BarChart3 },
  { value: "waterfall", label: "Waterfall Chart", icon: BarChart3 },
];

export default function PanelEditPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const panelId = params.panelId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translating, setTranslating] = useState(false);

  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [prompt, setPrompt] = useState("");
  const [sqlQuery, setSqlQuery] = useState("");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [config, setConfig] = useState<DashboardPanel["config"]>({});
  const [nlInput, setNlInput] = useState("");

  const dsContextsCache = useRef<DataSourceContext[] | null>(null);
  const appliedActions = useRef<Set<string>>(new Set());

  const transport = useRef(
    new DefaultChatTransport({ api: "/api/dashboard-chat" }),
  );

  const { messages: chatMessages, sendMessage, status: chatStatus } = useChat({
    transport: transport.current,
    onError: (e: Error) => {
      console.error(e);
      toast.error("Error while processing your request", {
        description: e.message,
      });
    },
  });

  const isChatLoading = chatStatus === "streaming" || chatStatus === "submitted";

  useEffect(() => {
    for (const msg of chatMessages) {
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

        if ((action.action === "add" || action.action === "update") && action.panel) {
          const p = action.panel;
          if (p.title) setTitle(p.title);
          if (p.chartType) setChartType(p.chartType);
          if (p.data) setData(p.data);
          if (p.config) setConfig(p.config);
          if (p.sqlQuery) setSqlQuery(p.sqlQuery);
          if (p.prompt) setPrompt(p.prompt);
          toast.success(`Panel "${p.title}" updated via Starlight`);
        }
      }
    }
  }, [chatMessages]);

  const handleStarlightSubmit = useCallback(
    async (text: string) => {
      if (!text.trim() || isChatLoading) return;

      if (!dsContextsCache.current) {
        dsContextsCache.current = await fetchDataSourceContexts();
      }
      const dsContexts = dsContextsCache.current;

      sendMessage(
        { text: text.trim() },
        {
          body: {
            dataSourceIds: dsContexts.map((ds) => ds.id),
            dataSourceContexts: dsContexts,
            currentPanels: JSON.stringify([{ id: panelId, title, chartType, prompt, sqlQuery }]),
            companyContext: "",
          },
        },
      );
    },
    [isChatLoading, sendMessage, panelId, title, chartType, prompt, sqlQuery],
  );

  useEffect(() => {
    fetch(`/api/panels/${panelId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Panel not found");
        return res.json();
      })
      .then((p) => {
        setTitle(p.title || "");
        setChartType(p.chart_type || p.chartType || "bar");
        setPrompt(p.prompt || "");
        setSqlQuery(p.sql_query || p.sqlQuery || "");
        setData(p.data || []);
        setConfig(p.config || {});
      })
      .catch(() => {
        toast.error("Failed to load panel");
        router.push(`/folders/${folderId}`);
      })
      .finally(() => setLoading(false));
  }, [panelId, folderId, router]);

  const previewChartData: ChartData = useMemo(() => {
    let labelKey: string;
    let valueKeys: string[];

    if (chartType === "pie") {
      labelKey = config.nameKey ?? config.xKey ?? "name";
      valueKeys = config.valueKey ? [config.valueKey] : config.yKeys ?? (config.yKey ? [config.yKey] : ["value"]);
    } else {
      labelKey = config.xKey ?? config.nameKey ?? "name";
      valueKeys = config.yKeys ?? (config.yKey ? [config.yKey] : config.valueKey ? [config.valueKey] : ["value"]);
    }

    return {
      title,
      chartType: chartType as ViewType,
      data,
      labelKey,
      valueKeys,
      sql: sqlQuery,
    };
  }, [title, chartType, data, config, sqlQuery]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/panels/${panelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          chartType,
          prompt,
          sqlQuery,
          data,
          config,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Panel saved");
    } catch {
      toast.error("Failed to save panel");
    } finally {
      setSaving(false);
    }
  }, [panelId, title, chartType, prompt, sqlQuery, data, config]);

  const handleExecute = useCallback(async () => {
    if (!sqlQuery.trim()) {
      toast.error("No SQL query to execute");
      return;
    }
    setExecuting(true);
    try {
      const ctxRes = await fetch("/api/contexts");
      if (!ctxRes.ok) throw new Error("Failed to load contexts");
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
        toast.error("No data source available");
        return;
      }

      const res = await fetch("/api/panel-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId, sql: sqlQuery }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Query execution failed");
      }

      const result = await res.json();
      const rows: Record<string, unknown>[] = result.rows || [];
      setData(rows);

      if (rows.length > 0) {
        const keys = Object.keys(rows[0]);
        const numericKeys = keys.filter((k) =>
          rows.some((r) => typeof r[k] === "number"),
        );
        const stringKeys = keys.filter((k) =>
          rows.some((r) => typeof r[k] === "string"),
        );

        if (chartType === "pie") {
          setConfig({
            nameKey: stringKeys[0] || keys[0],
            valueKey: numericKeys[0] || keys[1] || keys[0],
          });
        } else {
          setConfig({
            xKey: stringKeys[0] || keys[0],
            yKey: numericKeys[0] || keys[1] || keys[0],
            yKeys: numericKeys.length > 0 ? numericKeys : [keys[1] || keys[0]],
          });
        }
      }

      toast.success(`Query returned ${rows.length} row${rows.length !== 1 ? "s" : ""}`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to execute query");
    } finally {
      setExecuting(false);
    }
  }, [sqlQuery, chartType]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/panels/${panelId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Panel deleted");
      router.push(`/folders/${folderId}`);
    } catch {
      toast.error("Failed to delete panel");
      setDeleting(false);
    }
  }, [panelId, folderId, router]);

  const handleTranslate = useCallback(async () => {
    const text = nlInput.trim();
    if (!text) return;

    setTranslating(true);
    try {
      const ctxRes = await fetch("/api/contexts");
      if (!ctxRes.ok) throw new Error("Failed to load contexts");
      const ctxData = await ctxRes.json();
      const contexts: { tables: { dataSourceId: string; dataSourceName: string; dataSourceType: string; schemaName: string; tableName: string; columns: { name: string; type: string }[] }[] }[] = ctxData.contexts ?? [];

      const dsMap = new Map<string, { id: string; name: string; type: string; tables: { schema: string; name: string; columns: { name: string; type: string }[] }[] }>();
      for (const ctx of contexts) {
        for (const t of ctx.tables) {
          let ds = dsMap.get(t.dataSourceId);
          if (!ds) {
            ds = { id: t.dataSourceId, name: t.dataSourceName, type: t.dataSourceType, tables: [] };
            dsMap.set(t.dataSourceId, ds);
          }
          if (!ds.tables.some((tb) => tb.schema === t.schemaName && tb.name === t.tableName)) {
            ds.tables.push({ schema: t.schemaName, name: t.tableName, columns: t.columns });
          }
        }
      }

      const dataSourceContexts = Array.from(dsMap.values());
      if (dataSourceContexts.length === 0) {
        toast.error("No data sources available");
        return;
      }

      const res = await fetch("/api/panel-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, dataSourceContexts }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Translation failed");
      }

      const result = await res.json();
      if (result.error) throw new Error(result.error);

      if (result.sqlQuery) setSqlQuery(result.sqlQuery);
      if (result.title) setTitle(result.title);
      if (result.chartType) setChartType(result.chartType as ChartType);
      if (Array.isArray(result.data) && result.data.length > 0) setData(result.data);
      if (result.config) setConfig(result.config);

      setNlInput("");
      toast.success("Query generated from natural language");
    } catch (e) {
      toast.error((e as Error).message || "Failed to translate to SQL");
    } finally {
      setTranslating(false);
    }
  }, [nlInput]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
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
            <h1 className="text-2xl font-bold tracking-tight">Edit Panel</h1>
            <p className="text-sm text-muted-foreground">
              Configure your panel settings and query
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Delete
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Panel Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Panel title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="chartType">Chart Type</Label>
                <Select
                  value={chartType}
                  onValueChange={(v) => setChartType(v as ChartType)}
                >
                  <SelectTrigger id="chartType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHART_TYPES.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>
                        <span className="flex items-center gap-2">
                          <ct.icon className="h-3.5 w-3.5" />
                          {ct.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Input
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe what this panel should show"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Modify using natural language
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
                placeholder="e.g. Show me total revenue by month for the last year"
                rows={3}
                className="text-sm"
                disabled={translating}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && nlInput.trim()) {
                    e.preventDefault();
                    handleTranslate();
                  }
                }}
              />
              <Button
                onClick={handleTranslate}
                disabled={translating || !nlInput.trim()}
                size="sm"
                className="w-full"
              >
                {translating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                {translating ? "Generating SQL..." : "Generate SQL"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Describe what you want to see and we&apos;ll generate the SQL query, chart type, and configuration automatically.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">SQL Query</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                placeholder="SELECT ... FROM ..."
                rows={8}
                className="font-mono text-xs"
              />
              <Button
                onClick={handleExecute}
                disabled={executing || !sqlQuery.trim()}
                size="sm"
                variant="outline"
                className="w-full"
              >
                {executing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                Execute Query
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {executing ? (
                <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Executing query...</span>
                </div>
              ) : (
                <InlineChart
                  chartData={previewChartData}
                  mode="full"
                  height={300}
                />
              )}
            </CardContent>
          </Card>

          {data.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Data ({data.length} row{data.length !== 1 ? "s" : ""})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[300px] overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {Object.keys(data[0]).map((key) => (
                          <th
                            key={key}
                            className="px-3 py-2 text-left font-medium text-muted-foreground"
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-t border-border/50">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-3 py-1.5 truncate max-w-[200px]">
                              {val == null ? (
                                <span className="text-muted-foreground italic">null</span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.length > 50 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t">
                      Showing 50 of {data.length} rows
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <StarlightInput
        onSubmit={handleStarlightSubmit}
        isLoading={isChatLoading}
        placeholder="Ask Starlight to modify this panel (⌘K)"
        messages={chatMessages}
        view="panel"
      />
    </div>
  );
}
