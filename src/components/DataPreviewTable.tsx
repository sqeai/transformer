"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Columns3, Rows3, Settings2, ChevronDown, ChevronUp, MoreHorizontal, AlertTriangle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface DataBoundary {
  headerRowIndex: number;
  dataStartRowIndex: number;
  dataEndRowIndex: number;
  startColumn: number;
  endColumn: number;
}

export interface IndexedRow {
  originalIndex: number;
  data: string[];
}

interface DataPreviewTableProps {
  rows: IndexedRow[];
  totalRows: number;
  totalColumns: number;
  initialBoundary?: Partial<DataBoundary>;
  onBoundaryChange: (boundary: DataBoundary) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  /** Rendered between the preview row-count warning and the data table */
  slotAfterWarning?: React.ReactNode;
  /** Rendered above the boundary settings panel (e.g. AI cleansing preview) */
  slotAboveBoundary?: React.ReactNode;
}

export default function DataPreviewTable({
  rows,
  totalRows,
  totalColumns,
  initialBoundary,
  onBoundaryChange,
  onLoadMore,
  loadingMore,
  slotAfterWarning,
  slotAboveBoundary,
}: DataPreviewTableProps) {
  const maxRowIdx = Math.max(0, totalRows - 1);
  const maxColIdx = Math.max(0, totalColumns - 1);

  const [headerRow, setHeaderRow] = useState(initialBoundary?.headerRowIndex ?? 0);
  const [dataStart, setDataStart] = useState(initialBoundary?.dataStartRowIndex ?? 1);
  const [dataEnd, setDataEnd] = useState(initialBoundary?.dataEndRowIndex ?? maxRowIdx);
  const [startCol, setStartCol] = useState(initialBoundary?.startColumn ?? 0);
  const [endCol, setEndCol] = useState(initialBoundary?.endColumn ?? maxColIdx);
  const [showSettings, setShowSettings] = useState(true);
  /** Selected row (originalIndex) — centered in view with 5 rows above/below */
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(
    initialBoundary != null ? (initialBoundary.headerRowIndex ?? 0) : null,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [draftHeaderRow, setDraftHeaderRow] = useState(String(headerRow + 1));
  const [draftDataStart, setDraftDataStart] = useState(String(dataStart + 1));
  const [draftDataEnd, setDraftDataEnd] = useState(String(dataEnd + 1));
  const [draftStartCol, setDraftStartCol] = useState(String(startCol + 1));
  const [draftEndCol, setDraftEndCol] = useState(String(endCol + 1));
  const pendingArrowField = useRef<"headerRow" | "dataStart" | "dataEnd" | "startCol" | "endCol" | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const DEBOUNCE_MS = 500;

  const commitBoundary = useCallback(
    (field: "headerRow" | "dataStart" | "dataEnd" | "startCol" | "endCol", raw: string) => {
      const v = Number(raw);
      if (Number.isNaN(v) || raw.trim() === "") return;
      const idx = v - 1;

      let h = headerRow, ds = dataStart, de = dataEnd, sc = startCol, ec = endCol;

      switch (field) {
        case "headerRow": {
          h = Math.max(0, Math.min(idx, maxRowIdx));
          setHeaderRow(h);
          setDraftHeaderRow(String(h + 1));
          ds = Math.min(h + 1, maxRowIdx);
          setDataStart(ds);
          setDraftDataStart(String(ds + 1));
          setSelectedRowIndex(h);
          break;
        }
        case "dataStart": {
          ds = Math.max(0, Math.min(idx, maxRowIdx));
          setDataStart(ds);
          setDraftDataStart(String(ds + 1));
          break;
        }
        case "dataEnd": {
          de = Math.max(0, Math.min(idx, maxRowIdx));
          setDataEnd(de);
          setDraftDataEnd(String(de + 1));
          break;
        }
        case "startCol": {
          sc = Math.max(0, Math.min(idx, maxColIdx));
          setStartCol(sc);
          setDraftStartCol(String(sc + 1));
          break;
        }
        case "endCol": {
          ec = Math.max(0, Math.min(idx, maxColIdx));
          setEndCol(ec);
          setDraftEndCol(String(ec + 1));
          break;
        }
      }

      onBoundaryChange({
        headerRowIndex: h,
        dataStartRowIndex: ds,
        dataEndRowIndex: de,
        startColumn: sc,
        endColumn: ec,
      });
    },
    [maxRowIdx, maxColIdx, headerRow, dataStart, dataEnd, startCol, endCol, onBoundaryChange],
  );

  const handleDraftChange = useCallback(
    (field: "headerRow" | "dataStart" | "dataEnd" | "startCol" | "endCol", raw: string) => {
      switch (field) {
        case "headerRow": setDraftHeaderRow(raw); break;
        case "dataStart": setDraftDataStart(raw); break;
        case "dataEnd": setDraftDataEnd(raw); break;
        case "startCol": setDraftStartCol(raw); break;
        case "endCol": setDraftEndCol(raw); break;
      }

      clearTimeout(debounceRef.current);
      if (pendingArrowField.current === field) {
        pendingArrowField.current = null;
        commitBoundary(field, raw);
      } else {
        debounceRef.current = setTimeout(() => commitBoundary(field, raw), DEBOUNCE_MS);
      }
    },
    [commitBoundary],
  );

  const handleArrowKey = useCallback(
    (field: "headerRow" | "dataStart" | "dataEnd" | "startCol" | "endCol", e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        pendingArrowField.current = field;
      }
    },
    [],
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Keep selected row in sync with header when boundary is set from outside
  useEffect(() => {
    if (initialBoundary != null)
      setSelectedRowIndex(initialBoundary.headerRowIndex ?? 0);
  }, [initialBoundary?.headerRowIndex]);

  const columnLabels = useMemo(() => {
    const count = endCol - startCol + 1;
    return Array.from({ length: count }, (_, i) => {
      const colIdx = startCol + i;
      return `Col ${colIdx + 1}`;
    });
  }, [startCol, endCol]);

  const dataRowCount = Math.min(dataEnd, maxRowIdx) - dataStart + 1;
  const colCount = endCol - startCol + 1;

  const hasGap = useMemo(() => {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].originalIndex - rows[i - 1].originalIndex > 1) return true;
    }
    return false;
  }, [rows]);

  const hasTrailingGap = useMemo(
    () =>
      totalRows > rows.length &&
      rows.length > 0 &&
      rows[rows.length - 1].originalIndex < totalRows - 1,
    [totalRows, rows],
  );
  const trailingGapCount = useMemo(
    () =>
      hasTrailingGap && rows.length > 0
        ? totalRows - 1 - rows[rows.length - 1].originalIndex
        : 0,
    [hasTrailingGap, totalRows, rows],
  );

  const rowsWithGaps = useMemo(() => {
    const result: (IndexedRow | "gap" | "trailingGap")[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && rows[i].originalIndex - rows[i - 1].originalIndex > 1) {
        result.push("gap");
      }
      result.push(rows[i]);
    }
    if (hasTrailingGap) result.push("trailingGap");
    return result;
  }, [rows, hasTrailingGap]);

  const isNumericLike = useCallback((value: string) => {
    const s = value.trim();
    if (!s) return false;
    // Common number formats: 1,234.56 | (123) | -10% | 10.2 | 1 234,56
    return /^-?\(?\s*\d[\d\s,.'’]*\)?\s*%?$/.test(s);
  }, []);

  const padColumnIndices = useMemo(() => {
    // Heuristic: forward-fill columns that are mostly non-numeric and have many blanks in the data range.
    // This helps make hierarchical / merged-cell style sheets readable as a flat table.
    const indices: number[] = [];
    const sc = Math.max(0, startCol);
    const ec = Math.max(sc, endCol);
    for (let c = sc; c <= ec; c++) {
      let nonEmpty = 0;
      let empty = 0;
      let numericLike = 0;
      for (const r of rows) {
        const idx = r.originalIndex;
        if (idx === headerRow) continue;
        if (idx < dataStart || idx > dataEnd) continue;
        const cell = (r.data[c] ?? "").trim();
        if (!cell) {
          empty++;
        } else {
          nonEmpty++;
          if (isNumericLike(cell)) numericLike++;
        }
      }
      const total = nonEmpty + empty;
      if (total < 5) continue;
      const emptyRatio = empty / total;
      const numericRatio = nonEmpty > 0 ? numericLike / nonEmpty : 0;
      if (nonEmpty >= 2 && emptyRatio >= 0.25 && numericRatio <= 0.25) {
        indices.push(c);
      }
    }
    return indices;
  }, [rows, startCol, endCol, headerRow, dataStart, dataEnd, isNumericLike]);

  const paddedRowDataByOriginalIndex = useMemo(() => {
    if (padColumnIndices.length === 0) return new Map<number, string[]>();
    const map = new Map<number, string[]>();
    const lastSeen = new Map<number, string>();
    let lastOriginalIdx: number | null = null;

    for (const r of rows) {
      const idx = r.originalIndex;
      const isGap = lastOriginalIdx != null && idx - lastOriginalIdx > 1;
      if (isGap) lastSeen.clear();
      lastOriginalIdx = idx;

      const isHeader = idx === headerRow;
      const isIncluded = !isHeader && idx >= dataStart && idx <= dataEnd;
      if (!isIncluded) continue;

      const next = [...r.data];
      for (const c of padColumnIndices) {
        const raw = (next[c] ?? "").trim();
        if (raw) {
          lastSeen.set(c, next[c] ?? "");
        } else {
          const carry = lastSeen.get(c);
          if (carry != null && carry.trim() !== "") next[c] = carry;
        }
      }
      map.set(idx, next);
    }

    return map;
  }, [rows, padColumnIndices, headerRow, dataStart, dataEnd]);

  const skippedCount = useMemo(() => {
    if (!hasGap) return 0;
    for (let i = 1; i < rows.length; i++) {
      const diff = rows[i].originalIndex - rows[i - 1].originalIndex - 1;
      if (diff > 0) return diff;
    }
    return 0;
  }, [rows, hasGap]);

  const getRowClass = (gridRowIndex: number): string => {
    if (gridRowIndex === headerRow) return "";
    if (gridRowIndex < dataStart || gridRowIndex > dataEnd)
      return "bg-zinc-100 dark:bg-zinc-800/50 opacity-50";
    return "";
  };

  const isSelected = (originalIndex: number) => selectedRowIndex === originalIndex;

  const previewDescription = useMemo(() => {
    const rowDesc = dataRowCount > 0
      ? `${dataRowCount} data row${dataRowCount !== 1 ? "s" : ""}`
      : "No data rows";
    const colDesc = `${colCount} column${colCount !== 1 ? "s" : ""}`;
    const showing = hasGap
      ? ` Showing top & bottom rows (${skippedCount} rows hidden).`
      : totalRows > rows.length
        ? ` Showing first ${rows.length} of ${totalRows} total rows.`
        : "";
    return `${rowDesc} across ${colDesc}.${showing}`;
  }, [dataRowCount, colCount, hasGap, skippedCount, totalRows, rows.length]);

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rows3 className="h-4 w-4" />
              Data Preview
            </CardTitle>
            <CardDescription>{previewDescription}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings((s) => !s)}
          >
            <Settings2 className="mr-2 h-4 w-4" />
            Boundaries
            {showSettings ? (
              <ChevronUp className="ml-1 h-3 w-3" />
            ) : (
              <ChevronDown className="ml-1 h-3 w-3" />
            )}
          </Button>
        </div>
      </CardHeader>

      {slotAboveBoundary != null && (
        <CardContent className="border-t pt-4 pb-2">{slotAboveBoundary}</CardContent>
      )}

      {showSettings && (
        <CardContent className="border-t pt-4 pb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Rows3 className="h-3 w-3 text-blue-500" />
                Header Row
              </Label>
              <Input
                type="number"
                min={1}
                max={maxRowIdx + 1}
                value={draftHeaderRow}
                onKeyDown={(e) => handleArrowKey("headerRow", e)}
                onChange={(e) => handleDraftChange("headerRow", e.target.value)}
                className="h-10 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">1-indexed row number</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Rows3 className="h-3 w-3 text-green-500" />
                Data Start Row
              </Label>
              <Input
                type="number"
                min={1}
                max={maxRowIdx + 1}
                value={draftDataStart}
                onKeyDown={(e) => handleArrowKey("dataStart", e)}
                onChange={(e) => handleDraftChange("dataStart", e.target.value)}
                className="h-10 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">First data row</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Rows3 className="h-3 w-3 text-red-500" />
                Data End Row
              </Label>
              <Input
                type="number"
                min={1}
                max={totalRows}
                value={draftDataEnd}
                onKeyDown={(e) => handleArrowKey("dataEnd", e)}
                onChange={(e) => handleDraftChange("dataEnd", e.target.value)}
                className="h-10 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Last data row</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Columns3 className="h-3 w-3 text-violet-500" />
                Start Column
              </Label>
              <Input
                type="number"
                min={1}
                max={maxColIdx + 1}
                value={draftStartCol}
                onKeyDown={(e) => handleArrowKey("startCol", e)}
                onChange={(e) => handleDraftChange("startCol", e.target.value)}
                className="h-10 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">First column</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Columns3 className="h-3 w-3 text-violet-500" />
                End Column
              </Label>
              <Input
                type="number"
                min={1}
                max={totalColumns}
                value={draftEndCol}
                onKeyDown={(e) => handleArrowKey("endCol", e)}
                onChange={(e) => handleDraftChange("endCol", e.target.value)}
                className="h-10 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Last column</p>
            </div>
          </div>
        </CardContent>
      )}

      <CardContent className={showSettings ? "pt-0" : ""}>
        {totalRows > rows.length && rows.length > 0 && (
          <Alert variant="default" className="mb-3 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription>
              Only the first {rows.length} of {totalRows} rows are shown in this preview to keep loading fast. Your boundary settings and full data will still be used when you continue.
            </AlertDescription>
          </Alert>
        )}
        {slotAfterWarning != null && <div className="mb-3">{slotAfterWarning}</div>}
        <div
          ref={scrollContainerRef}
          className="rounded-md border overflow-auto max-w-full max-h-[400px]"
        >
          <div className="w-fit min-w-full">
          <div
            role="row"
            className="sticky top-0 z-10 grid w-full bg-background border-b border-border"
            style={{ gridTemplateColumns: `48px repeat(${colCount}, minmax(80px, 1fr))` }}
          >
              <div
                role="columnheader"
                className="text-center text-[10px] text-muted-foreground/60 font-mono py-2 px-1 w-12"
              >
                #
              </div>
              {columnLabels.map((label, i) => (
                <div
                  key={i}
                  role="columnheader"
                  className="text-xs whitespace-nowrap max-w-[200px] truncate text-muted-foreground/60 py-2 px-2"
                >
                  {label}
                </div>
              ))}
            </div>
            {rowsWithGaps.map((entry, idx) => {
              if (entry === "gap") {
                return (
                  <div
                    key={`gap-${idx}`}
                    role="row"
                    className="flex w-full items-center justify-start gap-2 border-y-2 border-dashed border-muted-foreground/20 bg-zinc-800/70 dark:bg-zinc-950/80 py-2 pl-3 text-xs text-white dark:text-zinc-100"
                  >
                    <MoreHorizontal className="h-3 w-3 shrink-0" />
                    {skippedCount} rows hidden
                    {onLoadMore && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2 h-7 text-xs text-black dark:text-white"
                        onClick={onLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Load more rows"
                        )}
                      </Button>
                    )}
                    <MoreHorizontal className="h-3 w-3 shrink-0" />
                  </div>
                );
              }
              if (entry === "trailingGap") {
                return (
                  <div
                    key="trailing-gap"
                    role="row"
                    className="flex w-full items-center justify-start gap-2 border-y-2 border-dashed border-muted-foreground/20 bg-zinc-800/70 dark:bg-zinc-950/80 py-2 pl-3 text-xs text-white dark:text-zinc-100"
                  >
                    <MoreHorizontal className="h-3 w-3 shrink-0" />
                    {trailingGapCount} more rows not shown
                    {onLoadMore && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2 h-7 text-xs text-black dark:text-white"
                        onClick={onLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>Load more rows ({trailingGapCount} remaining)</>
                        )}
                      </Button>
                    )}
                    <MoreHorizontal className="h-3 w-3 shrink-0" />
                  </div>
                );
              }
              const rowIdx = entry.originalIndex;
              const rowData = paddedRowDataByOriginalIndex.get(rowIdx) ?? entry.data;
              const isHeader = rowIdx === headerRow;
              const isOutside =
                !isHeader && (rowIdx < dataStart || rowIdx > dataEnd);
              return (
                <div
                  key={rowIdx}
                  role="row"
                  data-original-index={rowIdx}
                  className={`grid w-full border-b border-border/50 ${getRowClass(rowIdx)} cursor-pointer ${
                    isSelected(rowIdx)
                      ? "ring-2 ring-inset ring-primary bg-primary/10 dark:bg-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                  style={{ gridTemplateColumns: `48px repeat(${colCount}, minmax(80px, 1fr))` }}
                  onClick={() => setSelectedRowIndex(rowIdx)}
                >
                  <div
                    role="cell"
                    className="text-center text-[10px] text-muted-foreground/60 font-mono py-1.5 px-1"
                  >
                    {rowIdx + 1}
                  </div>
                  {rowData.slice(startCol, endCol + 1).map((cell, ci) => (
                    <div
                      key={ci}
                      role="cell"
                      className={`py-1.5 px-2 text-xs whitespace-nowrap max-w-[200px] truncate ${
                        isHeader
                          ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold"
                          : isOutside
                            ? "text-muted-foreground/40"
                            : ""
                      }`}
                      title={String(cell)}
                    >
                      {cell ||
                        (isHeader ? (
                          <span className="text-blue-400/40 italic">empty</span>
                        ) : (
                          ""
                        ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-200 dark:bg-blue-900" />
            Header row (blue cells)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-200 dark:bg-zinc-700" />
            Excluded rows
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white dark:bg-zinc-900 border" />
            Included data
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
