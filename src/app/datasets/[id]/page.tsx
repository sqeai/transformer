"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { DatasetRecord } from "@/lib/types";
import { useSchemaStore } from "@/lib/schema-store";
import { ArrowLeft, Download, Loader2, Plus, Trash2 } from "lucide-react";
import ExcelJS from "exceljs";

export default function DatasetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { resetWorkflow, setCurrentSchema } = useSchemaStore();
  const [dataset, setDataset] = useState<DatasetRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, [id]);

  const columns = useMemo(() => {
    if (!dataset) return [];
    const set = new Set<string>();
    for (const row of dataset.rows ?? []) {
      Object.keys(row ?? {}).forEach((k) => set.add(k));
    }
    return Array.from(set);
  }, [dataset]);

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
      router.push("/schemas");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddToDataset = () => {
    if (!dataset) return;
    // Clear any persisted upload/file state before starting a new append flow.
    resetWorkflow();
    setCurrentSchema(dataset.schemaId);
    router.push(`/upload?schemaId=${dataset.schemaId}&datasetId=${dataset.id}`);
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
          <CardContent><Button onClick={() => router.push("/schemas")}>Back to Schemas</Button></CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/schemas")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{dataset.name}</h1>
              <p className="text-muted-foreground text-sm">{dataset.rowCount} rows • Created {new Date(dataset.createdAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={handleAddToDataset}>
              <Plus className="mr-2 h-4 w-4" />
              Add to this dataset
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
              Delete Dataset
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dataset Settings</CardTitle>
            <CardDescription>Rename this dataset. Mapping snapshot is saved with the dataset for flexible future use.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            <Button onClick={saveName} disabled={savingName}>{savingName ? "Saving..." : "Save Name"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview Data</CardTitle>
            <CardDescription>Showing first {Math.min(50, dataset.rows.length)} rows</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataset.rows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      {columns.map((c) => <TableCell key={c} className="whitespace-nowrap">{String((row as Record<string, unknown>)[c] ?? "")}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
