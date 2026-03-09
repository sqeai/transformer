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
  Paperclip,
  FileText,
  FileImage,
  File as FileIcon,
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
import type { SchemaField } from "@/lib/types";
import { toast } from "sonner";

interface ToolResultPayload {
  type: "schema_update";
  schema?: { name: string; fields: SchemaField[] };
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
            <div className="my-2 overflow-auto max-h-screen last:mb-0">
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

const BUBBLE_POSITION_KEY = "chat-bubble-position";
const DEFAULT_BUBBLE_POSITION = { right: 24, bottom: 24 };

function loadBubblePosition(): { right: number; bottom: number } {
  if (typeof window === "undefined") return DEFAULT_BUBBLE_POSITION;
  try {
    const stored = localStorage.getItem(BUBBLE_POSITION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed.right === "number" && typeof parsed.bottom === "number") {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_BUBBLE_POSITION;
}

function saveBubblePosition(pos: { right: number; bottom: number }) {
  try {
    localStorage.setItem(BUBBLE_POSITION_KEY, JSON.stringify(pos));
  } catch { /* ignore */ }
}

function clampPosition(right: number, bottom: number): { right: number; bottom: number } {
  const bubbleSize = 56;
  const maxRight = window.innerWidth - bubbleSize;
  const maxBottom = window.innerHeight - bubbleSize;
  return {
    right: Math.max(0, Math.min(right, maxRight)),
    bottom: Math.max(0, Math.min(bottom, maxBottom)),
  };
}

export function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [bubblePos, setBubblePos] = useState(DEFAULT_BUBBLE_POSITION);
  const { messages, sendMessage, setMessages, status } = useChatContext();
  const {
    schemas,
    updateSchema,
  } = useSchemaStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appliedPayloads = useRef<Set<string>>(new Set());
  const dragCounter = useRef(0);

  const bubbleDrag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startRight: 0,
    startBottom: 0,
    moved: false,
  });

  useEffect(() => {
    setBubblePos(loadBubblePosition());
  }, []);

  const onBubblePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      bubbleDrag.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startRight: bubblePos.right,
        startBottom: bubblePos.bottom,
        moved: false,
      };
    },
    [bubblePos],
  );

  const onBubblePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!bubbleDrag.current.active) return;
      const dx = e.clientX - bubbleDrag.current.startX;
      const dy = e.clientY - bubbleDrag.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        bubbleDrag.current.moved = true;
      }
      const newPos = clampPosition(
        bubbleDrag.current.startRight - dx,
        bubbleDrag.current.startBottom - dy,
      );
      setBubblePos(newPos);
    },
    [],
  );

  const onBubblePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!bubbleDrag.current.active) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      bubbleDrag.current.active = false;
      if (bubbleDrag.current.moved) {
        saveBubblePosition(bubblePos);
      } else {
        setOpen((o) => !o);
      }
    },
    [bubblePos],
  );

  const isLoading = status === "streaming" || status === "submitted";

  const currentSchema = schemas[0];

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
      }
    },
    [currentSchema, updateSchema],
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
    });
  }, [currentSchema]);

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

      const workspaceContext = buildWorkspaceContext();

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
            { body: { workspaceContext, attachments: attachmentsMeta } },
          );
          setInput("");
          setAttachedFiles([]);
        } finally {
          setIsUploading(false);
        }
      } else {
        sendMessage({ text: input.trim() }, { body: { workspaceContext } });
        setInput("");
      }
    },
    [input, attachedFiles, isLoading, isUploading, sendMessage, buildWorkspaceContext, uploadFilesToS3],
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
        onPointerDown={onBubblePointerDown}
        onPointerMove={onBubblePointerMove}
        onPointerUp={onBubblePointerUp}
        style={{ right: bubblePos.right, bottom: bubblePos.bottom }}
        className={cn(
          "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-opacity duration-200 select-none touch-none",
          "bg-gradient-to-br from-primary to-accent text-primary-foreground",
          "hover:shadow-xl",
          !bubbleDrag.current.active && "hover:scale-105 active:scale-95 transition-all",
          open && "rotate-90 scale-0 opacity-0 pointer-events-none",
        )}
        aria-label="Open chat"
      >
        <MessageCircle className="h-6 w-6 pointer-events-none" />
      </button>

      {/* Chat panel */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={
          expanded
            ? { bottom: 16, right: 16 }
            : { bottom: bubblePos.bottom, right: bubblePos.right }
        }
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300 ease-out",
          expanded
            ? "w-[700px] max-w-[calc(100vw-2rem)]"
            : "w-[400px] max-w-[calc(100vw-3rem)]",
          open
            ? expanded
              ? "h-[calc(100vh-2rem)] opacity-100 translate-y-0"
              : "h-[560px] max-h-[calc(100vh-3rem)] opacity-100 translate-y-0"
            : "h-0 max-h-0 opacity-0 translate-y-4 pointer-events-none",
          isDragging && "ring-2 ring-primary ring-inset",
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
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2.5 text-sm leading-relaxed">
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

        {/* Input */}
        <form
          onSubmit={onSubmit}
          className="border-t border-border bg-card p-3"
        >
          {/* File chips */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
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

          <div className="flex items-end gap-2">
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
              className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
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
              placeholder={attachedFiles.length > 0 ? "Add a message about these files..." : "Ask about your schema..."}
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                "max-h-[120px] min-h-[40px]",
              )}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              disabled={isUploading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
              disabled={(!input.trim() && attachedFiles.length === 0) || isLoading || isUploading}
            >
              {isLoading || isUploading ? (
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
