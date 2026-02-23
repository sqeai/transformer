"use client";

import { useMemo, useState } from "react";
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
import { useSchemaStore } from "@/lib/schema-store";
import type { ExportFormat } from "@/lib/types";
import { Download, FileSpreadsheet, Database, FileText, Layers, ArrowLeft } from "lucide-react";
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
];

export default function ExportPage() {
  const router = useRouter();
  const { workflow, getSchema } = useSchemaStore();
  const { rawRows, columnMappings, currentSchemaId, pivotConfig } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;
  const [exporting, setExporting] = useState<string | null>(null);

  const mappedRows = useMemo(
    () => applyMappings(rawRows, columnMappings, pivotConfig),
    [rawRows, columnMappings, pivotConfig],
  );

  const columns = useMemo(() => {
    const cols = new Set<string>();
    columnMappings.forEach((m) => cols.add(m.targetPath));
    return Array.from(cols).sort();
  }, [columnMappings]);

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
    if (id === "excel") return <FileSpreadsheet className="h-5 w-5" />;
    if (id === "bigquery") return <Database className="h-5 w-5" />;
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
                    "Exporting…"
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Export
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
        </Card>
      </div>
    </DashboardLayout>
  );
}
