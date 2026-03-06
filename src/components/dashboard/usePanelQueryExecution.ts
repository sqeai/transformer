"use client";

import { useCallback, useRef, useState } from "react";
import type { DashboardPanel } from "./types";

interface ContextTable {
  dataSourceId: string;
}

interface FolderContext {
  tables: ContextTable[];
}

async function getFirstDataSourceId(): Promise<string | null> {
  try {
    const res = await fetch("/api/contexts");
    if (!res.ok) return null;
    const data = await res.json();
    const contexts: FolderContext[] = data.contexts ?? [];
    for (const ctx of contexts) {
      if (ctx.tables?.length > 0) {
        return ctx.tables[0].dataSourceId;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function usePanelQueryExecution() {
  const [executingPanels, setExecutingPanels] = useState<Set<string>>(
    new Set(),
  );
  const dataSourceIdCache = useRef<string | null | undefined>(undefined);

  const executePanel = useCallback(
    async (
      panel: DashboardPanel,
    ): Promise<DashboardPanel | null> => {
      if (!panel.sqlQuery?.trim()) return null;

      if (dataSourceIdCache.current === undefined) {
        dataSourceIdCache.current = await getFirstDataSourceId();
      }

      const dataSourceId = dataSourceIdCache.current;
      if (!dataSourceId) return null;

      setExecutingPanels((prev) => new Set(prev).add(panel.id));

      try {
        const res = await fetch("/api/panel-execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataSourceId,
            sql: panel.sqlQuery,
          }),
        });

        const result = await res.json();
        if (result.error) return null;

        const rows: Record<string, unknown>[] = result.rows ?? [];
        if (rows.length === 0) return null;

        const columns = Object.keys(rows[0]);
        const config = { ...panel.config };
        if (columns.length >= 2 && !config.xKey && !config.nameKey) {
          if (panel.chartType === "pie") {
            config.nameKey = columns[0];
            config.valueKey = columns[1];
          } else {
            config.xKey = columns[0];
            config.yKey = columns[1];
            if (columns.length > 2) {
              config.yKeys = columns.slice(1);
            }
          }
        }

        return { ...panel, data: rows, config };
      } catch {
        return null;
      } finally {
        setExecutingPanels((prev) => {
          const next = new Set(prev);
          next.delete(panel.id);
          return next;
        });
      }
    },
    [],
  );

  const executePanelsOnLoad = useCallback(
    async (panels: DashboardPanel[]): Promise<DashboardPanel[]> => {
      const panelsNeedingData = panels.filter(
        (p) => p.sqlQuery?.trim() && (!p.data || p.data.length === 0),
      );

      if (panelsNeedingData.length === 0) return panels;

      const results = await Promise.allSettled(
        panelsNeedingData.map((p) => executePanel(p)),
      );

      const updatedMap = new Map<string, DashboardPanel>();
      panelsNeedingData.forEach((p, i) => {
        const result = results[i];
        if (result.status === "fulfilled" && result.value) {
          updatedMap.set(p.id, result.value);
        }
      });

      if (updatedMap.size === 0) return panels;

      return panels.map((p) => updatedMap.get(p.id) ?? p);
    },
    [executePanel],
  );

  return {
    executePanel,
    executePanelsOnLoad,
    executingPanels,
    isExecuting: executingPanels.size > 0,
  };
}
