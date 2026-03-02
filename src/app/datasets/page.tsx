"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
  Search,
  Database,
} from "lucide-react";
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";

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
  const { schemas, setDatasetWorkflow, resetDatasetWorkflow } = useSchemaStore();

  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSchemaId, setFilterSchemaId] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const limit = 20;

  useEffect(() => {
    const newSchemaParam = searchParams.get("newSchema");
    if (newSchemaParam) {
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

  const handleUploadFromDialog = useCallback(
    (schemaId: string, files: UploadedFileEntry[]) => {
      resetDatasetWorkflow();
      setDatasetWorkflow({
        schemaId,
        step: "upload",
        files,
        selectedSheets: [],
      });
      router.push(`/datasets/new?schemaId=${schemaId}`);
    },
    [resetDatasetWorkflow, setDatasetWorkflow, router],
  );

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

      <UploadDatasetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpload={handleUploadFromDialog}
      />
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
