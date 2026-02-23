"use client";

import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AggregationFunction,
  ColumnMapping,
  PivotConfig,
} from "@/lib/types";
import { Layers, X, Plus, Group, Sparkles } from "lucide-react";

interface AggOption {
  value: AggregationFunction;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
  suffix?: string;
}

const AGGREGATION_OPTIONS: AggOption[] = [
  { value: "sum", label: "Sum" },
  { value: "concat", label: "Concatenate" },
  { value: "count", label: "Count" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "first", label: "First value" },
  {
    value: "ai_merge",
    label: "AI Merge",
    disabled: true,
    icon: <Sparkles className="h-3 w-3" />,
    suffix: "Coming soon",
  },
];

interface PivotConfigPanelProps {
  rawColumns: string[];
  columnMappings: ColumnMapping[];
  pivotConfig: PivotConfig;
  onPivotConfigChange: (config: PivotConfig) => void;
  onColumnMappingsChange: (mappings: ColumnMapping[]) => void;
}

export default function PivotConfigPanel({
  rawColumns,
  columnMappings,
  pivotConfig,
  onPivotConfigChange,
  onColumnMappingsChange,
}: PivotConfigPanelProps) {
  const groupBySet = useMemo(
    () => new Set(pivotConfig.groupByColumns),
    [pivotConfig.groupByColumns],
  );

  const mappedRawColumns = useMemo(
    () => columnMappings.map((m) => m.rawColumn),
    [columnMappings],
  );

  const availableForGroupBy = useMemo(
    () => mappedRawColumns.filter((col) => !groupBySet.has(col)),
    [mappedRawColumns, groupBySet],
  );

  const nonGroupByMappings = useMemo(
    () => columnMappings.filter((m) => !groupBySet.has(m.rawColumn)),
    [columnMappings, groupBySet],
  );

  const ensureAggregations = useCallback(
    (newGroupBySet: Set<string>) => {
      const needsUpdate = columnMappings.some(
        (m) => !newGroupBySet.has(m.rawColumn) && !m.aggregation,
      );
      if (needsUpdate) {
        onColumnMappingsChange(
          columnMappings.map((m) =>
            !newGroupBySet.has(m.rawColumn) && !m.aggregation
              ? { ...m, aggregation: "sum" as const }
              : m,
          ),
        );
      }
    },
    [columnMappings, onColumnMappingsChange],
  );

  const toggleEnabled = useCallback(() => {
    const next = !pivotConfig.enabled;
    onPivotConfigChange({
      ...pivotConfig,
      enabled: next,
      groupByColumns: next ? pivotConfig.groupByColumns : [],
    });
    if (!next) {
      onColumnMappingsChange(
        columnMappings.map((m) => ({ rawColumn: m.rawColumn, targetPath: m.targetPath })),
      );
    } else if (pivotConfig.groupByColumns.length > 0) {
      ensureAggregations(new Set(pivotConfig.groupByColumns));
    }
  }, [pivotConfig, columnMappings, onPivotConfigChange, onColumnMappingsChange, ensureAggregations]);

  const addGroupByColumn = useCallback(
    (col: string) => {
      const next = [...pivotConfig.groupByColumns, col];
      onPivotConfigChange({ ...pivotConfig, groupByColumns: next });
      ensureAggregations(new Set(next));
    },
    [pivotConfig, onPivotConfigChange, ensureAggregations],
  );

  const removeGroupByColumn = useCallback(
    (col: string) => {
      onPivotConfigChange({
        ...pivotConfig,
        groupByColumns: pivotConfig.groupByColumns.filter((c) => c !== col),
      });
    },
    [pivotConfig, onPivotConfigChange],
  );

  const setAggregation = useCallback(
    (rawColumn: string, aggregation: AggregationFunction) => {
      onColumnMappingsChange(
        columnMappings.map((m) =>
          m.rawColumn === rawColumn ? { ...m, aggregation } : m,
        ),
      );
    },
    [columnMappings, onColumnMappingsChange],
  );

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Pivot &amp; Aggregation</CardTitle>
          </div>
          <Button
            variant={pivotConfig.enabled ? "default" : "outline"}
            size="sm"
            onClick={toggleEnabled}
          >
            {pivotConfig.enabled ? "Enabled" : "Disabled"}
          </Button>
        </div>
        <CardDescription>
          Group rows by key columns and aggregate the rest. Useful when raw data
          has line-item detail that needs to be rolled up.
        </CardDescription>
      </CardHeader>

      {pivotConfig.enabled && (
        <CardContent className="space-y-4">
          {/* Group-by columns */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Group className="h-3.5 w-3.5" />
              Group-by columns
            </label>
            <p className="text-xs text-muted-foreground">
              Rows with the same values in these columns will be merged into one
              row.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {pivotConfig.groupByColumns.map((col) => (
                <span
                  key={col}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                >
                  {col}
                  <button
                    type="button"
                    onClick={() => removeGroupByColumn(col)}
                    className="rounded-sm hover:bg-primary/20 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            {availableForGroupBy.length > 0 && (
              <Select onValueChange={addGroupByColumn} value="">
                <SelectTrigger className="w-56 h-8 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Plus className="h-3 w-3" />
                    <SelectValue placeholder="Add group-by column…" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {availableForGroupBy.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Aggregation per non-group-by mapped column */}
          {pivotConfig.groupByColumns.length > 0 &&
            nonGroupByMappings.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Aggregation per column
                </label>
                <p className="text-xs text-muted-foreground">
                  Choose how values are combined when multiple rows are merged.
                </p>
                <div className="space-y-1.5">
                  {nonGroupByMappings.map((m) => (
                    <div
                      key={m.rawColumn}
                      className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5"
                    >
                      <span className="text-sm min-w-0 truncate flex-1">
                        {m.rawColumn}
                        <span className="text-muted-foreground">
                          {" "}
                          &rarr; {m.targetPath}
                        </span>
                      </span>
                      <Select
                        value={m.aggregation ?? "sum"}
                        onValueChange={(v) =>
                          setAggregation(
                            m.rawColumn,
                            v as AggregationFunction,
                          )
                        }
                      >
                        <SelectTrigger className="w-36 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AGGREGATION_OPTIONS.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                              disabled={opt.disabled}
                            >
                              <span className="flex items-center gap-1.5">
                                {opt.icon}
                                {opt.label}
                                {opt.suffix && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {opt.suffix}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {pivotConfig.groupByColumns.length > 0 && (
            <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground">
              <strong>Preview effect:</strong> {rawColumns.length > 0 ? `Rows will be grouped by [${pivotConfig.groupByColumns.join(", ")}]. ` : ""}
              {nonGroupByMappings.length > 0
                ? `${nonGroupByMappings.length} column${nonGroupByMappings.length !== 1 ? "s" : ""} will be aggregated.`
                : "Add column mappings to configure aggregation."}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
