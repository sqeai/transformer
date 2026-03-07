"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Search,
  Plus,
  BarChart3,
  TrendingUp,
  PieChart,
  DollarSign,
  Users,
  ShoppingCart,
  ArrowUpDown,
  Loader2,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DashboardPanel, PredefinedQuestion, ChartType } from "./types";

const PREDEFINED_QUESTIONS: PredefinedQuestion[] = [
  { id: "q1", label: "Total Revenue by Year", category: "Revenue", defaultChartType: "bar" },
  { id: "q2", label: "Total Revenue by Quarter", category: "Revenue", defaultChartType: "bar" },
  { id: "q3", label: "Gross Profit", category: "Profitability", defaultChartType: "bar" },
  { id: "q4", label: "Subscription vs Redemption", category: "Comparison", defaultChartType: "bar" },
  { id: "q5", label: "Monthly Revenue Trend", category: "Revenue", defaultChartType: "line" },
  { id: "q6", label: "Revenue by Product Category", category: "Revenue", defaultChartType: "pie" },
  { id: "q7", label: "Customer Acquisition by Channel", category: "Customers", defaultChartType: "pie" },
  { id: "q8", label: "Top 10 Products by Sales", category: "Products", defaultChartType: "bar" },
  { id: "q9", label: "Operating Expenses Breakdown", category: "Expenses", defaultChartType: "pie" },
  { id: "q10", label: "Net Income Over Time", category: "Profitability", defaultChartType: "line" },
  { id: "q11", label: "Customer Retention Rate", category: "Customers", defaultChartType: "line" },
  { id: "q12", label: "Average Order Value by Month", category: "Orders", defaultChartType: "line" },
  { id: "q13", label: "Revenue vs Expenses", category: "Comparison", defaultChartType: "bar" },
  { id: "q14", label: "Sales by Region", category: "Sales", defaultChartType: "bar" },
  { id: "q15", label: "Profit Margin by Product", category: "Profitability", defaultChartType: "bar" },
  { id: "q16", label: "Cash Flow Waterfall", category: "Finance", defaultChartType: "waterfall" },
  { id: "q17", label: "Year-over-Year Growth", category: "Growth", defaultChartType: "line" },
  { id: "q18", label: "Customer Lifetime Value Distribution", category: "Customers", defaultChartType: "bar" },
  { id: "q19", label: "Monthly Active Users", category: "Users", defaultChartType: "line" },
  { id: "q20", label: "Churn Rate by Month", category: "Customers", defaultChartType: "line" },
  { id: "q21", label: "Revenue per Employee", category: "Revenue", defaultChartType: "bar" },
  { id: "q22", label: "Inventory Turnover Rate", category: "Operations", defaultChartType: "bar" },
  { id: "q23", label: "Accounts Receivable Aging", category: "Finance", defaultChartType: "bar" },
  { id: "q24", label: "Budget vs Actual Spending", category: "Finance", defaultChartType: "bar" },
];

const CATEGORIES = [...new Set(PREDEFINED_QUESTIONS.map((q) => q.category))];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Revenue: DollarSign,
  Profitability: TrendingUp,
  Comparison: ArrowUpDown,
  Customers: Users,
  Products: ShoppingCart,
  Expenses: PieChart,
  Sales: BarChart3,
  Finance: DollarSign,
  Growth: TrendingUp,
  Users: Users,
  Orders: ShoppingCart,
  Operations: BarChart3,
};

const CHART_ICONS: Record<string, React.ElementType> = {
  bar: BarChart3,
  line: TrendingUp,
  pie: PieChart,
  scatter: BarChart3,
  waterfall: BarChart3,
};

type Tab = "existing" | "predefined" | "custom";

interface AddPanelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPredefined: (question: PredefinedQuestion) => void;
  onAddCustom: (prompt: string, sqlQuery?: string) => void;
  onAddExisting?: (panel: DashboardPanel) => void;
  existingPanels?: DashboardPanel[];
  currentPanelIds?: Set<string>;
  dashboardId?: string | null;
}

export function AddPanelDialog({
  open,
  onOpenChange,
  onAddPredefined,
  onAddCustom,
  onAddExisting,
  existingPanels: externalExistingPanels,
  currentPanelIds,
  dashboardId,
}: AddPanelDialogProps) {
  const hasExistingPanelsSource = !!externalExistingPanels || !!dashboardId;
  const [tab, setTab] = useState<Tab>(hasExistingPanelsSource ? "existing" : "predefined");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [customSql, setCustomSql] = useState("");

  const [allPanels, setAllPanels] = useState<DashboardPanel[]>([]);
  const [loadingPanels, setLoadingPanels] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setSelectedExisting(new Set());
      return;
    }
    if (externalExistingPanels) {
      setAllPanels(externalExistingPanels);
      return;
    }
    if (!dashboardId) return;

    setLoadingPanels(true);
    fetch(`/api/dashboards/${dashboardId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.panels) {
          const loaded: DashboardPanel[] = data.panels.map(
            (p: Record<string, unknown>) => ({
              id: p.id,
              title: p.title,
              chartType: p.chart_type || p.chartType,
              data: p.data || [],
              config: p.config || {},
              prompt: p.prompt || "",
              sqlQuery: p.sql_query || p.sqlQuery || "",
            }),
          );
          setAllPanels(loaded);
        }
      })
      .finally(() => setLoadingPanels(false));
  }, [open, dashboardId, externalExistingPanels]);

  useEffect(() => {
    if (open) {
      setTab(hasExistingPanelsSource ? "existing" : "predefined");
    }
  }, [open, hasExistingPanelsSource]);

  const availablePanels = allPanels.filter(
    (p) => !currentPanelIds?.has(p.id),
  );

  const filteredExisting = availablePanels.filter(
    (p) => !search || p.title.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredQuestions = PREDEFINED_QUESTIONS.filter((q) => {
    const matchesSearch =
      !search || q.label.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || q.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAddPredefined = useCallback(
    (question: PredefinedQuestion) => {
      onAddPredefined(question);
      onOpenChange(false);
      setSearch("");
      setSelectedCategory(null);
    },
    [onAddPredefined, onOpenChange],
  );

  const handleAddCustom = useCallback(() => {
    if (!customPrompt.trim()) return;
    onAddCustom(customPrompt.trim(), customSql.trim() || undefined);
    onOpenChange(false);
    setCustomPrompt("");
    setCustomSql("");
  }, [customPrompt, customSql, onAddCustom, onOpenChange]);

  const toggleExistingSelection = useCallback((id: string) => {
    setSelectedExisting((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirmExisting = useCallback(() => {
    if (!onAddExisting) return;
    for (const id of selectedExisting) {
      const panel = allPanels.find((p) => p.id === id);
      if (panel) onAddExisting(panel);
    }
    setSelectedExisting(new Set());
    onOpenChange(false);
  }, [selectedExisting, allPanels, onAddExisting, onOpenChange]);

  const tabs: { key: Tab; label: string }[] = hasExistingPanelsSource
    ? [
        { key: "existing", label: "Existing Panels" },
        { key: "predefined", label: "Predefined Questions" },
        { key: "custom", label: "Custom Question" },
      ]
    : [
        { key: "predefined", label: "Predefined Questions" },
        { key: "custom", label: "Custom Question" },
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Panel</DialogTitle>
          <DialogDescription>
            {hasExistingPanelsSource
              ? "Add an existing panel, choose a predefined question, or create your own."
              : "Choose a predefined question or create your own."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border pb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSearch("");
                setSelectedCategory(null);
              }}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "existing" && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search panels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6" style={{ maxHeight: "400px" }}>
              {loadingPanels ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredExisting.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {availablePanels.length === 0
                    ? "All panels are already on the dashboard. Create a new one below."
                    : "No panels match your search."}
                </div>
              ) : (
                <div className="space-y-1.5 pb-2">
                  {filteredExisting.map((panel) => {
                    const Icon = CHART_ICONS[panel.chartType] ?? BarChart3;
                    const isSelected = selectedExisting.has(panel.id);
                    const hasData = panel.data && panel.data.length > 0;
                    return (
                      <button
                        key={panel.id}
                        onClick={() => toggleExistingSelection(panel.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors group",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                            isSelected
                              ? "bg-primary/10"
                              : "bg-muted/50 group-hover:bg-primary/10",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 transition-colors",
                              isSelected
                                ? "text-primary"
                                : "text-muted-foreground group-hover:text-primary",
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{panel.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {panel.chartType} chart
                            </span>
                            {hasData && (
                              <span className="text-[10px] text-green-600">
                                &middot; {panel.data.length} row{panel.data.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded border transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {selectedExisting.size > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground">
                  {selectedExisting.size} panel{selectedExisting.size !== 1 ? "s" : ""} selected
                </span>
                <Button onClick={handleConfirmExisting} size="sm">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add to Dashboard
                </Button>
              </div>
            )}
          </div>
        )}

        {tab === "predefined" && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors",
                  !selectedCategory
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() =>
                    setSelectedCategory(selectedCategory === cat ? null : cat)
                  }
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full border transition-colors",
                    selectedCategory === cat
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6" style={{ maxHeight: "400px" }}>
              <div className="space-y-1.5 pb-2">
                {filteredQuestions.map((q) => {
                  const Icon = CATEGORY_ICONS[q.category] ?? BarChart3;
                  return (
                    <button
                      key={q.id}
                      onClick={() => handleAddPredefined(q)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card px-4 py-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/50 group-hover:bg-primary/10 transition-colors">
                        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {q.label}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {q.category}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground capitalize">
                            {q.defaultChartType} chart
                          </span>
                        </div>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
                {filteredQuestions.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No questions match your search.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {tab === "custom" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Question / Prompt</Label>
              <Input
                id="custom-prompt"
                placeholder="e.g. Show me the top 5 customers by lifetime value"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-sql">
                SQL Query{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="custom-sql"
                placeholder="SELECT customer_name, SUM(total) as lifetime_value FROM orders GROUP BY customer_name ORDER BY lifetime_value DESC LIMIT 5"
                value={customSql}
                onChange={(e) => setCustomSql(e.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Provide a SQL query to run against your data sources, or leave
                blank to let the AI generate one.
              </p>
            </div>
            <Button
              onClick={handleAddCustom}
              disabled={!customPrompt.trim()}
              className="self-end"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Panel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
