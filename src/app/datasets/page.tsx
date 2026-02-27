"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useSchemaStore, type UploadedFileEntry } from "@/lib/schema-store";
import {
  Plus,
  Loader2,
  Upload,
  FileSpreadsheet,
  X,
  Search,
  Database,
} from "lucide-react";
import { getExcelSheetNames } from "@/lib/parse-excel-preview";

interface DatasetListItem {
  id: string;
  schemaId: string;
  schemaName: string | null;
  name: string;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

function DatasetsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { schemas, schemasLoading, setDatasetWorkflow, resetDatasetWorkflow } = useSchemaStore();

  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSchemaId, setFilterSchemaId] = useState<string>("all");
  const limit = 20;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newSchemaParam = searchParams.get("newSchema");
    if (newSchemaParam) {
      setSelectedSchemaId(newSchemaParam);
      setDialogOpen(true);
    }
  }, [searchParams]);

  const fetchDatasets = useCallback(async (currentOffset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(currentOffset));
      if (filterSchemaId && filterSchemaId !== "all") {
        params.set("schemaId", filterSchemaId);
      }
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      const res = await fetch(`/api/datasets?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch");
      setDatasets(Array.isArray(data.datasets) ? data.datasets : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  }, [filterSchemaId, searchQuery]);

  useEffect(() => {
    setOffset(0);
    fetchDatasets(0);
  }, [fetchDatasets]);

  const handleLoadMore = () => {
    const nextOffset = offset + limit;
    setOffset(nextOffset);
    setLoading(true);
    fetch(`/api/datasets?limit=${limit}&offset=${nextOffset}${filterSchemaId && filterSchemaId !== "all" ? `&schemaId=${filterSchemaId}` : ""}${searchQuery.trim() ? `&search=${searchQuery.trim()}` : ""}`)
      .then((res) => res.json())
      .then((data) => {
        setDatasets((prev) => [...prev, ...(Array.isArray(data.datasets) ? data.datasets : [])]);
        setTotal(typeof data.total === "number" ? data.total : total);
      })
      .finally(() => setLoading(false));
  };

  const processFiles = useCallback(async (files: File[]) => {
    setProcessingFiles(true);
    const entries: UploadedFileEntry[] = [];
    for (const file of files) {
      const ext = file.name.toLowerCase();
      if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) continue;
      try {
        const buffer = await file.arrayBuffer();
        const sheetNames = await getExcelSheetNames(buffer) ?? [file.name];
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
    if (!selectedSchemaId || uploadedFiles.length === 0) return;
    setUploading(true);
    resetDatasetWorkflow();
    setDatasetWorkflow({
      schemaId: selectedSchemaId,
      step: "upload",
      files: uploadedFiles,
      selectedSheets: [],
    });
    setDialogOpen(false);
    router.push(`/datasets/new?schemaId=${selectedSchemaId}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Datasets</h1>
            <p className="text-muted-foreground">
              All your processed datasets across all schemas.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Dataset
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search datasets..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterSchemaId} onValueChange={setFilterSchemaId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by schema" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schemas</SelectItem>
              {schemas.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading && datasets.length === 0 ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading datasets...</span>
              </div>
            ) : datasets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Database className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-lg font-medium">No datasets yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Create a new dataset by uploading Excel files.
                </p>
                <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Dataset
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Schema</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datasets.map((d) => (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/datasets/${d.id}`)}
                      >
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {d.schemaName ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.rowCount} row{d.rowCount !== 1 ? "s" : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(d.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {datasets.length < total && (
                  <div className="flex justify-center py-4">
                    <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Load More
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setUploadedFiles([]);
          setSelectedSchemaId("");
          setUploading(false);
        }
      }}>
        <DialogContent className="max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle>New Dataset</DialogTitle>
            <DialogDescription>
              Select a target schema and upload Excel files to process.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Schema</label>
              <Select value={selectedSchemaId} onValueChange={setSelectedSchemaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a schema..." />
                </SelectTrigger>
                <SelectContent>
                  {schemasLoading ? (
                    <SelectItem value="__loading" disabled>Loading...</SelectItem>
                  ) : schemas.length === 0 ? (
                    <SelectItem value="__none" disabled>No schemas available</SelectItem>
                  ) : (
                    schemas.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

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
                  {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} ready
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
                          {f.sheetNames.length} sheet{f.sheetNames.length !== 1 ? "s" : ""}
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
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!selectedSchemaId || uploadedFiles.length === 0 || processingFiles || uploading}
              >
                {processingFiles || uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {processingFiles ? "Processing files..." : uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

export default function DatasetsPage() {
  return (
    <Suspense fallback={null}>
      <DatasetsPageContent />
    </Suspense>
  );
}
