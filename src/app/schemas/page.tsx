"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSchemaStore, flattenFields } from "@/lib/schema-store";
import {
  Plus,
  Trash2,
  Loader2,
  FileSpreadsheet,
  Pencil,
  LayoutTemplate,
  Database,
  ChevronRight,
  Check,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
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
import type { FinalSchema, SchemaField, SqlCompatibleType } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { getExcelSheetNames, extractExcelGrid } from "@/lib/parse-excel-preview";
import { SCHEMA_PRESETS, type SchemaPreset } from "@/lib/schema-presets";
import { cn } from "@/lib/utils";

function mapDbTypeToSchemaType(dbType: string): SqlCompatibleType {
  const t = dbType.toUpperCase();
  if (t.includes("INT")) return "INTEGER";
  if (t.includes("FLOAT") || t.includes("DOUBLE") || t.includes("REAL")) return "FLOAT";
  if (t.includes("NUMERIC") || t.includes("DECIMAL") || t.includes("MONEY")) return "NUMERIC";
  if (t.includes("BOOL")) return "BOOLEAN";
  if (t.includes("TIMESTAMP")) return "TIMESTAMP";
  if (t.includes("DATETIME")) return "DATETIME";
  if (t.includes("DATE")) return "DATE";
  return "STRING";
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

type DialogMode = "initial" | "preset" | "datasource" | "manual";

interface DataSourceEntry {
  id: string;
  name: string;
  type: string;
}

interface TableEntry {
  schema: string;
  name: string;
}

interface ColumnEntry {
  name: string;
  type: string;
}

function PresetPanel({
  selectedPreset,
  onSelectPreset,
  onCreateFromPreset,
  creating,
}: {
  selectedPreset: SchemaPreset | null;
  onSelectPreset: (preset: SchemaPreset) => void;
  onCreateFromPreset: (preset: SchemaPreset) => void;
  creating: boolean;
}) {
  return (
    <>
      <DialogHeader className="shrink-0 pb-4">
        <DialogTitle>Use Preset</DialogTitle>
        <DialogDescription>
          Select a predefined schema template to get started quickly.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-1 min-h-0 gap-4">
        {/* Preset cards */}
        <div className="w-[260px] shrink-0 space-y-2">
          {SCHEMA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(
                "w-full rounded-lg border p-4 text-left transition-colors",
                selectedPreset?.id === preset.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/50",
              )}
              onClick={() => onSelectPreset(preset)}
            >
              <p className="font-medium text-sm">{preset.name}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {preset.description}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {preset.fields.length} fields
              </p>
            </button>
          ))}
        </div>

        {/* Field preview */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {selectedPreset ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold">{selectedPreset.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedPreset.fields.length} fields</p>
                </div>
                <Button
                  onClick={() => onCreateFromPreset(selectedPreset)}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Use This Preset
                </Button>
              </div>
              <div className="flex-1 min-h-0 rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Field Name</TableHead>
                      <TableHead className="w-[140px]">Data Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPreset.fields.map((field, i) => (
                      <TableRow key={field.name}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{field.name}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                            {field.dataType ?? "STRING"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <LayoutTemplate className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a preset to preview its fields</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DataSourcePanel({
  dataSources,
  dataSourcesLoading,
  selectedDataSourceId,
  onSelectDataSource,
  tables,
  tablesLoading,
  selectedTable,
  onSelectTable,
  columns,
  columnsLoading,
  onCreateFromDataSource,
  creating,
}: {
  dataSources: DataSourceEntry[];
  dataSourcesLoading: boolean;
  selectedDataSourceId: string;
  onSelectDataSource: (id: string) => void;
  tables: TableEntry[];
  tablesLoading: boolean;
  selectedTable: TableEntry | null;
  onSelectTable: (table: TableEntry) => void;
  columns: ColumnEntry[];
  columnsLoading: boolean;
  onCreateFromDataSource: () => void;
  creating: boolean;
}) {
  return (
    <>
      <DialogHeader className="shrink-0 pb-4">
        <DialogTitle>Connect to Data Source</DialogTitle>
        <DialogDescription>
          Select a data source and table to import its columns as a schema.
        </DialogDescription>
      </DialogHeader>

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
          {/* Left: data source + table selection */}
          <div className="w-[280px] shrink-0 flex flex-col gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Source</label>
              <Select value={selectedDataSourceId} onValueChange={onSelectDataSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a data source..." />
                </SelectTrigger>
                <SelectContent>
                  {dataSources.map((ds) => (
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
                        const isSelected = selectedTable?.schema === table.schema && selectedTable?.name === table.name;
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
                            onClick={() => onSelectTable(table)}
                          >
                            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isSelected && "rotate-90")} />
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

          {/* Right: column preview */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {columnsLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading columns...
              </div>
            ) : selectedTable && columns.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold">
                      {selectedTable.schema !== "public" && (
                        <span className="text-muted-foreground">{selectedTable.schema}.</span>
                      )}
                      {selectedTable.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{columns.length} columns</p>
                  </div>
                  <Button
                    onClick={onCreateFromDataSource}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Use This Table
                  </Button>
                </div>
                <div className="flex-1 min-h-0 rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Column Name</TableHead>
                        <TableHead className="w-[180px]">Database Type</TableHead>
                        <TableHead className="w-[140px]">Schema Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columns.map((col, i) => (
                        <TableRow key={col.name}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{col.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">
                            {col.type}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                              {mapDbTypeToSchemaType(col.type)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">
                    {selectedDataSourceId
                      ? "Select a table to preview its columns"
                      : "Select a data source to get started"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ManualSchemaPanel({
  prompt,
  onPromptChange,
  onCreateSchema,
  creating,
}: {
  prompt: string;
  onPromptChange: (next: string) => void;
  onCreateSchema: () => void;
  creating: boolean;
}) {
  return (
    <>
      <DialogHeader className="shrink-0 pb-4">
        <DialogTitle>Describe to AI</DialogTitle>
        <DialogDescription>
          Paste headers, sample rows, JSON, or any notes. The schema agent will infer the fields for you.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Paste anything here, for example:
invoice_no, invoice_date, customer_name, currency, subtotal, vat, total

or

JSON sample:
{&quot;customerId&quot;:&quot;C-001&quot;,&quot;orderDate&quot;:&quot;2026-03-03&quot;,&quot;amount&quot;:125000}"
          className="flex-1 min-h-[360px] resize-none font-mono text-sm"
        />
        <div className="flex justify-end">
          <Button onClick={onCreateSchema} disabled={!prompt.trim() || creating}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inferring fields...
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

export default function SchemasPage() {
  const { user } = useAuth();
  const { schemas, schemasLoading, deleteSchema, addSchema } = useSchemaStore();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [addSchemaOpen, setAddSchemaOpen] = useState(false);
  const [creatingFromManual, setCreatingFromManual] = useState(false);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetPreview, setSheetPreview] = useState<string[][]>([]);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [schemaUploadFile, setSchemaUploadFile] = useState<File | null>(null);
  const [schemaUploadBuffer, setSchemaUploadBuffer] = useState<ArrayBuffer | null>(null);

  // Expanded dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>("initial");
  const [initialSelection, setInitialSelection] = useState<"upload" | "manual" | "preset" | "datasource" | null>(null);
  const [manualPrompt, setManualPrompt] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<SchemaPreset | null>(null);
  const [creatingPreset, setCreatingPreset] = useState(false);

  // Data source connection state
  const [dataSources, setDataSources] = useState<DataSourceEntry[]>([]);
  const [dataSourcesLoading, setDataSourcesLoading] = useState(false);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string>("");
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableEntry | null>(null);
  const [columns, setColumns] = useState<ColumnEntry[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [creatingFromDataSource, setCreatingFromDataSource] = useState(false);

  const schemasSorted = useMemo(
    () => [...schemas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [schemas],
  );

  const resetSheetPickerState = () => {
    setSheetPickerOpen(false);
    setSheetNames([]);
    setActiveSheetIndex(0);
    setSheetPreview([]);
    setSchemaUploadFile(null);
    setSchemaUploadBuffer(null);
  };

  const loadSheetPreview = useCallback(
    async (buffer: ArrayBuffer, index: number) => {
      setSheetPreviewLoading(true);
      try {
        const { grid } = await extractExcelGrid(buffer, 6, undefined, index);
        setSheetPreview(grid);
      } catch {
        setSheetPreview([]);
      } finally {
        setSheetPreviewLoading(false);
      }
    },
    [],
  );

  const handleUploadClick = () => {
    setAddSchemaOpen(false);
    fileInputRef.current?.click();
  };

  const createSchemaFromFile = useCallback(
    async (file: File, sheetIndex = 0) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("sheetIndex", String(sheetIndex));
        const res = await fetch("/api/parse-schema", { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
        const { fields } = await res.json();
        const schema: FinalSchema = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.xlsx?$/i, "") || "New Schema",
          fields: fields.map((f: { id: string; name: string; path: string; level: number; order: number }) => ({
            ...f,
            children: [],
          })),
          createdAt: new Date().toISOString(),
        };
        const created = await addSchema(schema);
        resetSheetPickerState();
        setAddSchemaOpen(false);
        router.push(`/schemas/${created.id}`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [addSchema, router],
  );

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
        name: typeof data?.schemaName === "string" && data.schemaName.trim()
          ? data.schemaName.trim()
          : "generated_schema",
        fields: Array.isArray(data?.fields) ? data.fields : [],
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema);
      setAddSchemaOpen(false);
      resetDialogMode();
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setCreatingFromManual(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const names = await getExcelSheetNames(buffer);
      if (!names || names.length <= 1) {
        await createSchemaFromFile(file, 0);
      } else {
        setSchemaUploadFile(file);
        setSchemaUploadBuffer(buffer);
        setSheetNames(names);
        setActiveSheetIndex(0);
        setSheetPickerOpen(true);
        await loadSheetPreview(buffer, 0);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      e.target.value = "";
    }
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
  };

  const handleDialogOpenChange = (open: boolean) => {
    setAddSchemaOpen(open);
    if (!open) resetDialogMode();
  };

  const handleConfirmSelection = () => {
    switch (initialSelection) {
      case "upload":
        handleUploadClick();
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
      const created = await addSchema(schema);
      setAddSchemaOpen(false);
      resetDialogMode();
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setCreatingPreset(false);
    }
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
      const dsName = dataSources.find((d) => d.id === selectedDataSourceId)?.name ?? "";
      const schema: FinalSchema = {
        id: crypto.randomUUID(),
        name: `${dsName} - ${selectedTable.name}`,
        fields,
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema);
      setAddSchemaOpen(false);
      resetDialogMode();
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setCreatingFromDataSource(false);
    }
  };

  const isExpanded = dialogMode === "preset" || dialogMode === "datasource" || dialogMode === "manual";

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Schemas</h1>
            <p className="text-muted-foreground">
              Define and manage your target data structures. Click a schema to configure fields, descriptions, and defaults.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button onClick={() => setAddSchemaOpen(true)} disabled={uploading}>
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add New Schema
            </Button>
          </div>
        </div>

        {schemasLoading && schemas.length === 0 ? (
          <Card>
            <CardContent className="py-10">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading schemas...</span>
              </div>
            </CardContent>
          </Card>
        ) : schemas.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No schemas yet</CardTitle>
              <CardDescription>
                Add a new schema by uploading from an existing Excel file or by defining fields manually.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setAddSchemaOpen(true)} disabled={uploading}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Schema
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Schemas</CardTitle>
              <CardDescription>Click a schema to view and configure its fields.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemasLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Loading schemas...
                      </TableCell>
                    </TableRow>
                  ) : (
                    schemasSorted.map((s) => {
                      const fieldCount = flattenFields(s.fields).filter(
                        (f) => !f.children?.length,
                      ).length;
                      const createdDate = new Date(s.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });

                      return (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/schemas/${s.id}`)}
                        >
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {s.creator?.name ?? s.creator?.email ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {createdDate}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {user && s.creator && s.creator.id === user.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteId(s.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/schemas/${s.id}`);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={addSchemaOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className={cn(
            "w-full transition-all duration-200",
            isExpanded
              ? "max-w-[90vw] max-h-[85vh] h-[85vh]"
              : "max-w-xl",
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
                {/* AI-powered options with rainbow border */}
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
                    <span className="min-w-0 break-words">Upload from existing Excel</span>
                    <Sparkles className="h-3.5 w-3.5 ml-auto shrink-0 text-violet-500" />
                  </span>
                  <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                    Parse a header row from an Excel file into a schema you can configure.
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
                    <span className="min-w-0 break-words">Connect to Data Source</span>
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
                    <Sparkles className="h-3.5 w-3.5 ml-auto shrink-0 text-violet-500" />
                  </span>
                  <span className="w-full text-left text-muted-foreground text-sm font-normal break-words mt-1.5 block">
                    Start from a predefined schema template for common data structures.
                  </span>
                </button>
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleConfirmSelection}
                  disabled={!initialSelection || uploading || creatingFromManual}
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

      <Dialog
        open={sheetPickerOpen}
        onOpenChange={(open) => {
          if (!open) resetSheetPickerState();
        }}
      >
        <DialogContent className="w-full max-w-[90vw] max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Select sheet for schema</DialogTitle>
            <DialogDescription>
              Choose which worksheet&apos;s header row should be used to build your final schema.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex-1 min-h-0 overflow-auto space-y-3">
            {schemaUploadFile && (
              <p className="text-sm text-muted-foreground">
                File: <span className="font-medium">{schemaUploadFile.name}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2 border-b pb-2">
              {sheetNames.map((name, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={async () => {
                    if (!schemaUploadBuffer) return;
                    setActiveSheetIndex(index);
                    await loadSheetPreview(schemaUploadBuffer, index);
                  }}
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
                            <TableCell key={cIdx} className="whitespace-nowrap max-w-[160px] truncate">
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
              <Button
                variant="outline"
                onClick={resetSheetPickerState}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (schemaUploadFile) {
                    void createSchemaFromFile(schemaUploadFile, activeSheetIndex);
                  }
                }}
                disabled={!schemaUploadFile || uploading}
              >
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schema?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The schema{deleteId ? ` "${schemas.find((s) => s.id === deleteId)?.name ?? ""}"` : ""} and all its fields will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteId) {
                  try {
                    await deleteSchema(deleteId);
                    setDeleteId(null);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Delete failed");
                  }
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
