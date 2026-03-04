"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

interface SheetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string | null;
  sheetNames: string[];
  activeSheetIndex: number;
  onSelectSheet: (index: number) => void;
  sheetPreview: string[][];
  sheetPreviewLoading: boolean;
  uploading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SheetPickerDialog({
  open,
  onOpenChange,
  fileName,
  sheetNames,
  activeSheetIndex,
  onSelectSheet,
  sheetPreview,
  sheetPreviewLoading,
  uploading,
  onConfirm,
  onCancel,
}: SheetPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[90vw] max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Select sheet for schema</DialogTitle>
          <DialogDescription>
            Choose which worksheet&apos;s header row should be used to build
            your final schema.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex-1 min-h-0 overflow-auto space-y-3">
          {fileName && (
            <p className="text-sm text-muted-foreground">
              File: <span className="font-medium">{fileName}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-b pb-2">
            {sheetNames.map((name, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onSelectSheet(index)}
                className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                  activeSheetIndex === index
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {name || `Sheet ${index + 1}`}
              </button>
            ))}
          </div>
          <div className="min-h-[120px]">
            {sheetPreviewLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading preview…
              </div>
            ) : sheetPreview.length > 0 ? (
              <div className="rounded-md border overflow-auto max-w-full max-h-[400px]">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      {sheetPreview[0].map((cell, idx) => (
                        <TableHead key={idx} className="whitespace-nowrap">
                          {cell || `Column ${idx + 1}`}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheetPreview.slice(1, 5).map((row, rIdx) => (
                      <TableRow key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <TableCell
                            key={cIdx}
                            className="whitespace-nowrap max-w-[160px] truncate"
                          >
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No preview available for this sheet.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pb-1">
            <Button variant="outline" onClick={onCancel} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating schema…
                </>
              ) : (
                "Use this sheet"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
