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
import { useSchemaStore } from "@/lib/schema-store";
import { ArrowRight, ArrowLeft, Layers, ArrowDownUp } from "lucide-react";
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
  const { rawRows, columnMappings, currentSchemaId, pivotConfig } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;

  const previewRows = useMemo(
    () => applyMappings(rawRows, columnMappings, pivotConfig),
    [rawRows, columnMappings, pivotConfig],
  );

  const previewColumns = useMemo(() => {
    const cols = new Set<string>();
    columnMappings.forEach((m) => cols.add(m.targetPath));
    return Array.from(cols).sort();
  }, [columnMappings]);

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

        <Card>
          <CardHeader>
            <CardTitle>
              {isPivoted ? "Aggregated output" : "Mapped data"}
            </CardTitle>
            <CardDescription>
              Schema: {schema.name}. Columns: {previewColumns.join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewColumns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      {previewColumns.map((col) => (
                        <TableCell key={col}>
                          {formatDisplayValue(getByPath(row as Record<string, unknown>, col))}
                        </TableCell>
                      ))}
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
