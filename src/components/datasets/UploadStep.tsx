"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/DataTable";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SheetSelection, UploadedFileEntry } from "@/lib/schema-store";

interface PreviewState {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  visibleRows: number;
}

interface UploadStepProps {
  files: UploadedFileEntry[];
  selectedSheets: SheetSelection[];
  expandedFiles: Set<string>;
  previewSheet: SheetSelection | null;
  preview: PreviewState | null;
  previewLoading: boolean;
  aiInstructions: Record<string, string>;
  onAiInstructionsChange: (sheetKey: string, value: string) => void;
  onToggleFile: (fileId: string) => void;
  onToggleSheet: (sheet: SheetSelection) => void;
  onToggleAllSheetsForFile: (fileId: string) => void;
  onPreviewSheet: (sheet: SheetSelection) => void;
  onLoadMorePreview: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  isSheetSelected: (fileId: string, sheetIndex: number) => boolean;
}

export function UploadStep({
  files,
  selectedSheets,
  expandedFiles,
  previewSheet,
  preview,
  previewLoading,
  aiInstructions,
  onAiInstructionsChange,
  onToggleFile,
  onToggleSheet,
  onToggleAllSheetsForFile,
  onPreviewSheet,
  onLoadMorePreview,
  onCancel,
  onSubmit,
  isSheetSelected,
}: UploadStepProps) {
  const previewSheetKey = previewSheet ? `${previewSheet.fileId}:${previewSheet.sheetIndex}` : "";
  const currentInstructions = previewSheetKey ? (aiInstructions[previewSheetKey] ?? "") : "";
  const [aiSectionOpen, setAiSectionOpen] = useState(currentInstructions.length > 0);

  useEffect(() => {
    setAiSectionOpen(currentInstructions.length > 0);
  }, [previewSheetKey]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-3 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={selectedSheets.length === 0}>
          Next: Process {selectedSheets.length} sheet
          {selectedSheets.length !== 1 ? "s" : ""}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Files & Sheets</CardTitle>
          <CardDescription>Select sheets to process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {files.map((file) => {
              const allSelected =
                file.sheetNames.length > 0 &&
                file.sheetNames.every((_, idx) =>
                  isSheetSelected(file.fileId, idx),
                );
              const someSelected = file.sheetNames.some((_, idx) =>
                isSheetSelected(file.fileId, idx),
              );

              return (
                <div key={file.fileId}>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted">
                    <button
                      type="button"
                      className="flex items-center justify-center shrink-0"
                      onClick={() => onToggleFile(file.fileId)}
                    >
                      {expandedFiles.has(file.fileId) ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el)
                          el.indeterminate = !allSelected && someSelected;
                      }}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleAllSheetsForFile(file.fileId);
                      }}
                      className="rounded"
                    />
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 text-sm text-left min-w-0"
                      onClick={() => onToggleFile(file.fileId)}
                    >
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">
                        {file.fileName}
                      </span>
                    </button>
                  </div>
                  {expandedFiles.has(file.fileId) && (
                    <div className="ml-6 space-y-0.5">
                      {file.sheetNames.map((name, idx) => {
                        const selected = isSheetSelected(file.fileId, idx);
                        const sheet: SheetSelection = {
                          fileId: file.fileId,
                          fileName: file.fileName,
                          sheetIndex: idx,
                          sheetName: name,
                        };
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1 rounded text-sm",
                              selected ? "bg-primary/10" : "hover:bg-muted",
                              previewSheet?.fileId === file.fileId &&
                                previewSheet?.sheetIndex === idx &&
                                "ring-1 ring-primary",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => onToggleSheet(sheet)}
                              className="rounded"
                            />
                            <span className="flex-1 truncate">
                              {name || `Sheet ${idx + 1}`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => onPreviewSheet(sheet)}
                            >
                              Preview
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {files.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No files uploaded. Go back and add files.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Preview</CardTitle>
          <CardDescription>
            {previewSheet
              ? `${previewSheet.fileName} / ${previewSheet.sheetName}`
              : "Select a sheet to preview"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewSheet && (
            <div className="rounded-md border p-3 space-y-2">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setAiSectionOpen((prev) => !prev)}
              >
                {aiSectionOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <Sparkles className="h-4 w-4 shrink-0 text-purple-500" />
                <span className="text-sm font-medium">AI Instructions</span>
                <span className="text-xs text-muted-foreground ml-auto">Optional</span>
              </button>
              {aiSectionOpen && (
                <div className="space-y-1.5 pt-1">
                  <Textarea
                    placeholder="e.g. Only include rows where the status is 'active'. Amounts should be in USD..."
                    value={currentInstructions}
                    onChange={(e) => onAiInstructionsChange(previewSheetKey, e.target.value)}
                    rows={3}
                    className="resize-y text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Instructions for this sheet will be passed to the AI agent as a high-priority directive.
                  </p>
                </div>
              )}
            </div>
          )}

          {preview ? (
            <DataTable
              columns={preview.columns}
              rows={preview.rows}
              totalRows={preview.totalRows}
              loading={previewLoading}
              loadingMessage="Loading preview..."
              emptyMessage="Click a sheet on the left to preview its contents."
              onLoadMore={onLoadMorePreview}
              loadMoreDisabled={previewLoading}
            />
          ) : previewLoading ? (
            <DataTable
              columns={[]}
              rows={[]}
              loading
              loadingMessage="Loading preview..."
            />
          ) : (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              Click a sheet on the left to preview its contents.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
