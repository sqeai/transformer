"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type FormEvent,
  type ComponentPropsWithoutRef,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Send,
  Trash2,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brain,
  LayoutDashboard,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Save,
  Maximize2,
  Minimize2,
  Settings2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  ContextSelector,
  type ContextSelection,
} from "./ContextSelector";
import { ChartPanel } from "./ChartPanel";
import type { DashboardPanel } from "./types";

const DASHBOARD_STORAGE_KEY = "dashboard-chat-history";
const DASHBOARD_PANELS_KEY = "dashboard-panels";
const PANEL_REGEX = /<!-- DASHBOARD_PANEL:(.*?) -->/g;
const THINKING_START = "<!-- THINKING_START -->";
const THINKING_END = "<!-- THINKING_END -->";

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

function stripDelimiters(text: string): string {
  return text.replace(PANEL_REGEX, "").trim();
}

function parseThinking(text: string): { thinking: string; response: string } {
  const startIdx = text.indexOf(THINKING_START);
  const endIdx = text.indexOf(THINKING_END);

  if (startIdx === -1 && endIdx === -1) {
    return { thinking: "", response: stripDelimiters(text) };
  }

  const thinkingFrom = startIdx === -1 ? 0 : startIdx + THINKING_START.length;
  const thinkingTo = endIdx === -1 ? text.length : endIdx;
  const thinking = text.substring(thinkingFrom, thinkingTo).trim();

  let response = "";
  if (endIdx !== -1) {
    response = text.substring(endIdx + THINKING_END.length);
  }

  return { thinking, response: stripDelimiters(response) };
}

function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("chat-markdown break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => (
            <p className="mb-2 last:mb-0" {...props}>{children}</p>
          ),
          h1: ({ children, ...props }: ComponentPropsWithoutRef<"h1">) => (
            <h1 className="mb-2 mt-3 text-base font-bold first:mt-0" {...props}>{children}</h1>
          ),
          h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
            <h2 className="mb-1.5 mt-2.5 text-sm font-bold first:mt-0" {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
            <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...props}>{children}</h3>
          ),
          ul: ({ children, ...props }: ComponentPropsWithoutRef<"ul">) => (
            <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0" {...props}>{children}</ul>
          ),
          ol: ({ children, ...props }: ComponentPropsWithoutRef<"ol">) => (
            <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0" {...props}>{children}</ol>
          ),
          li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => (
            <li className="text-sm" {...props}>{children}</li>
          ),
          code: ({ children, className: codeClassName, ...props }: ComponentPropsWithoutRef<"code">) => {
            const isBlock = codeClassName?.includes("language-");
            if (isBlock) {
              return (
                <pre className="my-2 overflow-x-auto rounded-lg bg-background/80 p-3 text-xs last:mb-0">
                  <code className={codeClassName} {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-background/60 px-1 py-0.5 text-xs font-mono" {...props}>{children}</code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
            <div className="my-2 overflow-auto max-h-48 last:mb-0">
              <table className="w-full text-xs border-collapse" {...props}>{children}</table>
            </div>
          ),
          th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
            <th className="sticky top-0 z-10 border border-border bg-muted/50 px-2 py-1 text-left font-semibold" {...props}>{children}</th>
          ),
          td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
            <td className="border border-border px-2 py-1" {...props}>{children}</td>
          ),
          a: ({ children, ...props }: ComponentPropsWithoutRef<"a">) => (
            <a className="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
          ),
          strong: ({ children, ...props }: ComponentPropsWithoutRef<"strong">) => (
            <strong className="font-semibold" {...props}>{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 text-muted-foreground py-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="text-xs">Building dashboard</span>
      <span className="flex gap-0.5">
        <span className="animate-bounce text-xs" style={{ animationDelay: "0ms" }}>.</span>
        <span className="animate-bounce text-xs" style={{ animationDelay: "150ms" }}>.</span>
        <span className="animate-bounce text-xs" style={{ animationDelay: "300ms" }}>.</span>
      </span>
    </div>
  );
}

function AssistantMessage({
  thinking,
  response,
  toolParts,
  hasThinking,
  hasResponse,
  hasTools,
}: {
  thinking: string;
  response: string;
  toolParts: unknown[];
  hasThinking: boolean;
  hasResponse: boolean;
  hasTools: boolean;
}) {
  const [thinkingOpen, setThinkingOpen] = useState(!hasResponse);
  const [toolsOpen, setToolsOpen] = useState(!hasResponse);

  useEffect(() => {
    if (hasResponse) {
      setThinkingOpen(false);
      setToolsOpen(false);
    }
  }, [hasResponse]);

  const tailLength = 100;
  const thinkingTail = thinking.replace(/\s+/g, " ").trim();
  const thinkingPreview =
    thinkingTail.length > tailLength
      ? "…" + thinkingTail.slice(-tailLength)
      : thinkingTail;

  return (
    <div className="flex gap-2">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0 max-w-[90%] flex flex-col gap-1.5">
        {hasTools && (
          <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 px-2.5 w-full bg-muted/40 rounded-lg border hover:bg-muted/60">
              <Wrench className="h-3.5 w-3.5" />
              <span className="font-medium">{toolParts.length} tool{toolParts.length > 1 ? "s" : ""} used</span>
              {toolsOpen ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto rounded-lg bg-muted/20 border p-2.5">
                {toolParts.map((part, index) => {
                  const p = part as Record<string, unknown>;
                  const toolName = (p.toolName as string) || (p.type as string) || "Tool";
                  const state = p.state as string | undefined;
                  return (
                    <div key={`tool-${index}`} className="flex items-center gap-2 py-0.5">
                      <span className="text-[11px] font-semibold text-foreground">{toolName}</span>
                      {state && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          state === "output-available" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : state === "running" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {state === "output-available" ? "completed" : state}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {hasThinking && (
          <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 px-2.5 w-full bg-muted/30 rounded-lg border border-dashed hover:bg-muted/50 text-left">
              <Brain className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-medium flex-shrink-0">Thinking</span>
              {!thinkingOpen && thinkingPreview ? (
                <span className="min-w-0 flex-1 truncate text-[11px] ml-1" title={thinkingPreview}>{thinkingPreview}</span>
              ) : null}
              {thinkingOpen ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 ml-auto" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 rounded-lg bg-muted/20 border border-dashed p-3 text-muted-foreground">
                <MarkdownContent content={thinking} className="prose-sm [&_*]:text-muted-foreground text-xs" />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {hasResponse && (
          <div className="rounded-2xl rounded-bl-md bg-muted text-foreground px-3.5 py-2.5 text-sm leading-relaxed">
            <MarkdownContent content={response} />
          </div>
        )}

        {!hasResponse && !hasThinking && !hasTools && <ThinkingIndicator />}
      </div>
    </div>
  );
}

interface DashboardBuilderProps {
  dashboardId?: string;
  folderId?: string;
}

export function DashboardBuilder({ dashboardId, folderId }: DashboardBuilderProps) {
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [dashboardName, setDashboardName] = useState("Untitled Dashboard");
  const [isSaving, setIsSaving] = useState(false);
  const [panels, setPanels] = useState<DashboardPanel[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(DASHBOARD_PANELS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [contextSelection, setContextSelection] =
    useState<ContextSelection | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DASHBOARD_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, [setMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(messages));
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(DASHBOARD_STORAGE_KEY);
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_PANELS_KEY, JSON.stringify(panels));
  }, [panels]);

  useEffect(() => {
    if (!expandedPanel) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setExpandedPanel(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedPanel]);

  const dbInitialLoadDone = useRef(false);
  const dbPanelsSnapshot = useRef<string>("");
  const dbAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dashboardId) return;
    (async () => {
      try {
        const res = await fetch(`/api/dashboards/${dashboardId}`);
        if (res.ok) {
          const data = await res.json();
          setDashboardName(data.name || "Untitled Dashboard");
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
            dbPanelsSnapshot.current = JSON.stringify(loaded);
          }
        }
      } catch {
        // fallback to localStorage
      } finally {
        dbInitialLoadDone.current = true;
      }
    })();
  }, [dashboardId]);

  useEffect(() => {
    if (!dashboardId || !dbInitialLoadDone.current) return;

    const snapshot = JSON.stringify(panels);
    if (snapshot === dbPanelsSnapshot.current) return;
    dbPanelsSnapshot.current = snapshot;

    if (dbAutoSaveTimer.current) clearTimeout(dbAutoSaveTimer.current);
    dbAutoSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/dashboards/${dashboardId}/panels`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panels }),
        });
      } catch {
        // silent
      }
    }, 1500);

    return () => {
      if (dbAutoSaveTimer.current) clearTimeout(dbAutoSaveTimer.current);
    };
  }, [panels, dashboardId]);

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
      dbPanelsSnapshot.current = JSON.stringify(panels);
      toast.success("Dashboard saved");
    } catch {
      toast.error("Failed to save dashboard");
    } finally {
      setIsSaving(false);
    }
  }, [dashboardId, dashboardName, panels]);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    appliedActions.current.clear();
    localStorage.removeItem(DASHBOARD_STORAGE_KEY);
  }, [setMessages]);

  const clearDashboard = useCallback(() => {
    setPanels([]);
    appliedActions.current.clear();
    localStorage.removeItem(DASHBOARD_PANELS_KEY);
  }, []);

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

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
        })),
      );

      sendMessage(
        { text: input.trim() },
        {
          body: {
            dataSourceIds,
            dataSourceContexts,
            currentPanels,
            companyContext: contextSelection?.companyContext ?? "",
          },
        },
      );
      setInput("");
    },
    [input, isLoading, sendMessage, contextSelection, panels],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit(e as unknown as FormEvent);
      }
    },
    [onSubmit],
  );

  const removePanel = useCallback((id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const editPanel = useCallback(
    (id: string) => {
      const panel = panels.find((p) => p.id === id);
      if (panel) {
        setInput(`Update the "${panel.title}" panel: `);
        inputRef.current?.focus();
      }
    },
    [panels],
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-6 overflow-hidden">
      {/* Main area - split between dashboard and chat */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Dashboard Builder</h1>
              <p className="text-xs text-muted-foreground">
                {panels.length > 0
                  ? `${panels.length} panel${panels.length > 1 ? "s" : ""}${contextSelection && contextSelection.contexts.length > 0 ? ` · ${contextSelection.contexts.length} context${contextSelection.contexts.length > 1 ? "s" : ""}` : ""}`
                  : "Select contexts from the right panel to get started"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {dashboardId && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={saveDashboard}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            )}
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setPanelOpen((o) => !o)}
              title={panelOpen ? "Hide contexts" : "Show contexts"}
            >
              {panelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Dashboard grid + Chat */}
        <div className="flex flex-1 min-h-0">
          {/* Dashboard panels */}
          <div className="flex-1 overflow-y-auto p-4">
            {panels.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <LayoutDashboard className="mb-4 h-12 w-12 opacity-30" />
                <p className="text-lg font-medium">No panels yet</p>
                <p className="mt-2 text-sm max-w-md">
                  Use the chat below to describe the dashboard you want.
                  Try something like:
                </p>
                <div className="mt-4 grid grid-cols-1 gap-2 max-w-lg">
                  {[
                    "Create a dashboard with revenue by month as a line chart and expenses by category as a pie chart",
                    "Show me a bar chart of top 10 products by sales",
                    "Build a financial overview with revenue trends, cost breakdown, and profit waterfall",
                    "Display a KPI summary showing total sales, customer count, conversion rate, and average order value",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs text-left hover:bg-muted/60 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {expandedPanel && (
                  <div
                    className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8"
                    onClick={() => setExpandedPanel(null)}
                  >
                    <div
                      className="w-full max-w-5xl h-full max-h-[80vh] bg-card rounded-xl border shadow-2xl flex flex-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-4 py-3 border-b">
                        <h3 className="font-semibold">{panels.find(p => p.id === expandedPanel)?.title}</h3>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedPanel(null)}>
                          <Minimize2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex-1 p-4">
                        {panels.find(p => p.id === expandedPanel) && (
                          <ChartPanel
                            panel={panels.find(p => p.id === expandedPanel)!}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 auto-rows-[280px]">
                  {panels.map((panel) => (
                    <div key={panel.id} className="relative group">
                      <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden h-full">
                        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
                          <h3 className="text-sm font-medium truncate">{panel.title}</h3>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => editPanel(panel.id)}>
                              <Settings2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedPanel(panel.id)}>
                              <Maximize2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removePanel(panel.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex-1 p-3 min-h-[200px]">
                          <ChartPanel panel={panel} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Chat sidebar */}
          <div className="w-96 flex-shrink-0 flex flex-col border-l border-border bg-card/30">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Chat</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={clearChat}
                title="Clear chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            >
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground px-4">
                  <Plus className="mb-2 h-8 w-8 opacity-30" />
                  <p className="text-xs">
                    Describe the charts you want and I&apos;ll build them for you.
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.role === "user";

                if (isUser) {
                  const textParts = (msg.parts ?? []).filter(
                    (p): p is { type: "text"; text: string } =>
                      p.type === "text",
                  );
                  const text = textParts.map((p) => p.text).join("");
                  if (!text) return null;

                  return (
                    <div key={msg.id} className="flex gap-2 justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3 py-2 text-xs leading-relaxed">
                        <p className="whitespace-pre-wrap break-words">
                          {text}
                        </p>
                      </div>
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20">
                        <User className="h-3 w-3 text-primary" />
                      </div>
                    </div>
                  );
                }

                const textParts = (msg.parts ?? []).filter(
                  (p): p is { type: "text"; text: string } =>
                    p.type === "text",
                );
                const fullText = textParts.map((p) => p.text).join("");

                const toolParts = (msg.parts ?? []).filter((p) => {
                  const pt = p as Record<string, unknown>;
                  return (
                    typeof pt.type === "string" &&
                    (pt.type.startsWith("tool-") ||
                      pt.type === "dynamic-tool" ||
                      pt.type === "tool-invocation")
                  );
                });

                const { thinking, response } = parseThinking(fullText);
                const hasThinking = thinking.trim().length > 0;
                const hasResponse = response.trim().length > 0;
                const hasTools = toolParts.length > 0;

                if (!hasThinking && !hasResponse && !hasTools) return null;

                return (
                  <AssistantMessage
                    key={msg.id}
                    thinking={thinking}
                    response={response}
                    toolParts={toolParts}
                    hasThinking={hasThinking}
                    hasResponse={hasResponse}
                    hasTools={hasTools}
                  />
                );
              })}

              {isLoading &&
                messages[messages.length - 1]?.role === "user" && (
                  <div className="flex gap-2">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2">
                      <ThinkingIndicator />
                    </div>
                  </div>
                )}
            </div>

            <form
              onSubmit={onSubmit}
              className="border-t border-border/50 p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Describe a chart or dashboard..."
                  rows={1}
                  className={cn(
                    "flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs",
                    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                    "max-h-[100px] min-h-[36px]",
                  )}
                  style={
                    { fieldSizing: "content" } as React.CSSProperties
                  }
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-lg"
                  disabled={!input.trim() || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Right panel - Context Selector */}
      {panelOpen && (
        <div className="w-72 flex-shrink-0">
          <ContextSelector onSelectionChange={setContextSelection} storageKey="dashboard-selected-context-ids" />
        </div>
      )}
    </div>
  );
}
