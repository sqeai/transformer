"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  useSchemaStore,
  flattenFields,
  type SheetSelection,
  type SheetJobResult,
  type TransformationMappingEntry,
} from "@/lib/schema-store";
import { extractExcelGridTopBottom } from "@/lib/parse-excel-preview";
import { parseExcelToRows } from "@/lib/parse-excel";
import ExcelJS from "exceljs";
import { StepIndicator, STEPS, type Step } from "@/components/datasets/StepIndicator";
import { UploadStep } from "@/components/datasets/UploadStep";
import { ProcessingStep } from "@/components/datasets/ProcessingStep";
import { ReviewStep } from "@/components/datasets/ReviewStep";
import { ExportStep } from "@/components/datasets/ExportStep";

const PREVIEW_ROWS = 100;
const POLL_INTERVAL_MS = 1500;

function getMimeTypeForUnstructured(type: string): string {
  switch (type) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "txt": return "text/plain";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default: return "application/octet-stream";
  }
}

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

function isSameTransformationIteration(
  a: TransformationMappingEntry[],
  b: TransformationMappingEntry[],
): boolean {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeJobResultWithIterationHistory(
  previous: SheetJobResult,
  incoming: SheetJobResult["result"] | undefined,
  status: SheetJobResult["status"],
  jobId: string,
): Pick<SheetJobResult, "result" | "transformationIterationJobIds"> {
  const fallbackResult = incoming ?? previous.result;
  if (!fallbackResult) {
    return {
      result: fallbackResult,
      transformationIterationJobIds: previous.transformationIterationJobIds,
    };
  }

  const previousIterations =
    previous.result?.mappingIterations
    ?? (previous.result?.mapping ? [previous.result.mapping] : []);
  const incomingMapping = fallbackResult.mapping ?? [];
  const seenJobIds = previous.transformationIterationJobIds ?? [];
  const alreadyRecorded = seenJobIds.includes(jobId);
  const iterationAlreadyExists = previousIterations.some((it) =>
    isSameTransformationIteration(it, incomingMapping),
  );

  const nextIterations = (
    status === "completed" && !alreadyRecorded && !iterationAlreadyExists
  )
    ? [...previousIterations, incomingMapping]
    : previousIterations;

  return {
    result: {
      ...fallbackResult,
      mappingIterations: nextIterations,
    },
    transformationIterationJobIds: (
      status === "completed" && !alreadyRecorded
    )
      ? [...seenJobIds, jobId]
      : seenJobIds,
  };
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
  const hasManuallyToggledSheets = useRef(false);
  const [aiInstructions, setAiInstructions] = useState<Record<string, string>>(datasetWorkflow.aiInstructions ?? {});

  const [previewSheet, setPreviewSheet] = useState<SheetSelection | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTopRows, setPreviewTopRows] = useState(PREVIEW_ROWS);

  const [jobResults, setJobResults] = useState<SheetJobResult[]>(datasetWorkflow.jobResults);
  const [uploadedSheetRefs, setUploadedSheetRefs] = useState<Record<string, UploadedSheetRef>>({});
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const [modifyPrompt, setModifyPrompt] = useState("");
  const modifyPollingRef = useRef<NodeJS.Timeout | null>(null);
  const modifyJobIdRef = useRef<string | null>(null);
  const [modifySubmittingSheetKey, setModifySubmittingSheetKey] = useState<string | null>(null);
  const [originalPreview, setOriginalPreview] = useState<PreviewState | null>(null);
  const [originalPreviewLoading, setOriginalPreviewLoading] = useState(false);
  const allOriginalRowsRef = useRef<Record<string, unknown>[]>([]);
  const [originalVisibleCount, setOriginalVisibleCount] = useState(PREVIEW_ROWS);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  const [exportTargetDatasetId, setExportTargetDatasetId] = useState<string>(
    datasetIdParam ?? datasetWorkflow.exportTargetDatasetId ?? "__new",
  );
  const [newDatasetName, setNewDatasetName] = useState("");
  const [existingDatasets, setExistingDatasets] = useState<Array<{ id: string; name: string }>>([]);
  const [exporting, setExporting] = useState(false);

  const files = datasetWorkflow.files;

  // --- Navigation ---

  const handleHeaderBack = useCallback(() => {
    const currentIndex = STEPS.findIndex((candidate) => candidate.key === step);
    const previousStep = currentIndex > 0 ? STEPS[currentIndex - 1]?.key : null;
    if (previousStep) {
      setStep(previousStep);
      return;
    }
    router.push("/datasets");
  }, [router, step]);

  // --- Sheet upload helper ---

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
        dimensions: { rowCount: args.rows.length, columnCount: args.columns.length },
      }),
    });
    const presignData = await presignRes.json();
    if (!presignRes.ok) throw new Error(presignData.error ?? "Failed to request sheet upload URL");

    const csvPayload = rowsToCsv(args.columns, args.rows);
    const uploadRes = await fetch(String(presignData.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": "text/csv" },
      body: csvPayload,
    });
    if (!uploadRes.ok) throw new Error("Failed to upload sheet CSV to S3");

    return { sheetId: String(presignData.sheetId), filePath: String(presignData.filePath) };
  }, []);

  // --- Auto-expand / auto-select effects ---

  useEffect(() => {
    if (files.length > 0 && expandedFiles.size === 0) {
      setExpandedFiles(new Set(files.map((f) => f.fileId)));
    }
  }, [files]);

  useEffect(() => {
    if (selectedSheets.length === 0 && files.length > 0 && !hasManuallyToggledSheets.current) {
      const allSheets: SheetSelection[] = [];
      for (const file of files) {
        for (let i = 0; i < file.sheetNames.length; i++) {
          allSheets.push({ fileId: file.fileId, fileName: file.fileName, sheetIndex: i, sheetName: file.sheetNames[i] });
        }
      }
      setSelectedSheets(allSheets);
    }
  }, [files, selectedSheets.length]);

  useEffect(() => {
    if (!previewSheet && files.length > 0 && files[0].sheetNames.length > 0) {
      setPreviewSheet({ fileId: files[0].fileId, fileName: files[0].fileName, sheetIndex: 0, sheetName: files[0].sheetNames[0] });
    }
  }, [files, previewSheet]);

  // --- Preview loading ---

  useEffect(() => {
    setPreviewTopRows(PREVIEW_ROWS);
  }, [previewSheet?.fileId, previewSheet?.sheetIndex]);

  useEffect(() => {
    if (!previewSheet) return;
    const file = files.find((f) => f.fileId === previewSheet.fileId);
    if (!file) return;

    if (file.unstructuredType) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    (async () => {
      try {
        const result = await extractExcelGridTopBottom(file.buffer, previewTopRows, 0, 100, previewSheet.sheetIndex);
        if (cancelled) return;
        const columns = result.rows.length > 0 ? result.rows[0].data.map((_: string, i: number) => `Column ${i + 1}`) : [];
        const rows = result.rows.map((r: { originalIndex: number; data: string[] }) => {
          const row: Record<string, unknown> = {};
          r.data.forEach((cell: string, i: number) => { row[columns[i]] = cell; });
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

  // --- Persist workflow state ---

  useEffect(() => {
    setDatasetWorkflow({ step, selectedSheets, jobResults, confirmedSheetIds: [], aiInstructions });
  }, [step, selectedSheets, jobResults, aiInstructions]);

  // --- Sheet selection ---

  const toggleSheet = (sheet: SheetSelection) => {
    hasManuallyToggledSheets.current = true;
    const key = `${sheet.fileId}:${sheet.sheetIndex}`;
    setSelectedSheets((prev) => {
      const exists = prev.some((s) => `${s.fileId}:${s.sheetIndex}` === key);
      if (exists) return prev.filter((s) => `${s.fileId}:${s.sheetIndex}` !== key);
      return [...prev, sheet];
    });
  };

  const toggleAllSheetsForFile = (fileId: string) => {
    hasManuallyToggledSheets.current = true;
    const file = files.find((f) => f.fileId === fileId);
    if (!file) return;
    const fileSheets: SheetSelection[] = file.sheetNames.map((sheetName, sheetIndex) => ({
      fileId: file.fileId, fileName: file.fileName, sheetIndex, sheetName,
    }));
    setSelectedSheets((prev) => {
      const allSelected = fileSheets.every((sheet) =>
        prev.some((s) => s.fileId === sheet.fileId && s.sheetIndex === sheet.sheetIndex),
      );
      if (allSelected) return prev.filter((s) => s.fileId !== file.fileId);
      const existingKeys = new Set(prev.map((s) => `${s.fileId}:${s.sheetIndex}`));
      const missingSheets = fileSheets.filter((sheet) => !existingKeys.has(`${sheet.fileId}:${sheet.sheetIndex}`));
      return [...prev, ...missingSheets];
    });
  };

  const toggleFile = (fileId: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const isSheetSelected = (fileId: string, sheetIndex: number) =>
    selectedSheets.some((s) => s.fileId === fileId && s.sheetIndex === sheetIndex);

  // --- Job submission & polling ---

  const startPolling = useCallback((initialResults: SheetJobResult[]) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const jobIds = initialResults.filter((r) => r.jobId).map((r) => r.jobId);
    if (jobIds.length === 0) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs?ids=${jobIds.join(",")}`);
        const data = await res.json();
        if (!res.ok) return;

        const jobMap = new Map<string, { status: string; result?: unknown; error?: string }>();
        for (const job of data.jobs ?? []) jobMap.set(job.id, job);

        setJobResults((prev) => {
          const updated = prev.map((r) => {
            const job = jobMap.get(r.jobId);
            if (!job) return r;
            const nextStatus = job.status as SheetJobResult["status"];
            const merged = mergeJobResultWithIterationHistory(r, job.result as SheetJobResult["result"] | undefined, nextStatus, r.jobId);
            return { ...r, status: nextStatus, result: merged.result, transformationIterationJobIds: merged.transformationIterationJobIds, error: job.error };
          });

          const allDone = updated.every((r) => r.status === "completed" || r.status === "failed" || !r.jobId);
          if (allDone) {
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
            if (updated.some((r) => r.status === "pending")) {
              fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
            }
          }
          return updated;
        });

        fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      } catch { /* ignore */ }
    }, POLL_INTERVAL_MS);
  }, []);

  const submitJobs = useCallback(async () => {
    if (!schemaId || selectedSheets.length === 0) return;
    setStep("processing");
    const results: SheetJobResult[] = [];
    const nextUploadedRefs: Record<string, UploadedSheetRef> = {};

    for (const sheet of selectedSheets) {
      const file = files.find((f) => f.fileId === sheet.fileId);
      if (!file) continue;
      try {
        let uploaded: UploadedSheetRef;
        let unstructuredMimeType: string | undefined;

        if (file.unstructuredType) {
          const mimeType = getMimeTypeForUnstructured(file.unstructuredType);
          unstructuredMimeType = mimeType;

          const presignRes = await fetch("/api/sheets/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: sheet.sheetName,
              type: "raw",
              dimensions: { rowCount: 0, columnCount: 0 },
              contentType: mimeType,
              fileExtension: file.unstructuredType,
            }),
          });
          const presignData = await presignRes.json();
          if (!presignRes.ok) throw new Error(presignData.error ?? "Failed to request upload URL");

          const uploadRes = await fetch(String(presignData.uploadUrl), {
            method: "PUT",
            headers: { "Content-Type": mimeType },
            body: new Uint8Array(file.buffer),
          });
          if (!uploadRes.ok) throw new Error("Failed to upload file to S3");

          uploaded = { sheetId: String(presignData.sheetId), filePath: String(presignData.filePath) };
        } else {
          const parsed = await parseExcelToRows(file.buffer, { headerRowIndex: 0, dataStartRowIndex: 1, sheetIndex: sheet.sheetIndex });
          uploaded = await uploadSheetCsv({ sheetName: sheet.sheetName, columns: parsed.columns, rows: parsed.rows, type: "raw" });
        }

        nextUploadedRefs[`${sheet.fileId}:${sheet.sheetIndex}`] = uploaded;

        const sheetKey = `${sheet.fileId}:${sheet.sheetIndex}`;
        const sheetDirective = aiInstructions[sheetKey]?.trim() || undefined;
        const jobPayload: Record<string, unknown> = {
          filePath: uploaded.filePath,
          targetPaths,
          sheetName: sheet.sheetName,
          userDirective: sheetDirective,
        };
        if (unstructuredMimeType) {
          jobPayload.unstructuredMimeType = unstructuredMimeType;
        }

        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "data_cleanse", sheetId: uploaded.sheetId, payload: jobPayload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create job");
        results.push({ jobId: data.jobId, sheet, status: "pending" });
      } catch (err) {
        results.push({ jobId: "", sheet, status: "failed", error: err instanceof Error ? err.message : "Failed to create job" });
      }
    }

    setUploadedSheetRefs((prev) => ({ ...prev, ...nextUploadedRefs }));
    setJobResults(results);
    fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
    startPolling(results);
  }, [schemaId, selectedSheets, files, targetPaths, aiInstructions, uploadSheetCsv, startPolling]);

  useEffect(() => { return () => { if (pollingRef.current) clearInterval(pollingRef.current); }; }, []);

  const allJobsDone = jobResults.length > 0 && jobResults.every(
    (r) => r.status === "completed" || r.status === "failed" || !r.jobId,
  );

  // --- Review: original preview ---

  const loadOriginalPreview = useCallback(async (sheetResult: SheetJobResult) => {
    const file = files.find((f) => f.fileId === sheetResult.sheet.fileId);
    if (!file) return;
    setOriginalPreviewLoading(true);
    try {
      if (file.unstructuredType) {
        const text = file.extractedText ?? new TextDecoder().decode(file.buffer);
        const rows = text.split("\n").filter((l) => l.trim()).map((line) => ({ content: line }));
        allOriginalRowsRef.current = rows;
        setOriginalVisibleCount(PREVIEW_ROWS);
        setOriginalPreview({ columns: ["content"], rows, totalRows: rows.length, visibleRows: rows.length });
      } else {
        const parsed = await parseExcelToRows(file.buffer, { headerRowIndex: 0, dataStartRowIndex: 1, sheetIndex: sheetResult.sheet.sheetIndex });
        allOriginalRowsRef.current = parsed.rows;
        setOriginalVisibleCount(PREVIEW_ROWS);
        setOriginalPreview({ columns: parsed.columns, rows: parsed.rows, totalRows: parsed.rows.length, visibleRows: parsed.rows.length });
      }
    } catch {
      setOriginalPreview(null);
    } finally {
      setOriginalPreviewLoading(false);
    }
  }, [files]);

  const anySheetProcessing = useMemo(
    () => jobResults.some((r) => r.status === "pending" || r.status === "running"),
    [jobResults],
  );

  // --- Modify with AI ---

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
          prev.map((r) => {
            if (r.jobId !== jobId) return r;
            const nextStatus = job.status as SheetJobResult["status"];
            const merged = mergeJobResultWithIterationHistory(r, (job.result as SheetJobResult["result"] | undefined) ?? r.result, nextStatus, jobId);
            return { ...r, status: nextStatus, result: merged.result, transformationIterationJobIds: merged.transformationIterationJobIds, error: job.error };
          }),
        );

        if (job.status === "completed" || job.status === "failed") {
          if (modifyPollingRef.current) { clearInterval(modifyPollingRef.current); modifyPollingRef.current = null; }
          modifyJobIdRef.current = null;
        }
        fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      } catch { /* ignore */ }
    }, POLL_INTERVAL_MS);
  }, []);

  const handleStopModify = useCallback(() => {
    if (modifyPollingRef.current) { clearInterval(modifyPollingRef.current); modifyPollingRef.current = null; }
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

  useEffect(() => { return () => { if (modifyPollingRef.current) clearInterval(modifyPollingRef.current); }; }, []);

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
          payload: { filePath: uploadedModified.filePath, targetPaths, sheetName: sheetResult.sheet.sheetName, userDirective: modifyPrompt.trim(), originalFilePath: originalRef?.filePath, modifiedFilePath: uploadedModified.filePath },
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
      setUploadedSheetRefs((prev) => ({ ...prev, [currentSheetKey]: uploadedModified }));
      fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      startModifyPolling(data.jobId);
    } catch (err) {
      setModifySubmittingSheetKey(null);
      alert(err instanceof Error ? err.message : "Failed to modify");
    }
  }, [modifyPrompt, schemaId, targetPaths, startModifyPolling, uploadedSheetRefs, uploadSheetCsv]);

  // --- Export ---

  useEffect(() => {
    if (step !== "export" || !schemaId) return;
    fetch(`/api/datasets?schemaId=${schemaId}&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        setExistingDatasets((data.datasets ?? []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
      })
      .catch(() => {});
  }, [step, schemaId]);

  const handleExport = useCallback(async () => {
    if (!schemaId) return;
    setExporting(true);
    try {
      const exportableResults = jobResults.filter((r) => r.status === "completed" && r.result);
      const allRows: Record<string, unknown>[] = [];
      for (const r of exportableResults) {
        if (r.result?.transformedRows) allRows.push(...r.result.transformedRows);
      }

      if (exportTargetDatasetId === "__new") {
        const name = newDatasetName.trim() || `Dataset ${new Date().toLocaleDateString()}`;
        const res = await fetch("/api/datasets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schemaId, name, rows: allRows,
            mappingSnapshot: {
              toolsUsed: exportableResults.map((r) => r.result?.toolsUsed ?? []),
              transformations: exportableResults.map((r) => {
                const iterations = r.result?.mappingIterations;
                if (Array.isArray(iterations) && iterations.length > 0) return iterations;
                return [r.result?.mapping ?? []];
              }),
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
  }, [schemaId, jobResults, exportTargetDatasetId, newDatasetName, resetDatasetWorkflow, router]);

  const handleDownloadExcel = useCallback(async () => {
    setDownloadingExcel(true);
    try {
      const exportableResults = jobResults.filter((r) => r.status === "completed" && r.result);
      const allCols = exportableResults[0]?.result?.transformedColumns ?? [];
      const allRows: Record<string, unknown>[] = [];
      for (const r of exportableResults) {
        if (r.result?.transformedRows) allRows.push(...r.result.transformedRows);
      }
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Data");
      sheet.addRow(allCols);
      for (const row of allRows) sheet.addRow(allCols.map((c) => row[c] ?? ""));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
  }, [jobResults, newDatasetName]);

  // --- Render ---

  if (!schemaId || !schema) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground text-lg">No schema selected.</p>
          <Button className="mt-4" onClick={() => router.push("/datasets")}>Back to Datasets</Button>
        </div>
      </DashboardLayout>
    );
  }

  const reviewableResults = jobResults.filter(
    (r) => (r.status === "completed" || r.status === "pending" || r.status === "running") && Boolean(r.result),
  );
  const exportableResults = jobResults.filter((r) => r.status === "completed" && r.result);

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleHeaderBack}>
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

        {step === "upload" && (
          <UploadStep
            files={files}
            selectedSheets={selectedSheets}
            expandedFiles={expandedFiles}
            previewSheet={previewSheet}
            preview={preview}
            previewLoading={previewLoading}
            aiInstructions={aiInstructions}
            onAiInstructionsChange={(sheetKey, value) =>
              setAiInstructions((prev) => ({ ...prev, [sheetKey]: value }))
            }
            onToggleFile={toggleFile}
            onToggleSheet={toggleSheet}
            onToggleAllSheetsForFile={toggleAllSheetsForFile}
            onPreviewSheet={setPreviewSheet}
            onLoadMorePreview={() => setPreviewTopRows((prev) => prev + PREVIEW_ROWS)}
            onCancel={() => router.push("/datasets")}
            onSubmit={submitJobs}
            isSheetSelected={isSheetSelected}
          />
        )}

        {step === "processing" && (
          <ProcessingStep
            jobResults={jobResults}
            allJobsDone={allJobsDone}
            onContinue={() => setStep("review")}
          />
        )}

        {step === "review" && (
          <ReviewStep
            reviewableResults={reviewableResults}
            exportableCount={exportableResults.length}
            anySheetProcessing={anySheetProcessing}
            modifyPrompt={modifyPrompt}
            onModifyPromptChange={setModifyPrompt}
            onModifyWithAI={handleModifyWithAI}
            onStopModify={handleStopModify}
            modifySubmittingSheetKey={modifySubmittingSheetKey}
            originalPreview={originalPreview}
            originalPreviewLoading={originalPreviewLoading}
            onLoadOriginalPreview={loadOriginalPreview}
            originalVisibleCount={originalVisibleCount}
            onLoadMoreOriginal={() => setOriginalVisibleCount((prev) => prev + PREVIEW_ROWS)}
            files={files}
            onBack={() => setStep("upload")}
            onNext={() => setStep("export")}
          />
        )}

        {step === "export" && (
          <ExportStep
            exportableResults={exportableResults}
            exportTargetDatasetId={exportTargetDatasetId}
            onExportTargetChange={setExportTargetDatasetId}
            newDatasetName={newDatasetName}
            onNewDatasetNameChange={setNewDatasetName}
            existingDatasets={existingDatasets}
            exporting={exporting}
            downloadingExcel={downloadingExcel}
            onExport={handleExport}
            onDownloadExcel={handleDownloadExcel}
            onBack={() => setStep("review")}
          />
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
