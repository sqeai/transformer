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
  User,
} from "lucide-react";
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";
import { Badge } from "@/components/ui/badge";
import type { DatasetState } from "@/lib/types";

const STATE_CONFIG: Record<DatasetState, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700" },
  pending_approval: { label: "Pending Approval", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800" },
  completed: { label: "Completed", className: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
};

interface DatasetListItem {
  id: string;
  schemaId: string;
  schemaName: string | null;
  name: string;
  rowCount: number;
  state: DatasetState;
  createdAt: string;
  updatedAt: string;
  assignedToMe?: boolean;
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
  const [filterState, setFilterState] = useState<string>("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
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
      if (filterState && filterState !== "all") {
        params.set("state", filterState);
      }
      if (assignedToMe) {
        params.set("assignedToMe", "true");
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
  }, [filterSchemaId, filterState, assignedToMe, searchQuery]);

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
          <Select value={filterState} onValueChange={setFilterState}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {(Object.entries(STATE_CONFIG) as [DatasetState, { label: string }][]).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={assignedToMe ? "default" : "outline"}
            onClick={() => setAssignedToMe(!assignedToMe)}
            className="gap-2"
          >
            <User className="h-4 w-4" />
            Assigned to me
          </Button>
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
                      <TableHead>State</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datasets.map((d) => {
                      const stateInfo = STATE_CONFIG[d.state] ?? STATE_CONFIG.draft;
                      return (
                        <TableRow
                          key={d.id}
                          className={`cursor-pointer hover:bg-muted/50 ${d.assignedToMe ? "bg-primary/5" : ""}`}
                          onClick={() => router.push(`/datasets/${d.id}`)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {d.name}
                              {d.assignedToMe && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                                  Assigned to you
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {d.schemaName ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={stateInfo.className}>
                              {stateInfo.label}
                            </Badge>
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
                      );
                    })}
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
