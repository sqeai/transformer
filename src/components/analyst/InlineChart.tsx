"use client";

import { useMemo, useState } from "react";
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
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  ScatterChart as ScatterIcon,
  Waves,
  Table2,
  Code2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { VisualizationPayload } from "@/lib/agents/analyst-agent/tools";

const COLORS = [
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

type ViewType = "bar" | "line" | "pie" | "scatter" | "waterfall" | "table";

const VIEW_TABS: { type: ViewType; label: string; icon: typeof BarChart3 }[] = [
  { type: "bar", label: "Bar", icon: BarChart3 },
  { type: "line", label: "Line", icon: TrendingUp },
  { type: "pie", label: "Pie", icon: PieChartIcon },
  { type: "scatter", label: "Scatter", icon: ScatterIcon },
  { type: "waterfall", label: "Waterfall", icon: Waves },
  { type: "table", label: "Table", icon: Table2 },
];

const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  fontSize: "12px",
};

function fmtCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" || (typeof value === "string" && value !== "" && !Number.isNaN(Number(value)))) {
    return Number(value).toLocaleString("en-US");
  }
  return String(value);
}

const fmtAxis = (v: number) => v.toLocaleString("en-US");
const fmtTooltip = (v: number | undefined, name: string | undefined): [string, string] => [(v ?? 0).toLocaleString("en-US"), name ?? ""];

function estimateYAxisWidth(data: Record<string, unknown>[], valueKeys: string[]): number {
  let maxLen = 0;
  for (const row of data) {
    for (const key of valueKeys) {
      const v = row[key];
      if (v == null) continue;
      const formatted = typeof v === "number" || !Number.isNaN(Number(v))
        ? Number(v).toLocaleString("en-US")
        : String(v);
      if (formatted.length > maxLen) maxLen = formatted.length;
    }
  }
  return Math.max(40, Math.min(maxLen * 7.5 + 12, 160));
}

function WaterfallView({
  data,
  labelKey,
  valueKey,
}: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
}) {
  const waterfallData = useMemo(() => {
    let cumulative = 0;
    return data.map((item, i) => {
      const value = Number(item[valueKey]) || 0;
      const start = cumulative;
      cumulative += value;
      return {
        name: String(item[labelKey] ?? `Item ${i + 1}`),
        value,
        start,
        end: cumulative,
        fill: value >= 0 ? COLORS[0] : "#ef4444",
      };
    });
  }, [data, labelKey, valueKey]);

  const yAxisWidth = useMemo(
    () => estimateYAxisWidth(waterfallData, ["value", "start", "end"]),
    [waterfallData],
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={waterfallData}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis width={yAxisWidth} tick={{ fontSize: 11 }} tickLine={false} tickFormatter={fmtAxis} />
        <Tooltip contentStyle={tooltipStyle} formatter={fmtTooltip} />
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

function TableView({ data }: { data: Record<string, unknown>[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="sticky top-0 z-10 border border-border bg-muted/50 px-2.5 py-1.5 text-left font-semibold whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30 transition-colors">
              {columns.map((col) => (
                <td
                  key={col}
                  className="border border-border px-2.5 py-1.5 whitespace-nowrap"
                >
                  {row[col] == null ? (
                    <span className="text-muted-foreground/50 italic">null</span>
                  ) : (
                    fmtCell(row[col])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SqlPanel({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-border/50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/30"
      >
        <Code2 className="h-3.5 w-3.5" />
        <span className="font-medium">SQL Query</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 ml-auto" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 ml-auto" />
        )}
      </button>
      {open && (
        <div className="relative px-4 pb-3">
          <button
            onClick={handleCopy}
            className="absolute top-1 right-5 p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy SQL"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <pre className="overflow-x-auto rounded-lg bg-background/80 border border-border/50 p-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap">
            {sql}
          </pre>
        </div>
      )}
    </div>
  );
}

function ChartView({
  chartType,
  data,
  labelKey,
  valueKeys,
}: {
  chartType: ViewType;
  data: Record<string, unknown>[];
  labelKey: string;
  valueKeys: string[];
}) {
  const yAxisWidth = useMemo(() => estimateYAxisWidth(data, valueKeys), [data, valueKeys]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  switch (chartType) {
    case "bar": {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis width={yAxisWidth} tick={{ fontSize: 11 }} tickLine={false} tickFormatter={fmtAxis} />
            <Tooltip contentStyle={tooltipStyle} formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {valueKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case "line": {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis width={yAxisWidth} tick={{ fontSize: 11 }} tickLine={false} tickFormatter={fmtAxis} />
            <Tooltip contentStyle={tooltipStyle} formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {valueKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    case "pie": {
      const valueKey = valueKeys[0];
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={labelKey}
              cx="50%"
              cy="50%"
              outerRadius="75%"
              label={({ name, percent }) =>
                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case "scatter": {
      const yValueKey = valueKeys[0];
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey={labelKey}
              name={labelKey}
              tick={{ fontSize: 11 }}
              tickLine={false}
              type="category"
            />
            <YAxis
              width={yAxisWidth}
              dataKey={yValueKey}
              name={yValueKey}
              tick={{ fontSize: 11 }}
              tickLine={false}
              tickFormatter={fmtAxis}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={fmtTooltip}
            />
            <Scatter data={data} fill={COLORS[0]}>
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    case "waterfall": {
      return (
        <WaterfallView
          data={data}
          labelKey={labelKey}
          valueKey={valueKeys[0]}
        />
      );
    }

    case "table": {
      return <TableView data={data} />;
    }

    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Unsupported view type
        </div>
      );
  }
}

export function InlineChart({ visualization }: { visualization: VisualizationPayload }) {
  const [activeView, setActiveView] = useState<ViewType>(visualization.chartType);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <h3 className="text-sm font-medium truncate">{visualization.title}</h3>
        <span className="text-[11px] text-muted-foreground ml-2 shrink-0">
          {visualization.data.length.toLocaleString("en-US")} rows
        </span>
      </div>

      <div className="flex items-center gap-0.5 border-b border-border/50 px-3 py-1.5 bg-muted/20 overflow-x-auto">
        {VIEW_TABS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => setActiveView(type)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors shrink-0",
              activeView === type
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className={cn("p-3", activeView === "table" ? "h-[320px]" : "h-[300px]")}>
        <ChartView
          chartType={activeView}
          data={visualization.data}
          labelKey={visualization.labelKey}
          valueKeys={visualization.valueKeys}
        />
      </div>

      {visualization.sql && <SqlPanel sql={visualization.sql} />}
    </div>
  );
}
