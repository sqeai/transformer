"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSchemaStore, flattenFields } from "@/lib/schema-store";
import { ArrowRight, ArrowLeft, Layers, ArrowDownUp, CalendarDays } from "lucide-react";
import { applyMappings, getByPath, formatDisplayValue } from "@/lib/pivot-transform";
import type { AggregationFunction } from "@/lib/types";

const AGG_LABELS: Record<AggregationFunction, string> = {
  sum: "Sum",
  concat: "Concatenate",
  count: "Count",
  min: "Min",
  max: "Max",
  first: "First value",
  ai_merge: "AI Merge",
};

export default function PreviewPage() {
  const router = useRouter();
  const { workflow, getSchema } = useSchemaStore();
  const { rawRows, columnMappings, currentSchemaId, pivotConfig, verticalPivotConfig, defaultValues } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;

  const allTargetPaths = useMemo(
    () => schema ? flattenFields(schema.fields).filter((f) => !f.children?.length).map((f) => f.path) : [],
    [schema],
  );

  const previewRows = useMemo(
    () => applyMappings(rawRows, columnMappings, pivotConfig, defaultValues, allTargetPaths, verticalPivotConfig),
    [rawRows, columnMappings, pivotConfig, defaultValues, allTargetPaths, verticalPivotConfig],
  );

  const previewColumns = useMemo(() => {
    if (allTargetPaths.length > 0) return allTargetPaths;
    const cols = new Set<string>();
    columnMappings.forEach((m) => cols.add(m.targetPath));
    for (const path of Object.keys(defaultValues)) {
      cols.add(path);
    }
    return Array.from(cols).sort();
  }, [allTargetPaths, columnMappings, defaultValues]);

  if (!schema || rawRows.length === 0) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>No data to preview</CardTitle>
            <CardDescription>
              Upload raw data and define mappings first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/upload")}>
              Upload data
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const isPivoted = pivotConfig.enabled && pivotConfig.groupByColumns.length > 0;
  const isVerticallyPivoted = verticalPivotConfig.enabled && verticalPivotConfig.columns.length > 0;
  const groupBySet = new Set(pivotConfig.groupByColumns);
  const aggregatedMappings = isPivoted
    ? columnMappings.filter((m) => !groupBySet.has(m.rawColumn))
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/mapping")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Preview</h1>
              <p className="text-muted-foreground">
                {isPivoted ? (
                  <>
                    {rawRows.length} raw rows aggregated into{" "}
                    <strong>{previewRows.length}</strong> rows. Proceed to export.
                  </>
                ) : (
                  <>Mapped output ({previewRows.length} rows). Proceed to export.</>
                )}
              </p>
            </div>
          </div>
          <Button onClick={() => router.push("/export")}>
            Export
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {isPivoted && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Pivot Transformation Applied</CardTitle>
              </div>
              <CardDescription>
                Rows were grouped and aggregated before producing the final output.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-6 text-sm">
                <div>
                  <span className="font-medium">Group by:</span>{" "}
                  <span className="text-muted-foreground">
                    {pivotConfig.groupByColumns.join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowDownUp className="h-3.5 w-3.5" />
                  {rawRows.length} rows &rarr; {previewRows.length} rows
                </div>
              </div>
              {aggregatedMappings.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {aggregatedMappings.map((m) => (
                    <span
                      key={m.rawColumn}
                      className="inline-flex items-center gap-1 rounded-md bg-background border px-2 py-1 text-xs"
                    >
                      <span className="font-medium">{m.targetPath}</span>
                      <span className="text-muted-foreground">
                        ({AGG_LABELS[m.aggregation ?? "sum"]})
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isVerticallyPivoted && (
          <Card className="border-violet-400/30 bg-violet-50/50 dark:bg-violet-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <CardTitle className="text-base">Vertical Pivot (Unpivot) Applied</CardTitle>
              </div>
              <CardDescription>
                Source columns were expanded into rows with output fields and a value column.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-6 text-sm">
                <div>
                  <span className="font-medium">Source columns:</span>{" "}
                  <span className="text-muted-foreground">
                    {verticalPivotConfig.columns.map((c) => c.rawColumn).join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowDownUp className="h-3.5 w-3.5" />
                  {rawRows.length} rows &rarr; {previewRows.length} rows
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {verticalPivotConfig.outputTargetPaths.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-md bg-background border px-2 py-1 text-xs">
                    <span className="font-medium">{p}</span>
                    <span className="text-muted-foreground">(output field)</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {isPivoted ? "Aggregated output" : "Mapped data"}
            </CardTitle>
            <CardDescription>
              Schema: {schema.name}. {previewColumns.length} field{previewColumns.length !== 1 ? "s" : ""} in output.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewColumns.map((col) => {
                      const isMapped = columnMappings.some((m) => m.targetPath === col);
                      const hasDefault = defaultValues[col] != null && defaultValues[col] !== "";
                      return (
                        <TableHead key={col} className="whitespace-nowrap">
                          <span>{col}</span>
                          {!isMapped && hasDefault && (
                            <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-normal">(default)</span>
                          )}
                          {!isMapped && !hasDefault && (
                            <span className="ml-1 text-[10px] text-muted-foreground/50 font-normal">(unmapped)</span>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      {previewColumns.map((col) => {
                        const value = getByPath(row as Record<string, unknown>, col);
                        const isMapped = columnMappings.some((m) => m.targetPath === col);
                        const hasDefault = defaultValues[col] != null && defaultValues[col] !== "";
                        const isDefaultValue = !isMapped && hasDefault;
                        return (
                          <TableCell
                            key={col}
                            className={isDefaultValue ? "text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : ""}
                          >
                            {formatDisplayValue(value)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            {previewRows.length > 50 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Showing first 50 of {previewRows.length} rows.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white dark:bg-zinc-900 border" />
                Mapped from raw data
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-100 dark:bg-amber-900 border border-amber-300" />
                Default value applied
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 border" />
                Unmapped (empty)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
