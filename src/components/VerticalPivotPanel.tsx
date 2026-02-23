"use client";

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
import type { VerticalPivotConfig, VerticalPivotColumn } from "@/lib/types";
import { VP_RAW_VALUE_TOKEN } from "@/lib/types";
import { ArrowDownUp, X, Plus, Columns3, Rows3 } from "lucide-react";

interface VerticalPivotPanelProps {
  rawColumns: string[];
  targetPaths: string[];
  verticalPivotConfig: VerticalPivotConfig;
  onVerticalPivotConfigChange: (config: VerticalPivotConfig) => void;
}

export default function VerticalPivotPanel({
  rawColumns,
  targetPaths,
  verticalPivotConfig,
  onVerticalPivotConfigChange,
}: VerticalPivotPanelProps) {
  const selectedSourceColumns = useMemo(
    () => new Set(verticalPivotConfig.columns.map((c) => c.rawColumn)),
    [verticalPivotConfig.columns],
  );

  const availableRawColumns = useMemo(
    () => rawColumns.filter((col) => !selectedSourceColumns.has(col)),
    [rawColumns, selectedSourceColumns],
  );

  const selectedOutputPaths = useMemo(
    () => new Set(verticalPivotConfig.outputTargetPaths),
    [verticalPivotConfig.outputTargetPaths],
  );

  const availableTargetPaths = useMemo(
    () => targetPaths.filter((p) => !selectedOutputPaths.has(p)),
    [targetPaths, selectedOutputPaths],
  );

  const toggleEnabled = useCallback(() => {
    onVerticalPivotConfigChange({
      ...verticalPivotConfig,
      enabled: !verticalPivotConfig.enabled,
    });
  }, [verticalPivotConfig, onVerticalPivotConfigChange]);

  const addOutputTargetPath = useCallback(
    (path: string) => {
      const nextPaths = [...verticalPivotConfig.outputTargetPaths, path];
      const nextColumns = verticalPivotConfig.columns.map((col) => ({
        ...col,
        fieldValues: { ...col.fieldValues, [path]: "" },
      }));
      onVerticalPivotConfigChange({
        ...verticalPivotConfig,
        outputTargetPaths: nextPaths,
        columns: nextColumns,
      });
    },
    [verticalPivotConfig, onVerticalPivotConfigChange],
  );

  const removeOutputTargetPath = useCallback(
    (path: string) => {
      const nextPaths = verticalPivotConfig.outputTargetPaths.filter((p) => p !== path);
      const nextColumns = verticalPivotConfig.columns.map((col) => {
        const { [path]: _, ...rest } = col.fieldValues;
        return { ...col, fieldValues: rest };
      });
      onVerticalPivotConfigChange({
        ...verticalPivotConfig,
        outputTargetPaths: nextPaths,
        columns: nextColumns,
      });
    },
    [verticalPivotConfig, onVerticalPivotConfigChange],
  );

  const addSourceColumn = useCallback(
    (rawColumn: string) => {
      const fieldValues: Record<string, string> = {};
      for (const p of verticalPivotConfig.outputTargetPaths) {
        fieldValues[p] = tryAutoDetectFieldValue(rawColumn, p);
      }
      const col: VerticalPivotColumn = { rawColumn, fieldValues };
      onVerticalPivotConfigChange({
        ...verticalPivotConfig,
        columns: [...verticalPivotConfig.columns, col],
      });
    },
    [verticalPivotConfig, onVerticalPivotConfigChange],
  );

  const removeSourceColumn = useCallback(
    (rawColumn: string) => {
      onVerticalPivotConfigChange({
        ...verticalPivotConfig,
        columns: verticalPivotConfig.columns.filter((c) => c.rawColumn !== rawColumn),
      });
    },
    [verticalPivotConfig, onVerticalPivotConfigChange],
  );

  const updateFieldValue = useCallback(
    (rawColumn: string, targetPath: string, value: string) => {
      onVerticalPivotConfigChange({
        ...verticalPivotConfig,
        columns: verticalPivotConfig.columns.map((c) =>
          c.rawColumn === rawColumn
            ? { ...c, fieldValues: { ...c.fieldValues, [targetPath]: value } }
            : c,
        ),
      });
    },
    [verticalPivotConfig, onVerticalPivotConfigChange],
  );

  const hasOutputPaths = verticalPivotConfig.outputTargetPaths.length > 0;

  return (
    <Card className="border-dashed min-w-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Vertical Pivot (Unpivot)</CardTitle>
          </div>
          <Button
            variant={verticalPivotConfig.enabled ? "default" : "outline"}
            size="sm"
            onClick={toggleEnabled}
          >
            {verticalPivotConfig.enabled ? "Enabled" : "Disabled"}
          </Button>
        </div>
        <CardDescription>
          Collapse multiple source columns into rows. Select the output target
          fields, then assign each source column a value per field.
        </CardDescription>
      </CardHeader>

      {verticalPivotConfig.enabled && (
        <CardContent className="space-y-4 min-w-0">
          {/* Output mapped columns */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Columns3 className="h-3.5 w-3.5" />
              Output mapped columns
            </label>
            <p className="text-xs text-muted-foreground">
              Target fields populated by each source column. Add source columns
              below and set a static value for each field.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {verticalPivotConfig.outputTargetPaths.map((path) => (
                <span
                  key={path}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-100 dark:bg-violet-900/40 px-2 py-1 text-xs font-medium text-violet-800 dark:text-violet-200 break-all"
                >
                  {path}
                  <button
                    type="button"
                    onClick={() => removeOutputTargetPath(path)}
                    className="rounded-sm hover:bg-violet-200 dark:hover:bg-violet-800 p-0.5 shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            {availableTargetPaths.length > 0 && (
              <Select onValueChange={addOutputTargetPath} value="">
                <SelectTrigger className="w-full h-8 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Plus className="h-3 w-3" />
                    <SelectValue placeholder="Add output column..." />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {availableTargetPaths.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Unpivoted source columns */}
          {hasOutputPaths && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Rows3 className="h-3.5 w-3.5" />
                Unpivoted source columns
              </label>
              <p className="text-xs text-muted-foreground">
                Each source column becomes a separate output row. Set a static
                value for each output field.
              </p>

              <div className="space-y-2 min-w-0">
                {verticalPivotConfig.columns.map((col) => (
                  <div
                    key={col.rawColumn}
                    className="rounded-md border bg-muted/30 px-3 py-2 space-y-2 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-sm font-medium truncate min-w-0">{col.rawColumn}</span>
                      <button
                        type="button"
                        onClick={() => removeSourceColumn(col.rawColumn)}
                        className="rounded-sm hover:bg-destructive/20 p-0.5 shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="grid gap-2">
                      {verticalPivotConfig.outputTargetPaths.map((targetPath) => {
                        const isRaw = col.fieldValues[targetPath] === VP_RAW_VALUE_TOKEN;
                        return (
                          <div key={targetPath} className="min-w-0 flex flex-col gap-1">
                            <span
                              className="text-[11px] text-muted-foreground truncate"
                              title={targetPath}
                            >
                              {targetPath}
                            </span>
                            {isRaw ? (
                              <span className="rounded-md border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 px-2 py-1.5 text-xs text-violet-700 dark:text-violet-300 italic min-w-0 truncate">
                                (column value)
                              </span>
                            ) : (
                              <input
                                type="text"
                                value={col.fieldValues[targetPath] ?? ""}
                                onChange={(e) =>
                                  updateFieldValue(col.rawColumn, targetPath, e.target.value)
                                }
                                placeholder={`Value for ${targetPath}`}
                                className="w-full min-w-0 h-8 rounded-md border bg-background px-2 text-xs"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {availableRawColumns.length > 0 && (
                <Select onValueChange={addSourceColumn} value="">
                  <SelectTrigger className="w-full h-8 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Plus className="h-3 w-3" />
                      <SelectValue placeholder="Add source column..." />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {availableRawColumns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {verticalPivotConfig.columns.length > 0 && (
            <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground">
              <strong>Preview effect:</strong>{" "}
              {verticalPivotConfig.columns.length} source column{verticalPivotConfig.columns.length !== 1 ? "s" : ""} will
              be unpivoted into rows. Each raw data row will produce{" "}
              {verticalPivotConfig.columns.length} output row{verticalPivotConfig.columns.length !== 1 ? "s" : ""}.
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Best-effort auto-detection: tries to extract a value from a column name
 * for a given target path. E.g. column "January 2025" with target "year" → "2025".
 */
function tryAutoDetectFieldValue(colName: string, targetPath: string): string {
  const lowerPath = targetPath.toLowerCase().split(".").pop() ?? "";
  const parsed = parseTimePeriod(colName);
  if (!parsed) return "";

  if (lowerPath.includes("month") || lowerPath.includes("period") || lowerPath.includes("bulan")) {
    return parsed.month;
  }
  if (lowerPath.includes("year") || lowerPath.includes("tahun") || lowerPath.includes("yr")) {
    return parsed.year;
  }
  return "";
}

const MONTH_MAP: Record<string, string> = {
  jan: "January", january: "January",
  feb: "February", february: "February",
  mar: "March", march: "March",
  apr: "April", april: "April",
  may: "May",
  jun: "June", june: "June",
  jul: "July", july: "July",
  aug: "August", august: "August",
  sep: "September", sept: "September", september: "September",
  oct: "October", october: "October",
  nov: "November", november: "November",
  dec: "December", december: "December",
};

function parseTimePeriod(colName: string): { month: string; year: string } | null {
  const cleaned = colName.trim();

  const monthYearMatch = cleaned.match(/^([a-zA-Z]+)[\s\-_.,]+(\d{4})$/);
  if (monthYearMatch) {
    const month = MONTH_MAP[monthYearMatch[1].toLowerCase()];
    if (month) return { month, year: monthYearMatch[2] };
  }

  const yearMonthMatch = cleaned.match(/^(\d{4})[\s\-_.,]+([a-zA-Z]+)$/);
  if (yearMonthMatch) {
    const month = MONTH_MAP[yearMonthMatch[2].toLowerCase()];
    if (month) return { month, year: yearMonthMatch[1] };
  }

  const isoMatch = cleaned.match(/^(\d{4})[\-/](\d{1,2})$/);
  if (isoMatch) {
    const monthNum = parseInt(isoMatch[2], 10);
    if (monthNum >= 1 && monthNum <= 12) {
      const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      return { month: names[monthNum - 1], year: isoMatch[1] };
    }
  }

  const mmYYYYMatch = cleaned.match(/^(\d{1,2})[\-/](\d{4})$/);
  if (mmYYYYMatch) {
    const monthNum = parseInt(mmYYYYMatch[1], 10);
    if (monthNum >= 1 && monthNum <= 12) {
      const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      return { month: names[monthNum - 1], year: mmYYYYMatch[2] };
    }
  }

  return null;
}
