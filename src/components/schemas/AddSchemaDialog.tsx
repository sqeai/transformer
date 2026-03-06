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

type DialogMode = "initial" | "preset" | "datasource" | "manual";

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
  uploading: boolean;
  onUploadClick: () => void;
  folderId?: string;
}

export function AddSchemaDialog({
  open,
  onOpenChange,
  uploading,
  onUploadClick,
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

  const resetDialogMode = () => {
    setDialogMode("initial");
    setInitialSelection(null);
    setManualPrompt("");
    setSelectedPreset(null);
    setSelectedDataSourceId("");
    setTables([]);
    setSelectedTable(null);
    setColumns([]);
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
        onOpenChange(false);
        onUploadClick();
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
      router.push(`/schemas/${created.id}`);
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
      router.push(`/schemas/${created.id}`);
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
      const created = await addSchema(schema, folderId);
      onOpenChange(false);
      resetDialogMode();
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setCreatingFromDataSource(false);
    }
  };

  const isExpanded =
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
                disabled={uploading}
              >
                <span className="flex w-full items-center gap-2 font-medium text-sm">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 shrink-0" />
                  )}
                  <span className="min-w-0 break-words">
                    Upload from existing file
                  </span>
                  <Sparkles className="h-3.5 w-3.5 ml-auto shrink-0 text-violet-500" />
                </span>
                <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                  Parse a header row from an Excel or CSV file into a schema you
                  can configure.
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
                disabled={
                  !initialSelection || uploading || creatingFromManual
                }
              >
                {(uploading || creatingFromManual) && (
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
