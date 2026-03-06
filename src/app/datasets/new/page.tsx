"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  useSchemaStore,
  flattenFields,
  type FileSelection,
  type FileJobResult,
  type TransformationMappingEntry,
} from "@/lib/schema-store";
import { extractExcelGridTopBottom } from "@/lib/parse-excel-preview";
import { parseExcelToRows } from "@/lib/parse-excel";
import { parseCsvContent } from "@/lib/utils/csv";
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

interface UploadedFileRef {
  fileId: string;
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
  previous: FileJobResult,
  incoming: FileJobResult["result"] | undefined,
  status: FileJobResult["status"],
  jobId: string,
): Pick<FileJobResult, "result" | "transformationIterationJobIds"> {
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
  const folderIdParam = searchParams.get("folderId");
  const datasetsListUrl = folderIdParam ? `/folders/${folderIdParam}/datasets` : "/";
  const schema = schemaId ? getSchema(schemaId) : null;
  const targetPaths = useMemo(() => {
    if (!schema) return [];
    return flattenFields(schema.fields)
      .filter((f) => !f.children?.length)
      .map((f) => f.path);
  }, [schema]);

  const [step, setStep] = useState<Step>(datasetWorkflow.step || "upload");
  const [selectedFiles, setSelectedFiles] = useState<FileSelection[]>(datasetWorkflow.selectedFiles);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const hasManuallyToggledFiles = useRef(false);
  const [aiInstructions, setAiInstructions] = useState<Record<string, string>>(datasetWorkflow.aiInstructions ?? {});
  const [globalAiInstructions, setGlobalAiInstructions] = useState<string>(datasetWorkflow.globalAiInstructions ?? "");

  const [previewFile, setPreviewFile] = useState<FileSelection | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTopRows, setPreviewTopRows] = useState(PREVIEW_ROWS);

  const [jobResults, setJobResults] = useState<FileJobResult[]>(datasetWorkflow.jobResults);
  const [uploadedFileRefs, setUploadedFileRefs] = useState<Record<string, UploadedFileRef>>({});
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
    router.push(datasetsListUrl);
  }, [router, step, datasetsListUrl]);

  // --- File upload helper ---

  const uploadFileCsv = useCallback(async (
    args: {
      fileName: string;
      columns: string[];
      rows: Record<string, unknown>[];
      type: "raw" | "processed" | "intermediary";
    },
  ): Promise<UploadedFileRef> => {
    const presignRes = await fetch("/api/files/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: args.fileName,
        type: args.type,
        dimensions: { rowCount: args.rows.length, columnCount: args.columns.length },
      }),
    });
    const presignData = await presignRes.json();
    if (!presignRes.ok) throw new Error(presignData.error ?? "Failed to request file upload URL");

    const csvPayload = rowsToCsv(args.columns, args.rows);
    const uploadRes = await fetch(String(presignData.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": "text/csv" },
      body: csvPayload,
    });
    if (!uploadRes.ok) throw new Error("Failed to upload CSV to S3");

    return { fileId: String(presignData.fileId), filePath: String(presignData.filePath) };
  }, []);

  // --- Auto-expand / auto-select effects ---

  useEffect(() => {
    if (files.length > 0 && expandedFiles.size === 0) {
      setExpandedFiles(new Set(files.map((f) => f.fileId)));
    }
  }, [files]);

  useEffect(() => {
    if (selectedFiles.length === 0 && files.length > 0 && !hasManuallyToggledFiles.current) {
      const allSelections: FileSelection[] = [];
      for (const file of files) {
        for (let i = 0; i < file.worksheetNames.length; i++) {
          allSelections.push({ fileId: file.fileId, fileName: file.fileName, worksheetIndex: i, worksheetName: file.worksheetNames[i] });
        }
      }
      setSelectedFiles(allSelections);
    }
  }, [files, selectedFiles.length]);

  useEffect(() => {
    if (!previewFile && files.length > 0 && files[0].worksheetNames.length > 0) {
      setPreviewFile({ fileId: files[0].fileId, fileName: files[0].fileName, worksheetIndex: 0, worksheetName: files[0].worksheetNames[0] });
    }
  }, [files, previewFile]);

  // --- Preview loading ---

  useEffect(() => {
    setPreviewTopRows(PREVIEW_ROWS);
  }, [previewFile?.fileId, previewFile?.worksheetIndex]);

  useEffect(() => {
    if (!previewFile) return;
    const file = files.find((f) => f.fileId === previewFile.fileId);
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
        const isCsv = file.fileName.toLowerCase().endsWith(".csv");
        if (isCsv) {
          const text = new TextDecoder().decode(file.buffer);
          const parsed = parseCsvContent(text);
          if (cancelled) return;
          const headerRow = parsed[0] ?? [];
          const columns = headerRow.map((h, i) => h.trim() || `Column ${i + 1}`);
          const dataRows = parsed.slice(1, previewTopRows + 1);
          const rows = dataRows.map((r) => {
            const row: Record<string, unknown> = {};
            columns.forEach((col, i) => { row[col] = r[i] ?? ""; });
            return row;
          });
          setPreview({ columns, rows, totalRows: parsed.length - 1, visibleRows: rows.length });
        } else {
          const result = await extractExcelGridTopBottom(file.buffer, previewTopRows, 0, 100, previewFile.worksheetIndex);
          if (cancelled) return;
          const columns = result.rows.length > 0 ? result.rows[0].data.map((_: string, i: number) => `Column ${i + 1}`) : [];
          const rows = result.rows.map((r: { originalIndex: number; data: string[] }) => {
            const row: Record<string, unknown> = {};
            r.data.forEach((cell: string, i: number) => { row[columns[i]] = cell; });
            return row;
          });
          setPreview({ columns, rows, totalRows: result.totalRows, visibleRows: rows.length });
        }
      } catch {
        setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [previewFile, files, previewTopRows]);

  // --- Persist workflow state ---

  useEffect(() => {
    setDatasetWorkflow({ step, selectedFiles, jobResults, confirmedFileIds: [], aiInstructions, globalAiInstructions });
  }, [step, selectedFiles, jobResults, aiInstructions, globalAiInstructions]);

  // --- File selection ---

  const toggleFileSelection = (selection: FileSelection) => {
    hasManuallyToggledFiles.current = true;
    const key = `${selection.fileId}:${selection.worksheetIndex}`;
    setSelectedFiles((prev) => {
      const exists = prev.some((s) => `${s.fileId}:${s.worksheetIndex}` === key);
      if (exists) return prev.filter((s) => `${s.fileId}:${s.worksheetIndex}` !== key);
      return [...prev, selection];
    });
  };

  const toggleAllWorksheetsForFile = (fileId: string) => {
    hasManuallyToggledFiles.current = true;
    const file = files.find((f) => f.fileId === fileId);
    if (!file) return;
    const fileSelections: FileSelection[] = file.worksheetNames.map((worksheetName, worksheetIndex) => ({
      fileId: file.fileId, fileName: file.fileName, worksheetIndex, worksheetName,
    }));
    setSelectedFiles((prev) => {
      const allSelected = fileSelections.every((sel) =>
        prev.some((s) => s.fileId === sel.fileId && s.worksheetIndex === sel.worksheetIndex),
      );
      if (allSelected) return prev.filter((s) => s.fileId !== file.fileId);
      const existingKeys = new Set(prev.map((s) => `${s.fileId}:${s.worksheetIndex}`));
      const missing = fileSelections.filter((sel) => !existingKeys.has(`${sel.fileId}:${sel.worksheetIndex}`));
      return [...prev, ...missing];
    });
  };

  const toggleFileExpand = (fileId: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const isFileSelected = (fileId: string, worksheetIndex: number) =>
    selectedFiles.some((s) => s.fileId === fileId && s.worksheetIndex === worksheetIndex);

  // --- Job submission & polling ---

  const startPolling = useCallback((initialResults: FileJobResult[]) => {
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
            const nextStatus = job.status as FileJobResult["status"];
            const merged = mergeJobResultWithIterationHistory(r, job.result as FileJobResult["result"] | undefined, nextStatus, r.jobId);
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
    if (!schemaId || selectedFiles.length === 0) return;
    setStep("processing");
    const results: FileJobResult[] = [];
    const nextUploadedRefs: Record<string, UploadedFileRef> = {};

    for (const selection of selectedFiles) {
      const file = files.find((f) => f.fileId === selection.fileId);
      if (!file) continue;
      try {
        let uploaded: UploadedFileRef;
        let unstructuredMimeType: string | undefined;

        if (file.unstructuredType) {
          const mimeType = getMimeTypeForUnstructured(file.unstructuredType);
          unstructuredMimeType = mimeType;

          const presignRes = await fetch("/api/files/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: selection.worksheetName,
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

          uploaded = { fileId: String(presignData.fileId), filePath: String(presignData.filePath) };
        } else if (file.fileName.toLowerCase().endsWith(".csv")) {
          const text = new TextDecoder().decode(file.buffer);
          const csvParsed = parseCsvContent(text);
          const headerRow = csvParsed[0] ?? [];
          const csvColumns = headerRow.map((h, i) => h.trim() || `Column ${i + 1}`);
          const csvRows = csvParsed.slice(1).map((r) => {
            const row: Record<string, unknown> = {};
            csvColumns.forEach((col, i) => { row[col] = r[i] ?? ""; });
            return row;
          });
          uploaded = await uploadFileCsv({ fileName: selection.worksheetName, columns: csvColumns, rows: csvRows, type: "raw" });
        } else {
          const parsed = await parseExcelToRows(file.buffer, { headerRowIndex: 0, dataStartRowIndex: 1, sheetIndex: selection.worksheetIndex });
          uploaded = await uploadFileCsv({ fileName: selection.worksheetName, columns: parsed.columns, rows: parsed.rows, type: "raw" });
        }

        nextUploadedRefs[`${selection.fileId}:${selection.worksheetIndex}`] = uploaded;

        const fileKey = `${selection.fileId}:${selection.worksheetIndex}`;
        const fileDirective = aiInstructions[fileKey]?.trim() || "";
        const globalDirective = globalAiInstructions.trim();
        const combinedDirective = [globalDirective, fileDirective].filter(Boolean).join("\n") || undefined;
        const jobPayload: Record<string, unknown> = {
          filePath: uploaded.filePath,
          targetPaths,
          fileName: selection.worksheetName,
          userDirective: combinedDirective,
        };
        if (unstructuredMimeType) {
          jobPayload.unstructuredMimeType = unstructuredMimeType;
        }

        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "data_cleanse", fileId: uploaded.fileId, payload: jobPayload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create job");
        results.push({ jobId: data.jobId, file: selection, status: "pending" });
      } catch (err) {
        results.push({ jobId: "", file: selection, status: "failed", error: err instanceof Error ? err.message : "Failed to create job" });
      }
    }

    setUploadedFileRefs((prev) => ({ ...prev, ...nextUploadedRefs }));
    setJobResults(results);
    fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
    startPolling(results);
  }, [schemaId, selectedFiles, files, targetPaths, aiInstructions, globalAiInstructions, uploadFileCsv, startPolling]);

  useEffect(() => { return () => { if (pollingRef.current) clearInterval(pollingRef.current); }; }, []);

  const allJobsDone = jobResults.length > 0 && jobResults.every(
    (r) => r.status === "completed" || r.status === "failed" || !r.jobId,
  );

  // --- Review: original preview ---

  const loadOriginalPreview = useCallback(async (fileResult: FileJobResult) => {
    const file = files.find((f) => f.fileId === fileResult.file.fileId);
    if (!file) return;
    setOriginalPreviewLoading(true);
    try {
      if (file.unstructuredType) {
        const text = file.extractedText ?? new TextDecoder().decode(file.buffer);
        const rows = text.split("\n").filter((l) => l.trim()).map((line) => ({ content: line }));
        allOriginalRowsRef.current = rows;
        setOriginalVisibleCount(PREVIEW_ROWS);
        setOriginalPreview({ columns: ["content"], rows, totalRows: rows.length, visibleRows: rows.length });
      } else if (file.fileName.toLowerCase().endsWith(".csv")) {
        const text = new TextDecoder().decode(file.buffer);
        const csvParsed = parseCsvContent(text);
        const headerRow = csvParsed[0] ?? [];
        const csvColumns = headerRow.map((h, i) => h.trim() || `Column ${i + 1}`);
        const csvRows = csvParsed.slice(1).map((r) => {
          const row: Record<string, unknown> = {};
          csvColumns.forEach((col, i) => { row[col] = r[i] ?? ""; });
          return row;
        });
        allOriginalRowsRef.current = csvRows;
        setOriginalVisibleCount(PREVIEW_ROWS);
        setOriginalPreview({ columns: csvColumns, rows: csvRows, totalRows: csvRows.length, visibleRows: csvRows.length });
      } else {
        const parsed = await parseExcelToRows(file.buffer, { headerRowIndex: 0, dataStartRowIndex: 1, sheetIndex: fileResult.file.worksheetIndex });
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
            const nextStatus = job.status as FileJobResult["status"];
            const merged = mergeJobResultWithIterationHistory(r, (job.result as FileJobResult["result"] | undefined) ?? r.result, nextStatus, jobId);
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

  const handleModifyWithAI = useCallback(async (fileResult: FileJobResult) => {
    if (!modifyPrompt.trim() || !schemaId) return;
    const currentFileKey = `${fileResult.file.fileId}:${fileResult.file.worksheetIndex}`;
    setModifySubmittingSheetKey(currentFileKey);

    try {
      if (!fileResult.result) throw new Error("No modified data is available yet for this tab.");
      const modifiedColumns = fileResult.result.transformedColumns;
      const modifiedRows = fileResult.result.transformedRows;
      const originalRef = uploadedFileRefs[currentFileKey];
      const uploadedModified = await uploadFileCsv({
        fileName: `${fileResult.file.worksheetName} (modified)`,
        columns: modifiedColumns,
        rows: modifiedRows,
        type: "intermediary",
      });

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "data_cleanse",
          fileId: originalRef?.fileId,
          payload: { filePath: uploadedModified.filePath, targetPaths, fileName: fileResult.file.worksheetName, userDirective: modifyPrompt.trim(), originalFilePath: originalRef?.filePath, modifiedFilePath: uploadedModified.filePath },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create job");

      setJobResults((prev) =>
        prev.map((r) =>
          r.file.fileId === fileResult.file.fileId && r.file.worksheetIndex === fileResult.file.worksheetIndex
            ? { ...r, jobId: data.jobId, status: "pending" as const, result: r.result, error: undefined }
            : r,
        ),
      );

      setModifyPrompt("");
      setModifySubmittingSheetKey(null);
      setUploadedFileRefs((prev) => ({ ...prev, [currentFileKey]: uploadedModified }));
      fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      startModifyPolling(data.jobId);
    } catch (err) {
      setModifySubmittingSheetKey(null);
      alert(err instanceof Error ? err.message : "Failed to modify");
    }
  }, [modifyPrompt, schemaId, targetPaths, startModifyPolling, uploadedFileRefs, uploadFileCsv]);

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
          <Button className="mt-4" onClick={() => router.push(datasetsListUrl)}>Back to Datasets</Button>
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
            selectedFiles={selectedFiles}
            expandedFiles={expandedFiles}
            previewFile={previewFile}
            preview={preview}
            previewLoading={previewLoading}
            aiInstructions={aiInstructions}
            onAiInstructionsChange={(fileKey, value) =>
              setAiInstructions((prev) => ({ ...prev, [fileKey]: value }))
            }
            onToggleFileExpand={toggleFileExpand}
            onToggleFileSelection={toggleFileSelection}
            onToggleAllWorksheetsForFile={toggleAllWorksheetsForFile}
            onPreviewFile={setPreviewFile}
            onLoadMorePreview={() => setPreviewTopRows((prev) => prev + PREVIEW_ROWS)}
            globalAiInstructions={globalAiInstructions}
            onGlobalAiInstructionsChange={setGlobalAiInstructions}
            onCancel={() => router.push(datasetsListUrl)}
            onSubmit={submitJobs}
            isFileSelected={isFileSelected}
          />
        )}

        {step === "processing" && (
          <ProcessingStep
            jobResults={jobResults}
            allJobsDone={allJobsDone}
            onBack={() => setStep("upload")}
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
