"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Database,
  ChevronRight,
  ChevronDown,
  Table2,
  Columns3,
  Loader2,
  RefreshCw,
  CheckSquare,
  Square,
  MinusSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export interface DataSourceInfo {
  id: string;
  name: string;
  type: string;
}

export interface TableColumnInfo {
  schema: string;
  name: string;
  columns: { name: string; type: string }[];
}

export interface SelectedDataSource {
  id: string;
  name: string;
  type: string;
  tables: TableColumnInfo[];
}

interface DataSourcePanelProps {
  selectedSources: SelectedDataSource[];
  onSelectionChange: (sources: SelectedDataSource[]) => void;
}

const DS_CACHE_KEY = "ds-panel-sources-cache";
const DS_TABLES_CACHE_KEY = "ds-panel-tables-cache";

function loadCachedSources(): DataSourceInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(DS_CACHE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCachedSources(sources: DataSourceInfo[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DS_CACHE_KEY, JSON.stringify(sources));
  } catch {
    // ignore
  }
}

function loadCachedTables(): Record<string, TableColumnInfo[]> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(DS_TABLES_CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCachedTables(tables: Record<string, TableColumnInfo[]>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DS_TABLES_CACHE_KEY, JSON.stringify(tables));
  } catch {
    // ignore
  }
}

export function DataSourcePanel({
  selectedSources,
  onSelectionChange,
}: DataSourcePanelProps) {
  const [dataSources, setDataSources] = useState<DataSourceInfo[]>(loadCachedSources);
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [tablesCache, setTablesCache] = useState<Record<string, TableColumnInfo[]>>(loadCachedTables);
  const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());
  const initialFetchDone = useRef(false);

  const fetchDataSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data-sources");
      if (res.ok) {
        const data = await res.json();
        const sources = (data.dataSources ?? []).map(
          (ds: Record<string, unknown>) => ({
            id: ds.id as string,
            name: ds.name as string,
            type: ds.type as string,
          }),
        );
        setDataSources(sources);
        saveCachedSources(sources);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    const cached = loadCachedSources();
    if (cached.length === 0) {
      fetchDataSources();
    }
  }, [fetchDataSources]);

  const fetchTablesForSource = useCallback(
    async (dsId: string, forceRefresh = false) => {
      if (!forceRefresh && tablesCache[dsId]) return tablesCache[dsId];

      setLoadingTables((prev) => new Set(prev).add(dsId));
      try {
        const tablesRes = await fetch(`/api/data-sources/${dsId}/tables`);
        if (!tablesRes.ok) return [];
        const tablesData = await tablesRes.json();
        const tables: { schema: string; name: string }[] =
          tablesData.tables ?? [];

        const enriched: TableColumnInfo[] = await Promise.all(
          tables.map(async (t) => {
            try {
              const colRes = await fetch(
                `/api/data-sources/${dsId}/tables/${encodeURIComponent(t.schema)}/${encodeURIComponent(t.name)}/columns`,
              );
              if (colRes.ok) {
                const colData = await colRes.json();
                return {
                  schema: t.schema,
                  name: t.name,
                  columns: (colData.columns ?? []).map(
                    (c: { name: string; type: string }) => ({
                      name: c.name,
                      type: c.type,
                    }),
                  ),
                };
              }
            } catch {
              // ignore
            }
            return { schema: t.schema, name: t.name, columns: [] };
          }),
        );

        setTablesCache((prev) => {
          const next = { ...prev, [dsId]: enriched };
          saveCachedTables(next);
          return next;
        });
        return enriched;
      } catch {
        return [];
      } finally {
        setLoadingTables((prev) => {
          const next = new Set(prev);
          next.delete(dsId);
          return next;
        });
      }
    },
    [tablesCache],
  );

  const handleRefresh = useCallback(async () => {
    setTablesCache({});
    saveCachedTables({});
    await fetchDataSources();
  }, [fetchDataSources]);

  const toggleSource = useCallback(
    async (dsId: string) => {
      setExpandedSources((prev) => {
        const next = new Set(prev);
        if (next.has(dsId)) next.delete(dsId);
        else next.add(dsId);
        return next;
      });
      if (!tablesCache[dsId]) {
        await fetchTablesForSource(dsId);
      }
    },
    [tablesCache, fetchTablesForSource],
  );

  const toggleTableExpand = useCallback((key: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const tableKey = (dsId: string, t: TableColumnInfo) =>
    `${dsId}:${t.schema}.${t.name}`;

  const isTableSelected = useCallback(
    (dsId: string, t: TableColumnInfo) => {
      const src = selectedSources.find((s) => s.id === dsId);
      if (!src) return false;
      return src.tables.some(
        (st) => st.schema === t.schema && st.name === t.name,
      );
    },
    [selectedSources],
  );

  const toggleTableSelection = useCallback(
    (ds: DataSourceInfo, table: TableColumnInfo) => {
      const existing = selectedSources.find((s) => s.id === ds.id);

      if (existing) {
        const alreadySelected = existing.tables.some(
          (t) => t.schema === table.schema && t.name === table.name,
        );

        if (alreadySelected) {
          const newTables = existing.tables.filter(
            (t) => !(t.schema === table.schema && t.name === table.name),
          );
          if (newTables.length === 0) {
            onSelectionChange(
              selectedSources.filter((s) => s.id !== ds.id),
            );
          } else {
            onSelectionChange(
              selectedSources.map((s) =>
                s.id === ds.id ? { ...s, tables: newTables } : s,
              ),
            );
          }
        } else {
          onSelectionChange(
            selectedSources.map((s) =>
              s.id === ds.id
                ? { ...s, tables: [...s.tables, table] }
                : s,
            ),
          );
        }
      } else {
        onSelectionChange([
          ...selectedSources,
          { id: ds.id, name: ds.name, type: ds.type, tables: [table] },
        ]);
      }
    },
    [selectedSources, onSelectionChange],
  );

  const toggleAllTablesForSource = useCallback(
    async (ds: DataSourceInfo) => {
      const allTables = tablesCache[ds.id] ?? [];
      if (allTables.length === 0) {
        const fetched = await fetchTablesForSource(ds.id);
        if (fetched.length === 0) return;
        onSelectionChange([
          ...selectedSources.filter((s) => s.id !== ds.id),
          { id: ds.id, name: ds.name, type: ds.type, tables: fetched },
        ]);
        return;
      }

      const existing = selectedSources.find((s) => s.id === ds.id);
      const allSelected =
        existing && existing.tables.length === allTables.length;

      if (allSelected) {
        onSelectionChange(selectedSources.filter((s) => s.id !== ds.id));
      } else {
        onSelectionChange([
          ...selectedSources.filter((s) => s.id !== ds.id),
          { id: ds.id, name: ds.name, type: ds.type, tables: allTables },
        ]);
      }
    },
    [tablesCache, selectedSources, onSelectionChange, fetchTablesForSource],
  );

  const getSourceSelectionState = useCallback(
    (dsId: string): "none" | "some" | "all" => {
      const allTables = tablesCache[dsId] ?? [];
      const existing = selectedSources.find((s) => s.id === dsId);
      if (!existing || existing.tables.length === 0) return "none";
      if (allTables.length > 0 && existing.tables.length === allTables.length)
        return "all";
      return "some";
    },
    [tablesCache, selectedSources],
  );

  const totalSelectedTables = selectedSources.reduce(
    (sum, s) => sum + s.tables.length,
    0,
  );

  return (
    <div className="flex h-full flex-col border-l border-border bg-card/50">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Data Sources</h3>
          {totalSelectedTables > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalSelectedTables} table{totalSelectedTables > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRefresh}
          title="Refresh data sources"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", loading && "animate-spin")}
          />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading && dataSources.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Loading...</span>
            </div>
          )}

          {!loading && dataSources.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No data sources configured.
              <br />
              <span className="text-xs">Add one in Data Sources.</span>
            </div>
          )}

          {dataSources.map((ds) => {
            const expanded = expandedSources.has(ds.id);
            const tables = tablesCache[ds.id] ?? [];
            const isLoadingTables = loadingTables.has(ds.id);
            const selState = getSourceSelectionState(ds.id);

            return (
              <div key={ds.id} className="rounded-lg border border-border/50">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    onClick={() => toggleAllTablesForSource(ds)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    title={
                      selState === "all"
                        ? "Deselect all tables"
                        : "Select all tables"
                    }
                  >
                    {selState === "all" ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : selState === "some" ? (
                      <MinusSquare className="h-4 w-4 text-primary/70" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => toggleSource(ds.id)}
                    className="flex flex-1 items-center gap-1.5 text-left min-w-0"
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    )}
                    <Database className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" />
                    <span className="text-xs font-medium truncate">
                      {ds.name}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 ml-auto flex-shrink-0"
                    >
                      {ds.type}
                    </Badge>
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-border/30 px-2 py-1">
                    {isLoadingTables && (
                      <div className="flex items-center gap-1.5 py-2 px-2 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-xs">Loading tables...</span>
                      </div>
                    )}
                    {!isLoadingTables && tables.length === 0 && (
                      <div className="py-2 px-2 text-xs text-muted-foreground">
                        No tables found
                      </div>
                    )}
                    {tables.map((table) => {
                      const tKey = tableKey(ds.id, table);
                      const tExpanded = expandedTables.has(tKey);
                      const tSelected = isTableSelected(ds.id, table);

                      return (
                        <div key={tKey}>
                          <div className="flex w-full items-center gap-1.5 rounded px-2 py-1 hover:bg-muted/50 transition-colors">
                            <button
                              onClick={() =>
                                toggleTableSelection(ds, table)
                              }
                              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              title={
                                tSelected ? "Deselect table" : "Select table"
                              }
                            >
                              {tSelected ? (
                                <CheckSquare className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <Square className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => toggleTableExpand(tKey)}
                              className="flex flex-1 items-center gap-1.5 text-left min-w-0"
                            >
                              {tExpanded ? (
                                <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                              )}
                              <Table2 className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                              <span
                                className={cn(
                                  "text-[11px] truncate",
                                  tSelected && "font-medium text-foreground",
                                )}
                              >
                                {table.schema}.{table.name}
                              </span>
                            </button>
                          </div>
                          {tExpanded && table.columns.length > 0 && (
                            <div className="ml-8 space-y-0.5 py-0.5">
                              {table.columns.map((col) => (
                                <div
                                  key={col.name}
                                  className="flex items-center gap-1.5 px-2 py-0.5"
                                >
                                  <Columns3 className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/60" />
                                  <span className="text-[10px] text-muted-foreground truncate">
                                    {col.name}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/50 ml-auto flex-shrink-0">
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
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
