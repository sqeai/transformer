"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TransformationMappingEntry } from "@/lib/schema-store";
import {
  getTransformationDescription,
  getPhaseDescription,
} from "@/lib/transformation-descriptions";

interface TransformationStepListProps {
  iterations: TransformationMappingEntry[][];
  maxTableHeight?: string;
}

export function TransformationStepList({
  iterations,
  maxTableHeight = "400px",
}: TransformationStepListProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"before" | "after">("after");

  const steps = iterations.flat();

  if (steps.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-4">
        No transformation data available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {steps.length} transformation{steps.length !== 1 ? "s" : ""}
      </p>
      <div className="space-y-2">
        {steps.map((entry, idx) => {
                const stepKey = `${idx}`;
                const isExpanded = expandedStep === stepKey;
                const snapshot = previewMode === "before" ? entry.before : entry.after;
                const rowDelta = entry.rowCountAfter - entry.rowCountBefore;
                const colDelta = entry.outputColumns.length - entry.inputColumns.length;

                return (
                  <div key={stepKey} className="rounded-lg border overflow-hidden">
                    <button
                      type="button"
                      className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setExpandedStep(isExpanded ? null : stepKey);
                        setPreviewMode("after");
                      }}
                    >
                      <div
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium shrink-0",
                          entry.phase === "cleansing"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
                        )}
                      >
                        {entry.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm font-medium inline-flex items-center gap-1 cursor-help">
                                {getTransformationDescription(entry.tool).label}
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">{getTransformationDescription(entry.tool).description}</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider cursor-help",
                                  entry.phase === "cleansing"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    : "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
                                )}
                              >
                                {entry.phase}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">{getPhaseDescription(entry.phase).description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {entry.reasoning && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {entry.reasoning}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span
                          className={cn(
                            rowDelta > 0
                              ? "text-green-600"
                              : rowDelta < 0
                                ? "text-orange-600"
                                : "",
                          )}
                        >
                          {entry.rowCountBefore} → {entry.rowCountAfter} rows
                        </span>
                        {colDelta !== 0 && (
                          <span
                            className={cn(
                              colDelta > 0 ? "text-green-600" : "text-orange-600",
                            )}
                          >
                            {colDelta > 0 ? "+" : ""}
                            {colDelta} col{Math.abs(colDelta) !== 1 ? "s" : ""}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1 rounded-md border p-0.5">
                            <button
                              type="button"
                              className={cn(
                                "px-3 py-1 text-xs rounded transition-colors",
                                previewMode === "before"
                                  ? "bg-muted font-medium"
                                  : "text-muted-foreground hover:bg-muted/50",
                              )}
                              onClick={() => setPreviewMode("before")}
                            >
                              Before
                            </button>
                            <button
                              type="button"
                              className={cn(
                                "px-3 py-1 text-xs rounded transition-colors",
                                previewMode === "after"
                                  ? "bg-muted font-medium"
                                  : "text-muted-foreground hover:bg-muted/50",
                              )}
                              onClick={() => setPreviewMode("after")}
                            >
                              After
                            </button>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {snapshot
                              ? `${snapshot.sampleRows.length} of ${snapshot.totalRows} rows (${snapshot.columns.length} columns)`
                              : "No preview available"}
                          </span>
                        </div>

                        {snapshot && snapshot.sampleRows.length > 0 && (
                          <div
                            className="w-full rounded-md border overflow-auto"
                            style={{ maxHeight: maxTableHeight }}
                          >
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-14 whitespace-nowrap bg-background">
                                    #
                                  </TableHead>
                                  {snapshot.columns.map((col) => (
                                    <TableHead
                                      key={col}
                                      className="whitespace-nowrap bg-background text-xs"
                                    >
                                      {col}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {snapshot.sampleRows.map((row, ri) => (
                                  <TableRow key={ri}>
                                    <TableCell className="text-muted-foreground text-xs">
                                      {ri + 1}
                                    </TableCell>
                                    {snapshot.columns.map((col) => (
                                      <TableCell
                                        key={col}
                                        className="whitespace-nowrap max-w-[180px] truncate text-xs"
                                      >
                                        {String(
                                          (row as Record<string, unknown>)[col] ?? "",
                                        )}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}

                        {snapshot &&
                          snapshot.totalRows > snapshot.sampleRows.length && (
                            <p className="text-xs text-muted-foreground text-center">
                              Showing {snapshot.sampleRows.length} of{" "}
                              {snapshot.totalRows} rows
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
      </div>
    </div>
  );
}
