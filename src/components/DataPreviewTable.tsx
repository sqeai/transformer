"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Columns3, Rows3, Settings2, ChevronDown, ChevronUp } from "lucide-react";

export interface DataBoundary {
  headerRowIndex: number;
  dataStartRowIndex: number;
  dataEndRowIndex: number;
  startColumn: number;
  endColumn: number;
}

interface DataPreviewTableProps {
  grid: string[][];
  totalRows: number;
  totalColumns: number;
  initialBoundary?: Partial<DataBoundary>;
  onBoundaryChange: (boundary: DataBoundary) => void;
}

export default function DataPreviewTable({
  grid,
  totalRows,
  totalColumns,
  initialBoundary,
  onBoundaryChange,
}: DataPreviewTableProps) {
  const maxRowIdx = Math.max(0, totalRows - 1);
  const maxColIdx = Math.max(0, totalColumns - 1);

  const [headerRow, setHeaderRow] = useState(initialBoundary?.headerRowIndex ?? 0);
  const [dataStart, setDataStart] = useState(initialBoundary?.dataStartRowIndex ?? 1);
  const [dataEnd, setDataEnd] = useState(initialBoundary?.dataEndRowIndex ?? maxRowIdx);
  const [startCol, setStartCol] = useState(initialBoundary?.startColumn ?? 0);
  const [endCol, setEndCol] = useState(initialBoundary?.endColumn ?? maxColIdx);
  const [showSettings, setShowSettings] = useState(false);

  const [draftHeaderRow, setDraftHeaderRow] = useState(String(headerRow + 1));
  const [draftDataStart, setDraftDataStart] = useState(String(dataStart + 1));
  const [draftDataEnd, setDraftDataEnd] = useState(String(dataEnd + 1));
  const [draftStartCol, setDraftStartCol] = useState(String(startCol + 1));
  const [draftEndCol, setDraftEndCol] = useState(String(endCol + 1));

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
      debounceRef.current = setTimeout(() => commitBoundary(field, raw), DEBOUNCE_MS);
    },
    [commitBoundary],
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const headerCells = useMemo(() => {
    const row = grid[headerRow];
    if (!row) return [];
    return row.slice(startCol, endCol + 1);
  }, [grid, headerRow, startCol, endCol]);

  const previewRows = useMemo(() => {
    const visibleStart = Math.min(dataStart, grid.length);
    const visibleEnd = Math.min(dataEnd + 1, grid.length);
    return grid.slice(visibleStart, visibleEnd).map((row) => row.slice(startCol, endCol + 1));
  }, [grid, dataStart, dataEnd, startCol, endCol]);

  const dataRowCount = Math.min(dataEnd, maxRowIdx) - dataStart + 1;
  const colCount = endCol - startCol + 1;

  const getRowClass = (gridRowIndex: number): string => {
    if (gridRowIndex === headerRow) return "bg-blue-100 dark:bg-blue-950/40";
    if (gridRowIndex < dataStart || gridRowIndex > dataEnd)
      return "bg-zinc-100 dark:bg-zinc-800/50 opacity-50";
    return "";
  };

  return (
    <Card className="min-w-0 overflow-hidden min-h-1000">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rows3 className="h-4 w-4" />
              Data Preview
            </CardTitle>
            <CardDescription>
              {dataRowCount > 0 ? `${dataRowCount} data row${dataRowCount !== 1 ? "s" : ""}` : "No data rows"} across {colCount} column{colCount !== 1 ? "s" : ""}.
              {totalRows > grid.length && ` Showing first ${grid.length} of ${totalRows} total rows.`}
            </CardDescription>
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
                onChange={(e) => handleDraftChange("headerRow", e.target.value)}
                className="h-8 text-sm"
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
                onChange={(e) => handleDraftChange("dataStart", e.target.value)}
                className="h-8 text-sm"
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
                onChange={(e) => handleDraftChange("dataEnd", e.target.value)}
                className="h-8 text-sm"
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
                onChange={(e) => handleDraftChange("startCol", e.target.value)}
                className="h-8 text-sm"
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
                onChange={(e) => handleDraftChange("endCol", e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Last column</p>
            </div>
          </div>
        </CardContent>
      )}

      <CardContent className={showSettings ? "pt-0" : ""}>
        <div className="rounded-md border overflow-auto max-h-[420px] max-w-full">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-12 text-center text-[10px] text-muted-foreground/60 font-mono">
                  #
                </TableHead>
                {headerCells.map((cell, i) => (
                  <TableHead
                    key={i}
                    className="text-xs whitespace-nowrap max-w-[200px] truncate"
                    title={cell}
                  >
                    {cell || <span className="text-muted-foreground/40 italic">empty</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grid.map((row, gridIdx) => {
                const isHeader = gridIdx === headerRow;
                const isOutside = gridIdx < dataStart || gridIdx > dataEnd;
                if (isHeader) return null;

                return (
                  <TableRow
                    key={gridIdx}
                    className={getRowClass(gridIdx)}
                  >
                    <TableCell className="text-center text-[10px] text-muted-foreground/60 font-mono py-1.5">
                      {gridIdx + 1}
                    </TableCell>
                    {row.slice(startCol, endCol + 1).map((cell, ci) => (
                      <TableCell
                        key={ci}
                        className={`py-1.5 text-xs whitespace-nowrap max-w-[200px] truncate ${
                          isOutside ? "text-muted-foreground/40" : ""
                        }`}
                        title={String(cell)}
                      >
                        {cell || ""}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-200 dark:bg-blue-900" />
            Header row
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
