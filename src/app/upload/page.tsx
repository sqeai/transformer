"use client";

import { useCallback, useRef, useState } from "react";
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
import { useSchemaStore } from "@/lib/schema-store";
import { flattenFields } from "@/lib/schema-store";
import { parseExcelToRows } from "@/lib/parse-excel";
import { parseCsvToRows, extractCsvPreview } from "@/lib/parse-csv";
import { extractExcelGrid } from "@/lib/parse-excel-preview";
import type { RawDataAnalysis } from "@/lib/llm-schema";
import DataPreviewTable, { type DataBoundary } from "@/components/DataPreviewTable";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Info,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

type Step = "idle" | "loading_preview" | "analyzing" | "preview" | "parsing";

interface PreviewData {
  grid: string[][];
  totalRows: number;
  totalColumns: number;
  fileName: string;
  isExcel: boolean;
  csvText?: string;
  excelBuffer?: ArrayBuffer;
  llmAnalysis?: RawDataAnalysis;
}

export default function UploadPage() {
  const searchParams = useSearchParams();
  const schemaId = searchParams.get("schemaId");
  const router = useRouter();
  const { getSchema, setCurrentSchema, setRawData, resetWorkflow } = useSchemaStore();
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RawDataAnalysis | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [boundary, setBoundary] = useState<DataBoundary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const schema = schemaId ? getSchema(schemaId) : null;

  const loadPreview = useCallback(
    async (file: File) => {
      setError(null);
      setAnalysis(null);
      setPreview(null);
      setBoundary(null);
      resetWorkflow();

      const ext = file.name.toLowerCase();
      const isExcel = ext.endsWith(".xlsx") || ext.endsWith(".xls");
      const isCsv = ext.endsWith(".csv");

      if (!isExcel && !isCsv) {
        setError("Please upload a CSV or Excel (.xlsx, .xls) file.");
        return;
      }

      try {
        setStep("loading_preview");

        let llmAnalysis: RawDataAnalysis | undefined;

        if (isExcel) {
          const buffer = await file.arrayBuffer();

          setStep("analyzing");
          try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/analyze-raw", {
              method: "POST",
              body: formData,
            });
            if (res.ok) {
              llmAnalysis = await res.json();
              setAnalysis(llmAnalysis!);
            }
          } catch {
            // LLM analysis failed — user can still set boundaries manually
          }

          const { grid, totalRows, totalColumns } = await extractExcelGrid(buffer);

          const defaultBoundary: DataBoundary = {
            headerRowIndex: llmAnalysis?.headerRowIndex ?? 0,
            dataStartRowIndex: llmAnalysis?.dataStartRowIndex ?? 1,
            dataEndRowIndex: totalRows - 1,
            startColumn: llmAnalysis?.columnsToKeep
              ? Math.min(...llmAnalysis.columnsToKeep)
              : 0,
            endColumn: llmAnalysis?.columnsToKeep
              ? Math.max(...llmAnalysis.columnsToKeep)
              : totalColumns - 1,
          };

          setBoundary(defaultBoundary);
          setPreview({
            grid,
            totalRows,
            totalColumns,
            fileName: file.name,
            isExcel: true,
            excelBuffer: buffer,
            llmAnalysis,
          });
        } else {
          const csvText = await file.text();
          const { grid, totalRows, totalColumns } = extractCsvPreview(csvText, 50);

          const defaultBoundary: DataBoundary = {
            headerRowIndex: 0,
            dataStartRowIndex: 1,
            dataEndRowIndex: totalRows - 1,
            startColumn: 0,
            endColumn: totalColumns - 1,
          };

          setBoundary(defaultBoundary);
          setPreview({
            grid,
            totalRows,
            totalColumns,
            fileName: file.name,
            isExcel: false,
            csvText,
          });
        }

        setStep("preview");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load file preview");
        setStep("idle");
      }
    },
    [resetWorkflow],
  );

  const confirmAndParse = useCallback(async () => {
    if (!preview || !boundary) return;

    try {
      setStep("parsing");

      const columnsToKeep: number[] = [];
      for (let i = boundary.startColumn; i <= boundary.endColumn; i++) {
        columnsToKeep.push(i);
      }

      if (preview.isExcel && preview.excelBuffer) {
        const { columns, rows } = await parseExcelToRows(preview.excelBuffer, {
          analysis: preview.llmAnalysis,
          headerRowIndex: boundary.headerRowIndex,
          headerRowCount: preview.llmAnalysis?.headerRowCount,
          dataStartRowIndex: boundary.dataStartRowIndex,
          dataEndRowIndex: boundary.dataEndRowIndex,
          columnsToKeep,
        });
        setRawData(columns, rows);
      } else if (preview.csvText) {
        const { columns, rows } = parseCsvToRows(preview.csvText, {
          headerRowIndex: boundary.headerRowIndex,
          dataStartRowIndex: boundary.dataStartRowIndex,
          dataEndRowIndex: boundary.dataEndRowIndex,
          columnsToKeep,
        });
        setRawData(columns, rows);
      }

      if (schemaId) setCurrentSchema(schemaId);
      router.push("/mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
      setStep("preview");
    }
  }, [preview, boundary, schemaId, setCurrentSchema, setRawData, router]);

  const resetToIdle = () => {
    setStep("idle");
    setPreview(null);
    setBoundary(null);
    setAnalysis(null);
    setError(null);
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) loadPreview(file);
    },
    [loadPreview],
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadPreview(file);
    e.target.value = "";
  };

  if (!schemaId || !schema) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Select a schema first</CardTitle>
            <CardDescription>
              Go to Final Schemas and click &quot;Use&quot; on a schema to upload raw data for it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/schemas")}>Go to Schemas</Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const targetPaths = flattenFields(schema.fields).map((f) => f.path);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/schemas")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Upload raw data</h1>
            <p className="text-muted-foreground">
              Use schema &quot;{schema.name}&quot;. Upload Excel or CSV to map to the final structure.
            </p>
          </div>
        </div>

        {step === "idle" && (
          <Card className="border border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                AI-powered data cleaning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The AI agent will automatically analyse your raw file to detect the real header row,
                trim metadata/title rows, remove noise columns, and extract clean data — even if the
                headers aren&apos;t on the first row. You can adjust the boundaries manually after.
              </p>
            </CardContent>
          </Card>
        )}

        <Card
          className={`border-2 border-dashed transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          } ${step !== "idle" && step !== "preview" ? "" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {preview ? preview.fileName : "Drag and drop"}
            </CardTitle>
            <CardDescription>
              {preview
                ? "File loaded. Adjust boundaries below and click Continue when ready."
                : "Drop an Excel (.xlsx, .xls) or CSV file here, or click to browse."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFileInput}
            />
            {step === "idle" && (
              <Button
                size="lg"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose file
              </Button>
            )}
            {(step === "loading_preview" || step === "analyzing") && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {step === "analyzing"
                    ? "AI is analyzing structure…"
                    : "Loading preview…"}
                </span>
              </div>
            )}
            {step === "parsing" && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  Parsing data with selected boundaries…
                </span>
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>

        {step === "preview" && analysis && (
          <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4 text-blue-500" />
                AI Analysis Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                Header detected at row {analysis.headerRowIndex + 1} — trimmed{" "}
                {analysis.trimmedRowCount} metadata row(s)
              </p>
              <p>
                Keeping {analysis.columnsToKeep.length} of{" "}
                {preview!.totalColumns} columns
              </p>
              <p>
                Headers found:{" "}
                {analysis.headers.slice(0, 10).join(", ")}
                {analysis.headers.length > 10 ? "…" : ""}
              </p>
              {analysis.notes && <p className="italic">{analysis.notes}</p>}
            </CardContent>
          </Card>
        )}

        {step === "preview" && preview && boundary && (
          <>
            <DataPreviewTable
              grid={preview.grid}
              totalRows={preview.totalRows}
              totalColumns={preview.totalColumns}
              initialBoundary={boundary}
              onBoundaryChange={setBoundary}
            />

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={resetToIdle}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Upload different file
              </Button>
              <Button onClick={confirmAndParse}>
                Confirm & Continue to Mapping
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {step === "idle" && targetPaths.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Target fields ({targetPaths.length})</CardTitle>
              <CardDescription>
                After upload you will map your columns to these:{" "}
                {targetPaths.slice(0, 8).join(", ")}
                {targetPaths.length > 8 ? "…" : ""}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
