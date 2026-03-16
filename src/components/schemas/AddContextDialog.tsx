"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  BookOpen,
  CheckSquare,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Table2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SchemaContextType } from "@/lib/types";
import { getExcelSheetNames, extractExcelGrid } from "@/lib/parse-excel-preview";

type DialogStep =
  | "choose_type"
  | "text_form"
  | "lookup_choice"
  | "lookup_upload"
  | "lookup_datasource";

interface DataSourceEntry {
  id: string;
  name: string;
  type: string;
}

interface TableEntry {
  schema: string;
  name: string;
}

interface AddContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schemaId: string;
  folderId?: string | null;
  onContextAdded: () => void;
}

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const ACCEPT_STRING = ACCEPTED_EXTENSIONS.join(",");

function isAcceptedFile(file: File): boolean {
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export function AddContextDialog({
  open,
  onOpenChange,
  schemaId,
  folderId,
  onContextAdded,
}: AddContextDialogProps) {
  const [step, setStep] = useState<DialogStep>("choose_type");
  const [selectedType, setSelectedType] = useState<SchemaContextType | null>(null);

  // Shared
  const [contextName, setContextName] = useState("");
  const [saving, setSaving] = useState(false);

  // Text / Validation
  const [textContent, setTextContent] = useState("");
  const [optimizing, setOptimizing] = useState(false);

  // Upload lookup table
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBuffer, setUploadBuffer] = useState<ArrayBuffer | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetPreview, setSheetPreview] = useState<string[][]>([]);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lookup method choice
  const [lookupMethod, setLookupMethod] = useState<"upload" | "datasource" | null>(null);

  // Connect to existing data source
  const [dataSources, setDataSources] = useState<DataSourceEntry[]>([]);
  const [dataSourcesLoading, setDataSourcesLoading] = useState(false);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState("");
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableEntry | null>(null);

  const resetAll = useCallback(() => {
    setStep("choose_type");
    setSelectedType(null);
    setContextName("");
    setSaving(false);
    setTextContent("");
    setOptimizing(false);
    setUploadFile(null);
    setUploadBuffer(null);
    setSheetNames([]);
    setActiveSheetIndex(0);
    setSheetPreview([]);
    setSheetPreviewLoading(false);
    setDragging(false);
    dragCounter.current = 0;
    setLookupMethod(null);
    setDataSources([]);
    setDataSourcesLoading(false);
    setSelectedDataSourceId("");
    setTables([]);
    setTablesLoading(false);
    setSelectedTable(null);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) resetAll();
  };

  // --- Step handlers ---

  const handleConfirmType = () => {
    if (!selectedType) return;
    if (selectedType === "lookup_table") {
      setStep("lookup_choice");
    } else {
      setStep("text_form");
    }
  };

  const handleLookupNext = () => {
    if (!contextName.trim() || !lookupMethod) return;
    if (lookupMethod === "upload") {
      setStep("lookup_upload");
    } else {
      handleSwitchToDataSource();
    }
  };

  const handleOptimize = async () => {
    if (!textContent.trim() || optimizing) return;
    setOptimizing(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/contexts/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textContent }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to optimize");
      setTextContent(data.optimized);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to optimize");
    } finally {
      setOptimizing(false);
    }
  };

  const handleConfirmText = async () => {
    if (!contextName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/contexts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedType,
          name: contextName.trim(),
          content: textContent || null,
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add context");
      onContextAdded();
      handleOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add context");
    } finally {
      setSaving(false);
    }
  };

  // --- Upload lookup table ---

  const loadSheetPreview = useCallback(async (buffer: ArrayBuffer, index: number) => {
    setSheetPreviewLoading(true);
    try {
      const { grid } = await extractExcelGrid(buffer, 6, undefined, index);
      setSheetPreview(grid);
    } catch {
      setSheetPreview([]);
    } finally {
      setSheetPreviewLoading(false);
    }
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    setUploadFile(file);
    setUploadBuffer(null);
    setSheetNames([]);
    setActiveSheetIndex(0);
    setSheetPreview([]);

    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const isExcel = ext === "xlsx" || ext === "xls";

    if (isExcel) {
      try {
        const buffer = await file.arrayBuffer();
        setUploadBuffer(buffer);
        const names = await getExcelSheetNames(buffer);
        if (names && names.length > 1) {
          setSheetNames(names);
          setActiveSheetIndex(0);
          await loadSheetPreview(buffer, 0);
        } else if (names?.length === 1) {
          await loadSheetPreview(buffer, 0);
        }
      } catch {
        // proceed without sheet picker
      }
    } else if (ext === "csv") {
      try {
        const text = await file.text();
        const lines = text.split("\n").map((l) => l.split(",").map((c) => c.trim())).filter((r) => r.some((c) => c.length > 0));
        setSheetPreview(lines.slice(0, 6));
      } catch {
        setSheetPreview([]);
      }
    }
  }, [loadSheetPreview]);

  const handleSelectSheet = useCallback(async (index: number) => {
    if (!uploadBuffer) return;
    setActiveSheetIndex(index);
    await loadSheetPreview(uploadBuffer, index);
  }, [uploadBuffer, loadSheetPreview]);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isAcceptedFile(droppedFile)) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFileSelect(selected);
    e.target.value = "";
  }, [handleFileSelect]);

  const handleConfirmUpload = async () => {
    if (!uploadFile || !contextName.trim() || saving) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("file", uploadFile);
      formData.set("contextName", contextName.trim());
      formData.set("sheetIndex", String(activeSheetIndex));

      const uploadRes = await fetch(`/api/schemas/${schemaId}/contexts/upload-table`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Failed to upload table");

      const res = await fetch(`/api/schemas/${schemaId}/contexts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "lookup_table",
          name: contextName.trim(),
          dataSourceId: uploadData.dataSourceId,
          bqProject: uploadData.bqProject,
          bqDataset: uploadData.bqDataset,
          bqTable: uploadData.bqTable,
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add context");

      onContextAdded();
      handleOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload lookup table");
    } finally {
      setSaving(false);
    }
  };

  // --- Connect to existing data source ---

  const handleSwitchToDataSource = async () => {
    setStep("lookup_datasource");
    setDataSourcesLoading(true);
    try {
      const url = folderId
        ? `/api/data-sources?folderId=${folderId}`
        : "/api/data-sources";
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDataSources(data.dataSources ?? []);
      }
    } catch {
      setDataSources([]);
    } finally {
      setDataSourcesLoading(false);
    }
  };

  const handleSelectDataSource = async (dsId: string) => {
    setSelectedDataSourceId(dsId);
    setSelectedTable(null);
    setTablesLoading(true);
    try {
      const res = await fetch(`/api/data-sources/${dsId}/tables`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables ?? []);
      }
    } catch {
      setTables([]);
    } finally {
      setTablesLoading(false);
    }
  };

  const handleConfirmDataSource = async () => {
    if (!selectedTable || !contextName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/contexts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "lookup_table",
          name: contextName.trim(),
          dataSourceId: selectedDataSourceId,
          bqDataset: selectedTable.schema,
          bqTable: selectedTable.name,
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add context");
      onContextAdded();
      handleOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add context");
    } finally {
      setSaving(false);
    }
  };

  // --- Helpers ---

  const goBack = () => {
    if (step === "text_form") {
      setStep("choose_type");
      setSelectedType(null);
    } else if (step === "lookup_choice") {
      setStep("choose_type");
      setSelectedType(null);
    } else if (step === "lookup_upload" || step === "lookup_datasource") {
      setStep("lookup_choice");
      setUploadFile(null);
      setUploadBuffer(null);
      setSheetPreview([]);
      setSheetNames([]);
      setSelectedDataSourceId("");
      setTables([]);
      setSelectedTable(null);
    }
  };

  const isFullScreen = step === "lookup_datasource";
  const isExpanded = step === "lookup_upload" || step === "lookup_datasource";

  const hasMultipleSheets = sheetNames.length > 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "w-full transition-all duration-200",
          isFullScreen
            ? "max-w-[90vw] max-h-[85vh] h-[85vh]"
            : isExpanded
              ? "max-w-3xl max-h-[80vh]"
              : "max-w-xl",
        )}
      >
        {step === "choose_type" && (
          <>
            <DialogHeader>
              <DialogTitle>Add New Context</DialogTitle>
              <DialogDescription>
                Choose the type of context to add to this schema.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <button
                type="button"
                className={cn(
                  "h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left",
                  selectedType === "text_instructions"
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:bg-muted/50",
                )}
                onClick={() => setSelectedType("text_instructions")}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  <BookOpen className="h-4 w-4 shrink-0" />
                  Text Instructions
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Provide free-form text instructions for the AI agent.
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left",
                  selectedType === "validation"
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:bg-muted/50",
                )}
                onClick={() => setSelectedType("validation")}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  <CheckSquare className="h-4 w-4 shrink-0" />
                  Validation Rules
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Define validation rules and constraints for data processing.
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left",
                  selectedType === "lookup_table"
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:bg-muted/50",
                )}
                onClick={() => setSelectedType("lookup_table")}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  <Table2 className="h-4 w-4 shrink-0" />
                  Lookup Table
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Reference an external table for lookups and enrichment.
                </span>
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <Button onClick={handleConfirmType} disabled={!selectedType}>
                Confirm
              </Button>
            </div>
          </>
        )}

        {step === "text_form" && (
          <div className="flex flex-col gap-4">
            <div className="shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mb-2"
                onClick={goBack}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <DialogHeader>
                <DialogTitle>
                  {selectedType === "validation" ? "Add Validation Rules" : "Add Text Instructions"}
                </DialogTitle>
                <DialogDescription>
                  {selectedType === "validation"
                    ? "Define validation rules for the AI agent to enforce."
                    : "Provide instructions that the AI agent will follow."}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input
                placeholder="e.g. Country Code Rules"
                value={contextName}
                onChange={(e) => setContextName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {selectedType === "validation" ? "Validation Rules" : "Instructions"}
              </label>
              <Textarea
                placeholder={
                  selectedType === "validation"
                    ? "e.g. Amount must be > 0\nDate must be in YYYY-MM-DD format"
                    : "e.g. Use ISO country codes for the country field"
                }
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={6}
                disabled={optimizing}
                className={cn(optimizing && "opacity-60 cursor-not-allowed")}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOptimize}
                disabled={!textContent.trim() || optimizing}
              >
                {optimizing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5 text-violet-500" />
                )}
                Optimize
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmText}
                disabled={!contextName.trim() || saving}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Confirm
              </Button>
            </div>
          </div>
        )}

        {step === "lookup_choice" && (
          <>
            <div className="shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mb-2"
                onClick={goBack}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <DialogHeader>
                <DialogTitle>Add Lookup Table</DialogTitle>
                <DialogDescription>
                  Choose how to provide the lookup table data.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input
                placeholder="e.g. Country Codes"
                value={contextName}
                onChange={(e) => setContextName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3 py-2">
              <button
                type="button"
                className={cn(
                  "h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left",
                  lookupMethod === "upload"
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:bg-muted/50",
                )}
                onClick={() => setLookupMethod("upload")}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  <Upload className="h-4 w-4 shrink-0" />
                  Upload New Table
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Upload a CSV or Excel file to create a new lookup table in BigQuery.
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left",
                  lookupMethod === "datasource"
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:bg-muted/50",
                )}
                onClick={() => setLookupMethod("datasource")}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  <Database className="h-4 w-4 shrink-0" />
                  Connect to Existing Data Source
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Select a table from an already connected data source.
                </span>
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                onClick={handleLookupNext}
                disabled={!contextName.trim() || !lookupMethod}
              >
                Next
              </Button>
            </div>
          </>
        )}

        {step === "lookup_upload" && (
          <div className="flex flex-col h-full min-h-0 min-w-0 gap-4 overflow-hidden">
            <div className="shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mb-2"
                onClick={goBack}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <DialogHeader>
                <DialogTitle>Upload Lookup Table</DialogTitle>
                <DialogDescription>
                  Drop a CSV or Excel file below. The data will be uploaded to BigQuery as a lookup table.
                </DialogDescription>
              </DialogHeader>
            </div>

            {!contextName.trim() && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <Input
                  placeholder="e.g. Country Codes"
                  value={contextName}
                  onChange={(e) => setContextName(e.target.value)}
                />
              </div>
            )}

            {!uploadFile ? (
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors",
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50",
                )}
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
                <p className="text-sm font-medium">Drag and drop your file here</p>
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
                  Supports Excel (.xlsx, .xls) and CSV files
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 min-h-0 min-w-0 flex-1">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {uploadFile.size < 1024
                        ? `${uploadFile.size} B`
                        : uploadFile.size < 1024 * 1024
                          ? `${(uploadFile.size / 1024).toFixed(1)} KB`
                          : `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB`}
                      {hasMultipleSheets && <> &middot; {sheetNames.length} worksheets</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadFile(null);
                      setUploadBuffer(null);
                      setSheetPreview([]);
                      setSheetNames([]);
                    }}
                    disabled={saving}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {hasMultipleSheets && (
                  <div className="shrink-0">
                    <p className="text-sm font-medium mb-2">Select worksheet</p>
                    <div className="flex flex-wrap gap-2">
                      {sheetNames.map((name, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleSelectSheet(index)}
                          disabled={saving}
                          className={cn(
                            "rounded-md px-3 py-1.5 text-sm border transition-colors",
                            activeSheetIndex === index
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {name || `Worksheet ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sheetPreviewLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading preview…
                  </div>
                ) : sheetPreview.length > 0 ? (
                  <div className="rounded-md border overflow-auto max-h-[280px]">
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
                        {sheetPreview.slice(1, 6).map((row, rIdx) => (
                          <TableRow key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <TableCell key={cIdx} className="whitespace-nowrap max-w-[200px] truncate">
                                {cell}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex justify-end shrink-0">
              <Button
                onClick={handleConfirmUpload}
                disabled={!uploadFile || !contextName.trim() || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "lookup_datasource" && (
          <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 mb-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
                onClick={goBack}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>

            <DialogHeader className="shrink-0 pb-4">
              <DialogTitle>Connect to Existing Data Source</DialogTitle>
              <DialogDescription>
                Select a data source and table to use as a lookup table.
              </DialogDescription>
            </DialogHeader>

            {!contextName.trim() && (
              <div className="shrink-0 mb-4">
                <label className="text-xs text-muted-foreground mb-1 block">Context Name</label>
                <Input
                  placeholder="e.g. Country Codes"
                  value={contextName}
                  onChange={(e) => setContextName(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            )}

            {dataSourcesLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading data sources...
              </div>
            ) : dataSources.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No data sources configured.</p>
                  <p className="text-xs mt-1">Add a data source in the Data Sources page first.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 min-h-0 gap-4">
                <div className="w-[280px] shrink-0 flex flex-col gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Source</label>
                    <Select value={selectedDataSourceId} onValueChange={handleSelectDataSource}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a data source..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dataSources
                          .filter((ds) => ds.type === "bigquery")
                          .map((ds) => (
                            <SelectItem key={ds.id} value={ds.id}>
                              <span className="flex items-center gap-2">
                                <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                {ds.name}
                                <span className="text-xs text-muted-foreground">({ds.type})</span>
                              </span>
                            </SelectItem>
                          ))}
                        {dataSources.filter((ds) => ds.type !== "bigquery").map((ds) => (
                          <SelectItem key={ds.id} value={ds.id}>
                            <span className="flex items-center gap-2">
                              <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              {ds.name}
                              <span className="text-xs text-muted-foreground">({ds.type})</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedDataSourceId && (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <label className="text-sm font-medium mb-2 block">Tables</label>
                      {tablesLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading tables...
                        </div>
                      ) : tables.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No tables found.</p>
                      ) : (
                        <ScrollArea className="flex-1 min-h-0 rounded-md border">
                          <div className="p-1">
                            {tables.map((table) => {
                              const isSelected =
                                selectedTable?.schema === table.schema &&
                                selectedTable?.name === table.name;
                              return (
                                <button
                                  key={`${table.schema}.${table.name}`}
                                  type="button"
                                  className={cn(
                                    "flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-left transition-colors",
                                    isSelected
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-foreground hover:bg-muted",
                                  )}
                                  onClick={() => setSelectedTable(table)}
                                >
                                  <ChevronRight
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0 transition-transform",
                                      isSelected && "rotate-90",
                                    )}
                                  />
                                  <span className="truncate">
                                    {table.schema !== "public" && (
                                      <span className="text-muted-foreground">{table.schema}.</span>
                                    )}
                                    {table.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col min-h-0">
                  {selectedTable ? (
                    <div className="flex flex-col h-full">
                      <div className="mb-3">
                        <h3 className="text-base font-semibold">
                          {selectedTable.schema !== "public" && (
                            <span className="text-muted-foreground">{selectedTable.schema}.</span>
                          )}
                          {selectedTable.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Selected as lookup table
                        </p>
                      </div>
                      <div className="flex-1 min-h-0 rounded-md border bg-muted/10 flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                          <Table2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                          <p className="text-sm font-medium">
                            {selectedTable.schema}.{selectedTable.name}
                          </p>
                          <p className="text-xs mt-1">
                            This table will be linked as a lookup reference.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">
                          {selectedDataSourceId
                            ? "Select a table to use as lookup"
                            : "Select a data source to get started"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end shrink-0 pt-4 border-t">
              <Button
                onClick={handleConfirmDataSource}
                disabled={!selectedTable || !contextName.trim() || saving}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
