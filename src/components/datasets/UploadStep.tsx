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
import { UnstructuredPreview } from "@/components/datasets/UnstructuredPreview";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  FileType,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileSelection, UploadedFileEntry } from "@/lib/schema-store";

interface PreviewState {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  visibleRows: number;
}

interface UploadStepProps {
  files: UploadedFileEntry[];
  selectedFiles: FileSelection[];
  expandedFiles: Set<string>;
  previewFile: FileSelection | null;
  preview: PreviewState | null;
  previewLoading: boolean;
  aiInstructions: Record<string, string>;
  onAiInstructionsChange: (fileKey: string, value: string) => void;
  onToggleFileExpand: (fileId: string) => void;
  onToggleFileSelection: (selection: FileSelection) => void;
  onToggleAllWorksheetsForFile: (fileId: string) => void;
  onPreviewFile: (selection: FileSelection) => void;
  onLoadMorePreview: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  isFileSelected: (fileId: string, worksheetIndex: number) => boolean;
}

export function UploadStep({
  files,
  selectedFiles,
  expandedFiles,
  previewFile,
  preview,
  previewLoading,
  aiInstructions,
  onAiInstructionsChange,
  onToggleFileExpand,
  onToggleFileSelection,
  onToggleAllWorksheetsForFile,
  onPreviewFile,
  onLoadMorePreview,
  onCancel,
  onSubmit,
  isFileSelected,
}: UploadStepProps) {
  const previewFileKey = previewFile ? `${previewFile.fileId}:${previewFile.worksheetIndex}` : "";
  const currentInstructions = previewFileKey ? (aiInstructions[previewFileKey] ?? "") : "";
  const [aiSectionOpen, setAiSectionOpen] = useState(currentInstructions.length > 0);

  useEffect(() => {
    setAiSectionOpen(currentInstructions.length > 0);
  }, [previewFileKey]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-3 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={selectedFiles.length === 0}>
          Next: Process {selectedFiles.length} file
          {selectedFiles.length !== 1 ? "s" : ""}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Files</CardTitle>
          <CardDescription>Select files to process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {files.map((file) => {
              const allSelected =
                file.worksheetNames.length > 0 &&
                file.worksheetNames.every((_, idx) =>
                  isFileSelected(file.fileId, idx),
                );
              const someSelected = file.worksheetNames.some((_, idx) =>
                isFileSelected(file.fileId, idx),
              );

              const FileIcon = file.unstructuredType
                ? (file.unstructuredType === "png" || file.unstructuredType === "jpg" || file.unstructuredType === "jpeg"
                  ? ImageIcon
                  : file.unstructuredType === "txt"
                    ? FileText
                    : FileType)
                : FileSpreadsheet;
              const isUnstructured = Boolean(file.unstructuredType);

              return (
                <div key={file.fileId}>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted">
                    {!isUnstructured && file.worksheetNames.length > 1 && (
                      <button
                        type="button"
                        className="flex items-center justify-center shrink-0"
                        onClick={() => onToggleFileExpand(file.fileId)}
                      >
                        {expandedFiles.has(file.fileId) ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>
                    )}
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el)
                          el.indeterminate = !allSelected && someSelected;
                      }}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleAllWorksheetsForFile(file.fileId);
                      }}
                      className="rounded"
                    />
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 text-sm text-left min-w-0"
                      onClick={() => {
                        if (isUnstructured || file.worksheetNames.length <= 1) {
                          onToggleAllWorksheetsForFile(file.fileId);
                          const selection: FileSelection = {
                            fileId: file.fileId,
                            fileName: file.fileName,
                            worksheetIndex: 0,
                            worksheetName: file.worksheetNames[0] ?? file.fileName,
                          };
                          onPreviewFile(selection);
                        } else {
                          onToggleFileExpand(file.fileId);
                        }
                      }}
                    >
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">
                        {file.fileName}
                      </span>
                      {isUnstructured && (
                        <span className="ml-auto text-xs text-muted-foreground uppercase">
                          {file.unstructuredType}
                        </span>
                      )}
                    </button>
                  </div>
                  {expandedFiles.has(file.fileId) && file.worksheetNames.length > 1 && (
                    <div className="ml-6 space-y-0.5">
                      {file.worksheetNames.map((name, idx) => {
                        const selected = isFileSelected(file.fileId, idx);
                        const selection: FileSelection = {
                          fileId: file.fileId,
                          fileName: file.fileName,
                          worksheetIndex: idx,
                          worksheetName: name,
                        };
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1 rounded text-sm",
                              selected ? "bg-primary/10" : "hover:bg-muted",
                              previewFile?.fileId === file.fileId &&
                                previewFile?.worksheetIndex === idx &&
                                "ring-1 ring-primary",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => onToggleFileSelection(selection)}
                              className="rounded"
                            />
                            <span className="flex-1 truncate">
                              {name || `Worksheet ${idx + 1}`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => onPreviewFile(selection)}
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
            {previewFile
              ? `${previewFile.fileName} / ${previewFile.worksheetName}`
              : "Select a file to preview"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewFile && (
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
                    onChange={(e) => onAiInstructionsChange(previewFileKey, e.target.value)}
                    rows={3}
                    className="resize-y text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Instructions for this file will be passed to the AI agent as a high-priority directive.
                  </p>
                </div>
              )}
            </div>
          )}

          {(() => {
            const currentFile = previewFile
              ? files.find((f) => f.fileId === previewFile.fileId)
              : null;
            if (currentFile?.unstructuredType) {
              return <UnstructuredPreview file={currentFile} />;
            }
            if (preview) {
              return (
                <DataTable
                  columns={preview.columns}
                  rows={preview.rows}
                  totalRows={preview.totalRows}
                  loading={previewLoading}
                  loadingMessage="Loading preview..."
                  emptyMessage="Click a file on the left to preview its contents."
                  onLoadMore={onLoadMorePreview}
                  loadMoreDisabled={previewLoading}
                />
              );
            }
            if (previewLoading) {
              return (
                <DataTable
                  columns={[]}
                  rows={[]}
                  loading
                  loadingMessage="Loading preview..."
                />
              );
            }
            return (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                Click a file on the left to preview its contents.
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
