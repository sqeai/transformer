"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useSchemaStore,
  flattenFields,
  type SheetSelection,
  type SheetJobResult,
} from "@/lib/schema-store";
import { extractExcelGridTopBottom } from "@/lib/parse-excel-preview";
import { parseExcelToRows } from "@/lib/parse-excel";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Square,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ExcelJS from "exceljs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MappingFlow = dynamic(() => import("@/components/MappingFlow"), { ssr: false });

const PREVIEW_ROWS = 100;
const POLL_INTERVAL_MS = 1500;

type Step = "upload" | "processing" | "review" | "export";

const STEPS: { key: Step; label: string; number: number }[] = [
  { key: "upload", label: "Upload Raw Data", number: 1 },
  { key: "processing", label: "Processing", number: 2 },
  { key: "review", label: "Review", number: 3 },
  { key: "export", label: "Export", number: 4 },
];

interface PreviewState {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  visibleRows: number;
}

interface UploadedSheetRef {
  sheetId: string;
  filePath: string;
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [];
  lines.push(columns.map((col) => escapeCsvCell(col)).join(","));
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvCell(row[col])).join(","));
  }
  return lines.join("\n");
}

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
              i < currentIndex
                ? "bg-primary text-primary-foreground"
                : i === currentIndex
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < currentIndex ? <Check className="h-4 w-4" /> : step.number}
          </div>
          <span
            className={cn(
              "text-sm font-medium hidden sm:inline",
              i === currentIndex ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={cn("h-px w-8", i < currentIndex ? "bg-primary" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

function NewDatasetPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    schemas,
    getSchema,
    datasetWorkflow,
    setDatasetWorkflow,
    resetDatasetWorkflow,
  } = useSchemaStore();

  const schemaId = searchParams.get("schemaId") ?? datasetWorkflow.schemaId;
  const datasetIdParam = searchParams.get("datasetId");
  const schema = schemaId ? getSchema(schemaId) : null;
  const targetPaths = useMemo(() => {
    if (!schema) return [];
    return flattenFields(schema.fields)
      .filter((f) => !f.children?.length)
      .map((f) => f.path);
  }, [schema]);

  const [step, setStep] = useState<Step>(datasetWorkflow.step || "upload");
  const [selectedSheets, setSelectedSheets] = useState<SheetSelection[]>(datasetWorkflow.selectedSheets);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Preview state
  const [previewSheet, setPreviewSheet] = useState<SheetSelection | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTopRows, setPreviewTopRows] = useState(PREVIEW_ROWS);

  // Processing state
  const [jobResults, setJobResults] = useState<SheetJobResult[]>(datasetWorkflow.jobResults);
  const [uploadedSheetRefs, setUploadedSheetRefs] = useState<Record<string, UploadedSheetRef>>({});
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Review state
  const [reviewSheetIndex, setReviewSheetIndex] = useState(0);
  const [reviewSubTab, setReviewSubTab] = useState<"original" | "modified" | "mapping">("modified");
  const [confirmedSheets, setConfirmedSheets] = useState<Set<string>>(
    new Set(datasetWorkflow.confirmedSheetIds),
  );
  const [modifyPrompt, setModifyPrompt] = useState("");
  const modifyPollingRef = useRef<NodeJS.Timeout | null>(null);
  const modifyJobIdRef = useRef<string | null>(null);
  const [modifySubmittingSheetKey, setModifySubmittingSheetKey] = useState<string | null>(null);
  const [originalPreview, setOriginalPreview] = useState<PreviewState | null>(null);
  const [originalPreviewLoading, setOriginalPreviewLoading] = useState(false);
  const allOriginalRowsRef = useRef<Record<string, unknown>[]>([]);
  const [originalVisibleCount, setOriginalVisibleCount] = useState(PREVIEW_ROWS);
  const [modifiedVisibleCount, setModifiedVisibleCount] = useState(PREVIEW_ROWS);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  // Export state
  const [exportTargetDatasetId, setExportTargetDatasetId] = useState<string>(
    datasetIdParam ?? datasetWorkflow.exportTargetDatasetId ?? "__new",
  );
  const [newDatasetName, setNewDatasetName] = useState("");
  const [existingDatasets, setExistingDatasets] = useState<Array<{ id: string; name: string }>>([]);
  const [exporting, setExporting] = useState(false);

  const files = datasetWorkflow.files;

  const uploadSheetCsv = useCallback(async (
    args: {
      sheetName: string;
      columns: string[];
      rows: Record<string, unknown>[];
      type: "raw" | "processed" | "intermediary";
    },
  ): Promise<UploadedSheetRef> => {
    const presignRes = await fetch("/api/sheets/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: args.sheetName,
        type: args.type,
        dimensions: {
          rowCount: args.rows.length,
          columnCount: args.columns.length,
        },
      }),
    });
    const presignData = await presignRes.json();
    if (!presignRes.ok) {
      throw new Error(presignData.error ?? "Failed to request sheet upload URL");
    }

    const csvPayload = rowsToCsv(args.columns, args.rows);
    const uploadRes = await fetch(String(presignData.uploadUrl), {
      method: "PUT",
      headers: {
        "Content-Type": "text/csv",
      },
      body: csvPayload,
    });
    if (!uploadRes.ok) {
      throw new Error("Failed to upload sheet CSV to S3");
    }

    return {
      sheetId: String(presignData.sheetId),
      filePath: String(presignData.filePath),
    };
  }, []);

  // Auto-expand files
  useEffect(() => {
    if (files.length > 0 && expandedFiles.size === 0) {
      setExpandedFiles(new Set(files.map((f) => f.fileId)));
    }
  }, [files]);

  // Auto-select all sheets initially
  useEffect(() => {
    if (selectedSheets.length === 0 && files.length > 0) {
      const allSheets: SheetSelection[] = [];
      for (const file of files) {
        for (let i = 0; i < file.sheetNames.length; i++) {
          allSheets.push({
            fileId: file.fileId,
            fileName: file.fileName,
            sheetIndex: i,
            sheetName: file.sheetNames[i],
          });
        }
      }
      setSelectedSheets(allSheets);
    }
  }, [files, selectedSheets.length]);

  // Default preview to the first sheet
  useEffect(() => {
    if (!previewSheet && files.length > 0 && files[0].sheetNames.length > 0) {
      setPreviewSheet({
        fileId: files[0].fileId,
        fileName: files[0].fileName,
        sheetIndex: 0,
        sheetName: files[0].sheetNames[0],
      });
    }
  }, [files, previewSheet]);

  // Load preview for selected sheet
  useEffect(() => {
    setPreviewTopRows(PREVIEW_ROWS);
  }, [previewSheet?.fileId, previewSheet?.sheetIndex]);

  useEffect(() => {
    if (!previewSheet) return;
    const file = files.find((f) => f.fileId === previewSheet.fileId);
    if (!file) return;

    let cancelled = false;
    setPreviewLoading(true);

    (async () => {
      try {
        const result = await extractExcelGridTopBottom(
          file.buffer,
          previewTopRows,
          0,
          100,
          previewSheet.sheetIndex,
        );
        if (cancelled) return;
        const columns = result.rows.length > 0 ? result.rows[0].data.map((_: string, i: number) => `Column ${i + 1}`) : [];
        const rows = result.rows.map((r: { originalIndex: number; data: string[] }) => {
          const row: Record<string, unknown> = {};
          r.data.forEach((cell: string, i: number) => {
            row[columns[i]] = cell;
          });
          return row;
        });
        setPreview({ columns, rows, totalRows: result.totalRows, visibleRows: rows.length });
      } catch {
        setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [previewSheet, files, previewTopRows]);

  // Persist workflow state
  useEffect(() => {
    setDatasetWorkflow({
      step,
      selectedSheets,
      jobResults,
      confirmedSheetIds: Array.from(confirmedSheets),
    });
  }, [step, selectedSheets, jobResults, confirmedSheets]);

  const toggleSheet = (sheet: SheetSelection) => {
    const key = `${sheet.fileId}:${sheet.sheetIndex}`;
    setSelectedSheets((prev) => {
      const exists = prev.some((s) => `${s.fileId}:${s.sheetIndex}` === key);
      if (exists) return prev.filter((s) => `${s.fileId}:${s.sheetIndex}` !== key);
      return [...prev, sheet];
    });
  };

  const toggleAllSheetsForFile = (fileId: string) => {
    const file = files.find((f) => f.fileId === fileId);
    if (!file) return;

    const fileSheets: SheetSelection[] = file.sheetNames.map((sheetName, sheetIndex) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      sheetIndex,
      sheetName,
    }));

    setSelectedSheets((prev) => {
      const allSelected = fileSheets.every((sheet) =>
        prev.some((s) => s.fileId === sheet.fileId && s.sheetIndex === sheet.sheetIndex),
      );

      if (allSelected) {
        return prev.filter((s) => s.fileId !== file.fileId);
      }

      const existingKeys = new Set(prev.map((s) => `${s.fileId}:${s.sheetIndex}`));
      const missingSheets = fileSheets.filter(
        (sheet) => !existingKeys.has(`${sheet.fileId}:${sheet.sheetIndex}`),
      );
      return [...prev, ...missingSheets];
    });
  };

  const isSheetSelected = (fileId: string, sheetIndex: number) =>
    selectedSheets.some((s) => s.fileId === fileId && s.sheetIndex === sheetIndex);

  // Step 2: Submit jobs
  const submitJobs = useCallback(async () => {
    if (!schemaId || selectedSheets.length === 0) return;

    setStep("processing");
    const results: SheetJobResult[] = [];
    const nextUploadedRefs: Record<string, UploadedSheetRef> = {};

    for (const sheet of selectedSheets) {
      const file = files.find((f) => f.fileId === sheet.fileId);
      if (!file) continue;

      try {
        const parsed = await parseExcelToRows(file.buffer, {
          headerRowIndex: 0,
          dataStartRowIndex: 1,
          sheetIndex: sheet.sheetIndex,
        });
        const uploaded = await uploadSheetCsv({
          sheetName: sheet.sheetName,
          columns: parsed.columns,
          rows: parsed.rows,
          type: "raw",
        });
        nextUploadedRefs[`${sheet.fileId}:${sheet.sheetIndex}`] = uploaded;

        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "data_cleanse",
            sheetId: uploaded.sheetId,
            payload: {
              filePath: uploaded.filePath,
              targetPaths,
              sheetName: sheet.sheetName,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create job");

        results.push({
          jobId: data.jobId,
          sheet,
          status: "pending",
        });
      } catch (err) {
        results.push({
          jobId: "",
          sheet,
          status: "failed",
          error: err instanceof Error ? err.message : "Failed to create job",
        });
      }
    }

    setUploadedSheetRefs((prev) => ({ ...prev, ...nextUploadedRefs }));
    setJobResults(results);

    // Trigger job processing
    fetch("/api/jobs/process", { method: "POST" }).catch(() => {});

    // Start polling
    startPolling(results);
  }, [schemaId, selectedSheets, files, targetPaths, uploadSheetCsv]);

  const startPolling = (initialResults: SheetJobResult[]) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    const jobIds = initialResults.filter((r) => r.jobId).map((r) => r.jobId);
    if (jobIds.length === 0) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs?ids=${jobIds.join(",")}`);
        const data = await res.json();
        if (!res.ok) return;

        const jobMap = new Map<string, { status: string; result?: unknown; error?: string }>();
        for (const job of data.jobs ?? []) {
          jobMap.set(job.id, job);
        }

        setJobResults((prev) => {
          const updated = prev.map((r) => {
            const job = jobMap.get(r.jobId);
            if (!job) return r;
            return {
              ...r,
              status: job.status as SheetJobResult["status"],
              result: job.result as SheetJobResult["result"],
              error: job.error,
            };
          });

          const allDone = updated.every(
            (r) => r.status === "completed" || r.status === "failed" || !r.jobId,
          );

          if (allDone) {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            // Re-trigger processing for any pending jobs
            const hasPending = updated.some((r) => r.status === "pending");
            if (hasPending) {
              fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
            }
          }

          return updated;
        });

        // Retrigger processing periodically
        fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      } catch {
        // ignore polling errors
      }
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Auto-transition from processing to review
  const allJobsDone = jobResults.length > 0 && jobResults.every(
    (r) => r.status === "completed" || r.status === "failed" || !r.jobId,
  );

  useEffect(() => {
    if (step === "processing" && allJobsDone) {
      const timer = setTimeout(() => setStep("review"), 1000);
      return () => clearTimeout(timer);
    }
  }, [step, allJobsDone]);

  // Load original data for review tab
  const loadOriginalPreview = useCallback(async (sheetResult: SheetJobResult) => {
    const file = files.find((f) => f.fileId === sheetResult.sheet.fileId);
    if (!file) return;

    setOriginalPreviewLoading(true);
    try {
      const parsed = await parseExcelToRows(file.buffer, {
        headerRowIndex: 0,
        dataStartRowIndex: 1,
        sheetIndex: sheetResult.sheet.sheetIndex,
      });
      allOriginalRowsRef.current = parsed.rows;
      setOriginalVisibleCount(PREVIEW_ROWS);
      setOriginalPreview({
        columns: parsed.columns,
        rows: parsed.rows,
        totalRows: parsed.rows.length,
        visibleRows: parsed.rows.length,
      });
    } catch {
      setOriginalPreview(null);
    } finally {
      setOriginalPreviewLoading(false);
    }
  }, [files]);

  // Any sheet currently being re-processed (globally blocks nav)
  const anySheetProcessing = useMemo(
    () => jobResults.some((r) => r.status === "pending" || r.status === "running"),
    [jobResults],
  );

  // Start polling for modify job
  const startModifyPolling = useCallback((jobId: string) => {
    if (modifyPollingRef.current) clearInterval(modifyPollingRef.current);
    modifyJobIdRef.current = jobId;

    modifyPollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs?ids=${jobId}`);
        const data = await res.json();
        if (!res.ok) return;

        const job = data.jobs?.[0];
        if (!job) return;

        setJobResults((prev) =>
          prev.map((r) =>
            r.jobId === jobId
              ? {
                  ...r,
                  status: job.status as SheetJobResult["status"],
                  result: (job.result as SheetJobResult["result"] | undefined) ?? r.result,
                  error: job.error,
                }
              : r,
          ),
        );

        if (job.status === "completed" || job.status === "failed") {
          if (modifyPollingRef.current) {
            clearInterval(modifyPollingRef.current);
            modifyPollingRef.current = null;
          }
          modifyJobIdRef.current = null;
        }

        fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      } catch {
        // ignore polling errors
      }
    }, POLL_INTERVAL_MS);
  }, []);

  // Stop/cancel the modify job polling
  const handleStopModify = useCallback(() => {
    if (modifyPollingRef.current) {
      clearInterval(modifyPollingRef.current);
      modifyPollingRef.current = null;
    }
    const stoppedJobId = modifyJobIdRef.current;
    modifyJobIdRef.current = null;

    if (stoppedJobId) {
      setJobResults((prev) =>
        prev.map((r) =>
          r.jobId === stoppedJobId && (r.status === "pending" || r.status === "running")
            ? { ...r, status: "failed" as const, error: "Stopped by user" }
            : r,
        ),
      );
    }
  }, []);

  // Clean up modify polling on unmount
  useEffect(() => {
    return () => {
      if (modifyPollingRef.current) clearInterval(modifyPollingRef.current);
    };
  }, []);

  // Modify using AI - creates a job and polls
  const handleModifyWithAI = useCallback(async (sheetResult: SheetJobResult) => {
    if (!modifyPrompt.trim() || !schemaId) return;

    const currentSheetKey = `${sheetResult.sheet.fileId}:${sheetResult.sheet.sheetIndex}`;
    setModifySubmittingSheetKey(currentSheetKey);

    try {
      if (!sheetResult.result) throw new Error("No modified sheet is available yet for this tab.");

      const modifiedColumns = sheetResult.result.transformedColumns;
      const modifiedRows = sheetResult.result.transformedRows;
      const originalRef = uploadedSheetRefs[currentSheetKey];
      const uploadedModified = await uploadSheetCsv({
        sheetName: `${sheetResult.sheet.sheetName} (modified)`,
        columns: modifiedColumns,
        rows: modifiedRows,
        type: "intermediary",
      });

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "data_cleanse",
          sheetId: originalRef?.sheetId,
          payload: {
            filePath: uploadedModified.filePath,
            targetPaths,
            sheetName: sheetResult.sheet.sheetName,
            userDirective: modifyPrompt.trim(),
            originalFilePath: originalRef?.filePath,
            modifiedFilePath: uploadedModified.filePath,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create job");

      setJobResults((prev) =>
        prev.map((r) =>
          r.sheet.fileId === sheetResult.sheet.fileId && r.sheet.sheetIndex === sheetResult.sheet.sheetIndex
            ? { ...r, jobId: data.jobId, status: "pending" as const, result: r.result, error: undefined }
            : r,
        ),
      );

      setModifyPrompt("");
      setModifySubmittingSheetKey(null);
      setUploadedSheetRefs((prev) => ({
        ...prev,
        [currentSheetKey]: uploadedModified,
      }));

      fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      startModifyPolling(data.jobId);
    } catch (err) {
      setModifySubmittingSheetKey(null);
      alert(err instanceof Error ? err.message : "Failed to modify");
    }
  }, [modifyPrompt, schemaId, targetPaths, startModifyPolling, uploadedSheetRefs, uploadSheetCsv]);

  const toggleConfirmSheet = (sheetResult: SheetJobResult) => {
    const key = `${sheetResult.sheet.fileId}:${sheetResult.sheet.sheetIndex}`;
    setConfirmedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Export step
  useEffect(() => {
    if (step !== "export" || !schemaId) return;
    fetch(`/api/datasets?schemaId=${schemaId}&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        setExistingDatasets(
          (data.datasets ?? []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })),
        );
      })
      .catch(() => {});
  }, [step, schemaId]);

  const handleExport = useCallback(async () => {
    if (!schemaId) return;
    setExporting(true);

    try {
      const confirmedResults = jobResults.filter((r) => {
        const key = `${r.sheet.fileId}:${r.sheet.sheetIndex}`;
        return confirmedSheets.has(key) && r.status === "completed" && r.result;
      });

      const allRows: Record<string, unknown>[] = [];
      for (const r of confirmedResults) {
        if (r.result?.transformedRows) {
          allRows.push(...r.result.transformedRows);
        }
      }

      if (exportTargetDatasetId === "__new") {
        const name = newDatasetName.trim() || `Dataset ${new Date().toLocaleDateString()}`;
        const res = await fetch("/api/datasets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schemaId,
            name,
            rows: allRows,
            mappingSnapshot: {
              toolsUsed: confirmedResults.map((r) => r.result?.toolsUsed ?? []),
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create dataset");
        resetDatasetWorkflow();
        router.push(`/datasets/${data.dataset.id}`);
      } else {
        const res = await fetch(`/api/datasets/${exportTargetDatasetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appendRows: allRows }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to append to dataset");
        }
        resetDatasetWorkflow();
        router.push(`/datasets/${exportTargetDatasetId}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [schemaId, jobResults, confirmedSheets, exportTargetDatasetId, newDatasetName, resetDatasetWorkflow, router]);

  const handleDownloadExcel = useCallback(async () => {
    setDownloadingExcel(true);
    try {
      const confirmedResults = jobResults.filter((r) => {
        const key = `${r.sheet.fileId}:${r.sheet.sheetIndex}`;
        return confirmedSheets.has(key) && r.status === "completed" && r.result;
      });

      const allCols = confirmedResults[0]?.result?.transformedColumns ?? [];
      const allRows: Record<string, unknown>[] = [];
      for (const r of confirmedResults) {
        if (r.result?.transformedRows) {
          allRows.push(...r.result.transformedRows);
        }
      }

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Data");
      sheet.addRow(allCols);
      for (const row of allRows) {
        sheet.addRow(allCols.map((c) => row[c] ?? ""));
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${newDatasetName.trim() || `Dataset ${new Date().toLocaleDateString()}`}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingExcel(false);
    }
  }, [jobResults, confirmedSheets, newDatasetName]);

  if (!schemaId || !schema) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground text-lg">No schema selected.</p>
          <Button className="mt-4" onClick={() => router.push("/datasets")}>
            Back to Datasets
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const reviewableResults = jobResults.filter(
    (r) => (r.status === "completed" || r.status === "pending" || r.status === "running") && Boolean(r.result),
  );
  const confirmedCount = Array.from(confirmedSheets).filter((key) =>
    jobResults.some((r) => `${r.sheet.fileId}:${r.sheet.sheetIndex}` === key && r.status === "completed"),
  ).length;

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/datasets")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Dataset</h1>
            <p className="text-sm text-muted-foreground">
              Schema: <span className="font-medium">{schema.name}</span>
            </p>
          </div>
        </div>

        <StepIndicator currentStep={step} />

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Files & Sheets</CardTitle>
                <CardDescription>Select sheets to process</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {files.map((file) => (
                    <div key={file.fileId}>
                      {(() => {
                        const allFileSheetsSelected =
                          file.sheetNames.length > 0 &&
                          file.sheetNames.every((_, idx) => isSheetSelected(file.fileId, idx));
                        const someFileSheetsSelected =
                          file.sheetNames.some((_, idx) => isSheetSelected(file.fileId, idx));

                        return (
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted">
                            <button
                              type="button"
                              className="flex items-center justify-center shrink-0"
                              onClick={() => {
                                setExpandedFiles((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(file.fileId)) next.delete(file.fileId);
                                  else next.add(file.fileId);
                                  return next;
                                });
                              }}
                            >
                              {expandedFiles.has(file.fileId) ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                              )}
                            </button>
                            <input
                              type="checkbox"
                              checked={allFileSheetsSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = !allFileSheetsSelected && someFileSheetsSelected;
                              }}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleAllSheetsForFile(file.fileId);
                              }}
                              className="rounded"
                            />
                            <button
                              type="button"
                              className="flex items-center gap-2 flex-1 text-sm text-left min-w-0"
                              onClick={() => {
                                setExpandedFiles((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(file.fileId)) next.delete(file.fileId);
                                  else next.add(file.fileId);
                                  return next;
                                });
                              }}
                            >
                              <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium">{file.fileName}</span>
                            </button>
                          </div>
                        );
                      })()}
                      {expandedFiles.has(file.fileId) && (
                        <div className="ml-6 space-y-0.5">
                          {file.sheetNames.map((name, idx) => {
                            const selected = isSheetSelected(file.fileId, idx);
                            const sheet: SheetSelection = {
                              fileId: file.fileId,
                              fileName: file.fileName,
                              sheetIndex: idx,
                              sheetName: name,
                            };
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer",
                                  selected ? "bg-primary/10" : "hover:bg-muted",
                                  previewSheet?.fileId === file.fileId && previewSheet?.sheetIndex === idx && "ring-1 ring-primary",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleSheet(sheet)}
                                  className="rounded"
                                />
                                <button
                                  type="button"
                                  className="flex-1 text-left truncate"
                                  onClick={() => setPreviewSheet(sheet)}
                                >
                                  {name || `Sheet ${idx + 1}`}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {files.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No files uploaded. Go back and add files.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview</CardTitle>
                <CardDescription>
                  {previewSheet
                    ? `${previewSheet.fileName} / ${previewSheet.sheetName}`
                    : "Select a sheet to preview"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {previewLoading ? (
                  <div className="flex items-center gap-2 justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading preview...
                  </div>
                ) : preview ? (
                  <ScrollArea className="w-full rounded-md border max-h-[700px]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                          <TableHead className="w-14 whitespace-nowrap bg-background">#</TableHead>
                          {preview.columns.map((col) => (
                            <TableHead key={col} className="whitespace-nowrap bg-background">{col}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            {preview.columns.map((col) => (
                              <TableCell key={col} className="whitespace-nowrap max-w-[200px] truncate">
                                {String(row[col] ?? "")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    Click a sheet on the left to preview its contents.
                  </div>
                )}
                {preview && preview.totalRows > preview.visibleRows && (
                  <div className="mt-2 flex flex-col items-center gap-2">
                    <p className="text-xs text-muted-foreground text-center">
                      Showing {preview.visibleRows} of {preview.totalRows} rows
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewTopRows((prev) => prev + PREVIEW_ROWS)}
                      disabled={previewLoading}
                    >
                      {previewLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Load more
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="lg:col-span-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => router.push("/datasets")}>
                Cancel
              </Button>
              <Button
                onClick={submitJobs}
                disabled={selectedSheets.length === 0}
              >
                Next: Process {selectedSheets.length} sheet{selectedSheets.length !== 1 ? "s" : ""}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === "processing" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Data Cleanser is Processing
              </CardTitle>
              <CardDescription>
                Each sheet is being analyzed and transformed by the AI agent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {jobResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                    {r.status === "pending" || r.status === "running" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                    ) : r.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.sheet.fileName} / {r.sheet.sheetName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.status === "pending" && "Waiting..."}
                        {r.status === "running" && "Processing..."}
                        {r.status === "completed" && `Done - ${r.result?.transformedRows?.length ?? 0} rows`}
                        {r.status === "failed" && (r.error ?? "Failed")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {allJobsDone && (
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => setStep("review")}>
                    Continue to Review
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Sheet tabs */}
            <div className="flex flex-wrap gap-2 border-b pb-2">
              {reviewableResults.map((r, i) => {
                const key = `${r.sheet.fileId}:${r.sheet.sheetIndex}`;
                const isConfirmed = confirmedSheets.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm border transition-colors",
                      reviewSheetIndex === i
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => {
                      setReviewSheetIndex(i);
                      setReviewSubTab("modified");
                      setOriginalVisibleCount(PREVIEW_ROWS);
                      setModifiedVisibleCount(PREVIEW_ROWS);
                      setOriginalPreview(null);
                    }}
                  >
                    {isConfirmed && <Check className="h-3 w-3" />}
                    {r.sheet.sheetName}
                  </button>
                );
              })}
            </div>

            {reviewableResults.length > 0 && reviewableResults[reviewSheetIndex] && (() => {
              const currentResult = reviewableResults[reviewSheetIndex];
              const currentKey = `${currentResult.sheet.fileId}:${currentResult.sheet.sheetIndex}`;
              const isConfirmed = confirmedSheets.has(currentKey);
              const transformedRows = currentResult.result?.transformedRows ?? [];
              const transformedCols = currentResult.result?.transformedColumns ?? [];
              const pipeline = currentResult.result?.pipeline;
              const currentSheetProcessing = currentResult.status === "pending" || currentResult.status === "running";
              const currentSheetKey = `${currentResult.sheet.fileId}:${currentResult.sheet.sheetIndex}`;
              const currentSheetSubmitting = modifySubmittingSheetKey === currentSheetKey;
              const showModifyLoading = currentSheetProcessing || currentSheetSubmitting;

              return (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {currentResult.sheet.fileName} / {currentResult.sheet.sheetName}
                        </CardTitle>
                        <CardDescription>
                          {transformedRows.length} rows, {transformedCols.length} columns
                        </CardDescription>
                      </div>
                      <Button
                        variant={isConfirmed ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleConfirmSheet(currentResult)}
                        disabled={anySheetProcessing}
                      >
                        {isConfirmed ? (
                          <>
                            <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            Confirmed
                          </>
                        ) : (
                          "Confirm Sheet"
                        )}
                      </Button>
                    </div>

                    {/* Sub-tabs */}
                    <div className="flex gap-1 mt-3">
                      {(["original", "modified", "mapping"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          className={cn(
                            "px-3 py-1.5 text-sm rounded-md transition-colors",
                            reviewSubTab === tab
                              ? "bg-muted font-medium"
                              : "text-muted-foreground hover:bg-muted/50",
                          )}
                          onClick={() => {
                            setReviewSubTab(tab);
                            if (tab === "original" && !originalPreview) {
                              loadOriginalPreview(currentResult);
                            }
                          }}
                        >
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {reviewSubTab === "original" && (
                      <>
                        {originalPreviewLoading ? (
                          <div className="flex items-center gap-2 justify-center py-10 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Loading original data...
                          </div>
                        ) : originalPreview ? (
                          <div className="space-y-3">
                            <ScrollArea className="w-full rounded-md border max-h-[700px] overflow-auto">
                              <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                  <TableRow>
                                    <TableHead className="w-14 whitespace-nowrap bg-background">#</TableHead>
                                    {originalPreview.columns.map((col) => (
                                      <TableHead key={col} className="whitespace-nowrap bg-background">{col}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {originalPreview.rows.slice(0, originalVisibleCount).map((row, i) => (
                                    <TableRow key={i}>
                                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                      {originalPreview.columns.map((col) => (
                                        <TableCell key={col} className="whitespace-nowrap max-w-[200px] truncate">
                                          {String(row[col] ?? "")}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                            {originalPreview.totalRows > originalVisibleCount && (
                              <div className="flex flex-col items-center gap-2">
                                <p className="text-xs text-muted-foreground">
                                  Showing {Math.min(originalVisibleCount, originalPreview.totalRows)} of {originalPreview.totalRows} rows
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setOriginalVisibleCount((prev) => prev + PREVIEW_ROWS)}
                                >
                                  Load more
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-center py-4">No preview available.</p>
                        )}
                      </>
                    )}

                    {reviewSubTab === "modified" && (
                      <div className="space-y-4">
                        <ScrollArea className="w-full rounded-md border max-h-[700px] overflow-auto">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-background">
                              <TableRow>
                                <TableHead className="w-14 whitespace-nowrap bg-background">#</TableHead>
                                {transformedCols.map((col) => (
                                  <TableHead key={col} className="whitespace-nowrap bg-background">{col}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {transformedRows.slice(0, modifiedVisibleCount).map((row, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                  {transformedCols.map((col) => (
                                    <TableCell key={col} className="whitespace-nowrap max-w-[200px] truncate">
                                      {String(row[col] ?? "")}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                        {transformedRows.length > modifiedVisibleCount && (
                          <div className="flex flex-col items-center gap-2">
                            <p className="text-xs text-muted-foreground text-center">
                              Showing {Math.min(modifiedVisibleCount, transformedRows.length)} of {transformedRows.length} rows
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setModifiedVisibleCount((prev) => prev + PREVIEW_ROWS)}
                            >
                              Load more
                            </Button>
                          </div>
                        )}

                        {currentSheetProcessing && (
                          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              AI Data Cleanser is re-processing this sheet...
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleStopModify}
                            >
                              <Square className="mr-1.5 h-3.5 w-3.5" />
                              Stop
                            </Button>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Textarea
                            placeholder="Describe how to modify this data (e.g. 'Remove all rows where amount is 0', 'Combine first and last name columns')..."
                            value={modifyPrompt}
                            onChange={(e) => setModifyPrompt(e.target.value)}
                            className="flex-1"
                            rows={2}
                            disabled={showModifyLoading}
                          />
                          <Button
                            onClick={() => handleModifyWithAI(currentResult)}
                            disabled={!modifyPrompt.trim() || anySheetProcessing || currentSheetSubmitting}
                            className="shrink-0"
                          >
                            {showModifyLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="mr-2 h-4 w-4" />
                            )}
                            Modify using AI
                          </Button>
                        </div>
                      </div>
                    )}

                    {reviewSubTab === "mapping" && pipeline && (
                      <div className="overflow-auto">
                        <MappingFlow pipeline={pipeline} />
                      </div>
                    )}
                    {reviewSubTab === "mapping" && !pipeline && (
                      <p className="text-muted-foreground text-center py-4">
                        No pipeline data available.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("upload")} disabled={anySheetProcessing}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep("export")}
                disabled={confirmedCount === 0 || anySheetProcessing}
              >
                Next: Export {confirmedCount} sheet{confirmedCount !== 1 ? "s" : ""}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Export */}
        {step === "export" && (
          <Card>
            <CardHeader>
              <CardTitle>Export Dataset</CardTitle>
              <CardDescription>
                Choose where to save the {confirmedCount} confirmed sheet{confirmedCount !== 1 ? "s" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination</label>
                <Select value={exportTargetDatasetId} onValueChange={setExportTargetDatasetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new">Create new dataset</SelectItem>
                    {existingDatasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {exportTargetDatasetId === "__new" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Dataset Name</label>
                  <Input
                    value={newDatasetName}
                    onChange={(e) => setNewDatasetName(e.target.value)}
                    placeholder={`Dataset ${new Date().toLocaleDateString()}`}
                  />
                </div>
              )}

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Summary</p>
                {jobResults
                  .filter((r) => confirmedSheets.has(`${r.sheet.fileId}:${r.sheet.sheetIndex}`))
                  .map((r) => (
                    <div key={`${r.sheet.fileId}:${r.sheet.sheetIndex}`} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="truncate">
                        {r.sheet.fileName} / {r.sheet.sheetName}
                      </span>
                      <span className="text-muted-foreground ml-auto shrink-0">
                        {r.result?.transformedRows?.length ?? 0} rows
                      </span>
                    </div>
                  ))}
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("review")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDownloadExcel}
                    disabled={downloadingExcel || confirmedCount === 0}
                  >
                    {downloadingExcel ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download Excel
                  </Button>
                  <Button onClick={handleExport} disabled={exporting}>
                    {exporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {exportTargetDatasetId === "__new" ? "Create Dataset" : "Add to Dataset"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function NewDatasetPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    }>
      <NewDatasetPageContent />
    </Suspense>
  );
}
