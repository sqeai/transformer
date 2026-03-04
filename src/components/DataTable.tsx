"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows?: number;
  maxHeight?: string;
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  onLoadMore?: () => void;
  loadMoreDisabled?: boolean;
}

export function DataTable({
  columns,
  rows,
  totalRows,
  maxHeight = "700px",
  loading,
  loadingMessage = "Loading...",
  emptyMessage = "No data available.",
  onLoadMore,
  loadMoreDisabled,
}: DataTableProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {loadingMessage}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-4">{emptyMessage}</p>
    );
  }

  const total = totalRows ?? rows.length;
  const showLoadMore = onLoadMore && rows.length < total;

  return (
    <div className="space-y-3">
      <div
        className="w-full rounded-md border overflow-auto"
        style={{ maxHeight }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 whitespace-nowrap bg-background">
                #
              </TableHead>
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="whitespace-nowrap bg-background"
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                {columns.map((col) => (
                  <TableCell
                    key={col}
                    className="whitespace-nowrap max-w-[200px] truncate"
                  >
                    {String(row[col] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showLoadMore && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground text-center">
            Showing {rows.length} of {total} rows
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loadMoreDisabled}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
