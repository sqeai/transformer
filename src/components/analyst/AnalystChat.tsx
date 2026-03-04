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
  PanelRightClose,
  PanelRightOpen,
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
  DataSourcePanel,
  type SelectedDataSource,
} from "./DataSourcePanel";
import { InlineChart } from "./InlineChart";
import type { VisualizationPayload } from "@/lib/agents/analyst-agent/tools";

const ANALYST_STORAGE_KEY = "analyst-chat-history";
const ANALYST_SOURCES_KEY = "analyst-selected-sources";
const THINKING_START = "<!-- THINKING_START -->";
const THINKING_END = "<!-- THINKING_END -->";

function parseThinking(text: string): { thinking: string; response: string } {
  const startIdx = text.indexOf(THINKING_START);
  const endIdx = text.indexOf(THINKING_END);

  if (startIdx === -1 && endIdx === -1) {
    return { thinking: "", response: text.trim() };
  }

  const thinkingFrom = startIdx === -1 ? 0 : startIdx + THINKING_START.length;
  const thinkingTo = endIdx === -1 ? text.length : endIdx;
  const thinking = text.substring(thinkingFrom, thinkingTo).trim();

  let response = "";
  if (endIdx !== -1) {
    response = text.substring(endIdx + THINKING_END.length);
  }

  return { thinking, response: response.trim() };
}

const VISUALIZATION_PREFIX = "<!-- VISUALIZATION:";
const VISUALIZATION_SUFFIX = " -->";

function extractVisualizations(toolParts: unknown[]): VisualizationPayload[] {
  const visualizations: VisualizationPayload[] = [];
  for (const part of toolParts) {
    const p = part as Record<string, unknown>;
    if (p.toolName !== "visualize_data") continue;

    const output = p.output;
    let raw = "";
    if (output && typeof output === "object" && "kwargs" in (output as Record<string, unknown>)) {
      raw = ((output as Record<string, unknown>).kwargs as Record<string, unknown>)?.content as string ?? "";
    } else if (typeof output === "string") {
      raw = output;
    }

    const startIdx = raw.indexOf(VISUALIZATION_PREFIX);
    if (startIdx === -1) continue;
    const jsonStart = startIdx + VISUALIZATION_PREFIX.length;
    const endIdx = raw.indexOf(VISUALIZATION_SUFFIX, jsonStart);
    const jsonStr = endIdx === -1 ? raw.slice(jsonStart) : raw.slice(jsonStart, endIdx);

    try {
      visualizations.push(JSON.parse(jsonStr) as VisualizationPayload);
    } catch {
      // skip malformed payloads
    }
  }
  return visualizations;
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
            <p className="mb-2 last:mb-0" {...props}>
              {children}
            </p>
          ),
          h1: ({ children, ...props }: ComponentPropsWithoutRef<"h1">) => (
            <h1
              className="mb-2 mt-3 text-base font-bold first:mt-0"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
            <h2
              className="mb-1.5 mt-2.5 text-sm font-bold first:mt-0"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
            <h3
              className="mb-1 mt-2 text-sm font-semibold first:mt-0"
              {...props}
            >
              {children}
            </h3>
          ),
          ul: ({ children, ...props }: ComponentPropsWithoutRef<"ul">) => (
            <ul
              className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }: ComponentPropsWithoutRef<"ol">) => (
            <ol
              className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => (
            <li className="text-sm" {...props}>
              {children}
            </li>
          ),
          code: ({
            children,
            className: codeClassName,
            ...props
          }: ComponentPropsWithoutRef<"code">) => {
            const isBlock = codeClassName?.includes("language-");
            if (isBlock) {
              return (
                <pre className="my-2 overflow-x-auto rounded-lg bg-background/80 p-3 text-xs last:mb-0">
                  <code className={codeClassName} {...props}>
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code
                className="rounded bg-background/60 px-1 py-0.5 text-xs font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          blockquote: ({
            children,
            ...props
          }: ComponentPropsWithoutRef<"blockquote">) => (
            <blockquote
              className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground last:mb-0"
              {...props}
            >
              {children}
            </blockquote>
          ),
          table: ({
            children,
            ...props
          }: ComponentPropsWithoutRef<"table">) => (
            <div className="my-2 overflow-auto max-h-96 last:mb-0">
              <table
                className="w-full text-xs border-collapse"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
            <th
              className="sticky top-0 z-10 border border-border bg-muted/50 px-2 py-1 text-left font-semibold"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
            <td className="border border-border px-2 py-1" {...props}>
              {children}
            </td>
          ),
          a: ({ children, ...props }: ComponentPropsWithoutRef<"a">) => (
            <a
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          hr: (props: ComponentPropsWithoutRef<"hr">) => (
            <hr className="my-2 border-border" {...props} />
          ),
          strong: ({
            children,
            ...props
          }: ComponentPropsWithoutRef<"strong">) => (
            <strong className="font-semibold" {...props}>
              {children}
            </strong>
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
      <span className="text-xs">Thinking</span>
      <span className="flex gap-0.5">
        <span
          className="animate-bounce text-xs"
          style={{ animationDelay: "0ms" }}
        >
          .
        </span>
        <span
          className="animate-bounce text-xs"
          style={{ animationDelay: "150ms" }}
        >
          .
        </span>
        <span
          className="animate-bounce text-xs"
          style={{ animationDelay: "300ms" }}
        >
          .
        </span>
      </span>
    </div>
  );
}

function AssistantMessage({
  thinking,
  response,
  toolParts,
  visualizations,
  hasThinking,
  hasResponse,
  hasTools,
}: {
  thinking: string;
  response: string;
  toolParts: unknown[];
  visualizations: VisualizationPayload[];
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
      <div className="flex-1 min-w-0 max-w-[85%] flex flex-col gap-1.5">
        {hasTools && (
          <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 px-2.5 w-full bg-muted/40 rounded-lg border hover:bg-muted/60">
              <Wrench className="h-3.5 w-3.5" />
              <span className="font-medium">
                {toolParts.length} tool{toolParts.length > 1 ? "s" : ""} used
              </span>
              {toolsOpen ? (
                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 ml-auto" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto rounded-lg bg-muted/20 border p-2.5">
                {toolParts.map((part, index) => {
                  const p = part as Record<string, unknown>;
                  const toolName =
                    (p.toolName as string) ||
                    (p.type as string) ||
                    "Tool";
                  const output = p.output;
                  const state = p.state as string | undefined;

                  let displayContent = "";
                  if (
                    output &&
                    typeof output === "object" &&
                    "kwargs" in (output as Record<string, unknown>)
                  ) {
                    displayContent =
                      (
                        (output as Record<string, unknown>)
                          .kwargs as Record<string, unknown>
                      )?.content as string ?? "";
                  } else if (typeof output === "string") {
                    displayContent = output;
                  } else if (output) {
                    displayContent = JSON.stringify(output, null, 2);
                  }

                  return (
                    <div
                      key={`tool-${index}`}
                      className="border-b border-border/50 pb-1.5 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-semibold text-foreground">
                          {toolName}
                        </span>
                        {state && (
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded",
                              state === "output-available"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : state === "running"
                                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {state === "output-available"
                              ? "completed"
                              : state}
                          </span>
                        )}
                      </div>
                      {displayContent && (
                        <div className="text-[11px] text-muted-foreground max-h-24 overflow-y-auto">
                          <pre className="whitespace-pre-wrap break-all">
                            {displayContent.slice(0, 500)}
                            {displayContent.length > 500 ? "…" : ""}
                          </pre>
                        </div>
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
                <span
                  className="min-w-0 flex-1 truncate text-[11px] ml-1"
                  title={thinkingPreview}
                >
                  {thinkingPreview}
                </span>
              ) : null}
              {thinkingOpen ? (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 ml-auto" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 ml-auto" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 rounded-lg bg-muted/20 border border-dashed p-3 text-muted-foreground">
                <MarkdownContent
                  content={thinking}
                  className="prose-sm [&_*]:text-muted-foreground text-xs"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {visualizations.length > 0 && (
          <div className="space-y-2">
            {visualizations.map((viz, i) => (
              <InlineChart key={`viz-${i}`} visualization={viz} />
            ))}
          </div>
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

export function AnalystChat() {
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedSources, setSelectedSources] = useState<SelectedDataSource[]>(
    () => {
      if (typeof window === "undefined") return [];
      try {
        const stored = localStorage.getItem(ANALYST_SOURCES_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    },
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useRef(
    new DefaultChatTransport({ api: "/api/analyst-chat" }),
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status,
  } = useChat({
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
      const stored = localStorage.getItem(ANALYST_STORAGE_KEY);
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
      localStorage.setItem(ANALYST_STORAGE_KEY, JSON.stringify(messages));
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(ANALYST_STORAGE_KEY);
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(
      ANALYST_SOURCES_KEY,
      JSON.stringify(selectedSources),
    );
  }, [selectedSources]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(ANALYST_STORAGE_KEY);
  }, [setMessages]);

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

      const dataSourceIds = selectedSources.map((s) => s.id);
      const dataSourceContexts = selectedSources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        tables: s.tables,
      }));

      sendMessage(
        { text: input.trim() },
        { body: { dataSourceIds, dataSourceContexts } },
      );
      setInput("");
    },
    [input, isLoading, sendMessage, selectedSources],
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

  return (
    <div className="flex h-[calc(100%+3rem)] -m-6 overflow-hidden">
      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Data Analyst</h1>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Thinking..."
                  : selectedSources.length > 0
                    ? `${selectedSources.reduce((n, s) => n + s.tables.length, 0)} table${selectedSources.reduce((n, s) => n + s.tables.length, 0) !== 1 ? "s" : ""} selected`
                    : "Select tables to get started"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={clearChat}
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setPanelOpen((o) => !o)}
              title={panelOpen ? "Hide databases" : "Show databases"}
            >
              {panelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Bot className="mb-4 h-12 w-12 opacity-30" />
              <p className="text-lg font-medium">Data Analyst Assistant</p>
              <p className="mt-2 text-sm max-w-md">
                Ask me financial questions, explore your data, or request
                analysis. Select tables from the right panel to get started.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2 max-w-lg">
                {[
                  "What are the top 10 customers by revenue?",
                  "Show me monthly revenue trends",
                  "What's the average order value?",
                  "Compare Q1 vs Q2 performance",
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
                  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-3 text-sm leading-relaxed">
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                  </div>
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20">
                    <User className="h-4 w-4 text-primary" />
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
            const visualizations = extractVisualizations(toolParts);
            const hasThinking = thinking.trim().length > 0;
            const hasResponse = response.trim().length > 0;
            const hasTools = toolParts.length > 0;
            const hasVisualizations = visualizations.length > 0;

            if (!hasThinking && !hasResponse && !hasTools && !hasVisualizations) return null;

            return (
              <AssistantMessage
                key={msg.id}
                thinking={thinking}
                response={response}
                toolParts={toolParts}
                visualizations={visualizations}
                hasThinking={hasThinking}
                hasResponse={hasResponse}
                hasTools={hasTools}
              />
            );
          })}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                <ThinkingIndicator />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={onSubmit}
          className="border-t border-border bg-card/80 backdrop-blur-sm p-4"
        >
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                selectedSources.length > 0
                  ? "Ask a question about your data..."
                  : "Select tables from the right panel first..."
              }
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                "max-h-[150px] min-h-[44px]",
              )}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl"
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Right panel - Data Sources */}
      {panelOpen && (
        <div className="w-72 flex-shrink-0">
          <DataSourcePanel
            selectedSources={selectedSources}
            onSelectionChange={setSelectedSources}
          />
        </div>
      )}
    </div>
  );
}
