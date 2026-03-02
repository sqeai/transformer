"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchemaStore, type UploadedFileEntry } from "@/lib/schema-store";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { getExcelSheetNames } from "@/lib/parse-excel-preview";

export interface UploadDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, schema is fixed and selector is hidden (e.g. "Add to this dataset") */
  defaultSchemaId?: string;
  /** Optional dataset name for "Add to dataset" title */
  datasetName?: string;
  onUpload: (schemaId: string, files: UploadedFileEntry[]) => void;
}

export function UploadDatasetDialog({
  open,
  onOpenChange,
  defaultSchemaId,
  datasetName,
  onUpload,
}: UploadDatasetDialogProps) {
  const { schemas, schemasLoading } = useSchemaStore();
  const [selectedSchemaId, setSelectedSchemaId] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const schemaId = defaultSchemaId ?? selectedSchemaId;
  const isAddToDataset = Boolean(defaultSchemaId);

  const processFiles = useCallback(async (files: File[]) => {
    setProcessingFiles(true);
    const entries: UploadedFileEntry[] = [];
    for (const file of files) {
      const ext = file.name.toLowerCase();
      if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) continue;
      try {
        const buffer = await file.arrayBuffer();
        const sheetNames = (await getExcelSheetNames(buffer)) ?? [file.name];
        entries.push({
          fileId: crypto.randomUUID(),
          fileName: file.name,
          buffer,
          sheetNames,
        });
      } catch {
        // skip unreadable files
      }
    }
    setUploadedFiles((prev) => [...prev, ...entries]);
    setProcessingFiles(false);
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) void processFiles(files);
    },
    [processFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) void processFiles(files);
      e.target.value = "";
    },
    [processFiles],
  );

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.fileId !== fileId));
  };

  const handleUpload = () => {
    if (!schemaId || uploadedFiles.length === 0) return;
    setUploading(true);
    onUpload(schemaId, uploadedFiles);
    setUploading(false);
    setUploadedFiles([]);
    if (!defaultSchemaId) setSelectedSchemaId("");
    onOpenChange(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setUploadedFiles([]);
      if (!defaultSchemaId) setSelectedSchemaId("");
      setUploading(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>
            {isAddToDataset && datasetName
              ? `Add to "${datasetName}"`
              : "New Dataset"}
          </DialogTitle>
          <DialogDescription>
            {isAddToDataset
              ? "Upload Excel files to process and add to this dataset."
              : "Select a target schema and upload Excel files to process."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!defaultSchemaId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Schema</label>
              <Select value={selectedSchemaId} onValueChange={setSelectedSchemaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a schema..." />
                </SelectTrigger>
                <SelectContent>
                  {schemasLoading ? (
                    <SelectItem value="__loading" disabled>
                      Loading...
                    </SelectItem>
                  ) : schemas.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No schemas available
                    </SelectItem>
                  ) : (
                    schemas.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Upload Files</label>
            <div
              className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Drag and drop Excel files here, or{" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse
                </button>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .xlsx and .xls files. Multiple files allowed.
              </p>
            </div>
          </div>

          {processingFiles && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing files...
            </div>
          )}

          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""}{" "}
                ready
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {uploadedFiles.map((f) => (
                  <div
                    key={f.fileId}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.sheetNames.length} sheet
                        {f.sheetNames.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeFile(f.fileId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={
                !schemaId ||
                uploadedFiles.length === 0 ||
                processingFiles ||
                uploading
              }
            >
              {processingFiles || uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {processingFiles
                ? "Processing files..."
                : uploading
                  ? "Uploading..."
                  : isAddToDataset
                    ? "Continue to sheet preview"
                    : "Upload"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
