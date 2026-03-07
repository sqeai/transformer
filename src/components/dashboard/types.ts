export type ChartType = "pie" | "line" | "bar" | "scatter" | "waterfall";

/**
 * A panel is purely data: what to display and how to query it.
 * It contains NO layout information — the dashboard owns layout.
 */
export interface DashboardPanel {
  id: string;
  title: string;
  chartType: ChartType;
  data: Record<string, unknown>[];
  config: ChartConfig;
  prompt?: string;
  sqlQuery?: string;
}

export interface ChartConfig {
  xKey?: string;
  yKey?: string;
  yKeys?: string[];
  nameKey?: string;
  valueKey?: string;
  colors?: string[];
}

/**
 * Layout for a single panel within a dashboard grid.
 * Stored separately from the panel data.
 */
export interface PanelLayout {
  panelId: string;
  /** Column span in a 12-column grid (2–12). Default: 4. */
  colSpan: number;
  /** Row span. Default: 1. */
  rowSpan: number;
  /** Order index for drag-and-drop sorting. */
  order: number;
}

export interface DashboardState {
  id: string;
  title: string;
  panels: DashboardPanel[];
  layout: PanelLayout[];
}

export interface PredefinedQuestion {
  id: string;
  label: string;
  category: string;
  defaultChartType: ChartType;
  sqlHint?: string;
}
