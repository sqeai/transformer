"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  ArrowDown,
  Mic,
  ArrowUp,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

// ─── Data ────────────────────────────────────────────────────────────────────

const metrics = [
  {
    label: "Revenue",
    period: "YTD Actual",
    value: "IDR 112Bn",
    change: "15% MoM",
    positive: true,
  },
  {
    label: "EBITDA",
    period: "YTD Actual",
    value: "IDR 6.2Bn",
    change: "+280% MoM",
    positive: true,
  },
  {
    label: "Cost-to-Revenue Ratio",
    period: "YTD Actual",
    value: "70%",
    change: "-9% MoM",
    positive: false,
  },
  {
    label: "MPP cost-to-Revenue Ratio",
    period: "YTD Actual",
    value: "45%",
    change: "-8% MoM",
    positive: false,
  },
  {
    label: "Revenue Growth",
    period: "QoQ",
    value: "35%",
    change: "+15%",
    positive: true,
  },
  {
    label: "EBITDA Margin",
    period: "YTD Actual",
    value: "6%",
    change: "+10% MoM",
    positive: true,
  },
  {
    label: "Promotional Spend Impact on EBITDA",
    period: "YTD Actual",
    value: "IDR 5.8Bn",
    change: "+11% MoM",
    positive: true,
  },
];

const businessTrendData = [
  { year: "2022", revenue: 55, pbt: 8 },
  { year: "2023", revenue: 78, pbt: 4 },
  { year: "2024", revenue: 95, pbt: 18 },
];

const competitorData = [
  { subject: "AUM", STARAM: 80, Competitor: 95 },
  { subject: "Revenue", STARAM: 65, Competitor: 72 },
  { subject: "EBITDA", STARAM: 45, Competitor: 60 },
  { subject: "Growth", STARAM: 90, Competitor: 50 },
  { subject: "Fee", STARAM: 70, Competitor: 55 },
];

const plData = [
  { name: "Revenue", value: 112 },
  { name: "Op Cost", value: -45 },
  { name: "MPP", value: -28 },
  { name: "G&A", value: -15 },
  { name: "EBITDA", value: 24 },
];

const chartCards = [
  {
    title: "Business Performance Trend",
    prompt: "Show me the business performance trend for STAR AM",
    chart: "bar-trend",
  },
  {
    title: "Competitor benchmarking",
    prompt: "Provide competitor benchmarking analysis for STAR AM",
    chart: "radar",
  },
  {
    title: "Profit & Loss Analysis",
    prompt: "Provide a detailed profit and loss analysis for STAR AM",
    chart: "waterfall",
  },
];

const quickPrompts = [
  {
    category: "Business Driver",
    prompt: "Analyze our latest performance by product categories",
  },
  {
    category: "Suggested action items",
    prompt:
      "which KOLs to select based on their latest performance and our current budget",
  },
  {
    category: "Simulation",
    prompt:
      "Generate a financial forecast assuming lower growth in digital APERD and higher growth in banking APERD",
  },
  {
    category: "Benchmark analysis",
    prompt: "Management Fee comparison within top 20 FI Funds",
  },
  {
    category: "Financial Performance",
    prompt: "Find areas where we are experiencing cost overruns or inefficiencies",
  },
  {
    category: "Anomalies & Trends",
    prompt: "Find trends of any products retail users subscribe above Rp1bn",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  period,
  value,
  change,
  positive,
}: (typeof metrics)[0]) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#bac3d1] bg-white p-4">
      <div className="flex flex-col">
        <span className="text-[18px] font-bold leading-[22px] tracking-[-0.18px] text-[#1e252e]">
          {label}
        </span>
        <span className="text-[16px] font-medium leading-6 text-[#677485]">
          {period}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[24px] font-bold leading-7 tracking-[-0.24px] text-[#1e252e] whitespace-nowrap">
          {value}
        </span>
        {positive ? (
          <TrendingUp className="h-5 w-5 shrink-0 text-emerald-500" />
        ) : (
          <TrendingDown className="h-5 w-5 shrink-0 text-rose-500" />
        )}
        <span className="text-[16px] font-medium leading-6 text-[#677485] whitespace-nowrap">
          {change}
        </span>
      </div>
    </div>
  );
}

function BarTrendChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={businessTrendData} barGap={4}>
        <XAxis
          dataKey="year"
          tick={{ fontSize: 11, fill: "#999", opacity: 0.7 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#999", opacity: 0.7 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          ticks={[0, 20, 40, 60, 80, 100]}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
        />
        <Bar dataKey="revenue" fill="#394cff" radius={[3, 3, 0, 0]} name="Revenue" />
        <Bar dataKey="pbt" fill="#a4aebd" radius={[3, 3, 0, 0]} name="PBT" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RadarBenchmarkChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={competitorData}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontSize: 11, fill: "#999" }}
        />
        <Radar
          name="STAR AM"
          dataKey="STARAM"
          stroke="#06b6d4"
          fill="#06b6d4"
          fillOpacity={0.25}
        />
        <Radar
          name="Competitor"
          dataKey="Competitor"
          stroke="#f97316"
          fill="#f97316"
          fillOpacity={0.25}
        />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function WaterfallChart() {
  const data = plData.map((d) => ({
    ...d,
    displayValue: Math.abs(d.value),
    positive: d.value >= 0,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barSize={28}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#999" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
          formatter={(v: number, _n: string, item: { payload?: { positive?: boolean } }) =>
            [`${item.payload?.positive === false ? "-" : ""}${v}Bn`, "IDR"] as [string, string]
          }
        />
        <Bar dataKey="displayValue" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.positive ? "#394cff" : "#a4aebd"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartCard({
  title,
  prompt,
  chart,
  onSelect,
}: (typeof chartCards)[0] & { onSelect: (p: string) => void }) {
  return (
    <div
      className="flex flex-1 min-w-0 flex-col gap-6 rounded-lg border border-[#bac3d1] p-6 cursor-pointer hover:border-[#677485] transition-colors"
      onClick={() => onSelect(prompt)}
    >
      <div className="h-[190px] w-full">
        {chart === "bar-trend" && <BarTrendChart />}
        {chart === "radar" && <RadarBenchmarkChart />}
        {chart === "waterfall" && <WaterfallChart />}
      </div>
      <div className="flex items-end w-full">
        <span className="flex-1 text-[14px] font-medium leading-5 text-[#1e252e] min-w-0">
          {title}
        </span>
        <ArrowDown className="h-5 w-5 shrink-0 text-[#677485]" />
      </div>
    </div>
  );
}

function PromptCard({
  category,
  prompt,
  onSelect,
}: (typeof quickPrompts)[0] & { onSelect: (p: string) => void }) {
  return (
    <div
      className="flex w-[269px] shrink-0 flex-col gap-6 rounded-lg border border-[#bac3d1] p-6 cursor-pointer hover:border-[#677485] transition-colors"
      onClick={() => onSelect(prompt)}
    >
      <p className="text-[16px] font-medium leading-6 text-black truncate">
        {category}
      </p>
      <div className="flex items-end gap-4 w-full">
        <p className="flex-1 text-[14px] font-normal leading-5 text-[#677485] tracking-[0.14px] line-clamp-2 min-w-0">
          {prompt}
        </p>
        <ArrowDown className="h-5 w-5 shrink-0 text-[#677485]" />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MvpLandingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  const handlePrompt = useCallback(
    (prompt: string) => {
      const encoded = encodeURIComponent(prompt);
      router.push(`/assistant?q=${encoded}`);
    },
    [router],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    handlePrompt(trimmed);
  }, [inputValue, handlePrompt]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-white">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[900px] px-6 pb-32">
          {/* Header */}
          <div className="flex flex-col gap-1 py-8">
            <h1 className="text-[32px] font-bold leading-[40px] tracking-[-0.32px] text-[#1e252e]">
              Hi {firstName},
            </h1>
            <h2 className="text-[24px] font-bold leading-7 tracking-[-0.24px] text-[#1e252e]">
              How we can help
            </h2>
          </div>

          {/* Performance Overview */}
          <section className="mb-8">
            <p className="mb-4 text-[18px] font-bold leading-[22px] tracking-[-0.18px] text-[#677485]">
              Performance Overview, Dec-24
            </p>
            <div className="flex flex-wrap gap-4">
              {metrics.map((m) => (
                <div key={m.label} className="min-w-[180px] flex-1">
                  <MetricCard {...m} />
                </div>
              ))}
            </div>
          </section>

          {/* Generate visual/graph/diagram */}
          <section className="mb-8">
            <p className="mb-4 text-[18px] font-bold leading-[22px] tracking-[-0.18px] text-[#677485]">
              Generate visual/graph/diagram
            </p>
            <div className="flex flex-wrap gap-4">
              {chartCards.map((c) => (
                <ChartCard key={c.title} {...c} onSelect={handlePrompt} />
              ))}
            </div>
          </section>

          {/* Quick professional prompt */}
          <section className="mb-8">
            <p className="mb-4 text-[18px] font-bold leading-[22px] tracking-[-0.18px] text-[#677485]">
              Quick professional prompt
            </p>
            <div className="flex flex-wrap gap-4">
              {quickPrompts.map((p) => (
                <PromptCard key={p.category} {...p} onSelect={handlePrompt} />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Sticky chat input */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent px-6 pb-6 pt-8">
        <div className="mx-auto max-w-[900px]">
          <div className="flex flex-col gap-2 rounded-lg border border-[#bac3d1] bg-[#edf0f5] px-3 py-2 shadow-[0_-8px_16px_0_white]">
            <div className="flex items-center py-2">
              <span className="text-[14px] font-bold text-[#006ceb] leading-5 shrink-0">|</span>
              <textarea
                ref={inputRef}
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask questions"
                className="flex-1 resize-none bg-transparent pl-1 text-[16px] font-normal leading-6 text-[#1e252e] placeholder:text-[#bac3d1] focus:outline-none min-h-0"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="flex items-center justify-center rounded-full p-1 hover:bg-black/5 transition-colors"
                title="Attach file"
              >
                <Plus className="h-5 w-5 text-[#677485]" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center justify-center rounded-full p-2 hover:bg-black/5 transition-colors"
                  title="Voice input"
                >
                  <Mic className="h-5 w-5 text-[#677485]" />
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className={cn(
                    "flex items-center justify-center rounded-full p-2 transition-colors",
                    inputValue.trim()
                      ? "bg-[#1e252e] hover:bg-[#333d48] text-white"
                      : "bg-[#1e252e]/40 text-white cursor-not-allowed",
                  )}
                  disabled={!inputValue.trim()}
                  title="Send"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
