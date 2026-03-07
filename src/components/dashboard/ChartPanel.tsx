"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { InlineChart, type ChartData, type ViewType } from "@/components/analyst/InlineChart";
import type { DashboardPanel } from "./types";

interface ChartPanelProps {
  panel: DashboardPanel;
  isLoading?: boolean;
  className?: string;
}

/**
 * Convert a DashboardPanel's config-based shape into the unified ChartData
 * that InlineChart expects.
 */
function panelToChartData(panel: DashboardPanel): ChartData {
  const { chartType, data, config, title } = panel;

  let labelKey: string;
  let valueKeys: string[];

  if (chartType === "pie") {
    labelKey = config.nameKey ?? config.xKey ?? "name";
    valueKeys = config.valueKey ? [config.valueKey] : config.yKeys ?? (config.yKey ? [config.yKey] : ["value"]);
  } else {
    labelKey = config.xKey ?? config.nameKey ?? "name";
    valueKeys = config.yKeys ?? (config.yKey ? [config.yKey] : config.valueKey ? [config.valueKey] : ["value"]);
  }

  return {
    title,
    chartType: chartType as ViewType,
    data,
    labelKey,
    valueKeys,
    sql: panel.sqlQuery,
  };
}

/**
 * Renders a dashboard panel's chart content.
 * This is a pure display component — no layout chrome, no drag handles,
 * no resize controls. The dashboard grid owns all layout concerns.
 */
export function ChartPanel({ panel, isLoading, className }: ChartPanelProps) {
  const chartData = useMemo(() => panelToChartData(panel), [panel]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading data...</span>
      </div>
    );
  }

  return (
    <InlineChart
      chartData={chartData}
      mode="clean"
      className={className}
    />
  );
}

export { panelToChartData };
