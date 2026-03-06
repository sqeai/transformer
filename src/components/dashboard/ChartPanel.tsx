"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Settings2, GripVertical, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardPanel } from "./types";

const DEFAULT_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#c084fc",
  "#e879f9",
  "#f472b6",
  "#fb7185",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
];

interface ChartPanelProps {
  panel: DashboardPanel;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  expanded?: boolean;
  isLoading?: boolean;
}

function WaterfallChart({
  data,
  config,
}: {
  data: Record<string, unknown>[];
  config: DashboardPanel["config"];
}) {
  const xKey = config.xKey ?? "name";
  const yKey = config.yKey ?? "value";
  const colors = config.colors ?? DEFAULT_COLORS;

  const waterfallData = useMemo(() => {
    let cumulative = 0;
    return data.map((item, i) => {
      const value = Number(item[yKey]) || 0;
      const start = cumulative;
      cumulative += value;
      return {
        name: String(item[xKey] ?? `Item ${i + 1}`),
        value,
        start,
        end: cumulative,
        fill: value >= 0 ? colors[0] : colors[1] ?? "#ef4444",
      };
    });
  }, [data, xKey, yKey, colors]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={waterfallData}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="start" stackId="waterfall" fill="transparent" />
        <Bar dataKey="value" stackId="waterfall">
          {waterfallData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartPanel({ panel, onRemove, onEdit, expanded, isLoading }: ChartPanelProps) {
  const { chartType, data, config, title } = panel;
  const colors = config.colors ?? DEFAULT_COLORS;

  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading data...</span>
        </div>
      );
    }

    if (!data || data.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No data available
        </div>
      );
    }

    switch (chartType) {
      case "pie": {
        const nameKey = config.nameKey ?? "name";
        const valueKey = config.valueKey ?? "value";
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey={valueKey}
                nameKey={nameKey}
                cx="50%"
                cy="50%"
                outerRadius="75%"
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={colors[index % colors.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        );
      }

      case "line": {
        const xKey = config.xKey ?? "name";
        const yKeys = config.yKeys ?? (config.yKey ? [config.yKey] : ["value"]);
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {yKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      }

      case "bar": {
        const xKey = config.xKey ?? "name";
        const yKeys = config.yKeys ?? (config.yKey ? [config.yKey] : ["value"]);
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {yKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[i % colors.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      }

      case "scatter": {
        const xKey = config.xKey ?? "x";
        const yKey = config.yKey ?? "y";
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey={xKey}
                name={xKey}
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                dataKey={yKey}
                name={yKey}
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  fontSize: "12px",
                }}
              />
              <Scatter data={data} fill={colors[0]}>
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={colors[index % colors.length]}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        );
      }

      case "waterfall":
        return <WaterfallChart data={data} config={config} />;

      default:
        return (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Unsupported chart type: {chartType}
          </div>
        );
    }
  };

  if (expanded) {
    return <div className="w-full h-full">{renderChart()}</div>;
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden",
        panel.width === 2 ? "col-span-2" : "col-span-1",
        panel.height === 2 ? "row-span-2" : "row-span-1",
      )}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
          <h3 className="text-sm font-medium truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onEdit(panel.id)}
          >
            <Settings2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(panel.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 p-3 min-h-[200px]">{renderChart()}</div>
    </div>
  );
}
