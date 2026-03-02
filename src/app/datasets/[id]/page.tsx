"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { DatasetRecord } from "@/lib/types";
import { ArrowLeft, Download, Loader2, Plus, Trash2 } from "lucide-react";
import ExcelJS from "exceljs";
import { useSchemaStore, type UploadedFileEntry } from "@/lib/schema-store";
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";

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
            <Button variant="outline" onClick={() => exportRows("csv")} disabled={!!exporting}>
              <Download className="mr-2 h-4 w-4" />
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </Button>
            <Button variant="outline" onClick={() => exportRows("excel")} disabled={!!exporting}>
              <Download className="mr-2 h-4 w-4" />
              {exporting === "excel" ? "Exporting..." : "Export Excel"}
            </Button>
            <Button variant="destructive" onClick={deleteDataset} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dataset Name</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            <Button onClick={saveName} disabled={savingName}>{savingName ? "Saving..." : "Save"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
            <CardDescription>
              Showing {visibleRows.length} of {dataset.rows.length} rows
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full rounded-md border max-h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    {columns.map((c) => <TableHead key={c} className="whitespace-nowrap bg-background">{c}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row, i) => (
                    <TableRow key={i}>
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
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={() => setVisibleRowCount((prev) => prev + ROWS_PER_PAGE)}
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
