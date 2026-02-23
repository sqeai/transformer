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
import {
  MessageCircle,
  X,
  Send,
  Trash2,
  Loader2,
  Bot,
  User,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brain,
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
import { useChatContext, STORAGE_KEY } from "@/components/ChatProvider";
import { useSchemaStore } from "@/lib/schema-store";
import type { SchemaField, ColumnMapping, PivotConfig } from "@/lib/types";
import { toast } from "sonner";

interface ToolResultPayload {
  type: "schema_update" | "mappings_update" | "pivot_update" | "set_pivot_config" | "set_edges";
  schema?: { name: string; fields: SchemaField[] };
  mappings?: ColumnMapping[];
  pivotConfig?: PivotConfig;
  edges?: { rawColumn: string; targetPath: string }[];
}

const DELIMITER_REGEX = /<!-- (?:SCHEMA_JSON|MAPPINGS_JSON|PIVOT_JSON|EDGES_JSON):(.*?) -->/g;
const THINKING_START = "<!-- THINKING_START -->";
const THINKING_END = "<!-- THINKING_END -->";

function extractDelimitedPayloads(text: string): ToolResultPayload[] {
  const payloads: ToolResultPayload[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(DELIMITER_REGEX);
  while ((match = regex.exec(text)) !== null) {
    try {
      payloads.push(JSON.parse(match[1]));
    } catch {
      // skip unparseable
    }
  }
  return payloads;
}

function stripDelimiters(text: string): string {
  return text.replace(DELIMITER_REGEX, "").trim();
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

function MarkdownContent({ content, className }: { content: string; className?: string }) {
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
              <code className="rounded bg-background/60 px-1 py-0.5 text-xs font-mono" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          blockquote: ({ children, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
            <blockquote
              className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground last:mb-0"
              {...props}
            >
              {children}
            </blockquote>
          ),
          table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
            <div className="my-2 overflow-x-auto last:mb-0">
              <table className="w-full text-xs border-collapse" {...props}>{children}</table>
            </div>
          ),
          th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
            <th className="border border-border bg-muted/50 px-2 py-1 text-left font-semibold" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
            <td className="border border-border px-2 py-1" {...props}>{children}</td>
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
      <span className="text-xs">Thinking</span>
      <span className="flex gap-0.5">
        <span className="animate-bounce text-xs" style={{ animationDelay: "0ms" }}>.</span>
        <span className="animate-bounce text-xs" style={{ animationDelay: "150ms" }}>.</span>
        <span className="animate-bounce text-xs" style={{ animationDelay: "300ms" }}>.</span>
      </span>
    </div>
  );
}

export function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const { messages, sendMessage, setMessages, status } = useChatContext();
  const {
    schemas,
    workflow,
    updateSchema,
    setColumnMappings,
    setPivotConfig,
  } = useSchemaStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const appliedPayloads = useRef<Set<string>>(new Set());

  const isLoading = status === "streaming" || status === "submitted";

  const currentSchema = workflow.currentSchemaId
    ? schemas.find((s) => s.id === workflow.currentSchemaId)
    : schemas[0];

  const applyPayload = useCallback(
    (payload: ToolResultPayload) => {
      const key = JSON.stringify(payload);
      if (appliedPayloads.current.has(key)) return;

      if (payload.type === "schema_update" && payload.schema && currentSchema) {
        appliedPayloads.current.add(key);
        updateSchema(currentSchema.id, {
          name: payload.schema.name,
          fields: payload.schema.fields,
        });
        toast.success("Schema updated by assistant");
      } else if (payload.type === "mappings_update" && payload.mappings) {
        appliedPayloads.current.add(key);
        setColumnMappings(payload.mappings);
        toast.success("Column mappings updated by assistant");
      } else if (
        (payload.type === "pivot_update" || payload.type === "set_pivot_config") &&
        payload.pivotConfig
      ) {
        appliedPayloads.current.add(key);
        setPivotConfig(payload.pivotConfig);
        toast.success("Pivot config updated by assistant");
      } else if (payload.type === "set_edges" && payload.edges) {
        appliedPayloads.current.add(key);
        const mappings: ColumnMapping[] = payload.edges.map((e) => ({
          rawColumn: e.rawColumn,
          targetPath: e.targetPath,
        }));
        setColumnMappings(mappings);
        toast.success("Mapping edges updated by assistant");
      }
    },
    [currentSchema, updateSchema, setColumnMappings, setPivotConfig],
  );

  // Scan all assistant messages for delimited payloads in text content
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const textParts = (msg.parts ?? []).filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const fullText = textParts.map((p) => p.text).join("");
      const payloads = extractDelimitedPayloads(fullText);
      for (const payload of payloads) {
        applyPayload(payload);
      }
    }
  }, [messages, applyPayload]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const clearChat = useCallback(() => {
    setMessages([]);
    appliedPayloads.current.clear();
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }, [setMessages]);

  const buildWorkspaceContext = useCallback((): string | null => {
    if (!currentSchema) return null;

    return JSON.stringify({
      schema: {
        id: currentSchema.id,
        name: currentSchema.name,
        fields: currentSchema.fields,
      },
      rawColumns: workflow.rawColumns,
      columnMappings: workflow.columnMappings,
      pivotConfig: workflow.pivotConfig,
    });
  }, [currentSchema, workflow]);

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

      const workspaceContext = buildWorkspaceContext();
      sendMessage({ text: input.trim() }, { body: { workspaceContext } });
      setInput("");
    },
    [input, isLoading, sendMessage, buildWorkspaceContext],
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
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          "bg-gradient-to-br from-primary to-accent text-primary-foreground",
          "hover:scale-105 hover:shadow-xl active:scale-95",
          open && "rotate-90 scale-0 opacity-0 pointer-events-none",
        )}
        aria-label="Open chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {/* Chat panel */}
      <div
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300 ease-out",
          expanded
            ? "bottom-4 right-4 w-[700px] max-w-[calc(100vw-2rem)]"
            : "bottom-6 right-6 w-[400px] max-w-[calc(100vw-3rem)]",
          open
            ? expanded
              ? "h-[calc(100vh-2rem)] opacity-100 translate-y-0"
              : "h-[560px] max-h-[calc(100vh-3rem)] opacity-100 translate-y-0"
            : "h-0 max-h-0 opacity-0 translate-y-4 pointer-events-none",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Schema Assistant</p>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Thinking..."
                  : currentSchema
                    ? `Schema: ${currentSchema.name}`
                    : "No schema loaded"}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? "Shrink" : "Expand"}
            >
              {expanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
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
              onClick={() => setOpen(false)}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Bot className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">How can I help?</p>
              <p className="mt-1 text-xs max-w-[260px]">
                Ask me to modify your schema, change column mappings, configure
                pivot settings, or restructure data.
              </p>
            </div>
          )}
          {messages.map((msg) => {
            const isUser = msg.role === "user";

            if (isUser) {
              const textParts = (msg.parts ?? []).filter(
                (p): p is { type: "text"; text: string } => p.type === "text",
              );
              const text = textParts.map((p) => p.text).join("");
              if (!text) return null;

              return (
                <div key={msg.id} className="flex gap-2 justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2.5 text-sm leading-relaxed">
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                  </div>
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
              );
            }

            // Assistant message
            const textParts = (msg.parts ?? []).filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            );
            const fullText = textParts.map((p) => p.text).join("");

            // Tool parts (for collapsible display)
            const toolParts = (msg.parts ?? []).filter((p) => {
              const pt = p as Record<string, unknown>;
              return (
                typeof pt.type === "string" &&
                (pt.type.startsWith("tool-") || pt.type === "dynamic-tool" || pt.type === "tool-invocation")
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
          className="border-t border-border bg-card p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your schema..."
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                "max-h-[120px] min-h-[40px]",
              )}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
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
    </>
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

  // Auto-collapse when response text arrives
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
        {/* Tool calls collapsible */}
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
                  const toolName = (p.toolName as string) || (p.type as string) || "Tool";
                  const output = p.output;
                  const state = p.state as string | undefined;

                  let displayContent = "";
                  if (output && typeof output === "object" && "kwargs" in (output as Record<string, unknown>)) {
                    displayContent = ((output as Record<string, unknown>).kwargs as Record<string, unknown>)?.content as string ?? "";
                  } else if (typeof output === "string") {
                    displayContent = output;
                  } else if (output) {
                    displayContent = JSON.stringify(output, null, 2);
                  }

                  // Strip delimiters from tool display
                  displayContent = displayContent.replace(DELIMITER_REGEX, "").trim();

                  return (
                    <div key={`tool-${index}`} className="border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-semibold text-foreground">{toolName}</span>
                        {state && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded",
                            state === "output-available"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : state === "running"
                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : "bg-muted text-muted-foreground"
                          )}>
                            {state === "output-available" ? "completed" : state}
                          </span>
                        )}
                      </div>
                      {displayContent && (
                        <div className="text-[11px] text-muted-foreground max-h-24 overflow-y-auto">
                          <pre className="whitespace-pre-wrap break-all">{displayContent.slice(0, 500)}{displayContent.length > 500 ? "…" : ""}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Thinking collapsible */}
        {hasThinking && (
          <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 px-2.5 w-full bg-muted/30 rounded-lg border border-dashed hover:bg-muted/50 text-left">
              <Brain className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-medium flex-shrink-0">Thinking</span>
              {!thinkingOpen && thinkingPreview ? (
                <span className="min-w-0 flex-1 truncate text-[11px] ml-1" title={thinkingPreview}>
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

        {/* Response text */}
        {hasResponse && (
          <div className="rounded-2xl rounded-bl-md bg-muted text-foreground px-3.5 py-2.5 text-sm leading-relaxed">
            <MarkdownContent content={response} />
          </div>
        )}

        {/* Still thinking (no response yet, no thinking yet) */}
        {!hasResponse && !hasThinking && !hasTools && (
          <ThinkingIndicator />
        )}
      </div>
    </div>
  );
}
