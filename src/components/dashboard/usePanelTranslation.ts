"use client";

import { useCallback, useRef, useState } from "react";
import type { DashboardPanel, ChartType } from "./types";

interface ContextTable {
  dataSourceId: string;
  dataSourceName: string;
  dataSourceType: string;
  schemaName: string;
  tableName: string;
  columns: { name: string; type: string }[];
}

interface FolderContext {
  tables: ContextTable[];
}

interface DataSourceContext {
  id: string;
  name: string;
  type: string;
  tables: {
    schema: string;
    name: string;
    columns: { name: string; type: string }[];
  }[];
}

async function getDataSourceContexts(): Promise<DataSourceContext[]> {
  try {
    const res = await fetch("/api/contexts");
    if (!res.ok) return [];
    const data = await res.json();
    const contexts: FolderContext[] = data.contexts ?? [];

    const dsMap = new Map<string, DataSourceContext>();
    for (const ctx of contexts) {
      for (const t of ctx.tables) {
        let ds = dsMap.get(t.dataSourceId);
        if (!ds) {
          ds = {
            id: t.dataSourceId,
            name: t.dataSourceName,
            type: t.dataSourceType,
            tables: [],
          };
          dsMap.set(t.dataSourceId, ds);
        }
        const exists = ds.tables.some(
          (tb) => tb.schema === t.schemaName && tb.name === t.tableName,
        );
        if (!exists) {
          ds.tables.push({
            schema: t.schemaName,
            name: t.tableName,
            columns: t.columns,
          });
        }
      }
    }

    return Array.from(dsMap.values());
  } catch {
    return [];
  }
}

export function usePanelTranslation() {
  const [translatingPanels, setTranslatingPanels] = useState<Set<string>>(
    new Set(),
  );
  const dsContextsCache = useRef<DataSourceContext[] | null>(null);

  const translateAndExecute = useCallback(
    async (panel: DashboardPanel): Promise<DashboardPanel> => {
      if (!panel.prompt?.trim()) return panel;

      if (!dsContextsCache.current) {
        dsContextsCache.current = await getDataSourceContexts();
      }

      const dsContexts = dsContextsCache.current;
      if (dsContexts.length === 0) return panel;

      setTranslatingPanels((prev) => new Set(prev).add(panel.id));

      try {
        const res = await fetch("/api/panel-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: panel.prompt,
            dataSourceContexts: dsContexts,
          }),
        });

        if (!res.ok) return panel;

        const result = await res.json();
        if (result.error) return panel;

        return {
          ...panel,
          title: result.title || panel.title,
          chartType: (result.chartType as ChartType) || panel.chartType,
          sqlQuery: result.sqlQuery || panel.sqlQuery,
          data: Array.isArray(result.data) ? result.data : panel.data,
          config: result.config || panel.config,
        };
      } catch {
        return panel;
      } finally {
        setTranslatingPanels((prev) => {
          const next = new Set(prev);
          next.delete(panel.id);
          return next;
        });
      }
    },
    [],
  );

  return {
    translateAndExecute,
    translatingPanels,
    isTranslating: translatingPanels.size > 0,
  };
}
