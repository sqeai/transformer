"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Database,
  FileSpreadsheet,
  LayoutTemplate,
  Loader2,
  Pencil,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSchemaStore } from "@/lib/schema-store";
import type { FinalSchema, SchemaField } from "@/lib/types";
import type { SchemaPreset } from "@/lib/schema-presets";
import { PresetPanel } from "./PresetPanel";
import {
  DataSourcePanel,
  mapDbTypeToSchemaType,
  type DataSourceEntry,
  type TableEntry,
  type ColumnEntry,
} from "./DataSourcePanel";
import { ManualSchemaPanel } from "./ManualSchemaPanel";
import { UploadSchemaPanel } from "./UploadSchemaPanel";
import { getExcelSheetNames, extractExcelGrid } from "@/lib/parse-excel-preview";

type DialogMode = "initial" | "upload" | "preset" | "datasource" | "manual";

function toSnakeCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

interface AddSchemaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string;
}

export function AddSchemaDialog({
  open,
  onOpenChange,
  folderId,
}: AddSchemaDialogProps) {
  const router = useRouter();
  const { addSchema } = useSchemaStore();

  const [dialogMode, setDialogMode] = useState<DialogMode>("initial");
  const [initialSelection, setInitialSelection] = useState<
    "upload" | "manual" | "preset" | "datasource" | null
  >(null);
  const [manualPrompt, setManualPrompt] = useState("");
  const [creatingFromManual, setCreatingFromManual] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<SchemaPreset | null>(
    null,
  );
  const [creatingPreset, setCreatingPreset] = useState(false);

  const [dataSources, setDataSources] = useState<DataSourceEntry[]>([]);
  const [dataSourcesLoading, setDataSourcesLoading] = useState(false);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState("");
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableEntry | null>(null);
  const [columns, setColumns] = useState<ColumnEntry[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [creatingFromDataSource, setCreatingFromDataSource] = useState(false);

  // Upload mode state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBuffer, setUploadBuffer] = useState<ArrayBuffer | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetPreview, setSheetPreview] = useState<string[][]>([]);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const resetUploadState = () => {
    setUploadFile(null);
    setUploadBuffer(null);
    setSheetNames([]);
    setActiveSheetIndex(0);
    setSheetPreview([]);
    setSheetPreviewLoading(false);
  };

  const resetDialogMode = () => {
    setDialogMode("initial");
    setInitialSelection(null);
    setManualPrompt("");
    setSelectedPreset(null);
    setSelectedDataSourceId("");
    setTables([]);
    setSelectedTable(null);
    setColumns([]);
    resetUploadState();
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) resetDialogMode();
  };

  const handleSwitchToDataSource = async () => {
    setDialogMode("datasource");
    setDataSourcesLoading(true);
    try {
      const res = await fetch("/api/data-sources");
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

  const handleConfirmSelection = () => {
    switch (initialSelection) {
      case "upload":
        setDialogMode("upload");
        break;
      case "manual":
        setDialogMode("manual");
        break;
      case "preset":
        setDialogMode("preset");
        break;
      case "datasource":
        handleSwitchToDataSource();
        break;
    }
  };

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
    resetUploadState();
    setUploadFile(file);

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
        }
      } catch {
        // single sheet or failed to parse - will proceed without sheet picker
      }
    }
  }, [loadSheetPreview]);

  const handleRemoveFile = useCallback(() => {
    resetUploadState();
  }, []);

  const handleSelectSheet = useCallback(async (index: number) => {
    if (!uploadBuffer) return;
    setActiveSheetIndex(index);
    await loadSheetPreview(uploadBuffer, index);
  }, [uploadBuffer, loadSheetPreview]);

  const handleCreateSchemaFromUpload = useCallback(async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", uploadFile);
      formData.set("sheetIndex", String(activeSheetIndex));
      const res = await fetch("/api/parse-schema", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const { fields } = await res.json();
      const schema: FinalSchema = {
        id: crypto.randomUUID(),
        name: uploadFile.name.replace(/\.(xlsx?|csv|pdf|png|jpe?g|gif|webp|txt|docx|pptx)$/i, "") || "New Schema",
        fields: fields.map((f: { id: string; name: string; path: string; level: number; order: number }) => ({
          ...f,
          children: [],
        })),
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema, folderId);
      onOpenChange(false);
      resetDialogMode();
      router.push(folderId ? `/folders/${folderId}/schemas/${created.id}` : `/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [uploadFile, activeSheetIndex, addSchema, folderId, onOpenChange, router]);

  const handleAddFieldsManually = async () => {
    if (!manualPrompt.trim()) return;
    setCreatingFromManual(true);
    try {
      const res = await fetch("/api/schema-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: manualPrompt }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to infer schema fields");
      }
      const data = await res.json();
      const schema: FinalSchema = {
        id: crypto.randomUUID(),
        name:
          typeof data?.schemaName === "string" && data.schemaName.trim()
            ? data.schemaName.trim()
            : "generated_schema",
        fields: Array.isArray(data?.fields) ? data.fields : [],
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema, folderId);
      onOpenChange(false);
      resetDialogMode();
      router.push(folderId ? `/folders/${folderId}/schemas/${created.id}` : `/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setCreatingFromManual(false);
    }
  };

  const handleCreateFromPreset = async (preset: SchemaPreset) => {
    setCreatingPreset(true);
    try {
      const fields: SchemaField[] = preset.fields.map((f) => ({
        ...f,
        id: crypto.randomUUID(),
        name: toSnakeCase(f.name),
        path: toSnakeCase(f.name),
      }));
      const schema: FinalSchema = {
        id: crypto.randomUUID(),
        name: preset.defaultSchemaName ?? toSnakeCase(preset.name),
        fields,
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema, folderId);
      onOpenChange(false);
      resetDialogMode();
      router.push(folderId ? `/folders/${folderId}/schemas/${created.id}` : `/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setCreatingPreset(false);
    }
  };

  const handleSelectDataSource = async (dsId: string) => {
    setSelectedDataSourceId(dsId);
    setSelectedTable(null);
    setColumns([]);
    setTablesLoading(true);
    try {
      const res = await fetch(`/api/data-sources/${dsId}/tables`);
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

  const handleSelectTable = async (table: TableEntry) => {
    setSelectedTable(table);
    setColumnsLoading(true);
    try {
      const res = await fetch(
        `/api/data-sources/${selectedDataSourceId}/tables/${encodeURIComponent(table.schema)}/${encodeURIComponent(table.name)}/columns`,
      );
      if (res.ok) {
        const data = await res.json();
        setColumns(data.columns ?? []);
      }
    } catch {
      setColumns([]);
    } finally {
      setColumnsLoading(false);
    }
  };

  const handleCreateFromDataSource = async () => {
    if (!selectedTable || columns.length === 0) return;
    setCreatingFromDataSource(true);
    try {
      const fields: SchemaField[] = columns.map((col, i) => ({
        id: crypto.randomUUID(),
        name: col.name,
        path: col.name,
        level: 1,
        order: i + 1,
        dataType: mapDbTypeToSchemaType(col.type),
        children: [],
      }));
      const dsName =
        dataSources.find((d) => d.id === selectedDataSourceId)?.name ?? "";
      const schema: FinalSchema = {
        id: crypto.randomUUID(),
        name: `${dsName} - ${selectedTable.name}`,
        fields,
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema, folderId, {
        dataSourceId: selectedDataSourceId,
        tableSchema: selectedTable.schema,
        tableName: selectedTable.name,
      });
      onOpenChange(false);
      resetDialogMode();
      router.push(folderId ? `/folders/${folderId}/schemas/${created.id}` : `/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setCreatingFromDataSource(false);
    }
  };

  const isExpanded =
    dialogMode === "upload" ||
    dialogMode === "preset" ||
    dialogMode === "datasource" ||
    dialogMode === "manual";

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className={cn(
          "w-full transition-all duration-200",
          isExpanded ? "max-w-[90vw] max-h-[85vh] h-[85vh]" : "max-w-xl",
        )}
      >
        {!isExpanded ? (
          <>
            <DialogHeader>
              <DialogTitle>Add New Schema</DialogTitle>
              <DialogDescription>
                Choose how to create your schema.
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-col gap-3 py-2">
              <button
                type="button"
                className={cn(
                  "rainbow-border h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left transition-colors",
                  initialSelection === "upload"
                    ? "border-transparent ring-2 ring-primary"
                    : "border-transparent hover:bg-muted/50",
                )}
                onClick={() => setInitialSelection("upload")}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  <FileSpreadsheet className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    Upload from existing file
                  </span>
                  <Sparkles className="h-3.5 w-3.5 ml-auto shrink-0 text-violet-500" />
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Parse headers from Excel, CSV, PDF, images, Word, or
                  PowerPoint files into a schema you can configure.
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "rainbow-border h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left transition-colors",
                  initialSelection === "datasource"
                    ? "border-transparent ring-2 ring-primary"
                    : "border-transparent hover:bg-muted/50",
                )}
                onClick={() => setInitialSelection("datasource")}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  <Database className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    Connect to Data Source
                  </span>
                  <Sparkles className="h-3.5 w-3.5 ml-auto shrink-0 text-violet-500" />
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Import schema from a connected database table.
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "rainbow-border h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left transition-colors",
                  initialSelection === "manual"
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:bg-muted/50",
                )}
                onClick={() => setInitialSelection("manual")}
                disabled={creatingFromManual}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  {creatingFromManual ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4 shrink-0" />
                  )}
                  <span className="min-w-0 break-words">Describe to AI</span>
                  <Sparkles className="h-3.5 w-3.5 ml-auto shrink-0 text-violet-500" />
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Paste any unstructured data and let AI determine the fields
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "h-auto min-w-0 flex-shrink-0 rounded-lg border bg-background px-4 py-4 text-left transition-colors",
                  initialSelection === "preset"
                    ? "border-transparent ring-2 ring-primary"
                    : "border-transparent hover:bg-muted/50",
                )}
                onClick={() => setInitialSelection("preset")}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  <LayoutTemplate className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">Use Preset</span>
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Start from a predefined schema template for common data
                  structures.
                </span>
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                onClick={handleConfirmSelection}
                disabled={!initialSelection || creatingFromManual}
              >
                {creatingFromManual && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirm
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 mb-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
                onClick={resetDialogMode}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {dialogMode === "upload" && (
                <UploadSchemaPanel
                  file={uploadFile}
                  onFileSelect={handleFileSelect}
                  onRemoveFile={handleRemoveFile}
                  sheetNames={sheetNames}
                  activeSheetIndex={activeSheetIndex}
                  onSelectSheet={handleSelectSheet}
                  sheetPreview={sheetPreview}
                  sheetPreviewLoading={sheetPreviewLoading}
                  uploading={uploading}
                  onCreateSchema={handleCreateSchemaFromUpload}
                />
              )}
              {dialogMode === "preset" && (
                <PresetPanel
                  selectedPreset={selectedPreset}
                  onSelectPreset={setSelectedPreset}
                  onCreateFromPreset={handleCreateFromPreset}
                  creating={creatingPreset}
                />
              )}
              {dialogMode === "datasource" && (
                <DataSourcePanel
                  dataSources={dataSources}
                  dataSourcesLoading={dataSourcesLoading}
                  selectedDataSourceId={selectedDataSourceId}
                  onSelectDataSource={handleSelectDataSource}
                  tables={tables}
                  tablesLoading={tablesLoading}
                  selectedTable={selectedTable}
                  onSelectTable={handleSelectTable}
                  columns={columns}
                  columnsLoading={columnsLoading}
                  onCreateFromDataSource={handleCreateFromDataSource}
                  creating={creatingFromDataSource}
                />
              )}
              {dialogMode === "manual" && (
                <ManualSchemaPanel
                  prompt={manualPrompt}
                  onPromptChange={setManualPrompt}
                  onCreateSchema={handleAddFieldsManually}
                  creating={creatingFromManual}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
