"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { flattenFields } from "@/lib/schema-store";
import { parseExcelToRows } from "@/lib/parse-excel";
import { parseCsvToRows, extractCsvPreviewTopBottom } from "@/lib/parse-csv";
import { extractExcelGridTopBottom, getExcelSheetNames } from "@/lib/parse-excel-preview";
import type { RawDataAnalysis } from "@/lib/llm-schema";
import DataPreviewTable, { type DataBoundary, type IndexedRow } from "@/components/DataPreviewTable";
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

const PREVIEW_TOP_N = 30;
const PREVIEW_BOTTOM_N = 0;
const PREVIEW_MAX_COLS = 50;

interface PreviewData {
  rows: IndexedRow[];
  totalRows: number;
  totalColumns: number;
  fileName: string;
  isExcel: boolean;
  csvText?: string;
  excelBuffer?: ArrayBuffer;
  /** Excel only: names of all sheets */
  sheetNames?: string[];
  /** Excel only: 0-based index of the sheet to process */
  activeSheetIndex?: number;
}

export default function UploadPage() {
  const router = useRouter();
  const { getSchema, setCurrentSchema, setRawData, resetWorkflow, workflow, setUploadState } = useSchemaStore();
  const schemaId = workflow.currentSchemaId;
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RawDataAnalysis | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [boundary, setBoundary] = useState<DataBoundary | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedCountRef = useRef(PREVIEW_TOP_N);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);

  const schema = schemaId ? getSchema(schemaId) : null;

  // Restore persisted upload state when returning to this page with the same schema
  useEffect(() => {
    if (!schemaId || !schema || restoredRef.current) return;
    const saved = workflow.uploadState;
    if (saved?.schemaId === schemaId && saved.step === "preview" && saved.preview && saved.boundary) {
      restoredRef.current = true;
      setStep("preview");
      setPreview(saved.preview as PreviewData);
      setBoundary(saved.boundary as DataBoundary);
      setAnalysis((saved.analysis as RawDataAnalysis) ?? null);
    }
  }, [schemaId, schema, workflow.uploadState]);

  // Persist upload state while in preview so navigating back restores the data
  useEffect(() => {
    if (step === "preview" && preview && boundary && schemaId) {
      setUploadState({ schemaId, step: "preview", preview, boundary, analysis });
    }
  }, [step, preview, boundary, analysis, schemaId, setUploadState]);

  const loadPreview = useCallback(
    async (file: File) => {
      setError(null);
      setAnalysis(null);
      setPreview(null);
      setBoundary(null);
      loadedCountRef.current = PREVIEW_TOP_N;
      const savedSchemaId = schemaId;
      resetWorkflow();
      if (savedSchemaId) setCurrentSchema(savedSchemaId);

      const ext = file.name.toLowerCase();
      const isExcel = ext.endsWith(".xlsx") || ext.endsWith(".xls");
      const isCsv = ext.endsWith(".csv");

      if (!isExcel && !isCsv) {
        setError("Please upload a CSV or Excel (.xlsx, .xls) file.");
        return;
      }

      try {
        setStep("loading_preview");

        if (isExcel) {
          const buffer = await file.arrayBuffer();
          const sheetNames = await getExcelSheetNames(buffer);
          const { rows: previewRows, totalRows, totalColumns } = await extractExcelGridTopBottom(
            buffer, PREVIEW_TOP_N, PREVIEW_BOTTOM_N, PREVIEW_MAX_COLS, 0,
          );

          let llmBoundary: RawDataAnalysis | undefined;
          setStep("analyzing");
          try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("totalRows", String(totalRows));
            formData.append("totalColumns", String(totalColumns));
            const res = await fetch("/api/analyze-raw", {
              method: "POST",
              body: formData,
            });
            if (res.ok) {
              llmBoundary = await res.json();
              setAnalysis(llmBoundary!);
            }
          } catch {
            // LLM analysis failed — user can still set boundaries manually
          }

          const defaultBoundary: DataBoundary = {
            headerRowIndex: llmBoundary?.headerRowIndex ?? 0,
            dataStartRowIndex: llmBoundary?.dataStartRowIndex ?? 1,
            dataEndRowIndex: llmBoundary?.dataEndRowIndex ?? totalRows - 1,
            startColumn: llmBoundary?.startColumn ?? 0,
            endColumn: llmBoundary?.endColumn ?? totalColumns - 1,
          };

          setBoundary(defaultBoundary);
          setPreview({
            rows: previewRows,
            totalRows,
            totalColumns,
            fileName: file.name,
            isExcel: true,
            excelBuffer: buffer,
            sheetNames,
            activeSheetIndex: 0,
          });
        } else {
          const csvText = await file.text();
          const { rows: previewRows, totalRows, totalColumns } = extractCsvPreviewTopBottom(
            csvText, PREVIEW_TOP_N, PREVIEW_BOTTOM_N,
          );

          const defaultBoundary: DataBoundary = {
            headerRowIndex: 0,
            dataStartRowIndex: 1,
            dataEndRowIndex: totalRows - 1,
            startColumn: 0,
            endColumn: totalColumns - 1,
          };

          setBoundary(defaultBoundary);
          setPreview({
            rows: previewRows,
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
    [resetWorkflow, schemaId, setCurrentSchema],
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
          headerRowIndex: boundary.headerRowIndex,
          dataStartRowIndex: boundary.dataStartRowIndex,
          dataEndRowIndex: boundary.dataEndRowIndex,
          columnsToKeep,
          sheetIndex: preview.activeSheetIndex ?? 0,
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

      // Persist upload state so navigating back restores the preview
      if (schemaId) {
        setUploadState({ schemaId, step: "preview", preview, boundary, analysis });
      }

      router.push("/mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
      setStep("preview");
    }
  }, [preview, boundary, schemaId, analysis, setRawData, router, setUploadState]);

  const switchToSheet = useCallback(
    async (sheetIndex: number) => {
      if (!preview?.isExcel || !preview.excelBuffer || preview.activeSheetIndex === sheetIndex)
        return;
      const { rows: previewRows, totalRows, totalColumns } = await extractExcelGridTopBottom(
        preview.excelBuffer,
        PREVIEW_TOP_N,
        PREVIEW_BOTTOM_N,
        PREVIEW_MAX_COLS,
        sheetIndex,
      );
      const defaultBoundary: DataBoundary = {
        headerRowIndex: 0,
        dataStartRowIndex: 1,
        dataEndRowIndex: Math.max(0, totalRows - 1),
        startColumn: 0,
        endColumn: Math.max(0, totalColumns - 1),
      };
      setBoundary(defaultBoundary);
      setPreview((prev) =>
        prev
          ? {
              ...prev,
              rows: previewRows,
              totalRows,
              totalColumns,
              activeSheetIndex: sheetIndex,
            }
          : prev,
      );
      if (sheetIndex !== 0) setAnalysis(null);
    },
    [preview],
  );

  const handleBoundaryChange = useCallback((newBoundary: DataBoundary) => {
    setBoundary(newBoundary);
    // No refetch on boundary change — data is only loaded via "Load More Rows" or initial load
  }, []);

  const loadMoreRows = useCallback(async () => {
    if (!preview || loadingMore) return;

    setLoadingMore(true);
    const nextCount = loadedCountRef.current + PREVIEW_TOP_N;

    try {
      if (preview.isExcel && preview.excelBuffer) {
        const bnd = boundary ? {
          headerRowIndex: boundary.headerRowIndex,
          dataStartRowIndex: boundary.dataStartRowIndex,
          dataEndRowIndex: boundary.dataEndRowIndex,
        } : undefined;
        const { rows: newRows, totalRows, totalColumns } = await extractExcelGridTopBottom(
          preview.excelBuffer,
          nextCount,
          PREVIEW_BOTTOM_N,
          PREVIEW_MAX_COLS,
          preview.activeSheetIndex ?? 0,
          bnd,
        );
        loadedCountRef.current = nextCount;
        setPreview((prev) => prev ? { ...prev, rows: newRows, totalRows, totalColumns } : prev);
      } else if (preview.csvText) {
        const bnd = boundary ? {
          headerRowIndex: boundary.headerRowIndex,
          dataStartRowIndex: boundary.dataStartRowIndex,
          dataEndRowIndex: boundary.dataEndRowIndex,
        } : undefined;
        const { rows: newRows, totalRows, totalColumns } = extractCsvPreviewTopBottom(
          preview.csvText, nextCount, PREVIEW_BOTTOM_N, bnd,
        );
        loadedCountRef.current = nextCount;
        setPreview((prev) => prev ? { ...prev, rows: newRows, totalRows, totalColumns } : prev);
      }
    } catch {
      // Keep existing preview on error
    } finally {
      setLoadingMore(false);
    }
  }, [preview, boundary, loadingMore]);

  const resetToIdle = () => {
    setStep("idle");
    setPreview(null);
    setBoundary(null);
    setAnalysis(null);
    setError(null);
    setUploadState(null);
    loadedCountRef.current = PREVIEW_TOP_N;
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
      <div className="flex flex-col animate-fade-in min-w-0">
        <div className="shrink-0 flex items-center justify-between pb-3">
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
          {step === "preview" && preview && boundary && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={resetToIdle}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Upload different file
              </Button>
              <Button onClick={confirmAndParse}>
                Confirm & Continue to Mapping
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-1 min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pb-4">
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

        {step === "preview" && analysis && preview && (
          <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4 text-blue-500" />
                AI Analysis Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                Header detected at row {analysis.headerRowIndex + 1}, data rows{" "}
                {analysis.dataStartRowIndex + 1}–{analysis.dataEndRowIndex + 1}
              </p>
              <p>
                Columns {analysis.startColumn + 1}–{analysis.endColumn + 1} ({analysis.endColumn - analysis.startColumn + 1} of{" "}
                {preview!.totalColumns} columns)
              </p>
              {analysis.notes && <p className="italic">{analysis.notes}</p>}
            </CardContent>
          </Card>
        )}

        {step === "preview" && preview && boundary && (
          <>
            {preview.isExcel && preview.sheetNames && preview.sheetNames.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Sheets</p>
                <div className="flex flex-wrap gap-1 border-b border-border pb-0">
                  {preview.sheetNames.map((name, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => switchToSheet(index)}
                      className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
                        (preview.activeSheetIndex ?? 0) === index
                          ? "border border-b-0 border-border bg-background text-foreground -mb-px"
                          : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {name || `Sheet ${index + 1}`}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Only the active sheet will be processed. Click a sheet to switch.
                </p>
              </div>
            )}

            <DataPreviewTable
              rows={preview.rows}
              totalRows={preview.totalRows}
              totalColumns={preview.totalColumns}
              initialBoundary={boundary}
              onBoundaryChange={handleBoundaryChange}
              onLoadMore={loadMoreRows}
              loadingMore={loadingMore}
            />
          </>
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
      </div>
    </DashboardLayout>
  );
}
