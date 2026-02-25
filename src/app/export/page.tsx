"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import { useSchemaStore, flattenFields } from "@/lib/schema-store";
import type { ExportFormat } from "@/lib/types";
import { Download, Database, FileText, Layers, ArrowLeft, CalendarDays, Loader2, Plus } from "lucide-react";
import ExcelJS from "exceljs";
import { applyMappings, getByPath, formatDisplayValue } from "@/lib/pivot-transform";

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "excel",
    label: "Excel (.xlsx)",
    description: "Download as Excel spreadsheet",
  },
  {
    id: "csv",
    label: "CSV",
    description: "Download as comma-separated values",
  },
  {
    id: "bigquery",
    label: "Google BigQuery",
    description: "Export to BigQuery (configuration placeholder)",
  },
  {
    id: "google_sheets",
    label: "Google Sheets",
    description: "Export to Google Sheets (configuration placeholder)",
  },
  {
    id: "fis",
    label: "Upload to FIS",
    description: "Upload transformed rows to FIS (configuration placeholder)",
  },
];

function LogoBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex h-9 w-9 items-center justify-center rounded-md border shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function ExcelLogo() {
  return (
    <LogoBadge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
      <span className="text-xs font-black tracking-tight">XLS</span>
    </LogoBadge>
  );
}

function BigQueryLogo() {
  return (
    <LogoBadge className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
      <div className="flex flex-col items-center leading-none">
        <span className="text-[8px] font-semibold tracking-wider">BQ</span>
        <Database className="h-3.5 w-3.5" />
      </div>
    </LogoBadge>
  );
}

function GoogleSheetsLogo() {
  return (
    <LogoBadge className="border-green-200 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path d="M6 2h8l4 4v16H6z" fill="#22c55e" />
        <path d="M14 2v4h4" fill="#86efac" />
        <path d="M8 10h8M8 13h8M8 16h8M11 8v10" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </LogoBadge>
  );
}

function FisLogo() {
  return (
    <LogoBadge className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
      <span className="text-[11px] font-black tracking-widest">FIS</span>
    </LogoBadge>
  );
}

function CsvLogo() {
  return (
    <LogoBadge className="border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
      <span className="text-[10px] font-bold tracking-wide">CSV</span>
    </LogoBadge>
  );
}

export default function ExportPage() {
  const router = useRouter();
  const { workflow, getSchema, setUploadState } = useSchemaStore();
  const { rawRows, columnMappings, currentSchemaId, pivotConfig, verticalPivotConfig, defaultValues, uploadState } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;
  const [exporting, setExporting] = useState<string | null>(null);
  const [datasetSaving, setDatasetSaving] = useState(false);
  const [datasetSaveError, setDatasetSaveError] = useState<string | null>(null);
  const [savedDatasetId, setSavedDatasetId] = useState<string | null>(null);

  const allTargetPaths = useMemo(
    () => schema ? flattenFields(schema.fields).filter((f) => !f.children?.length).map((f) => f.path) : [],
    [schema],
  );

  const mappedRows = useMemo(
    () => applyMappings(rawRows, columnMappings, pivotConfig, defaultValues, allTargetPaths, verticalPivotConfig),
    [rawRows, columnMappings, pivotConfig, defaultValues, allTargetPaths, verticalPivotConfig],
  );

  const columns = useMemo(() => {
    if (allTargetPaths.length > 0) return allTargetPaths;
    const cols = new Set<string>();
    columnMappings.forEach((m) => cols.add(m.targetPath));
    for (const path of Object.keys(defaultValues)) {
      cols.add(path);
    }
    return Array.from(cols).sort();
  }, [allTargetPaths, columnMappings, defaultValues]);

  const selectedDatasetId = typeof uploadState?.datasetTargetId === "string" ? uploadState.datasetTargetId : null;
  const canSaveDataset = !!schema && mappedRows.length > 0;
  const persistDataset = async () => {
    if (!schema || mappedRows.length === 0) return null;
    setDatasetSaving(true);
    setDatasetSaveError(null);

    try {
      const mappingSnapshot = {
        columnMappings,
        pivotConfig,
        verticalPivotConfig,
        defaultValues,
      };

      if (selectedDatasetId) {
        const res = await fetch(`/api/datasets/${selectedDatasetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appendRows: mappedRows, mappingSnapshot }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to add rows to dataset");
        setSavedDatasetId(selectedDatasetId);
        return selectedDatasetId;
      }

      const dt = new Date();
      const datasetName = `${schema.name} Dataset ${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaId: schema.id,
          name: datasetName,
          rows: mappedRows,
          mappingSnapshot,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create dataset");

      const createdId =
        typeof data?.dataset?.id === "string" ? data.dataset.id : null;
      if (!createdId) throw new Error("Dataset created but no id was returned");

      setSavedDatasetId(createdId);
      setUploadState({
        ...(uploadState ?? { schemaId: schema.id, step: "idle" }),
        schemaId: schema.id,
        datasetTargetId: createdId,
      });
      return createdId;
    } catch (e) {
      setDatasetSaveError(e instanceof Error ? e.message : "Failed to save dataset");
      return null;
    } finally {
      setDatasetSaving(false);
    }
  };

  const handleDatasetCta = async () => {
    if (savedDatasetId) {
      router.push(`/datasets/${savedDatasetId}`);
      return;
    }
    if (selectedDatasetId) {
      await persistDataset();
      return;
    }
    await persistDataset();
  };

  const handleExport = async (formatId: string) => {
    if (!schema || mappedRows.length === 0) return;
    setExporting(formatId);

    try {
      if (formatId === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data");
        sheet.addRow(columns);
        mappedRows.forEach((row) => {
          const values = columns.map((c) => {
            const v = getByPath(row as Record<string, unknown>, c);
            return v != null && typeof v === "object" ? formatDisplayValue(v) : v;
          });
          sheet.addRow(values);
        });
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${schema.name}_export.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (formatId === "csv") {
        const header = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
        const lines = mappedRows.map((row) =>
          columns
            .map((c) => {
              const v = getByPath(row as Record<string, unknown>, c);
              const s = v != null ? formatDisplayValue(v) : "";
              return `"${s.replace(/"/g, '""')}"`;
            })
            .join(","),
        );
        const csv = [header, ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${schema.name}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (formatId === "bigquery") {
        alert(
          "Google BigQuery export is a placeholder. Configure your BigQuery project and dataset in settings to enable.",
        );
      } else if (formatId === "google_sheets") {
        alert(
          "Google Sheets export is a placeholder. Connect a Google account and target spreadsheet to enable.",
        );
      } else if (formatId === "fis") {
        alert(
          "FIS upload is a placeholder. Configure FIS credentials and endpoint mapping to enable.",
        );
      }
    } finally {
      setExporting(null);
    }
  };

  if (!schema || rawRows.length === 0) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>No data to export</CardTitle>
            <CardDescription>
              Complete the mapping and preview steps first.
            </CardDescription>
          </CardHeader>
        </Card>
      </DashboardLayout>
    );
  }

  const formatIcon = (id: string) => {
    if (id === "excel") return <ExcelLogo />;
    if (id === "csv") return <CsvLogo />;
    if (id === "bigquery") return <BigQueryLogo />;
    if (id === "google_sheets") return <GoogleSheetsLogo />;
    if (id === "fis") return <FisLogo />;
    return <FileText className="h-5 w-5" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/preview")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Export</h1>
            <p className="text-muted-foreground">
              Choose a format and download or send your mapped data.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="md:col-span-2 lg:col-span-3 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Dataset
              </CardTitle>
              <CardDescription>
                {selectedDatasetId
                  ? "Append the transformed rows to your selected dataset, then jump to the dataset view."
                  : "No dataset is selected yet. Save this export as a new dataset in the database."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                size="lg"
                className="h-14 w-full text-base"
                onClick={handleDatasetCta}
                disabled={!canSaveDataset || datasetSaving}
              >
                {datasetSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Dataset...
                  </>
                ) : savedDatasetId ? (
                  "View Dataset"
                ) : selectedDatasetId ? (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add dataset
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create new Dataset
                  </>
                )}
              </Button>
              {datasetSaveError && (
                <p className="text-sm text-destructive">{datasetSaveError}</p>
              )}
              {savedDatasetId && (
                <p className="text-xs text-muted-foreground">
                  Dataset saved. Use “View Dataset” to review or manage it.
                </p>
              )}
            </CardContent>
          </Card>

          {EXPORT_FORMATS.map((f) => (
            <Card key={f.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-center gap-2">
                {formatIcon(f.id)}
                <CardTitle className="text-lg">{f.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription className="mb-4">{f.description}</CardDescription>
                <Button
                  onClick={() => handleExport(f.id)}
                  disabled={exporting !== null}
                >
                  {exporting === f.id ? (
                    f.id === "fis" ? "Uploading…" : "Exporting…"
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      {f.id === "fis" ? "Upload" : "Export"}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              {mappedRows.length} rows × {columns.length} columns. Schema:{" "}
              {schema.name}.
            </CardDescription>
          </CardHeader>
          {pivotConfig.enabled && pivotConfig.groupByColumns.length > 0 && (
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Pivot active — grouped by{" "}
                  <strong>{pivotConfig.groupByColumns.join(", ")}</strong>.
                  {rawRows.length !== mappedRows.length && (
                    <span className="text-muted-foreground">
                      {" "}({rawRows.length} raw rows aggregated into {mappedRows.length}.)
                    </span>
                  )}
                </span>
              </div>
            </CardContent>
          )}
          {verticalPivotConfig.enabled && verticalPivotConfig.columns.length > 0 && (
            <CardContent className={pivotConfig.enabled && pivotConfig.groupByColumns.length > 0 ? "pt-2" : "pt-0"}>
              <div className="flex items-center gap-2 rounded-md border border-violet-300/30 bg-violet-50/50 dark:bg-violet-950/20 px-3 py-2 text-sm">
                <CalendarDays className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                <span>
                  Vertical pivot active — {verticalPivotConfig.columns.length} source column{verticalPivotConfig.columns.length !== 1 ? "s" : ""} expanded into rows
                  {verticalPivotConfig.outputTargetPaths.length > 0 && (
                    <> with output fields [{verticalPivotConfig.outputTargetPaths.join(", ")}]</>
                  )}.
                  {rawRows.length !== mappedRows.length && (
                    <span className="text-muted-foreground">
                      {" "}({rawRows.length} raw rows expanded to {mappedRows.length}.)
                    </span>
                  )}
                </span>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
