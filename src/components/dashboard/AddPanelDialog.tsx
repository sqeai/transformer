"use client";

import { useState, useCallback } from "react";
import { Search, Plus, BarChart3, TrendingUp, PieChart, DollarSign, Users, ShoppingCart, ArrowUpDown } from "lucide-react";
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
import type { PredefinedQuestion, ChartType } from "./types";

const PREDEFINED_QUESTIONS: PredefinedQuestion[] = [
  { id: "q1", label: "Total Revenue by Year", category: "Revenue", defaultChartType: "bar", sqlHint: "SELECT year, SUM(revenue) FROM transactions GROUP BY year" },
  { id: "q2", label: "Total Revenue by Quarter", category: "Revenue", defaultChartType: "bar", sqlHint: "SELECT quarter, SUM(revenue) FROM transactions GROUP BY quarter" },
  { id: "q3", label: "Gross Profit", category: "Profitability", defaultChartType: "bar", sqlHint: "SELECT period, gross_profit FROM financials" },
  { id: "q4", label: "Subscription vs Redemption", category: "Comparison", defaultChartType: "bar", sqlHint: "SELECT type, SUM(amount) FROM transactions GROUP BY type" },
  { id: "q5", label: "Monthly Revenue Trend", category: "Revenue", defaultChartType: "line", sqlHint: "SELECT month, SUM(revenue) FROM transactions GROUP BY month ORDER BY month" },
  { id: "q6", label: "Revenue by Product Category", category: "Revenue", defaultChartType: "pie", sqlHint: "SELECT category, SUM(revenue) FROM products GROUP BY category" },
  { id: "q7", label: "Customer Acquisition by Channel", category: "Customers", defaultChartType: "pie", sqlHint: "SELECT channel, COUNT(*) FROM customers GROUP BY channel" },
  { id: "q8", label: "Top 10 Products by Sales", category: "Products", defaultChartType: "bar", sqlHint: "SELECT product_name, SUM(sales) FROM orders GROUP BY product_name ORDER BY SUM(sales) DESC LIMIT 10" },
  { id: "q9", label: "Operating Expenses Breakdown", category: "Expenses", defaultChartType: "pie", sqlHint: "SELECT category, SUM(amount) FROM expenses GROUP BY category" },
  { id: "q10", label: "Net Income Over Time", category: "Profitability", defaultChartType: "line", sqlHint: "SELECT period, net_income FROM financials ORDER BY period" },
  { id: "q11", label: "Customer Retention Rate", category: "Customers", defaultChartType: "line", sqlHint: "SELECT month, retention_rate FROM customer_metrics ORDER BY month" },
  { id: "q12", label: "Average Order Value by Month", category: "Orders", defaultChartType: "line", sqlHint: "SELECT month, AVG(order_total) FROM orders GROUP BY month" },
  { id: "q13", label: "Revenue vs Expenses", category: "Comparison", defaultChartType: "bar", sqlHint: "SELECT period, revenue, expenses FROM financials" },
  { id: "q14", label: "Sales by Region", category: "Sales", defaultChartType: "bar", sqlHint: "SELECT region, SUM(sales) FROM orders GROUP BY region" },
  { id: "q15", label: "Profit Margin by Product", category: "Profitability", defaultChartType: "bar", sqlHint: "SELECT product, profit_margin FROM product_metrics ORDER BY profit_margin DESC" },
  { id: "q16", label: "Cash Flow Waterfall", category: "Finance", defaultChartType: "waterfall", sqlHint: "SELECT category, amount FROM cash_flow" },
  { id: "q17", label: "Year-over-Year Growth", category: "Growth", defaultChartType: "line", sqlHint: "SELECT year, growth_rate FROM annual_metrics ORDER BY year" },
  { id: "q18", label: "Customer Lifetime Value Distribution", category: "Customers", defaultChartType: "bar", sqlHint: "SELECT ltv_bucket, COUNT(*) FROM customers GROUP BY ltv_bucket" },
  { id: "q19", label: "Monthly Active Users", category: "Users", defaultChartType: "line", sqlHint: "SELECT month, active_users FROM user_metrics ORDER BY month" },
  { id: "q20", label: "Churn Rate by Month", category: "Customers", defaultChartType: "line", sqlHint: "SELECT month, churn_rate FROM customer_metrics ORDER BY month" },
  { id: "q21", label: "Revenue per Employee", category: "Revenue", defaultChartType: "bar", sqlHint: "SELECT department, revenue_per_employee FROM dept_metrics" },
  { id: "q22", label: "Inventory Turnover Rate", category: "Operations", defaultChartType: "bar", sqlHint: "SELECT category, turnover_rate FROM inventory_metrics" },
  { id: "q23", label: "Accounts Receivable Aging", category: "Finance", defaultChartType: "bar", sqlHint: "SELECT aging_bucket, total_amount FROM ar_aging" },
  { id: "q24", label: "Budget vs Actual Spending", category: "Finance", defaultChartType: "bar", sqlHint: "SELECT department, budget, actual FROM budget_tracking" },
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

interface AddPanelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPredefined: (question: PredefinedQuestion) => void;
  onAddCustom: (prompt: string, sqlQuery?: string) => void;
}

export function AddPanelDialog({
  open,
  onOpenChange,
  onAddPredefined,
  onAddCustom,
}: AddPanelDialogProps) {
  const [tab, setTab] = useState<"predefined" | "custom">("predefined");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [customSql, setCustomSql] = useState("");

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Panel</DialogTitle>
          <DialogDescription>
            Choose a predefined question or create your own.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border pb-2">
          <button
            onClick={() => setTab("predefined")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              tab === "predefined"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            Predefined Questions
          </button>
          <button
            onClick={() => setTab("custom")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              tab === "custom"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            Custom Question
          </button>
        </div>

        {tab === "predefined" ? (
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
        ) : (
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
