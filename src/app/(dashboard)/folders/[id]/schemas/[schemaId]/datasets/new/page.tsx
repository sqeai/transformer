"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  useSchemaStore,
  flattenFields,
  type FileSelection,
  type FileJobResult,
} from "@/lib/schema-store";
import { extractExcelGridTopBottom } from "@/lib/parse-excel-preview";
import { parseExcelToRows } from "@/lib/parse-excel";
import { parseCsvContent } from "@/lib/utils/csv";
import * as XLSX from "xlsx";
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

function replaceJobResult(
  previous: FileJobResult,
  incoming: FileJobResult["result"] | undefined,
  status: FileJobResult["status"],
): Pick<FileJobResult, "result"> {
  const fallbackResult = incoming ?? previous.result;
  if (!fallbackResult) {
    return { result: fallbackResult };
  }

  const incomingMapping = fallbackResult.mapping ?? [];

  return {
    result: {
      ...fallbackResult,
      mappingIterations: status === "completed" ? [incomingMapping] : (previous.result?.mappingIterations ?? []),
    },
  };
}

function NewDatasetPageContent() {
  const routeParams = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    schemas,
    getSchema,
    datasetWorkflow,
    setDatasetWorkflow,
    resetDatasetWorkflow,
  } = useSchemaStore();

  const folderId = routeParams.id as string;
  const schemaIdFromRoute = routeParams.schemaId as string;
  const schemaId = searchParams.get("schemaId") ?? schemaIdFromRoute ?? datasetWorkflow.schemaId;
  const datasetIdParam = searchParams.get("datasetId");
  const schemaDetailUrl = `/folders/${folderId}/schemas/${schemaIdFromRoute}`;
  const datasetsListUrl = schemaDetailUrl;
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
  const initialDirectivesRef = useRef<Record<string, string>>({});
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

  // --- Save AI directive as schema memory ---

  const saveMemory = useCallback(async (directive: string, name: string) => {
    if (!schemaId || !directive.trim()) return;
    try {
      await fetch(`/api/schemas/${schemaId}/contexts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "memory",
          name,
          content: directive.trim(),
        }),
        credentials: "include",
      });
    } catch {
      // Memory saving is best-effort; don't block the main flow
    }
  }, [schemaId]);

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
      const previewStartTime = performance.now();
      console.log("[Preview] Starting preview load for:", file.fileName, { bufferSize: file.buffer.byteLength, previewTopRows, worksheetIndex: previewFile.worksheetIndex });

      try {
        const isCsv = file.fileName.toLowerCase().endsWith(".csv");
        if (isCsv) {
          const csvDecodeStart = performance.now();
          const text = new TextDecoder().decode(file.buffer);
          console.log(`[Preview] CSV decode: ${(performance.now() - csvDecodeStart).toFixed(2)}ms`);

          const csvParseStart = performance.now();
          const parsed = parseCsvContent(text);
          console.log(`[Preview] CSV parse: ${(performance.now() - csvParseStart).toFixed(2)}ms`);

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
          console.log(`[Preview] CSV TOTAL: ${(performance.now() - previewStartTime).toFixed(2)}ms`);
        } else {
          const excelExtractStart = performance.now();
          console.log("[Preview] Calling extractExcelGridTopBottom...");
          const result = await extractExcelGridTopBottom(file.buffer, previewTopRows, 0, 100, previewFile.worksheetIndex);
          console.log(`[Preview] extractExcelGridTopBottom returned: ${(performance.now() - excelExtractStart).toFixed(2)}ms`);

          if (cancelled) return;

          const columnsMapStart = performance.now();
          const columns = result.rows.length > 0 ? result.rows[0].data.map((_: string, i: number) => `Column ${i + 1}`) : [];
          console.log(`[Preview] Columns mapped: ${(performance.now() - columnsMapStart).toFixed(2)}ms`);

          const rowsMapStart = performance.now();
          const rows = result.rows.map((r: { originalIndex: number; data: string[] }) => {
            const row: Record<string, unknown> = {};
            r.data.forEach((cell: string, i: number) => { row[columns[i]] = cell; });
            return row;
          });
          console.log(`[Preview] Rows mapped (${rows.length} rows): ${(performance.now() - rowsMapStart).toFixed(2)}ms`);

          setPreview({ columns, rows, totalRows: result.totalRows, visibleRows: rows.length });
          console.log(`[Preview] Excel TOTAL: ${(performance.now() - previewStartTime).toFixed(2)}ms`);
        }
      } catch (err) {
        console.error("[Preview] Error:", err);
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

    console.log("[startPolling] Starting polling for jobs:", jobIds);

    pollingRef.current = setInterval(async () => {
      try {
        const pollStart = performance.now();
        const res = await fetch(`/api/jobs?ids=${jobIds.join(",")}`);
        const data = await res.json();
        if (!res.ok) return;

        const jobMap = new Map<string, { status: string; result?: unknown; error?: string; created_at?: string; started_at?: string; completed_at?: string }>();
        for (const job of data.jobs ?? []) jobMap.set(job.id, job);

        // Log status changes
        const statusSummary = Array.from(jobMap.entries()).map(([id, job]) => ({ id: id.slice(0, 8), status: job.status }));
        console.log(`[polling] Job statuses (${(performance.now() - pollStart).toFixed(0)}ms):`, statusSummary);

        setJobResults((prev) => {
          const updated = prev.map((r) => {
            const job = jobMap.get(r.jobId);
            if (!job) return r;
            const nextStatus = job.status as FileJobResult["status"];
            if (r.status !== nextStatus) {
              console.log(`[polling] Job ${r.jobId.slice(0, 8)} status changed: ${r.status} -> ${nextStatus}`);
            }
            const merged = replaceJobResult(r, job.result as FileJobResult["result"] | undefined, nextStatus);
            return {
              ...r,
              status: nextStatus,
              result: merged.result,
              error: job.error,
              createdAt: job.created_at ?? r.createdAt,
              startedAt: job.started_at ?? r.startedAt,
              completedAt: job.completed_at ?? r.completedAt,
            };
          });

          const allDone = updated.every((r) => r.status === "completed" || r.status === "failed" || !r.jobId);
          if (allDone) {
            console.log("[polling] All jobs completed, stopping polling");
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
    const submitStartTime = performance.now();
    console.log("[submitJobs] Starting job submission...", { schemaId, selectedFilesCount: selectedFiles.length });

    if (!schemaId || selectedFiles.length === 0) return;
    setStep("processing");
    console.log("[submitJobs] Step changed to 'processing'", { elapsed: `${(performance.now() - submitStartTime).toFixed(2)}ms` });

    const results: FileJobResult[] = [];
    const nextUploadedRefs: Record<string, UploadedFileRef> = {};

    for (const selection of selectedFiles) {
      const fileStartTime = performance.now();
      const file = files.find((f) => f.fileId === selection.fileId);
      if (!file) continue;

      console.log(`[submitJobs] Processing file: ${selection.worksheetName}`, { fileId: selection.fileId, worksheetIndex: selection.worksheetIndex });

      try {
        let uploaded: UploadedFileRef;
        let unstructuredMimeType: string | undefined;

        if (file.unstructuredType) {
          const mimeType = getMimeTypeForUnstructured(file.unstructuredType);
          unstructuredMimeType = mimeType;

          const presignStart = performance.now();
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
          console.log(`[submitJobs] Presign request completed: ${(performance.now() - presignStart).toFixed(2)}ms`);
          if (!presignRes.ok) throw new Error(presignData.error ?? "Failed to request upload URL");

          const uploadStart = performance.now();
          const uploadRes = await fetch(String(presignData.uploadUrl), {
            method: "PUT",
            headers: { "Content-Type": mimeType },
            body: new Uint8Array(file.buffer),
          });
          console.log(`[submitJobs] S3 upload completed: ${(performance.now() - uploadStart).toFixed(2)}ms`);
          if (!uploadRes.ok) throw new Error("Failed to upload file to S3");

          uploaded = { fileId: String(presignData.fileId), filePath: String(presignData.filePath) };
        } else if (file.fileName.toLowerCase().endsWith(".csv")) {
          const parseStart = performance.now();
          const text = new TextDecoder().decode(file.buffer);
          const csvParsed = parseCsvContent(text);
          const headerRow = csvParsed[0] ?? [];
          const csvColumns = headerRow.map((h, i) => h.trim() || `Column ${i + 1}`);
          const csvRows = csvParsed.slice(1).map((r) => {
            const row: Record<string, unknown> = {};
            csvColumns.forEach((col, i) => { row[col] = r[i] ?? ""; });
            return row;
          });
          console.log(`[submitJobs] CSV parsed: ${(performance.now() - parseStart).toFixed(2)}ms`, { rows: csvRows.length, columns: csvColumns.length });

          const uploadStart = performance.now();
          uploaded = await uploadFileCsv({ fileName: selection.worksheetName, columns: csvColumns, rows: csvRows, type: "raw" });
          console.log(`[submitJobs] CSV uploaded: ${(performance.now() - uploadStart).toFixed(2)}ms`);
        } else {
          const parseStart = performance.now();
          const parsed = await parseExcelToRows(file.buffer, { headerRowIndex: 0, dataStartRowIndex: 1, sheetIndex: selection.worksheetIndex });
          console.log(`[submitJobs] Excel parsed: ${(performance.now() - parseStart).toFixed(2)}ms`, { rows: parsed.rows.length, columns: parsed.columns.length });

          const uploadStart = performance.now();
          uploaded = await uploadFileCsv({ fileName: selection.worksheetName, columns: parsed.columns, rows: parsed.rows, type: "raw" });
          console.log(`[submitJobs] Excel uploaded: ${(performance.now() - uploadStart).toFixed(2)}ms`);
        }

        nextUploadedRefs[`${selection.fileId}:${selection.worksheetIndex}`] = uploaded;

        const fileKey = `${selection.fileId}:${selection.worksheetIndex}`;
        const fileDirective = aiInstructions[fileKey]?.trim() || "";
        const globalDirective = globalAiInstructions.trim();
        const combinedDirective = [globalDirective, fileDirective].filter(Boolean).join("\n") || undefined;
        if (combinedDirective) {
          initialDirectivesRef.current[fileKey] = combinedDirective;
        }
        const jobPayload: Record<string, unknown> = {
          filePath: uploaded.filePath,
          targetPaths,
          fileName: selection.worksheetName,
          userDirective: combinedDirective,
          schemaId,
        };
        if (unstructuredMimeType) {
          jobPayload.unstructuredMimeType = unstructuredMimeType;
        }

        const jobCreateStart = performance.now();
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "data_cleanse", fileId: uploaded.fileId, payload: jobPayload }),
        });
        const data = await res.json();
        console.log(`[submitJobs] Job created: ${(performance.now() - jobCreateStart).toFixed(2)}ms`, { jobId: data.jobId });
        if (!res.ok) throw new Error(data.error ?? "Failed to create job");
        results.push({ jobId: data.jobId, file: selection, status: "pending" });
        console.log(`[submitJobs] File processed: ${(performance.now() - fileStartTime).toFixed(2)}ms total for ${selection.worksheetName}`);
      } catch (err) {
        console.error(`[submitJobs] Error processing ${selection.worksheetName}:`, err);
        results.push({ jobId: "", file: selection, status: "failed", error: err instanceof Error ? err.message : "Failed to create job" });
      }
    }

    setUploadedFileRefs((prev) => ({ ...prev, ...nextUploadedRefs }));
    setJobResults(results);
    console.log("[submitJobs] Triggering job processor...");
    fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
    startPolling(results);
    console.log(`[submitJobs] TOTAL TIME: ${(performance.now() - submitStartTime).toFixed(2)}ms`, { jobsCreated: results.filter(r => r.jobId).length, jobsFailed: results.filter(r => !r.jobId).length });

    // Save directives as schema memory for future processing
    const globalDirective = globalAiInstructions.trim();
    if (globalDirective) {
      saveMemory(globalDirective, `Dataset directive: ${globalDirective.slice(0, 80)}`);
    }
    const savedPerFile = new Set<string>();
    for (const selection of selectedFiles) {
      const fileKey = `${selection.fileId}:${selection.worksheetIndex}`;
      const fileDirective = aiInstructions[fileKey]?.trim();
      if (fileDirective && !savedPerFile.has(fileDirective)) {
        savedPerFile.add(fileDirective);
        saveMemory(fileDirective, `File directive (${selection.worksheetName}): ${fileDirective.slice(0, 60)}`);
      }
    }
  }, [schemaId, selectedFiles, files, targetPaths, aiInstructions, globalAiInstructions, uploadFileCsv, startPolling, saveMemory]);

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
            const merged = replaceJobResult(r, (job.result as FileJobResult["result"] | undefined) ?? r.result, nextStatus);
            return {
              ...r,
              status: nextStatus,
              result: merged.result,
              error: job.error,
              createdAt: job.created_at ?? r.createdAt,
              startedAt: job.started_at ?? r.startedAt,
              completedAt: job.completed_at ?? r.completedAt,
            };
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
      const originalRef = uploadedFileRefs[currentFileKey];
      if (!originalRef) throw new Error("Original file reference not found for this tab.");

      // Combine original directives with the new modify prompt so the
      // transformation restarts from scratch with all instructions.
      const originalDirective = initialDirectivesRef.current[currentFileKey] ?? "";
      const combinedDirective = [originalDirective, modifyPrompt.trim()].filter(Boolean).join("\n");

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "data_cleanse",
          fileId: originalRef.fileId,
          payload: { filePath: originalRef.filePath, targetPaths, fileName: fileResult.file.worksheetName, userDirective: combinedDirective, schemaId },
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

      const promptText = modifyPrompt.trim();
      setModifyPrompt("");
      setModifySubmittingSheetKey(null);
      fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      startModifyPolling(data.jobId);

      // Save the modify prompt as schema memory
      if (promptText) {
        saveMemory(promptText, `Modification: ${promptText.slice(0, 80)}`);
      }
    } catch (err) {
      setModifySubmittingSheetKey(null);
      alert(err instanceof Error ? err.message : "Failed to modify");
    }
  }, [modifyPrompt, schemaId, targetPaths, startModifyPolling, uploadedFileRefs, saveMemory]);

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
            folderId,
            mappingSnapshot: {
              toolsUsed: exportableResults.map((r) => r.result?.toolsUsed ?? []),
              transformations: exportableResults.map((r) => [r.result?.mapping ?? []]),
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create dataset");
        resetDatasetWorkflow();
        router.push(`/folders/${folderId}/schemas/${schemaIdFromRoute}/datasets/${data.dataset.id}`);
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
        router.push(`/folders/${folderId}/schemas/${schemaIdFromRoute}/datasets/${exportTargetDatasetId}`);
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

      // Build sheet data as array of arrays
      const sheetData: unknown[][] = [allCols];
      for (const row of allRows) {
        sheetData.push(allCols.map((c) => row[c] ?? ""));
      }

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
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

  const handleDownloadOriginalExcel = useCallback(async (fileResult: FileJobResult) => {
    setDownloadingExcel(true);
    try {
      const cols = originalPreview?.columns ?? [];
      // Use the full original rows from the ref (not the truncated preview)
      const rows = allOriginalRowsRef.current.length > 0 ? allOriginalRowsRef.current : (originalPreview?.rows ?? []);

      const sheetData: unknown[][] = [cols];
      for (const row of rows) {
        sheetData.push(cols.map((c) => (row as Record<string, unknown>)[c] ?? ""));
      }

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileResult.file.worksheetName} (original).xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingExcel(false);
    }
  }, [originalPreview]);

  const handleDownloadModifiedExcel = useCallback(async (fileResult: FileJobResult) => {
    setDownloadingExcel(true);
    try {
      const cols = fileResult.result?.transformedColumns ?? [];
      const rows = fileResult.result?.transformedRows ?? [];

      const sheetData: unknown[][] = [cols];
      for (const row of rows) {
        sheetData.push(cols.map((c) => row[c] ?? ""));
      }

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileResult.file.worksheetName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingExcel(false);
    }
  }, []);

  // --- Render ---

  if (!schemaId || !schema) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground text-lg">No schema selected.</p>
          <Button className="mt-4" onClick={() => router.push(datasetsListUrl)}>Back to Datasets</Button>
        </div>
      </>
    );
  }

  const reviewableResults = jobResults.filter(
    (r) => (r.status === "completed" || r.status === "pending" || r.status === "running") && Boolean(r.result),
  );
  const exportableResults = jobResults.filter((r) => r.status === "completed" && r.result);

  return (
    <>
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
            downloadingExcel={downloadingExcel}
            onDownloadOriginalExcel={handleDownloadOriginalExcel}
            onDownloadModifiedExcel={handleDownloadModifiedExcel}
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
    </>
  );
}

export default function NewDatasetPage() {
  return (
    <Suspense fallback={
      <>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    }>
      <NewDatasetPageContent />
    </Suspense>
  );
}
