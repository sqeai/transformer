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
import { useSearchParams, useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brain,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  FileText,
  FileImage,
  File as FileIcon,
  X,
  Download,
  Briefcase,
  TrendingUp,
  BarChart3,
  Sparkles,
  Search,
  BookOpen,
  ArrowDown,
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
} from "../dashboard/ContextSelector";
import { InlineChartFromVisualization } from "./InlineChart";
import type { VisualizationPayload } from "@/lib/agents/analyst-agent/tools";

const ANALYST_STORAGE_KEY = "analyst-chat-history";
const ANALYST_PERSONA_KEY = "analyst-persona-preference";
const THINKING_START = "<!-- THINKING_START -->";
const THINKING_END = "<!-- THINKING_END -->";

function parseThinking(text: string): { thinking: string; response: string } {
  const thinkingParts: string[] = [];
  let remaining = text;
  let lastEndIdx = 0;
  let responseParts: string[] = [];
  let foundAny = false;

  let searchFrom = 0;
  while (true) {
    const startIdx = remaining.indexOf(THINKING_START, searchFrom);
    if (startIdx === -1) break;
    foundAny = true;

    const beforeThinking = remaining.substring(searchFrom === 0 ? 0 : searchFrom, startIdx).trim();
    if (beforeThinking) responseParts.push(beforeThinking);

    const contentStart = startIdx + THINKING_START.length;
    const endIdx = remaining.indexOf(THINKING_END, contentStart);

    if (endIdx === -1) {
      thinkingParts.push(remaining.substring(contentStart).trim());
      lastEndIdx = remaining.length;
      searchFrom = remaining.length;
      break;
    }

    thinkingParts.push(remaining.substring(contentStart, endIdx).trim());
    lastEndIdx = endIdx + THINKING_END.length;
    searchFrom = lastEndIdx;
  }

  if (!foundAny) {
    return { thinking: "", response: text.trim() };
  }

  const afterLast = remaining.substring(lastEndIdx).trim();
  if (afterLast) responseParts.push(afterLast);

  return {
    thinking: thinkingParts.filter(Boolean).join("\n\n"),
    response: responseParts.join("\n\n").trim(),
  };
}

interface AttachedFile {
  file: File;
  id: string;
  status: "pending" | "uploading" | "done" | "error";
  filePath?: string;
  error?: string;
}

const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt", ".docx", ".pptx"];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_FILE_TYPES.includes(file.type)) return true;
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function getFileIcon(file: File) {
  if (file.type.startsWith("image/")) return FileImage;
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) return FileText;
  return FileIcon;
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

interface Citation {
  title: string;
  url: string;
}

function extractCitations(toolParts: unknown[]): Citation[] {
  const citations: Citation[] = [];
  for (const part of toolParts) {
    const p = part as Record<string, unknown>;
    if (p.toolName !== "web_search") continue;

    const output = p.output;
    let content = "";
    if (output && typeof output === "object" && "kwargs" in (output as Record<string, unknown>)) {
      content = ((output as Record<string, unknown>).kwargs as Record<string, unknown>)?.content as string ?? "";
    } else if (typeof output === "string") {
      content = output;
    }

    const citationMatch = content.match(/<!-- CITATIONS_JSON:(.*?) -->/);
    if (citationMatch) {
      try {
        const parsed = JSON.parse(citationMatch[1]) as Citation[];
        for (const cite of parsed) {
          if (!citations.some(c => c.url === cite.url)) {
            citations.push(cite);
          }
        }
      } catch {
        // skip parse errors
      }
    }
  }
  return citations;
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
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border/50 px-3 py-1.5 text-xs text-muted-foreground cursor-default"
    >
      <Sparkles className="h-3.5 w-3.5 animate-pulse" />
      <span className="font-medium">Thinking</span>
    </button>
  );
}

function AssistantMessage({
  thinking,
  response,
  toolParts,
  visualizations,
  citations,
  hasThinking,
  hasResponse,
  hasTools,
  isStreaming,
}: {
  thinking: string;
  response: string;
  toolParts: unknown[];
  visualizations: VisualizationPayload[];
  citations: Citation[];
  hasThinking: boolean;
  hasResponse: boolean;
  hasTools: boolean;
  isStreaming?: boolean;
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
              <InlineChartFromVisualization key={`viz-${i}`} visualization={viz} />
            ))}
          </div>
        )}

        {hasResponse && (
          <div className="rounded-2xl rounded-bl-md bg-muted text-foreground px-3.5 py-2.5 text-sm leading-relaxed">
            <MarkdownContent content={response} />
          </div>
        )}

        {citations.length > 0 && (
          <div className="mt-1">
            <p className="text-[11px] font-semibold text-muted-foreground mb-1">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {citations.slice(0, 6).map((cite, i) => (
                <a
                  key={i}
                  href={cite.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors border border-blue-100 dark:border-blue-800"
                >
                  {cite.title.length > 35 ? cite.title.substring(0, 35) + "..." : cite.title}
                  <svg className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}

        {isStreaming && <ThinkingIndicator />}
      </div>
    </div>
  );
}

type Persona = "financial" | "operations" | "business_development";

const PERSONA_OPTIONS: { value: Persona; label: string; icon: typeof Briefcase; description: string }[] = [
  { value: "financial", label: "Financial", icon: TrendingUp, description: "Revenue, margins, ratios, forecasting" },
  { value: "operations", label: "Operations", icon: BarChart3, description: "Supply chain, efficiency, quality" },
  { value: "business_development", label: "Business Dev", icon: Briefcase, description: "Market sizing, CAC/LTV, pipeline" },
];

const SAMPLE_PROMPTS = [
  {
    category: "CAPABILITY",
    icon: Sparkles,
    text: "What all can you do?",
    color: "text-[#5386FC]",
    borderColor: "border-[#5386FC]/30",
    bgColor: "bg-[#5386FC]/10",
  },
  {
    category: "SEARCH",
    icon: Search,
    text: "Describe our main dashboards / questions",
    color: "text-[#5386FC]",
    borderColor: "border-[#5386FC]/30",
    bgColor: "bg-[#5386FC]/10",
  },
  {
    category: "ANALYSIS",
    icon: TrendingUp,
    text: "Show me an interesting visualization",
    color: "text-[#5386FC]",
    borderColor: "border-[#5386FC]/30",
    bgColor: "bg-[#5386FC]/10",
  },
];

function WelcomeScreen({ onPromptClick }: { onPromptClick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 mb-5">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        Ask AI Data Cleanser anything
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        Query your data, create visualizations, and discover insights
      </p>

      <div className="w-full max-w-lg space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Try these questions
        </p>
        {SAMPLE_PROMPTS.map((prompt) => {
          const Icon = prompt.icon;
          return (
            <button
              key={prompt.text}
              onClick={() => onPromptClick(prompt.text)}
              className={cn(
                "flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors",
                prompt.borderColor,
                "bg-card/60 hover:bg-card/90",
              )}
            >
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", prompt.bgColor)}>
                <Icon className={cn("h-4 w-4", prompt.color)} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-[10px] font-semibold uppercase tracking-wider mb-0.5", prompt.color)}>
                  {prompt.category}
                </p>
                <p className="text-sm text-foreground">{prompt.text}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function exportChatAsMarkdown(messages: { role: string; parts?: { type: string; text?: string }[] }[]): string {
  const lines: string[] = ["# Chat Export\n"];
  for (const msg of messages) {
    const textParts = (msg.parts ?? []).filter((p: { type: string; text?: string }) => p.type === "text");
    const text = textParts.map((p: { type: string; text?: string }) => p.text ?? "").join("");
    if (!text) continue;
    const cleaned = text
      .replace(/<!-- THINKING_START -->[\s\S]*?<!-- THINKING_END -->/g, "")
      .replace(/<!-- VISUALIZATION:[\s\S]*? -->/g, "")
      .replace(/<!-- CITATIONS_JSON:[\s\S]*? -->/g, "")
      .trim();
    if (!cleaned) continue;
    lines.push(`## ${msg.role === "user" ? "You" : "Assistant"}\n`);
    lines.push(cleaned);
    lines.push("");
  }
  return lines.join("\n");
}

export function AnalystChat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [persona, setPersona] = useState<Persona>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ANALYST_PERSONA_KEY);
      if (stored === "financial" || stored === "operations" || stored === "business_development") {
        return stored;
      }
    }
    return "financial";
  });
  const [personaDropdownOpen, setPersonaDropdownOpen] = useState(false);
  const personaDropdownRef = useRef<HTMLDivElement>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [contextSelection, setContextSelection] =
    useState<ContextSelection | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const isNewChatRef = useRef(false);
  const justCreatedChatRef = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem(ANALYST_PERSONA_KEY, persona);
  }, [persona]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (personaDropdownRef.current && !personaDropdownRef.current.contains(e.target as Node)) {
        setPersonaDropdownOpen(false);
      }
    }
    if (personaDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [personaDropdownOpen]);

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

  const [backgroundStreaming, setBackgroundStreaming] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollForCompletion = useCallback(
    (id: string) => {
      if (pollRef.current) clearTimeout(pollRef.current);

      const poll = async () => {
        try {
          const res = await fetch(`/api/chat-history/${id}`);
          if (!res.ok) return;
          const data = await res.json();

          if (data.streaming_status === "idle") {
            setBackgroundStreaming(false);
            if (Array.isArray(data.messages) && data.messages.length > 0) {
              setMessages(data.messages);
            }
            window.dispatchEvent(new CustomEvent("chat-history-updated"));
            return;
          }

          if (Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages(data.messages);
          }
          pollRef.current = setTimeout(poll, 2000);
        } catch {
          pollRef.current = setTimeout(poll, 3000);
        }
      };

      setBackgroundStreaming(true);
      pollRef.current = setTimeout(poll, 1500);
    },
    [setMessages],
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const loadChat = useCallback(async (id: string) => {
    setMessages([]);
    setChatId(id);
    setInput("");
    setAttachedFiles([]);
    setBackgroundStreaming(false);
    if (pollRef.current) clearTimeout(pollRef.current);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/chat-history/${id}`);
      if (res.ok) {
        const data = await res.json();
        setChatId(data.id);
        if (data.persona === "financial" || data.persona === "operations" || data.persona === "business_development") {
          setPersona(data.persona);
        }
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
        if (data.streaming_status === "streaming") {
          pollForCompletion(data.id);
        }
      }
    } catch {
      toast.error("Failed to load chat");
    } finally {
      setChatLoading(false);
    }
  }, [setMessages, pollForCompletion]);

  useEffect(() => {
    const chatParam = searchParams.get("chat");
    if (chatParam && chatParam !== chatId) {
      if (justCreatedChatRef.current === chatParam) {
        justCreatedChatRef.current = null;
        setChatId(chatParam);
        return;
      }
      isNewChatRef.current = false;
      loadChat(chatParam);
    } else if (!chatParam && chatId) {
      isNewChatRef.current = true;
      setChatId(null);
      setMessages([]);
      localStorage.removeItem(ANALYST_STORAGE_KEY);
    }
  }, [searchParams, chatId, loadChat, setMessages]);

  useEffect(() => {
    const handleNewChat = () => {
      isNewChatRef.current = true;
      setChatId(null);
      setMessages([]);
      setInput("");
      setAttachedFiles([]);
      setChatLoading(false);
      setBackgroundStreaming(false);
      if (pollRef.current) clearTimeout(pollRef.current);
      localStorage.removeItem(ANALYST_STORAGE_KEY);
    };
    window.addEventListener("new-chat", handleNewChat);
    return () => window.removeEventListener("new-chat", handleNewChat);
  }, [setMessages]);

  const createChatEntry = useCallback(async (firstMessage: string): Promise<string | null> => {
    const title = firstMessage.length > 80
      ? firstMessage.slice(0, 80) + "..."
      : firstMessage;
    try {
      const res = await fetch("/api/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType: "analyst",
          title,
          messages: [],
          persona,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        isNewChatRef.current = false;
        justCreatedChatRef.current = data.id;
        setChatId(data.id);
        router.replace(`/assistant?chat=${data.id}`, { scroll: false });
        window.dispatchEvent(new CustomEvent("chat-history-updated"));
        return data.id;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, [persona, router]);

  const handleExport = useCallback(() => {
    const md = exportChatAsMarkdown(messages as { role: string; parts?: { type: string; text?: string }[] }[]);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const isLoading = status === "streaming" || status === "submitted" || backgroundStreaming;

  useEffect(() => {
    if (isNewChatRef.current) return;
    const chatParam = searchParams.get("chat");
    if (chatParam) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(ANALYST_STORAGE_KEY, JSON.stringify(messages));
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(ANALYST_STORAGE_KEY);
    }
  }, [messages]);

  const [hasNewResponses, setHasNewResponses] = useState(false);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const prevContentLenRef = useRef(0);

  const checkIfNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = checkIfNearBottom();
      isNearBottomRef.current = nearBottom;
      if (nearBottom) setHasNewResponses(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [checkIfNearBottom]);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const lastMessage = messages[messages.length - 1];
      const isAssistantMessage = lastMessage?.role === "assistant";

      if (isNearBottomRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
      } else if (isAssistantMessage) {
        setHasNewResponses(true);
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const textParts = (lastMsg?.parts ?? []).filter(
      (p): p is { type: "text"; text: string } => p.type === "text",
    );
    const currentLen = textParts.reduce((sum, p) => sum + p.text.length, 0);

    if (currentLen > prevContentLenRef.current) {
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } else if (lastMsg?.role === "assistant") {
        setHasNewResponses(true);
      }
    }
    prevContentLenRef.current = currentLen;
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    isNearBottomRef.current = true;
    setHasNewResponses(false);
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const accepted = files.filter(isAcceptedFile);
    if (accepted.length < files.length) {
      toast.error("Some files were skipped", {
        description: `Supported: ${ACCEPTED_EXTENSIONS.join(", ")}`,
      });
    }
    if (accepted.length === 0) return;

    const newAttachments: AttachedFile[] = accepted.map((file) => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: "pending",
    }));
    setAttachedFiles((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) addFiles(files);
    },
    [addFiles],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) addFiles(files);
      e.target.value = "";
    },
    [addFiles],
  );

  const uploadFilesToS3 = useCallback(
    async (files: AttachedFile[]): Promise<AttachedFile[]> => {
      const results = await Promise.all(
        files.map(async (af) => {
          try {
            setAttachedFiles((prev) =>
              prev.map((f) => (f.id === af.id ? { ...f, status: "uploading" as const } : f)),
            );

            const contentType = af.file.type || "application/octet-stream";

            const presignRes = await fetch("/api/chat-attachments/presign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fileName: af.file.name, contentType }),
            });

            if (!presignRes.ok) {
              const err = await presignRes.json().catch(() => ({ error: "Failed to get upload URL" }));
              throw new Error(err.error || "Failed to get upload URL");
            }

            const { uploadUrl, filePath } = await presignRes.json();

            const uploadRes = await fetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": contentType },
              body: af.file,
            });

            if (!uploadRes.ok) {
              throw new Error("Failed to upload file to storage");
            }

            const updated: AttachedFile = { ...af, status: "done", filePath };
            setAttachedFiles((prev) =>
              prev.map((f) => (f.id === af.id ? updated : f)),
            );
            return updated;
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Upload failed";
            const updated: AttachedFile = { ...af, status: "error", error: errorMsg };
            setAttachedFiles((prev) =>
              prev.map((f) => (f.id === af.id ? updated : f)),
            );
            return updated;
          }
        }),
      );
      return results;
    },
    [],
  );

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if ((!input.trim() && attachedFiles.length === 0) || isLoading || isUploading) return;

      isNearBottomRef.current = true;
      setHasNewResponses(false);

      const dataSources = contextSelection?.dataSources ?? [];
      const dataSourceIds = dataSources.map((s) => s.id);
      const dataSourceContexts = dataSources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        tables: s.tables,
      }));
      const companyContext = contextSelection?.companyContext ?? "";

      let activeChatId = chatId;
      if (!activeChatId && input.trim()) {
        activeChatId = await createChatEntry(input.trim());
      }

      if (attachedFiles.length > 0) {
        setIsUploading(true);
        try {
          const pendingFiles = attachedFiles.filter((f) => f.status === "pending" || f.status === "error");
          const alreadyDone = attachedFiles.filter((f) => f.status === "done");

          const uploaded = pendingFiles.length > 0
            ? await uploadFilesToS3(pendingFiles)
            : [];

          const allUploaded = [...alreadyDone, ...uploaded];
          const successFiles = allUploaded.filter((f) => f.status === "done" && f.filePath);

          if (successFiles.length === 0 && !input.trim()) {
            toast.error("Could not upload any files");
            setIsUploading(false);
            return;
          }

          const attachmentsMeta = successFiles.map((f) => ({
            fileName: f.file.name,
            filePath: f.filePath!,
            mimeType: f.file.type || "application/octet-stream",
          }));

          const fileNames = successFiles.map((f) => f.file.name);
          const fileLabel = fileNames.length > 0
            ? `[Attached: ${fileNames.join(", ")}]\n\n`
            : "";

          sendMessage(
            { text: `${fileLabel}${input.trim()}` },
            { body: { dataSourceIds, dataSourceContexts, attachments: attachmentsMeta, persona, chatId: activeChatId, companyContext } },
          );
          setInput("");
          setAttachedFiles([]);
        } finally {
          setIsUploading(false);
        }
      } else {
        sendMessage(
          { text: input.trim() },
          { body: { dataSourceIds, dataSourceContexts, persona, chatId: activeChatId, companyContext } },
        );
        setInput("");
      }
    },
    [input, attachedFiles, isLoading, isUploading, sendMessage, contextSelection, uploadFilesToS3, persona, chatId, createChatEntry],
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
      <div
        className={cn("flex flex-1 flex-col min-w-0 relative", isDragging && "ring-2 ring-primary ring-inset")}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6 py-3">
          <div className="flex items-center gap-3">
            {/* <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Data Analyst</h1>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Thinking..."
                  : contextSelection && contextSelection.contexts.length > 0
                    ? `${contextSelection.contexts.length} context${contextSelection.contexts.length > 1 ? "s" : ""} · ${contextSelection.dataSources.reduce((n, s) => n + s.tables.length, 0)} table${contextSelection.dataSources.reduce((n, s) => n + s.tables.length, 0) !== 1 ? "s" : ""}`
                    : "Ready"}
              </p>
            </div> */}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={handleExport}
              title="Export chat as Markdown"
              disabled={messages.length === 0}
            >
              <Download className="h-4 w-4" />
            </Button>
            {contextSelection && contextSelection.contexts.length > 0 && (
              <div className="flex items-center gap-1 mr-1 max-w-[200px] overflow-hidden">
                {contextSelection.contexts.slice(0, 3).map((ctx) => (
                  <span
                    key={ctx.folderId}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium truncate max-w-[80px]"
                    title={ctx.folderName}
                  >
                    {ctx.logoUrl ? (
                      <img
                        src={`/api/folder-logos/${ctx.folderId}?v=${encodeURIComponent(ctx.logoUrl)}`}
                        alt=""
                        className="h-2.5 w-2.5 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <BookOpen className="h-2.5 w-2.5 flex-shrink-0" />
                    )}
                    <span className="truncate">{ctx.folderName}</span>
                  </span>
                ))}
                {contextSelection.contexts.length > 3 && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    +{contextSelection.contexts.length - 3}
                  </span>
                )}
              </div>
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

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
        >
          {chatLoading && (
            <div className="flex flex-1 flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary/60 mb-3" />
              <p className="text-sm text-muted-foreground">Loading chat...</p>
            </div>
          )}

          {messages.length === 0 && !isLoading && !chatLoading && (
            <WelcomeScreen
              onPromptClick={(text) => {
                setInput(text);
                inputRef.current?.focus();
              }}
            />
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

              const attachedFileNames: string[] = [];
              let userText = text;

              const newFormatMatch = text.match(/^\[Attached: (.+?)\]\n\n/);
              if (newFormatMatch) {
                userText = text.replace(newFormatMatch[0], "").trim();
                attachedFileNames.push(...newFormatMatch[1].split(", "));
              } else {
                const oldFormatMatch = text.match(/\[Attached file content\]\n([\s\S]*?)\n\[End of attached file content\]\n\n/);
                if (oldFormatMatch) {
                  userText = text.replace(oldFormatMatch[0], "").trim();
                  const fileHeaders = oldFormatMatch[1].match(/--- File: (.+?) ---/g);
                  if (fileHeaders) {
                    for (const h of fileHeaders) {
                      const name = h.match(/--- File: (.+?) ---/)?.[1];
                      if (name) attachedFileNames.push(name);
                    }
                  }
                }
              }

              return (
                <div key={msg.id} className="flex gap-2 justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-3 text-sm leading-relaxed">
                    {attachedFileNames.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {attachedFileNames.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-xs"
                          >
                            <Paperclip className="h-3 w-3" />
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    {userText && <p className="whitespace-pre-wrap break-words">{userText}</p>}
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
            const citations = extractCitations(toolParts);
            const hasThinking = thinking.trim().length > 0;
            const hasResponse = response.trim().length > 0;
            const hasTools = toolParts.length > 0;
            const hasVisualizations = visualizations.length > 0;
            const isLastAssistant =
              messages.filter((m) => m.role === "assistant").at(-1)?.id === msg.id;
            const msgIsStreaming = isLoading && isLastAssistant;

            if (!hasThinking && !hasResponse && !hasTools && !hasVisualizations && !msgIsStreaming) return null;

            return (
              <AssistantMessage
                key={msg.id}
                thinking={thinking}
                response={response}
                toolParts={toolParts}
                visualizations={visualizations}
                citations={citations}
                hasThinking={hasThinking}
                hasResponse={hasResponse}
                hasTools={hasTools}
                isStreaming={msgIsStreaming}
              />
            );
          })}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="py-1.5">
                <ThinkingIndicator />
              </div>
            </div>
          )}
        </div>

        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-card/90 px-8 py-6">
              <Paperclip className="h-8 w-8 text-primary/60" />
              <p className="text-sm font-medium text-primary">Drop files here</p>
              <p className="text-xs text-muted-foreground">PDF, images, TXT, DOCX, PPTX</p>
            </div>
          </div>
        )}

        {/* New responses indicator */}
        {hasNewResponses && (
          <div className="flex justify-center py-1.5 border-t border-border/50 bg-card/60">
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              New Responses
            </button>
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={onSubmit}
          className="border-t border-border bg-card/80 backdrop-blur-sm p-4"
        >
          {/* File chips */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 max-w-4xl mx-auto">
              {attachedFiles.map((af) => {
                const Icon = getFileIcon(af.file);
                return (
                  <div
                    key={af.id}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                      af.status === "error"
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : af.status === "uploading"
                          ? "border-primary/50 bg-primary/5 text-primary"
                          : af.status === "done"
                            ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                            : "border-border bg-muted/50 text-foreground",
                    )}
                  >
                    {af.status === "uploading" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Icon className="h-3 w-3 shrink-0" />
                    )}
                    <span className="max-w-[120px] truncate">{af.file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(af.id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
                      disabled={af.status === "uploading"}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={handleFileInputChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                attachedFiles.length > 0
                  ? "Add a message about these files..."
                  : contextSelection && contextSelection.contexts.length > 0
                    ? "Ask a question about your data..."
                    : "Select contexts from the right panel first..."
              }
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                "max-h-[150px] min-h-[44px]",
              )}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              disabled={isUploading}
            />
            <div className="relative flex items-end" ref={personaDropdownRef}>
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl rounded-r-none border-r border-primary-foreground/20"
                disabled={(!input.trim() && attachedFiles.length === 0) || isLoading || isUploading}
              >
                {isLoading || isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                className="h-11 w-7 shrink-0 rounded-xl rounded-l-none"
                onClick={() => setPersonaDropdownOpen((o) => !o)}
                title={`Persona: ${PERSONA_OPTIONS.find((o) => o.value === persona)?.label}`}
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", personaDropdownOpen && "rotate-180")} />
              </Button>
              {personaDropdownOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden">
                  {PERSONA_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isActive = persona === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setPersona(opt.value);
                          setPersonaDropdownOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                        {isActive && (
                          <div className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Right panel - Contexts (always mounted so selection loads on page load) */}
      <div className={cn("flex-shrink-0", panelOpen ? "w-72" : "hidden")}>
        <ContextSelector onSelectionChange={setContextSelection} />
      </div>
    </div>
  );
}
