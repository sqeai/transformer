"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
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
import {
  FileSpreadsheet,
  FileText,
  FileImage,
  File as FileIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";

const ACCEPTED_EXTENSIONS = [
  ".xlsx",
  ".xls",
  ".csv",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".docx",
  ".pptx",
];

const ACCEPT_STRING = ACCEPTED_EXTENSIONS.join(",");

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

function isAcceptedFile(file: File): boolean {
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function getFileExt(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function getFileIcon(file: File) {
  const ext = getFileExt(file);
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return FileSpreadsheet;
  if (IMAGE_EXTENSIONS.has(ext)) return FileImage;
  if (["pdf", "docx", "pptx", "txt"].includes(ext)) return FileText;
  return FileIcon;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FilePreview =
  | { type: "image"; url: string }
  | { type: "pdf"; url: string }
  | { type: "text"; content: string }
  | { type: "csv"; headers: string[]; rows: string[][] }
  | { type: "none"; label: string }
  | null;

function parseCsvNaive(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => line.split(",").map((cell) => cell.trim()))
    .filter((row) => row.some((c) => c.length > 0));
}

interface UploadSchemaPanelProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onRemoveFile: () => void;
  sheetNames: string[];
  activeSheetIndex: number;
  onSelectSheet: (index: number) => void;
  sheetPreview: string[][];
  sheetPreviewLoading: boolean;
  uploading: boolean;
  onCreateSchema: () => void;
}

export function UploadSchemaPanel({
  file,
  onFileSelect,
  onRemoveFile,
  sheetNames,
  activeSheetIndex,
  onSelectSheet,
  sheetPreview,
  sheetPreviewLoading,
  uploading,
  onCreateSchema,
}: UploadSchemaPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const [preview, setPreview] = useState<FilePreview>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    const ext = getFileExt(file);
    const isExcelFile = ext === "xlsx" || ext === "xls";
    if (isExcelFile) {
      setPreview(null);
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;

    async function buildPreview() {
      setPreviewLoading(true);
      try {
        if (IMAGE_EXTENSIONS.has(ext)) {
          objectUrl = URL.createObjectURL(file!);
          if (!revoked) setPreview({ type: "image", url: objectUrl });
        } else if (ext === "pdf") {
          objectUrl = URL.createObjectURL(file!);
          if (!revoked) setPreview({ type: "pdf", url: objectUrl });
        } else if (ext === "txt") {
          const text = await file!.text();
          if (!revoked) setPreview({ type: "text", content: text });
        } else if (ext === "csv") {
          const text = await file!.text();
          const rows = parseCsvNaive(text);
          const headers = rows[0] ?? [];
          if (!revoked) setPreview({ type: "csv", headers, rows: rows.slice(1) });
        } else if (ext === "docx") {
          if (!revoked) setPreview({ type: "none", label: "Word document — contents will be extracted by AI." });
        } else if (ext === "pptx") {
          if (!revoked) setPreview({ type: "none", label: "PowerPoint presentation — contents will be extracted by AI." });
        } else {
          if (!revoked) setPreview({ type: "none", label: "File contents will be analyzed by AI to extract schema fields." });
        }
      } catch {
        if (!revoked) setPreview({ type: "none", label: "Could not generate preview." });
      } finally {
        if (!revoked) setPreviewLoading(false);
      }
    }

    void buildPreview();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      dragCounter.current = 0;
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && isAcceptedFile(droppedFile)) {
        onFileSelect(droppedFile);
      }
    },
    [onFileSelect],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) onFileSelect(selected);
      e.target.value = "";
    },
    [onFileSelect],
  );

  const hasMultipleSheets = sheetNames.length > 1;
  const isExcel = file
    ? ["xlsx", "xls"].includes(file.name.split(".").pop()?.toLowerCase() ?? "")
    : false;
  const Icon = file ? getFileIcon(file) : Upload;

  return (
    <>
      <DialogHeader className="shrink-0 pb-4">
        <DialogTitle>Upload from existing file</DialogTitle>
        <DialogDescription>
          Drop a file below to extract its headers into a schema. Excel files
          with multiple sheets will show a preview to choose from.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {!file ? (
          <div
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_STRING}
              className="hidden"
              onChange={handleFileInput}
            />
            <Upload className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm font-medium">
              Drag and drop your file here
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => fileInputRef.current?.click()}
              >
                browse
              </button>{" "}
              to select a file
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Supports Excel, CSV, PDF, images, Word, PowerPoint, and text
              files
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 min-h-0 flex-1">
            {/* File info bar */}
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                  {isExcel && hasMultipleSheets && (
                    <> &middot; {sheetNames.length} worksheets</>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onRemoveFile}
                disabled={uploading}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sheet picker + preview for Excel with multiple sheets */}
            {isExcel && hasMultipleSheets && (
              <div className="flex flex-col gap-3 min-h-0 flex-1">
                <div className="shrink-0">
                  <p className="text-sm font-medium mb-2">Select worksheet</p>
                  <div className="flex flex-wrap gap-2">
                    {sheetNames.map((name, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => onSelectSheet(index)}
                        disabled={uploading}
                        className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                          activeSheetIndex === index
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {name || `Worksheet ${index + 1}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {sheetPreviewLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading preview…
                    </div>
                  ) : sheetPreview.length > 0 ? (
                    <div className="rounded-md border overflow-auto max-h-[320px]">
                      <Table className="min-w-max">
                        <TableHeader>
                          <TableRow>
                            {sheetPreview[0].map((cell, idx) => (
                              <TableHead
                                key={idx}
                                className="whitespace-nowrap"
                              >
                                {cell || `Column ${idx + 1}`}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sheetPreview.slice(1, 6).map((row, rIdx) => (
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
                    <p className="text-sm text-muted-foreground py-4">
                      No preview available for this worksheet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Preview for single-sheet Excel */}
            {isExcel && !hasMultipleSheets && (
              <div className="flex items-center justify-center rounded-lg border border-dashed bg-muted/20 py-8 text-sm text-muted-foreground">
                Single worksheet detected — headers will be extracted
                automatically.
              </div>
            )}

            {/* Rich preview for non-Excel files */}
            {!isExcel && (
              <div className="min-h-0 flex-1 overflow-auto">
                {previewLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading preview…
                  </div>
                ) : preview?.type === "image" ? (
                  <div className="rounded-lg border bg-muted/10 p-4 flex items-center justify-center">
                    <img
                      src={preview.url}
                      alt={file.name}
                      className="max-h-[360px] max-w-full rounded object-contain"
                    />
                  </div>
                ) : preview?.type === "pdf" ? (
                  <div className="rounded-lg border overflow-hidden" style={{ height: 400 }}>
                    <iframe
                      src={preview.url}
                      title={file.name}
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : preview?.type === "text" ? (
                  <div className="rounded-lg border bg-muted/10 overflow-auto max-h-[360px]">
                    <pre className="p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap break-words text-foreground/80">
                      {preview.content.length > 5000
                        ? preview.content.slice(0, 5000) + "\n\n… (truncated)"
                        : preview.content}
                    </pre>
                  </div>
                ) : preview?.type === "csv" ? (
                  <div className="rounded-md border overflow-auto max-h-[360px]">
                    <Table className="min-w-max">
                      <TableHeader>
                        <TableRow>
                          {preview.headers.map((h, idx) => (
                            <TableHead
                              key={idx}
                              className="whitespace-nowrap"
                            >
                              {h || `Column ${idx + 1}`}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.slice(0, 10).map((row, rIdx) => (
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
                    {preview.rows.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center py-2 border-t">
                        Showing 10 of {preview.rows.length} rows
                      </p>
                    )}
                  </div>
                ) : preview?.type === "none" ? (
                  <div className="flex items-center justify-center rounded-lg border border-dashed bg-muted/20 py-8 text-sm text-muted-foreground">
                    {preview.label}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end shrink-0">
          <Button onClick={onCreateSchema} disabled={!file || uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating schema…
              </>
            ) : (
              "Create Schema"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
