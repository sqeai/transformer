"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { DatasetRecord } from "@/lib/types";
import { ArrowLeft, ChevronDown, Database, Download, ExternalLink, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { useSchemaStore, type UploadedFileEntry } from "@/lib/schema-store";
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROWS_PER_PAGE = 100;

export default function DatasetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dataset, setDataset] = useState<DatasetRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);
  const [visibleRowCount, setVisibleRowCount] = useState(ROWS_PER_PAGE);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { setDatasetWorkflow, resetDatasetWorkflow } = useSchemaStore();

  const handleAddToDatasetUpload = useCallback(
    (schemaId: string, files: UploadedFileEntry[]) => {
      if (!dataset) return;
      resetDatasetWorkflow();
      setDatasetWorkflow({
        schemaId,
        step: "upload",
        files,
        selectedSheets: [],
        exportTargetDatasetId: dataset.id,
      });
      router.push(`/datasets/new?schemaId=${schemaId}&datasetId=${dataset.id}`);
    },
    [dataset, resetDatasetWorkflow, setDatasetWorkflow, router],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/datasets/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load dataset");
        if (cancelled) return;
        setDataset(data.dataset as DatasetRecord);
        setNameDraft((data.dataset as DatasetRecord).name);
      } catch {
        if (!cancelled) setDataset(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const columns = useMemo(() => {
    if (!dataset) return [];
    const set = new Set<string>();
    for (const row of dataset.rows ?? []) {
      Object.keys(row ?? {}).forEach((k) => set.add(k));
    }
    return Array.from(set);
  }, [dataset]);

  const visibleRows = useMemo(() => {
    if (!dataset) return [];
    return dataset.rows.slice(0, visibleRowCount);
  }, [dataset, visibleRowCount]);

  const canLoadMore = dataset ? visibleRowCount < dataset.rows.length : false;
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const saveName = async () => {
    if (!dataset) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === dataset.name) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error();
      setDataset({ ...dataset, name: trimmed });
    } finally {
      setSavingName(false);
    }
  };

  const exportRows = async (format: "csv" | "excel") => {
    if (!dataset) return;
    setExporting(format);
    try {
      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data");
        sheet.addRow(columns);
        for (const row of dataset.rows) {
          sheet.addRow(columns.map((c) => (row as Record<string, unknown>)[c] ?? ""));
        }
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${dataset.name}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const header = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
        const lines = dataset.rows.map((row) =>
          columns.map((c) => `"${String((row as Record<string, unknown>)[c] ?? "").replace(/"/g, '""')}"`).join(","),
        );
        const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${dataset.name}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(null);
    }
  };

  const deleteDataset = async () => {
    if (!dataset) return;
    if (!confirm(`Delete dataset "${dataset.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/datasets");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-8 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading dataset...</CardContent></Card>
      </DashboardLayout>
    );
  }

  if (!dataset) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader><CardTitle>Dataset not found</CardTitle></CardHeader>
          <CardContent><Button onClick={() => router.push("/datasets")}>Back to Datasets</Button></CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/datasets")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{dataset.name}</h1>
              <p className="text-muted-foreground text-sm">{dataset.rowCount} rows &bull; Created {new Date(dataset.createdAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add To This Dataset
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!!exporting}>
                  {exporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {exporting ? "Exporting..." : "Export"}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => exportRows("excel")}>
                  <svg className="mr-2 h-4 w-4 shrink-0 text-green-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 13l3 3 3-3M8 17l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportRows("csv")}>
                  <svg className="mr-2 h-4 w-4 shrink-0 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 13h8M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  CSV (.csv)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <svg className="mr-2 h-4 w-4 shrink-0 text-orange-500 opacity-50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2"/>
                    <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span>FIS</span>
                  <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Database className="mr-2 h-4 w-4 shrink-0 text-blue-500 opacity-50" />
                  <span>BigQuery</span>
                  <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Database className="mr-2 h-4 w-4 shrink-0 text-red-500 opacity-50" />
                  <span>Redshift</span>
                  <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <svg className="mr-2 h-4 w-4 shrink-0 text-sky-700 opacity-50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" strokeWidth="2"/>
                    <path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6" stroke="currentColor" strokeWidth="2"/>
                    <path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <span>Postgres</span>
                  <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="destructive" onClick={deleteDataset} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dataset Name</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
              <Button onClick={saveName} disabled={savingName}>{savingName ? "Saving..." : "Save"}</Button>
            </CardContent>
          </Card>

          <Link href={`/schemas/${dataset.schemaId}`} className="block">
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Schema
                </CardTitle>
                <CardDescription>The schema used by this dataset.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{dataset.schemaName ?? "Unnamed schema"}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
            <CardDescription>
              Showing {visibleRows.length} of {dataset.rows.length} rows
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea ref={scrollAreaRef} className="w-full rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-14 whitespace-nowrap bg-background">#</TableHead>
                    {columns.map((c) => <TableHead key={c} className="whitespace-nowrap bg-background">{c}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      {columns.map((c) => (
                        <TableCell key={c} className="whitespace-nowrap max-w-[200px] truncate">
                          {String((row as Record<string, unknown>)[c] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            {canLoadMore && (
              <div className="flex flex-col items-center gap-2 mt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {visibleRows.length} of {dataset.rows.length} rows
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
                    const scrollTop = viewport?.scrollTop ?? 0;
                    setVisibleRowCount((prev) => prev + ROWS_PER_PAGE);
                    requestAnimationFrame(() => {
                      if (viewport) viewport.scrollTop = scrollTop;
                    });
                  }}
                >
                  Load More
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <UploadDatasetDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        defaultSchemaId={dataset.schemaId}
        datasetName={dataset.name}
        onUpload={handleAddToDatasetUpload}
      />
    </DashboardLayout>
  );
}
