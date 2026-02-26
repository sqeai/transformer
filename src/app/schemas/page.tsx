"use client";

import { useRef, useState, useCallback, useMemo, useEffect, Fragment } from "react";
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
import { useSchemaStore, flattenFields } from "@/lib/schema-store";
import { Plus, Trash2, Loader2, ChevronRight, Play, FileSpreadsheet, Pencil, ChevronDown, Database, PlusCircle } from "lucide-react";
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
import type { FinalSchema, DatasetSummary } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { getExcelSheetNames, extractExcelGrid } from "@/lib/parse-excel-preview";

export default function SchemasPage() {
  const { user } = useAuth();
  const { schemas, schemasLoading, deleteSchema, addSchema, setCurrentSchema, resetWorkflow } = useSchemaStore();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [addSchemaOpen, setAddSchemaOpen] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetPreview, setSheetPreview] = useState<string[][]>([]);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [schemaUploadFile, setSchemaUploadFile] = useState<File | null>(null);
  const [schemaUploadBuffer, setSchemaUploadBuffer] = useState<ArrayBuffer | null>(null);
  const [expandedSchemaIds, setExpandedSchemaIds] = useState<Set<string>>(new Set());
  const [datasetLists, setDatasetLists] = useState<Record<string, { items: DatasetSummary[]; total?: number; loading?: boolean; hydrated?: boolean }>>({});
  const [deleteDatasetId, setDeleteDatasetId] = useState<string | null>(null);

  const schemasSorted = useMemo(
    () => [...schemas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [schemas],
  );

  useEffect(() => {
    if (schemasSorted.length === 0) return;
    setExpandedSchemaIds((prev) => {
      if (prev.size > 0) return prev;
      return new Set(schemasSorted.slice(0, 3).map((s) => s.id));
    });
    setDatasetLists((prev) => {
      const next = { ...prev };
      for (const s of schemasSorted) {
        if (!next[s.id]) {
          next[s.id] = { items: s.datasets ?? [], total: s.datasetCount ?? (s.datasets?.length ?? 0) };
        }
      }
      return next;
    });
  }, [schemasSorted]);

  const toggleSchemaExpanded = (schemaId: string) => {
    setExpandedSchemaIds((prev) => {
      const next = new Set(prev);
      if (next.has(schemaId)) next.delete(schemaId);
      else next.add(schemaId);
      return next;
    });
  };

  const hydrateSchemaDatasets = useCallback(async (schemaId: string) => {
    const current = datasetLists[schemaId];
    if (current?.loading) return;
    if (current?.hydrated) return;

    setDatasetLists((prev) => ({
      ...prev,
      [schemaId]: {
        items: prev[schemaId]?.items ?? [],
        total: prev[schemaId]?.total,
        loading: true,
        hydrated: prev[schemaId]?.hydrated,
      },
    }));

    try {
      const res = await fetch(`/api/datasets?schemaId=${schemaId}&limit=5&offset=0`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to hydrate datasets");
      const incoming = Array.isArray(data.datasets) ? (data.datasets as DatasetSummary[]) : [];
      setDatasetLists((prev) => ({
        ...prev,
        [schemaId]: {
          items: incoming,
          total: typeof data.total === "number" ? data.total : prev[schemaId]?.total,
          loading: false,
          hydrated: true,
        },
      }));
    } catch {
      setDatasetLists((prev) => ({
        ...prev,
        [schemaId]: {
          ...(prev[schemaId] ?? { items: [] }),
          loading: false,
          hydrated: false,
        },
      }));
    }
  }, [datasetLists]);

  useEffect(() => {
    if (expandedSchemaIds.size === 0) return;
    const expanded = schemasSorted.filter((s) => expandedSchemaIds.has(s.id));
    expanded.forEach((s) => {
      void hydrateSchemaDatasets(s.id);
    });
  }, [expandedSchemaIds, schemasSorted, hydrateSchemaDatasets]);

  const loadMoreDatasets = useCallback(async (schemaId: string) => {
    const current = datasetLists[schemaId];
    setDatasetLists((prev) => ({
      ...prev,
      [schemaId]: { items: prev[schemaId]?.items ?? [], total: prev[schemaId]?.total, loading: true },
    }));
    try {
      const offset = current?.items.length ?? 0;
      const res = await fetch(`/api/datasets?schemaId=${schemaId}&limit=5&offset=${offset}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to load datasets");
      const incoming = Array.isArray(data.datasets) ? (data.datasets as DatasetSummary[]) : [];
      setDatasetLists((prev) => ({
        ...prev,
        [schemaId]: {
          items: [...(prev[schemaId]?.items ?? []), ...incoming],
          total: typeof data.total === "number" ? data.total : prev[schemaId]?.total,
          loading: false,
          hydrated: true,
        },
      }));
    } catch {
      setDatasetLists((prev) => ({
        ...prev,
        [schemaId]: { ...(prev[schemaId] ?? { items: [] }), loading: false },
      }));
    }
  }, [datasetLists]);

  const handleDeleteDataset = useCallback(async (datasetId: string) => {
    const res = await fetch(`/api/datasets/${datasetId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to delete dataset");
    }
    setDatasetLists((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = {
          ...next[key],
          items: next[key].items.filter((d) => d.id !== datasetId),
          total: typeof next[key].total === "number" ? Math.max(0, (next[key].total ?? 1) - 1) : next[key].total,
        };
      }
      return next;
    });
    setDeleteDatasetId(null);
  }, []);

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
    setAddingManual(true);
    try {
      const schema: FinalSchema = {
        id: crypto.randomUUID(),
        name: "New Schema",
        fields: [],
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema);
      setAddSchemaOpen(false);
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setAddingManual(false);
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Final Schemas</h1>
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
                    <TableHead className="w-[140px]">Step 1 — Use schema</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemasLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading schemas...
                      </TableCell>
                    </TableRow>
                  ) : (
                    schemasSorted.map((s, schemaIndex) => {
                    const fieldCount = flattenFields(s.fields).filter(
                      (f) => !f.children?.length,
                    ).length;
                    const createdDate = new Date(s.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });

                    const isExpanded = expandedSchemaIds.has(s.id);
                    const datasetState = datasetLists[s.id] ?? { items: s.datasets ?? [], total: s.datasetCount ?? 0, loading: false };
                    const visibleDatasets = datasetState.items ?? [];
                    const canLoadMore = typeof datasetState.total === "number"
                      ? visibleDatasets.length < datasetState.total
                      : (s.datasetCount ?? 0) > visibleDatasets.length;

                    return (
                      <Fragment key={s.id}>
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/schemas/${s.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSchemaExpanded(s.id);
                              }}
                              className="rounded p-1 hover:bg-muted"
                              aria-label={isExpanded ? "Collapse datasets" : "Expand datasets"}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                            <Button
                              size="sm"
                              onClick={() => {
                                resetWorkflow();
                                setCurrentSchema(s.id);
                                router.push("/upload");
                              }}
                              className="font-medium"
                            >
                              <Play className="mr-1.5 h-4 w-4" />
                              Use this schema
                            </Button>
                          </div>
                        </TableCell>
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
                          </div>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                      <TableRow key={`${s.id}-datasets`} className="bg-muted/20">
                        <TableCell colSpan={7} className="py-0 pl-16 pr-4">
                          {isExpanded ? (
                            <div className="relative py-3 pl-6 space-y-2">
                              <div className="pointer-events-none absolute left-2 -top-3 bottom-0 w-px bg-border/80" />
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                                  <Database className="h-3.5 w-3.5" />
                                  Datasets ({datasetState.total ?? visibleDatasets.length})
                                </div>
                              </div>

                              <div
                                className="relative"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetWorkflow();
                                  setCurrentSchema(s.id);
                                  router.push(`/upload?schemaId=${s.id}`);
                                }}
                              >
                                <div className="absolute left-2 top-1/2 h-px w-4 -translate-y-1/2 bg-border/80" />
                                <div className="rounded-md border-2 border-primary/40 bg-primary/10 p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-primary/15 transition-colors">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <PlusCircle className="h-4 w-4 text-primary shrink-0" />
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-foreground">Create new dataset</div>
                                      <div className="text-xs text-muted-foreground">Add transformed rows under this schema</div>
                                    </div>
                                  </div>
                                  <Plus className="h-4 w-4 text-primary shrink-0" />
                                </div>
                              </div>

                              {visibleDatasets.length === 0 ? (
                                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                  No datasets yet. Use New dataset to create the first dataset.
                                </div>
                              ) : (
                                visibleDatasets.map((d) => (
                                  <div key={d.id} className="relative">
                                    <div className="absolute left-2 top-1/2 h-px w-4 -translate-y-1/2 bg-border/80" />
                                    <div className="rounded-md border bg-background p-3 flex items-center justify-between gap-3">
                                      <div
                                        className="min-w-0 cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          router.push(`/datasets/${d.id}`);
                                        }}
                                      >
                                        <div className="font-medium truncate">{d.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {d.rowCount} rows • Created {new Date(d.createdAt).toLocaleDateString()}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          size="sm"
                                          className="h-9"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            resetWorkflow();
                                            setCurrentSchema(s.id);
                                            router.push(`/upload?schemaId=${s.id}&datasetId=${d.id}`);
                                          }}
                                        >
                                          <PlusCircle className="mr-1.5 h-4 w-4" />
                                          Add to this dataset
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/datasets/${d.id}`);
                                          }}
                                        >
                                          View
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-destructive hover:text-destructive"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteDatasetId(d.id);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}

                              {canLoadMore && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void loadMoreDatasets(s.id);
                                  }}
                                  disabled={datasetState.loading}
                                >
                                  {datasetState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Load 5 more datasets
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="py-2 text-xs text-muted-foreground">
                              {datasetState.total ?? visibleDatasets.length} dataset{(datasetState.total ?? visibleDatasets.length) !== 1 ? "s" : ""} (collapsed)
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      </Fragment>
                    );
                  })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={addSchemaOpen} onOpenChange={setAddSchemaOpen}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader>
            <DialogTitle>Add New Schema</DialogTitle>
            <DialogDescription>
              Upload from an existing Excel file or add fields manually.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-3 py-2">
            <Button
              variant="outline"
              className="h-auto min-w-0 flex-shrink-0 flex-col items-start gap-1.5 whitespace-normal py-4 text-left"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              <span className="flex w-full items-center gap-2 font-medium">
                {uploading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 break-words">Upload from existing Excel</span>
              </span>
              <span className="w-full text-left text-muted-foreground text-sm font-normal break-words">
                Parse a header row from an Excel file into a schema you can configure.
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto min-w-0 flex-shrink-0 flex-col items-start gap-1.5 whitespace-normal py-4 text-left"
              onClick={handleAddFieldsManually}
              disabled={addingManual}
            >
              <span className="flex w-full items-center gap-2 font-medium">
                {addingManual ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Pencil className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 break-words">Add fields manually</span>
              </span>
              <span className="w-full text-left text-muted-foreground text-sm font-normal break-words">
                Create an empty schema and define each field yourself.
              </span>
            </Button>
          </div>
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
                <div className="rounded-md border overflow-x-auto max-w-full">
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

      <AlertDialog open={!!deleteDatasetId} onOpenChange={() => setDeleteDatasetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the saved transformed output dataset and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteDatasetId) return;
                try {
                  await handleDeleteDataset(deleteDatasetId);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Delete failed");
                }
              }}
            >
              Delete Dataset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
