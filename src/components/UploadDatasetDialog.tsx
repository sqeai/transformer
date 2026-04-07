"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  useSchemaStore,
  type UploadedFileEntry,
  isUnstructuredExtension,
  getUnstructuredFileType,
} from "@/lib/schema-store";
import type { FinalSchema } from "@/lib/types";
import { FileSpreadsheet, FileText, Image, FileType, Loader2, Upload, X } from "lucide-react";
import { getExcelSheetNames } from "@/lib/parse-excel-preview";

export interface UploadDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, schema is fixed and selector is hidden (e.g. "Add to this dataset") */
  defaultSchemaId?: string;
  /** Optional schema preselection for "New Dataset" flow */
  initialSchemaId?: string;
  /** Optional dataset name for "Add to dataset" title */
  datasetName?: string;
  /** When set, only schemas belonging to this folder (and its subfolders) are shown */
  folderId?: string;
  onUpload: (schemaId: string, files: UploadedFileEntry[]) => void;
}

export function UploadDatasetDialog({
  open,
  onOpenChange,
  defaultSchemaId,
  initialSchemaId,
  datasetName,
  folderId,
  onUpload,
}: UploadDatasetDialogProps) {
  const { schemas: globalSchemas, schemasLoading: globalSchemasLoading } = useSchemaStore();
  const [folderSchemas, setFolderSchemas] = useState<FinalSchema[]>([]);
  const [folderSchemasLoading, setFolderSchemasLoading] = useState(false);

  useEffect(() => {
    if (!folderId || !open) return;
    setFolderSchemasLoading(true);
    fetch(`/api/schemas?folderId=${folderId}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { schemas: [] }))
      .then((data) => setFolderSchemas(Array.isArray(data?.schemas) ? data.schemas : []))
      .catch(() => setFolderSchemas([]))
      .finally(() => setFolderSchemasLoading(false));
  }, [folderId, open]);

  const schemas = folderId ? folderSchemas : globalSchemas;
  const schemasLoading = folderId ? folderSchemasLoading : globalSchemasLoading;

  const [selectedSchemaId, setSelectedSchemaId] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const schemaId = defaultSchemaId ?? selectedSchemaId;
  const isAddToDataset = Boolean(defaultSchemaId);

  useEffect(() => {
    if (open && !defaultSchemaId) {
      setSelectedSchemaId(initialSchemaId ?? "");
    }
  }, [open, defaultSchemaId, initialSchemaId]);

  const processFiles = useCallback(async (files: File[]) => {
    const totalStart = performance.now();
    console.log(`[processFiles] Starting to process ${files.length} file(s)`);

    setProcessingFiles(true);
    const entries: UploadedFileEntry[] = [];
    for (const file of files) {
      const fileStart = performance.now();
      const name = file.name.toLowerCase();
      console.log(`[processFiles] Processing file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

      try {
        const bufferStart = performance.now();
        const buffer = await file.arrayBuffer();
        console.log(`[processFiles] file.arrayBuffer(): ${(performance.now() - bufferStart).toFixed(2)}ms`);

        if (isUnstructuredExtension(name)) {
          const unstructuredType = getUnstructuredFileType(name)!;
          let extractedText: string | undefined;
          if (unstructuredType === "txt") {
            const decodeStart = performance.now();
            extractedText = new TextDecoder().decode(buffer);
            console.log(`[processFiles] TextDecoder for txt: ${(performance.now() - decodeStart).toFixed(2)}ms`);
          }
          entries.push({
            fileId: crypto.randomUUID(),
            fileName: file.name,
            buffer,
            worksheetNames: [file.name],
            unstructuredType,
            extractedText,
          });
          console.log(`[processFiles] Unstructured file processed: ${(performance.now() - fileStart).toFixed(2)}ms`);
        } else if (name.endsWith(".csv")) {
          entries.push({
            fileId: crypto.randomUUID(),
            fileName: file.name,
            buffer,
            worksheetNames: [file.name],
          });
          console.log(`[processFiles] CSV file processed: ${(performance.now() - fileStart).toFixed(2)}ms`);
        } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          const sheetNamesStart = performance.now();
          const worksheetNames = (await getExcelSheetNames(buffer)) ?? [file.name];
          console.log(`[processFiles] getExcelSheetNames(): ${(performance.now() - sheetNamesStart).toFixed(2)}ms (found ${worksheetNames.length} sheets)`);

          entries.push({
            fileId: crypto.randomUUID(),
            fileName: file.name,
            buffer,
            worksheetNames,
          });
          console.log(`[processFiles] Excel file processed: ${(performance.now() - fileStart).toFixed(2)}ms`);
        }
      } catch (err) {
        console.error(`[processFiles] Error processing ${file.name}:`, err);
        // skip unreadable files
      }
    }
    setUploadedFiles((prev) => [...prev, ...entries]);
    setProcessingFiles(false);

    console.log(`[processFiles] TOTAL TIME for ${files.length} file(s): ${(performance.now() - totalStart).toFixed(2)}ms`);
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
    if (!defaultSchemaId) setSelectedSchemaId(initialSchemaId ?? "");
    onOpenChange(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setUploadedFiles([]);
      if (!defaultSchemaId) setSelectedSchemaId(initialSchemaId ?? "");
      setUploading(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-full min-w-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate">
            {isAddToDataset && datasetName
              ? `Add to "${datasetName}"`
              : "New Dataset"}
          </DialogTitle>
          <DialogDescription>
            {isAddToDataset
              ? "Upload files to process and add to this dataset. Supports Excel, CSV, PDF, images, text, Word, and PowerPoint."
              : "Select a target schema and upload files to process. Supports Excel, CSV, PDF, images, text, Word, and PowerPoint."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0">
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
                accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.txt,.docx,.pptx"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Drag and drop files here, or{" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse
                </button>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports Excel (.xlsx, .xls), CSV (.csv), PDF, images (.png, .jpg), text (.txt), Word (.docx), and PowerPoint (.pptx).
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
                {uploadedFiles.map((f) => {
                  const FileIcon = f.unstructuredType
                    ? (f.unstructuredType === "png" || f.unstructuredType === "jpg" || f.unstructuredType === "jpeg"
                      ? Image
                      : f.unstructuredType === "txt"
                        ? FileText
                        : FileType)
                    : FileSpreadsheet;
                  return (
                  <div
                    key={f.fileId}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 min-w-0"
                  >
                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.fileName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {f.unstructuredType
                          ? f.unstructuredType.toUpperCase()
                          : `${f.worksheetNames.length} worksheet${f.worksheetNames.length !== 1 ? "s" : ""}`}
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
                  );
                })}
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
                    ? "Continue to file preview"
                    : "Upload"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
