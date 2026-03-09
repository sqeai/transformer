"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type FormEvent,
  type ComponentPropsWithoutRef,
} from "react";
import {
  Sparkles,
  Send,
  Loader2,
  X,
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brain,
  Minimize2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";

const THINKING_START = "<!-- THINKING_START -->";
const THINKING_END = "<!-- THINKING_END -->";
const PANEL_REGEX = /<!-- DASHBOARD_PANEL:.*? -->/g;

function parseThinking(text: string): { thinking: string; response: string } {
  const startIdx = text.indexOf(THINKING_START);
  const endIdx = text.indexOf(THINKING_END);

  if (startIdx === -1 && endIdx === -1) {
    return { thinking: "", response: text.replace(PANEL_REGEX, "").trim() };
  }

  const thinkingFrom = startIdx === -1 ? 0 : startIdx + THINKING_START.length;
  const thinkingTo = endIdx === -1 ? text.length : endIdx;
  const thinking = text.substring(thinkingFrom, thinkingTo).trim();

  let response = "";
  if (endIdx !== -1) {
    response = text.substring(endIdx + THINKING_END.length);
  }

  return { thinking, response: response.replace(PANEL_REGEX, "").trim() };
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
            <h1 className="mb-2 mt-3 text-base font-bold first:mt-0" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
            <h2 className="mb-1.5 mt-2.5 text-sm font-bold first:mt-0" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
            <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...props}>
              {children}
            </h3>
          ),
          ul: ({ children, ...props }: ComponentPropsWithoutRef<"ul">) => (
            <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }: ComponentPropsWithoutRef<"ol">) => (
            <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => (
            <li className="text-sm" {...props}>{children}</li>
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
            <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground last:mb-0" {...props}>
              {children}
            </blockquote>
          ),
          table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
            <div className="my-2 overflow-auto max-h-48 last:mb-0">
              <table className="w-full text-xs border-collapse" {...props}>{children}</table>
            </div>
          ),
          th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
            <th className="sticky top-0 z-10 border border-border bg-muted/50 px-2 py-1 text-left font-semibold" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
            <td className="border border-border px-2 py-1" {...props}>{children}</td>
          ),
          a: ({ children, ...props }: ComponentPropsWithoutRef<"a">) => (
            <a className="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
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

function AssistantBubble({ message }: { message: UIMessage }) {
  const textParts = (message.parts ?? []).filter(
    (p): p is { type: "text"; text: string } => p.type === "text",
  );
  const fullText = textParts.map((p) => p.text).join("");

  const toolParts = (message.parts ?? []).filter((p) => {
    const pt = p as Record<string, unknown>;
    return (
      typeof pt.type === "string" &&
      (pt.type.startsWith("tool-") || pt.type === "tool-invocation")
    );
  });

  const { thinking, response } = parseThinking(fullText);
  const hasThinking = thinking.trim().length > 0;
  const hasResponse = response.trim().length > 0;
  const hasTools = toolParts.length > 0;

  const [thinkingOpen, setThinkingOpen] = useState(!hasResponse);
  const [toolsOpen, setToolsOpen] = useState(!hasResponse);

  useEffect(() => {
    if (hasResponse) {
      setThinkingOpen(false);
      setToolsOpen(false);
    }
  }, [hasResponse]);

  if (!hasThinking && !hasResponse && !hasTools) {
    return (
      <div className="flex gap-2">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
          <Bot className="h-3 w-3 text-primary" />
        </div>
        <ThinkingIndicator />
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
        <Bot className="h-3 w-3 text-primary" />
      </div>
      <div className="flex-1 min-w-0 max-w-[90%] flex flex-col gap-1">
        {hasTools && (
          <button
            onClick={() => setToolsOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1 px-2 bg-muted/40 rounded-md border w-fit"
          >
            <Wrench className="h-3 w-3" />
            <span className="font-medium">
              {toolParts.length} tool{toolParts.length > 1 ? "s" : ""}
            </span>
            {toolsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        {hasTools && toolsOpen && (
          <div className="space-y-1 max-h-32 overflow-y-auto rounded-md bg-muted/20 border p-2 text-[11px]">
            {toolParts.map((part, index) => {
              const p = part as Record<string, unknown>;
              const toolName = (p.toolName as string) || "Tool";
              const state = p.state as string | undefined;
              return (
                <div key={index} className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">{toolName}</span>
                  {state && (
                    <span
                      className={cn(
                        "text-[10px] px-1 py-0.5 rounded",
                        state === "output-available"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                      )}
                    >
                      {state === "output-available" ? "done" : state}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {hasThinking && (
          <button
            onClick={() => setThinkingOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1 px-2 bg-muted/30 rounded-md border border-dashed w-fit"
          >
            <Brain className="h-3 w-3" />
            <span className="font-medium">Thinking</span>
            {thinkingOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        {hasThinking && thinkingOpen && (
          <div className="rounded-md bg-muted/20 border border-dashed p-2 text-muted-foreground">
            <MarkdownContent
              content={thinking}
              className="prose-sm [&_*]:text-muted-foreground text-xs"
            />
          </div>
        )}

        {hasResponse && (
          <div className="rounded-xl rounded-bl-sm bg-muted text-foreground px-3 py-2 text-sm leading-relaxed">
            <MarkdownContent content={response} />
          </div>
        )}
      </div>
    </div>
  );
}

export type StarlightView = "dashboard" | "panel";

export interface StarlightInputProps {
  onSubmit: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  messages?: UIMessage[];
  view?: StarlightView;
}

export function StarlightInput({
  onSubmit,
  isLoading = false,
  placeholder = "Ask Starlight anything",
  messages = [],
  view = "dashboard",
}: StarlightInputProps) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const open = useCallback(() => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const close = useCallback(() => {
    setExpanded(false);
    setInput("");
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expanded, close]);

  useEffect(() => {
    const handleShortcut = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (expanded) {
          close();
        } else {
          open();
        }
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [expanded, open, close]);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, expanded]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      onSubmit(input.trim());
      setInput("");
    },
    [input, isLoading, onSubmit],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as FormEvent);
      }
    },
    [handleSubmit],
  );

  const viewLabel =
    view === "panel"
      ? "Create or update panels"
      : "Modify your dashboard layout";

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          onClick={close}
        />
      )}

      <div
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out",
          expanded ? "w-full max-w-2xl" : "w-auto",
        )}
      >
        {!expanded ? (
          <button
            onClick={open}
            className={cn(
              "flex items-center gap-2.5 rounded-full",
              "bg-card/95 backdrop-blur-md border border-border/60 shadow-lg shadow-black/10",
              "px-5 py-2.5 text-sm text-muted-foreground",
              "hover:bg-card hover:border-primary/30 hover:text-foreground hover:shadow-xl",
              "transition-all duration-200 cursor-pointer",
              "group",
            )}
          >
            <Sparkles className="h-4 w-4 text-primary group-hover:text-primary transition-colors" />
            <span>{placeholder}</span>
            <kbd className="ml-2 hidden sm:inline-flex items-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        ) : (
          <div
            className={cn(
              "flex flex-col rounded-2xl",
              "bg-card/98 backdrop-blur-md border border-primary/30 shadow-2xl shadow-black/20",
              "animate-in zoom-in-95 fade-in duration-200",
              "max-h-[70vh]",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Starlight</span>
                <span className="text-[11px] text-muted-foreground">
                  · {viewLabel}
                </span>
              </div>
              <button
                onClick={close}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className={cn(
                "overflow-y-auto px-4 py-3 space-y-3",
                messages.length > 0 ? "min-h-[120px] max-h-[50vh]" : "h-0",
              )}
            >
              {messages.map((msg) => {
                if (msg.role === "user") {
                  const textParts = (msg.parts ?? []).filter(
                    (p): p is { type: "text"; text: string } => p.type === "text",
                  );
                  const text = textParts.map((p) => p.text).join("");
                  if (!text) return null;
                  return (
                    <div key={msg.id} className="flex gap-2 justify-end">
                      <div className="max-w-[80%] rounded-xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm">
                        <p className="whitespace-pre-wrap break-words">{text}</p>
                      </div>
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20">
                        <User className="h-3 w-3 text-primary" />
                      </div>
                    </div>
                  );
                }

                return <AssistantBubble key={msg.id} message={msg} />;
              })}

              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-2">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <ThinkingIndicator />
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex items-end gap-2 px-4 py-3 border-t border-border/30"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={1}
                className={cn(
                  "flex-1 resize-none bg-transparent text-sm text-foreground",
                  "placeholder:text-muted-foreground/60 focus:outline-none",
                  "max-h-[120px] min-h-[24px]",
                )}
                style={{ fieldSizing: "content" } as React.CSSProperties}
                disabled={isLoading}
              />
              <div className="flex items-center gap-1 shrink-0 mb-0.5">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    input.trim() && !isLoading
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                      : "bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
