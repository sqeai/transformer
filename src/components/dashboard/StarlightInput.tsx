"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import { Sparkles, Send, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarlightInputProps {
  onSubmit: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function StarlightInput({
  onSubmit,
  isLoading = false,
  placeholder = "Ask Starlight anything",
}: StarlightInputProps) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      onSubmit(input.trim());
      setInput("");
      close();
    },
    [input, isLoading, onSubmit, close],
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
          <form
            onSubmit={handleSubmit}
            className={cn(
              "flex items-end gap-2 rounded-2xl",
              "bg-card/98 backdrop-blur-md border border-primary/30 shadow-2xl shadow-black/20",
              "px-4 py-3",
              "animate-in zoom-in-95 fade-in duration-200",
            )}
          >
            <Sparkles className="h-4 w-4 text-primary shrink-0 mb-2.5" />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you'd like to see on the dashboard..."
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
                type="button"
                onClick={close}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
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
        )}
      </div>
    </>
  );
}
