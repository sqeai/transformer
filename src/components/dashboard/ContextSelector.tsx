"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Database,
  Table2,
  Columns3,
  Loader2,
  RefreshCw,
  CheckSquare,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export interface ContextTableInfo {
  dataSourceId: string;
  dataSourceName: string;
  dataSourceType: string;
  schemaName: string;
  tableName: string;
  columns: { name: string; type: string }[];
  dimensions: Record<
    string,
    {
      type: string;
      uniqueValues?: string[];
      sampleValues?: string[];
      nullPercentage?: number;
    }
  > | null;
}

export interface FolderContext {
  folderId: string;
  folderName: string;
  logoUrl: string | null;
  content: string;
  tables: ContextTableInfo[];
}

export interface ContextSelection {
  contexts: FolderContext[];
  companyContext: string;
  dataSources: {
    id: string;
    name: string;
    type: string;
    tables: {
      schema: string;
      name: string;
      columns: { name: string; type: string }[];
    }[];
  }[];
}

interface ContextSelectorProps {
  onSelectionChange: (selection: ContextSelection) => void;
  storageKey?: string;
}

const ANALYST_CONTEXT_STORAGE_KEY = "analyst-selected-context-ids";

function loadSavedContextIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveContextIds(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

function buildSelection(
  allContexts: FolderContext[],
  selectedIds: Set<string>,
): ContextSelection {
  const selected = allContexts.filter((c) => selectedIds.has(c.folderId));
  const companyContext = selected
    .filter((c) => c.content.trim())
    .map((c) => `## ${c.folderName}\n\n${c.content}`)
    .join("\n\n---\n\n");

  const dsMap = new Map<
    string,
    {
      id: string;
      name: string;
      type: string;
      tables: Map<
        string,
        {
          schema: string;
          name: string;
          columns: { name: string; type: string }[];
        }
      >;
    }
  >();

  for (const ctx of selected) {
    for (const t of ctx.tables) {
      let ds = dsMap.get(t.dataSourceId);
      if (!ds) {
        ds = {
          id: t.dataSourceId,
          name: t.dataSourceName,
          type: t.dataSourceType,
          tables: new Map(),
        };
        dsMap.set(t.dataSourceId, ds);
      }
      const tableKey = `${t.schemaName}.${t.tableName}`;
      if (!ds.tables.has(tableKey)) {
        ds.tables.set(tableKey, {
          schema: t.schemaName,
          name: t.tableName,
          columns: t.columns,
        });
      }
    }
  }

  const dataSources = Array.from(dsMap.values()).map((ds) => ({
    id: ds.id,
    name: ds.name,
    type: ds.type,
    tables: Array.from(ds.tables.values()),
  }));

  return { contexts: selected, companyContext, dataSources };
}

export function ContextSelector({ onSelectionChange, storageKey = ANALYST_CONTEXT_STORAGE_KEY }: ContextSelectorProps) {
  const [allContexts, setAllContexts] = useState<FolderContext[]>([]);
  const [loading, setLoading] = useState(false);
  const [fullLoading, setFullLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(loadSavedContextIds(storageKey)));
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(
    new Set(),
  );
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const initialFetchDone = useRef(false);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const fetchAllContexts = useCallback(async () => {
    setFullLoading(true);
    try {
      const res = await fetch("/api/contexts");
      if (res.ok) {
        const data = await res.json();
        setAllContexts(data.contexts ?? []);
      }
    } catch {
      // ignore
    } finally {
      setFullLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    const savedIds = loadSavedContextIds(storageKey);
    if (savedIds.length > 0) {
      setLoading(true);
      const params = new URLSearchParams({
        folderIds: savedIds.join(","),
        lightweight: "true",
      });
      fetch(`/api/contexts?${params}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.contexts?.length) {
            setAllContexts(data.contexts);
          }
        })
        .catch(() => {})
        .finally(() => {
          fetchAllContexts();
        });
    } else {
      setLoading(true);
      fetchAllContexts();
    }
  }, [fetchAllContexts, storageKey]);

  useEffect(() => {
    saveContextIds(storageKey, selectedIds);
    const selection = buildSelection(allContexts, selectedIds);
    onSelectionChangeRef.current(selection);
  }, [allContexts, selectedIds, storageKey]);

  const toggleContext = useCallback((folderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((folderId: string) => {
    setExpandedContexts((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const toggleTableExpand = useCallback((key: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const totalTables = allContexts
    .filter((c) => selectedIds.has(c.folderId))
    .reduce((sum, c) => sum + c.tables.length, 0);

  const isRefreshing = loading || fullLoading;

  const { selectedContexts, unselectedContexts } = useMemo(() => {
    const selected: FolderContext[] = [];
    const unselected: FolderContext[] = [];
    for (const ctx of allContexts) {
      if (selectedIds.has(ctx.folderId)) {
        selected.push(ctx);
      } else {
        unselected.push(ctx);
      }
    }
    return { selectedContexts: selected, unselectedContexts: unselected };
  }, [allContexts, selectedIds]);

  const renderContextItem = useCallback((ctx: FolderContext) => {
    const isSelected = selectedIds.has(ctx.folderId);
    const isExpanded = expandedContexts.has(ctx.folderId);

    return (
      <div
        key={ctx.folderId}
        className={cn(
          "rounded-lg border overflow-hidden",
          isSelected
            ? "border-primary/40 bg-primary/5"
            : "border-border/50",
        )}
      >
        <div className="flex items-center gap-1 px-2 py-1.5">
          <button
            onClick={() => toggleContext(ctx.folderId)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title={isSelected ? "Deselect context" : "Select context"}
          >
            {isSelected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => toggleExpand(ctx.folderId)}
            className="flex flex-1 items-center gap-1.5 text-left min-w-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            )}
            {ctx.logoUrl ? (
              <img
                src={`/api/folder-logos/${ctx.folderId}?v=${encodeURIComponent(ctx.logoUrl)}`}
                alt=""
                className="h-3.5 w-3.5 flex-shrink-0 rounded object-cover"
              />
            ) : (
              <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" />
            )}
            <span className="text-xs font-medium truncate">
              {ctx.folderName}
            </span>
            {ctx.tables.length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 ml-auto flex-shrink-0"
              >
                {ctx.tables.length} table
                {ctx.tables.length > 1 ? "s" : ""}
              </Badge>
            )}
          </button>
        </div>

        {isExpanded && (
          <div className="border-t border-border/30 px-2 py-1 overflow-hidden">
            {ctx.content.trim() && (
              <div className="px-2 py-1.5 mb-1 rounded bg-muted/30 border border-dashed border-border/50">
                <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                  Context
                </p>
                <p className="text-[11px] text-muted-foreground line-clamp-3">
                  {ctx.content.slice(0, 200)}
                  {ctx.content.length > 200 ? "..." : ""}
                </p>
              </div>
            )}

            {ctx.tables.length === 0 && (
              <div className="py-2 px-2 text-xs text-muted-foreground">
                No tables linked
              </div>
            )}

            {ctx.tables.map((table) => {
              const tKey = `${ctx.folderId}:${table.dataSourceId}:${table.schemaName}.${table.tableName}`;
              const tExpanded = expandedTables.has(tKey);

              return (
                <div key={tKey}>
                  <button
                    onClick={() => toggleTableExpand(tKey)}
                    className="flex w-full items-start gap-1.5 rounded px-2 py-1.5 hover:bg-muted/50 transition-colors min-w-0"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {tExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-shrink-0 mt-0.5">
                      <Table2 className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col items-start min-w-0 text-left">
                      <span className="text-[11px] font-medium truncate max-w-full">
                        {table.tableName}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 truncate max-w-full">
                        {table.schemaName}
                      </span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Database className="h-2.5 w-2.5 text-muted-foreground/50" />
                        <span className="text-[9px] text-muted-foreground/50">
                          {table.dataSourceName}
                        </span>
                      </div>
                    </div>
                  </button>
                  {tExpanded && table.columns.length > 0 && (
                    <div className="ml-8 space-y-0.5 py-0.5 overflow-hidden">
                      {table.columns.map((col) => (
                        <div
                          key={col.name}
                          className="flex items-center gap-1.5 px-2 py-0.5 min-w-0"
                        >
                          <Columns3 className="h-2.5 w-2.5 text-muted-foreground/60" />
                          <span className="text-[10px] text-muted-foreground">
                            {col.name}
                          </span>
                          <span className="text-[9px] text-muted-foreground/50 ml-auto">
                            {col.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }, [selectedIds, expandedContexts, expandedTables, toggleContext, toggleExpand, toggleTableExpand]);

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-card/50">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Contexts</h3>
          {selectedIds.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedIds.size} selected
            </Badge>
          )}
          {totalTables > 0 && (
            <Badge variant="outline" className="text-xs">
              {totalTables} table{totalTables > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={fetchAllContexts}
          title="Refresh contexts"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
          />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1 overflow-hidden">
          {isRefreshing && allContexts.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Loading...</span>
            </div>
          )}

          {!isRefreshing && allContexts.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No contexts found.
              <br />
              <span className="text-xs">
                Add context and tables in the Context page.
              </span>
            </div>
          )}

          {selectedContexts.map(renderContextItem)}

          {selectedContexts.length > 0 && unselectedContexts.length > 0 && (
            <div className="flex items-center gap-2 py-1.5 px-1">
              <Separator className="flex-1" />
              <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                Available
              </span>
              <Separator className="flex-1" />
            </div>
          )}

          {unselectedContexts.map(renderContextItem)}

          {fullLoading && allContexts.length > 0 && unselectedContexts.length === 0 && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              <span className="text-xs">Loading more contexts...</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
