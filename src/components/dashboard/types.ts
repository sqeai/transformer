export type ChartType = "pie" | "line" | "bar" | "scatter" | "waterfall";

export interface DashboardPanel {
  id: string;
  title: string;
  chartType: ChartType;
  data: Record<string, unknown>[];
  config: ChartConfig;
  width: 1 | 2;
  height: 1 | 2;
  prompt?: string;
  sqlQuery?: string;
  colSpan?: number;
}

export interface ChartConfig {
  xKey?: string;
  yKey?: string;
  yKeys?: string[];
  nameKey?: string;
  valueKey?: string;
  colors?: string[];
}

export interface DashboardState {
  id: string;
  title: string;
  panels: DashboardPanel[];
}

export interface PredefinedQuestion {
  id: string;
  label: string;
  category: string;
  defaultChartType: ChartType;
  sqlHint?: string;
}
