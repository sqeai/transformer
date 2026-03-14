"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LookupTable } from "@/lib/types";
import { toast } from "sonner";
import { parseExcelToRows } from "@/lib/parse-excel";
import { getExcelSheetNames } from "@/lib/parse-excel-preview";
import { parseCsvContent } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LookupTablesEditorProps {
  schemaId: string;
  lookupTables: LookupTable[];
  onLookupTablesChange: (tables: LookupTable[]) => void;
  readOnly?: boolean;
}

type DialogStep = "upload" | "columns" | "preview";

interface ParsedSheetData {
  columns: string[];
  rows: Record<string, string>[];
}

interface UploadedFile {
  fileName: string;
  buffer: ArrayBuffer;
  sheetNames: string[];
  isCsv: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREVIEW_ROW_LIMIT = 50;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LookupTablesEditor({
  schemaId,
  lookupTables,
  onLookupTablesChange,
  readOnly = false,
}: LookupTablesEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);

  // --- Dialog state ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("upload");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");

  // Upload step
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Parsed data (after sheet selection)
  const [parsedData, setParsedData] = useState<ParsedSheetData | null>(null);

  // Column assignment step
  const [columnRoles, setColumnRoles] = useState<Record<string, "dimension" | "value">>({});

  // Save
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Derived ---
  const dimensions = useMemo(
    () => (parsedData?.columns ?? []).filter((c) => columnRoles[c] === "dimension"),
    [parsedData, columnRoles],
  );
  const values = useMemo(
    () => (parsedData?.columns ?? []).filter((c) => columnRoles[c] === "value"),
    [parsedData, columnRoles],
  );

  // ---------------------------------------------------------------------------
  // Dialog lifecycle
  // ---------------------------------------------------------------------------

  const resetDialog = useCallback(() => {
    setDialogStep("upload");
    setEditingId(null);
    setTableName("");
    setUploadedFile(null);
    setSelectedSheetIndex(0);
    setParsedData(null);
    setColumnRoles({});
  }, []);

  const openCreateDialog = useCallback(() => {
    resetDialog();
    setDialogOpen(true);
  }, [resetDialog]);

  const openEditDialog = useCallback((table: LookupTable) => {
    resetDialog();
    setEditingId(table.id);
    setTableName(table.name);
    const roles: Record<string, "dimension" | "value"> = {};
    for (const d of table.dimensions) roles[d] = "dimension";
    for (const v of table.values) roles[v] = "value";
    setColumnRoles(roles);
    setParsedData({
      columns: [...table.dimensions, ...table.values],
      rows: table.rows.map((r) => ({ ...r })),
    });
    setDialogStep("columns");
    setDialogOpen(true);
  }, [resetDialog]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    resetDialog();
  }, [resetDialog]);

  // ---------------------------------------------------------------------------
  // Step 1: Upload & sheet selection
  // ---------------------------------------------------------------------------

  const processFile = useCallback(async (file: File) => {
    setParsing(true);
    try {
      const name = file.name.toLowerCase();
      const buffer = await file.arrayBuffer();

      if (name.endsWith(".csv")) {
        const text = await file.text();
        const parsed = parseCsvContent(text);
        if (parsed.length < 2) {
          toast.error("CSV must have a header row and at least one data row.");
          return;
        }
        const columns = parsed[0].map((h, i) => h.trim() || `Column_${i + 1}`);
        const rows = parsed.slice(1)
          .filter((r) => r.some((cell) => cell.trim() !== ""))
          .map((r) => {
            const obj: Record<string, string> = {};
            columns.forEach((col, i) => { obj[col] = String(r[i] ?? "").trim(); });
            return obj;
          });

        setUploadedFile({ fileName: file.name, buffer, sheetNames: [file.name], isCsv: true });
        setParsedData({ columns, rows });
        setSelectedSheetIndex(0);

        const roles: Record<string, "dimension" | "value"> = {};
        columns.forEach((col, i) => { roles[col] = i === 0 ? "dimension" : "value"; });
        setColumnRoles(roles);

        if (!tableName) setTableName(file.name.replace(/\.[^.]+$/, ""));
        setDialogStep("columns");
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const sheetNames = await getExcelSheetNames(buffer);
        if (sheetNames.length === 0) {
          toast.error("No worksheets found in the Excel file.");
          return;
        }
        setUploadedFile({ fileName: file.name, buffer, sheetNames, isCsv: false });
        setSelectedSheetIndex(0);
        if (!tableName) setTableName(file.name.replace(/\.[^.]+$/, ""));

        if (sheetNames.length === 1) {
          await parseSelectedSheet(buffer, 0);
        }
      } else {
        toast.error("Unsupported file type. Please upload .xlsx, .xls, or .csv.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [tableName]);

  const parseSelectedSheet = useCallback(async (buffer: ArrayBuffer, sheetIndex: number) => {
    setParsing(true);
    try {
      const result = await parseExcelToRows(buffer, { sheetIndex });
      if (result.columns.length === 0) {
        toast.error("No data found in the selected sheet.");
        setParsing(false);
        return;
      }
      const columns = result.columns;
      const rows = result.rows.map((r) => {
        const obj: Record<string, string> = {};
        for (const col of columns) obj[col] = String(r[col] ?? "").trim();
        return obj;
      });

      setParsedData({ columns, rows });

      const roles: Record<string, "dimension" | "value"> = {};
      columns.forEach((col, i) => { roles[col] = i === 0 ? "dimension" : "value"; });
      setColumnRoles(roles);

      setDialogStep("columns");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse sheet");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleSheetSelect = useCallback((value: string) => {
    const idx = parseInt(value, 10);
    setSelectedSheetIndex(idx);
    if (uploadedFile) {
      parseSelectedSheet(uploadedFile.buffer, idx);
    }
  }, [uploadedFile, parseSelectedSheet]);

  // ---------------------------------------------------------------------------
  // Step 2: Column assignment
  // ---------------------------------------------------------------------------

  const handleToggleRole = useCallback((col: string) => {
    setColumnRoles((prev) => ({
      ...prev,
      [col]: prev[col] === "dimension" ? "value" : "dimension",
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // Step 3: Preview & Save
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    const name = tableName.trim();
    if (!name) { toast.error("Table name is required."); return; }
    if (dimensions.length === 0) { toast.error("Select at least one dimension column."); return; }
    if (values.length === 0) { toast.error("Select at least one value column."); return; }
    if (!parsedData || parsedData.rows.length === 0) { toast.error("No data rows."); return; }

    setSaving(true);
    try {
      const payload = {
        id: editingId,
        name,
        dimensions,
        values,
        rows: parsedData.rows,
      };

      const method = editingId ? "PUT" : "POST";
      const res = await fetch(`/api/schemas/${schemaId}/lookup-tables`, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save lookup table");

      const saved = data.lookupTable as LookupTable;
      if (editingId) {
        onLookupTablesChange(lookupTables.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        onLookupTablesChange([...lookupTables, saved]);
      }

      closeDialog();
      toast.success(editingId ? "Lookup table updated." : "Lookup table created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [tableName, dimensions, values, parsedData, editingId, schemaId, lookupTables, onLookupTablesChange, closeDialog]);

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  const handleDelete = useCallback(async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/schemas/${schemaId}/lookup-tables?lookupTableId=${deleteConfirmId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed");
      }
      onLookupTablesChange(lookupTables.filter((t) => t.id !== deleteConfirmId));
      toast.success("Lookup table deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  }, [deleteConfirmId, schemaId, lookupTables, onLookupTablesChange]);

  // ---------------------------------------------------------------------------
  // Render: Main card with list
  // ---------------------------------------------------------------------------

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <CardTitle className="text-base truncate">Lookup Tables</CardTitle>
                <CardDescription className="text-xs">
                  {lookupTables.length} table{lookupTables.length !== 1 ? "s" : ""}
                  {" — reference data for value mapping during data cleansing"}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={openCreateDialog}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Lookup Table
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="pt-0 space-y-3">
            {lookupTables.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No lookup tables yet. Add one to enable value mapping during data cleansing.
              </p>
            ) : (
              lookupTables.map((table) => (
                <div key={table.id} className="rounded-md border">
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedTableId((prev) => (prev === table.id ? null : table.id))}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{table.name}</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {table.dimensions.map((d) => (
                          <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0 border-blue-400 text-blue-700 dark:text-blue-300">
                            {d}
                          </Badge>
                        ))}
                        <span className="text-muted-foreground text-[10px] mx-0.5">&rarr;</span>
                        {table.values.map((v) => (
                          <Badge key={v} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {v}
                          </Badge>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({table.rows.length} row{table.rows.length !== 1 ? "s" : ""})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!readOnly && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); openEditDialog(table); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(table.id); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {expandedTableId === table.id ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {expandedTableId === table.id && table.rows.length > 0 && (
                    <div className="border-t overflow-auto max-h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {[...table.dimensions, ...table.values].map((col) => (
                              <TableHead key={col} className="text-xs whitespace-nowrap">
                                {table.dimensions.includes(col) ? (
                                  <span className="font-semibold">{col}</span>
                                ) : (
                                  <span className="text-muted-foreground">{col}</span>
                                )}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {table.rows.slice(0, PREVIEW_ROW_LIMIT).map((row, ri) => (
                            <TableRow key={ri}>
                              {[...table.dimensions, ...table.values].map((col) => (
                                <TableCell key={col} className="text-xs py-1.5 whitespace-nowrap">
                                  {row[col] || <span className="text-muted-foreground/30 italic">empty</span>}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                          {table.rows.length > PREVIEW_ROW_LIMIT && (
                            <TableRow>
                              <TableCell
                                colSpan={table.dimensions.length + table.values.length}
                                className="text-center text-xs text-muted-foreground py-2"
                              >
                                ...and {table.rows.length - PREVIEW_ROW_LIMIT} more rows
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Multi-step Dialog                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Lookup Table" : "New Lookup Table"}
            </DialogTitle>
            <DialogDescription>
              {dialogStep === "upload" && "Upload an Excel or CSV file to import lookup data."}
              {dialogStep === "columns" && "Assign each column as a Dimension (match key) or a Value (output)."}
              {dialogStep === "preview" && "Review the lookup table before saving."}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
            <span className={dialogStep === "upload" ? "font-semibold text-foreground" : ""}>
              1. Upload
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className={dialogStep === "columns" ? "font-semibold text-foreground" : ""}>
              2. Assign Columns
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className={dialogStep === "preview" ? "font-semibold text-foreground" : ""}>
              3. Preview &amp; Save
            </span>
          </div>

          {/* -------- Step 1: Upload -------- */}
          {dialogStep === "upload" && (
            <div className="flex-1 overflow-auto space-y-4 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Table Name</label>
                <Input
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. Country Codes"
                  className="max-w-sm"
                />
              </div>

              <div
                className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                  dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleFileDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
                {parsing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">Parsing file...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Drag and drop a file here, or{" "}
                      <button
                        type="button"
                        className="text-primary underline underline-offset-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        browse
                      </button>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports Excel (.xlsx, .xls) and CSV (.csv)
                    </p>
                  </>
                )}
              </div>

              {/* Uploaded file + sheet selector */}
              {uploadedFile && !uploadedFile.isCsv && uploadedFile.sheetNames.length > 1 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{uploadedFile.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {uploadedFile.sheetNames.length} worksheet{uploadedFile.sheetNames.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Select Worksheet
                    </label>
                    <Select
                      value={String(selectedSheetIndex)}
                      onValueChange={handleSheetSelect}
                    >
                      <SelectTrigger className="max-w-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {uploadedFile.sheetNames.map((name, idx) => (
                          <SelectItem key={idx} value={String(idx)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* -------- Step 2: Column Assignment -------- */}
          {dialogStep === "columns" && parsedData && (
            <div className="flex-1 overflow-auto space-y-4 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Table Name</label>
                <Input
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. Country Codes"
                  className="max-w-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Click each column to toggle between Dimension and Value
                </label>
                <div className="flex flex-wrap gap-2">
                  {parsedData.columns.map((col) => {
                    const isDim = columnRoles[col] === "dimension";
                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => handleToggleRole(col)}
                        title={`Click to change to ${isDim ? "Value" : "Dimension"}`}
                      >
                        <Badge
                          variant={isDim ? "outline" : "secondary"}
                          className={`text-xs px-2.5 py-1 cursor-pointer transition-all ${
                            isDim
                              ? "border-blue-400 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 shadow-sm"
                              : "hover:bg-muted"
                          }`}
                        >
                          <span className="text-[9px] font-mono mr-1.5 opacity-60 uppercase">
                            {isDim ? "dim" : "val"}
                          </span>
                          {col}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-400 text-blue-700 dark:text-blue-300">DIM</Badge>
                    Dimension = match key ({dimensions.length})
                  </span>
                  <span className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">VAL</Badge>
                    Value = output ({values.length})
                  </span>
                </div>
              </div>

              {/* Data preview */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Data Preview ({parsedData.rows.length} row{parsedData.rows.length !== 1 ? "s" : ""})
                </label>
                <div className="rounded-md border overflow-auto max-h-[280px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-center text-[10px]">#</TableHead>
                        {parsedData.columns.map((col) => (
                          <TableHead key={col} className="text-xs whitespace-nowrap">
                            {columnRoles[col] === "dimension" ? (
                              <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-700 dark:text-blue-300">{col}</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">{col}</Badge>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.rows.slice(0, 10).map((row, ri) => (
                        <TableRow key={ri}>
                          <TableCell className="text-center text-[10px] text-muted-foreground font-mono py-1.5">
                            {ri + 1}
                          </TableCell>
                          {parsedData.columns.map((col) => (
                            <TableCell key={col} className="text-xs py-1.5 whitespace-nowrap max-w-[200px] truncate">
                              {row[col] || <span className="text-muted-foreground/30 italic">empty</span>}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {parsedData.rows.length > 10 && (
                        <TableRow>
                          <TableCell
                            colSpan={parsedData.columns.length + 1}
                            className="text-center text-xs text-muted-foreground py-2"
                          >
                            ...and {parsedData.rows.length - 10} more rows
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {/* -------- Step 3: Final Preview -------- */}
          {dialogStep === "preview" && parsedData && (
            <div className="flex-1 overflow-auto space-y-4 py-2">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Table Name</label>
                  <p className="text-sm font-medium">{tableName || "Untitled"}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Dimensions</label>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {dimensions.map((d) => (
                      <Badge key={d} variant="outline" className="text-[10px] border-blue-400 text-blue-700 dark:text-blue-300">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Values</label>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {values.map((v) => (
                      <Badge key={v} variant="secondary" className="text-[10px]">
                        {v}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Lookup Table ({parsedData.rows.length} row{parsedData.rows.length !== 1 ? "s" : ""})
                </label>
                <div className="rounded-md border overflow-auto max-h-[380px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-center text-[10px]">#</TableHead>
                        {dimensions.map((col) => (
                          <TableHead key={col} className="text-xs whitespace-nowrap font-semibold">
                            {col}
                          </TableHead>
                        ))}
                        {values.map((col) => (
                          <TableHead key={col} className="text-xs whitespace-nowrap text-muted-foreground">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.rows.slice(0, PREVIEW_ROW_LIMIT).map((row, ri) => (
                        <TableRow key={ri}>
                          <TableCell className="text-center text-[10px] text-muted-foreground font-mono py-1.5">
                            {ri + 1}
                          </TableCell>
                          {dimensions.map((col) => (
                            <TableCell key={col} className="text-xs py-1.5 whitespace-nowrap font-medium">
                              {row[col] || <span className="text-muted-foreground/30 italic">empty</span>}
                            </TableCell>
                          ))}
                          {values.map((col) => (
                            <TableCell key={col} className="text-xs py-1.5 whitespace-nowrap">
                              {row[col] || <span className="text-muted-foreground/30 italic">empty</span>}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {parsedData.rows.length > PREVIEW_ROW_LIMIT && (
                        <TableRow>
                          <TableCell
                            colSpan={1 + dimensions.length + values.length}
                            className="text-center text-xs text-muted-foreground py-2"
                          >
                            ...and {parsedData.rows.length - PREVIEW_ROW_LIMIT} more rows
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {/* Footer with navigation */}
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <div>
              {dialogStep !== "upload" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialogStep(dialogStep === "preview" ? "columns" : "upload")}
                  disabled={saving}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={closeDialog} disabled={saving}>
                Cancel
              </Button>

              {dialogStep === "upload" && (
                <Button
                  disabled={!parsedData || parsing}
                  onClick={() => setDialogStep("columns")}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}

              {dialogStep === "columns" && (
                <Button
                  disabled={dimensions.length === 0 || values.length === 0}
                  onClick={() => setDialogStep("preview")}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}

              {dialogStep === "preview" && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                  {editingId ? "Update" : "Create"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lookup table?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The lookup table and all its data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
