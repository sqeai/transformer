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
  CheckCircle2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useChatContext, STORAGE_KEY } from "@/components/ChatProvider";
import { useSchemaStore } from "@/lib/schema-store";
import type { SchemaField, ColumnMapping, PivotConfig } from "@/lib/types";
import { toast } from "sonner";

interface ToolResultPayload {
  type: "schema_update" | "mappings_update" | "pivot_update";
  schema?: { name: string; fields: SchemaField[] };
  mappings?: ColumnMapping[];
  pivotConfig?: PivotConfig;
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

function ToolResultBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 text-xs font-medium text-green-700 dark:text-green-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {label}
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
  const appliedToolCalls = useRef<Set<string>>(new Set());

  const isLoading = status === "streaming" || status === "submitted";

  const currentSchema = workflow.currentSchemaId
    ? schemas.find((s) => s.id === workflow.currentSchemaId)
    : schemas[0];

  const applyToolResult = useCallback(
    (toolCallId: string, output: unknown) => {
      if (appliedToolCalls.current.has(toolCallId)) return;

      let payload: ToolResultPayload;
      try {
        payload =
          typeof output === "string" ? JSON.parse(output) : (output as ToolResultPayload);
      } catch {
        return;
      }

      if (payload.type === "schema_update" && payload.schema && currentSchema) {
        appliedToolCalls.current.add(toolCallId);
        updateSchema(currentSchema.id, {
          name: payload.schema.name,
          fields: payload.schema.fields,
        });
        toast.success("Schema updated by assistant");
      } else if (payload.type === "mappings_update" && payload.mappings) {
        appliedToolCalls.current.add(toolCallId);
        setColumnMappings(payload.mappings);
        toast.success("Column mappings updated by assistant");
      } else if (payload.type === "pivot_update" && payload.pivotConfig) {
        appliedToolCalls.current.add(toolCallId);
        setPivotConfig(payload.pivotConfig);
        toast.success("Pivot config updated by assistant");
      }
    },
    [currentSchema, updateSchema, setColumnMappings, setPivotConfig],
  );

  // Scan messages for tool results and apply them
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts ?? []) {
        const p = part as Record<string, unknown>;
        if (
          typeof p.type === "string" &&
          (p.type.startsWith("tool-") || p.type === "dynamic-tool") &&
          p.state === "output-available" &&
          typeof p.toolCallId === "string" &&
          p.output !== undefined
        ) {
          applyToolResult(p.toolCallId as string, p.output);
        }
      }
    }
  }, [messages, applyToolResult]);

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
    appliedToolCalls.current.clear();
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
            const textParts = (msg.parts ?? []).filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            );
            const text =
              textParts.length > 0
                ? textParts.map((p) => p.text).join("")
                : "";

            // Collect tool result badges for this message
            const toolBadges: { id: string; label: string }[] = [];
            if (!isUser) {
              for (const part of msg.parts ?? []) {
                const p = part as Record<string, unknown>;
                if (
                  typeof p.type === "string" &&
                  (p.type.startsWith("tool-") || p.type === "dynamic-tool") &&
                  p.state === "output-available" &&
                  typeof p.toolCallId === "string" &&
                  p.output !== undefined
                ) {
                  try {
                    const payload: ToolResultPayload =
                      typeof p.output === "string"
                        ? JSON.parse(p.output as string)
                        : (p.output as ToolResultPayload);
                    if (payload.type === "schema_update") {
                      toolBadges.push({ id: p.toolCallId as string, label: "Schema updated" });
                    } else if (payload.type === "mappings_update") {
                      toolBadges.push({ id: p.toolCallId as string, label: "Mappings updated" });
                    } else if (payload.type === "pivot_update") {
                      toolBadges.push({ id: p.toolCallId as string, label: "Pivot config updated" });
                    }
                  } catch {
                    // not a parseable tool result
                  }
                }
              }
            }

            if (!text && toolBadges.length === 0) return null;

            return (
              <div key={msg.id} className="space-y-1.5">
                {text && (
                  <div
                    className={cn(
                      "flex gap-2",
                      isUser ? "justify-end" : "justify-start",
                    )}
                  >
                    {!isUser && (
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md",
                      )}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap break-words">{text}</p>
                      ) : (
                        <MarkdownContent content={text} />
                      )}
                    </div>
                    {isUser && (
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
                        <User className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                  </div>
                )}
                {toolBadges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-8">
                    {toolBadges.map((badge) => (
                      <ToolResultBadge key={badge.id} label={badge.label} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
