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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSchemaStore } from "@/lib/schema-store";
import { flattenFields } from "@/lib/schema-store";
import { parseExcelToRows } from "@/lib/parse-excel";
import { parseCsvToRows, extractCsvPreviewTopBottom } from "@/lib/parse-csv";
import { extractExcelGridTopBottom, getExcelSheetNames, dumpSheetAsText } from "@/lib/parse-excel-preview";
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
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";

type UploadMode = "structured" | "unstructured";
type StructuredStep = "idle" | "loading_preview" | "analyzing" | "preview" | "parsing";
type UnstructuredStep = "idle" | "sheet_select" | "confirming" | "extracting" | "reviewing" | "done";

const PREVIEW_TOP_N = 30;
const PREVIEW_BOTTOM_N = 0;
// Allow wide files to be fully inspected in the grid while still
// keeping a sane upper bound for performance.
const PREVIEW_MAX_COLS = 200;
const POLL_INTERVAL_MS = 3000;

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

interface SheetItem {
  fileId: string;
  fileName: string;
  buffer: ArrayBuffer;
  sheetIndex: number;
  sheetName: string;
}

interface JobStatus {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: { record: Record<string, unknown>; mapping: Array<{ targetPath: string; source: string }> };
  error?: string;
}

interface SourceTablePreview {
  rows: IndexedRow[];
  totalRows: number;
  totalColumns: number;
}

interface UnstructuredReviewItem {
  jobId: string;
  fileId: string;
  fileName: string;
  sheetName: string;
  sourcePreview: SourceTablePreview;
  mapping: Array<{ targetPath: string; source: string }>;
  recordDraft: Record<string, string>;
  confirmed: boolean;
}

interface SheetSelectionPreview {
  fileId: string;
  fileName: string;
  sheetName: string;
  preview: SourceTablePreview;
}

function stringifyRecordValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function UploadPage() {
  const router = useRouter();
  const { getSchema, setCurrentSchema, setRawData, resetWorkflow, workflow, setUploadState } = useSchemaStore();
  const schemaId = workflow.currentSchemaId;
  const [uploadMode, setUploadMode] = useState<UploadMode>("structured");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Structured mode state
  const [structuredStep, setStructuredStep] = useState<StructuredStep>("idle");
  const [analysis, setAnalysis] = useState<RawDataAnalysis | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [boundary, setBoundary] = useState<DataBoundary | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedCountRef = useRef(PREVIEW_TOP_N);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);

  // Unstructured mode state
  const [unstructuredStep, setUnstructuredStep] = useState<UnstructuredStep>("idle");
  const [sheetItems, setSheetItems] = useState<SheetItem[]>([]);
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<string>>(new Set());
  const [previewMapping, setPreviewMapping] = useState<Array<{ targetPath: string; source: string }>>([]);
  const [previewRecord, setPreviewRecord] = useState<Record<string, unknown> | null>(null);
  const [previewSourceTable, setPreviewSourceTable] = useState<SourceTablePreview | null>(null);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [jobStatuses, setJobStatuses] = useState<Map<string, JobStatus>>(new Map());
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [reviewItems, setReviewItems] = useState<UnstructuredReviewItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [activeSheetPreviewId, setActiveSheetPreviewId] = useState<string | null>(null);
  const [sheetSelectionPreview, setSheetSelectionPreview] = useState<SheetSelectionPreview | null>(null);
  const [sheetSelectionPreviewLoading, setSheetSelectionPreviewLoading] = useState(false);
  const unstructuredFileInputRef = useRef<HTMLInputElement>(null);

  const schema = schemaId ? getSchema(schemaId) : null;
  const targetPaths = useMemo(() => {
    if (!schema) return [];
    return flattenFields(schema.fields).map((f) => f.path);
  }, [schema]);

  // Restore persisted upload state when returning to this page with the same schema
  useEffect(() => {
    if (!schemaId || !schema || restoredRef.current) return;
    const saved = workflow.uploadState;
    if (saved?.schemaId === schemaId && saved.step === "preview" && saved.preview && saved.boundary) {
      restoredRef.current = true;
      setStructuredStep("preview");
      setPreview(saved.preview as PreviewData);
      setBoundary(saved.boundary as DataBoundary);
      setAnalysis((saved.analysis as RawDataAnalysis) ?? null);
    }
  }, [schemaId, schema, workflow.uploadState]);

  // Persist upload state while in preview so navigating back restores the data
  useEffect(() => {
    if (structuredStep === "preview" && preview && boundary && schemaId) {
      setUploadState({ schemaId, step: "preview", preview, boundary, analysis, uploadMode: "structured" });
    }
  }, [structuredStep, preview, boundary, analysis, schemaId, setUploadState]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  useEffect(() => {
    if (uploadMode !== "unstructured" || unstructuredStep !== "sheet_select") return;

    const selectedSheetId = (activeSheetPreviewId && selectedSheetIds.has(activeSheetPreviewId))
      ? activeSheetPreviewId
      : Array.from(selectedSheetIds)[0];
    if (!selectedSheetId) {
      setSheetSelectionPreview(null);
      setSheetSelectionPreviewLoading(false);
      return;
    }

    const item = sheetItems.find((s) => s.fileId === selectedSheetId);
    if (!item) {
      setSheetSelectionPreview(null);
      setSheetSelectionPreviewLoading(false);
      return;
    }

    // Avoid reloading when the preview already matches the first selected sheet.
    if (sheetSelectionPreview?.fileId === item.fileId) return;

    let cancelled = false;
    setSheetSelectionPreviewLoading(true);

    (async () => {
      try {
        const sourcePreview = await extractExcelGridTopBottom(
          item.buffer,
          20,
          0,
          40,
          item.sheetIndex,
        );
        if (cancelled) return;
        setSheetSelectionPreview({
          fileId: item.fileId,
          fileName: item.fileName,
          sheetName: item.sheetName,
          preview: {
            rows: sourcePreview.rows,
            totalRows: sourcePreview.totalRows,
            totalColumns: sourcePreview.totalColumns,
          },
        });
      } catch {
        if (cancelled) return;
        setSheetSelectionPreview(null);
      } finally {
        if (!cancelled) setSheetSelectionPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uploadMode, unstructuredStep, selectedSheetIds, sheetItems, sheetSelectionPreview?.fileId]);

  // Structured mode: load preview
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
        setStructuredStep("loading_preview");

        if (isExcel) {
          const buffer = await file.arrayBuffer();
          const sheetNames = await getExcelSheetNames(buffer);
          const { rows: previewRows, totalRows, totalColumns } = await extractExcelGridTopBottom(
            buffer, PREVIEW_TOP_N, PREVIEW_BOTTOM_N, PREVIEW_MAX_COLS, 0,
          );

          const defaultBoundary: DataBoundary = {
            headerRowIndex: 0,
            dataStartRowIndex: 1,
            dataEndRowIndex: totalRows - 1,
            startColumn: 0,
            // Always default to using all available columns so the raw upload
            // has as many fields as possible; the user can narrow this later.
            endColumn: totalColumns - 1,
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

        setStructuredStep("preview");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load file preview");
        setStructuredStep("idle");
      }
    },
    [resetWorkflow, schemaId, setCurrentSchema],
  );

  const confirmAndParse = useCallback(async () => {
    if (!preview || !boundary) return;

    try {
      setStructuredStep("parsing");

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

      if (schemaId) {
        setUploadState({ schemaId, step: "preview", preview, boundary, analysis, uploadMode: "structured" });
      }

      router.push("/mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
      setStructuredStep("preview");
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
    setStructuredStep("idle");
    setPreview(null);
    setBoundary(null);
    setAnalysis(null);
    setError(null);
    setUploadState(null);
    loadedCountRef.current = PREVIEW_TOP_N;
  };

  const resetUnstructuredToIdle = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setUnstructuredStep("idle");
    setSheetItems([]);
    setSelectedSheetIds(new Set());
    setPreviewMapping([]);
    setPreviewRecord(null);
    setPreviewSourceTable(null);
    setJobIds([]);
    setJobStatuses(new Map());
    setReviewItems([]);
    setReviewIndex(0);
    setActiveSheetPreviewId(null);
    setSheetSelectionPreview(null);
    setSheetSelectionPreviewLoading(false);
    setError(null);
  }, [pollingInterval]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (uploadMode === "structured") {
        const file = e.dataTransfer.files[0];
        if (file) loadPreview(file);
      } else {
        const files = Array.from(e.dataTransfer.files ?? []).filter((f) => {
          const ext = f.name.toLowerCase();
          return ext.endsWith(".xlsx") || ext.endsWith(".xls");
        });
        if (files.length > 0) {
          handleUnstructuredFiles(files);
        }
      }
    },
    [uploadMode, loadPreview],
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (uploadMode === "structured") {
        loadPreview(file);
      } else if (e.target.files) {
        const files = Array.from(e.target.files).filter((f) => {
          const ext = f.name.toLowerCase();
          return ext.endsWith(".xlsx") || ext.endsWith(".xls");
        });
        if (files.length > 0) {
          handleUnstructuredFiles(files);
        }
      }
    }
    e.target.value = "";
  };

  // Unstructured mode: handle multiple files
  const handleUnstructuredFiles = useCallback(async (files: File[]) => {
    setError(null);
    setSheetItems([]);
    setSelectedSheetIds(new Set());
    setPreviewMapping([]);
    setPreviewRecord(null);
    setPreviewSourceTable(null);
    setReviewItems([]);
    setReviewIndex(0);
    setActiveSheetPreviewId(null);
    setSheetSelectionPreview(null);
    setSheetSelectionPreviewLoading(false);

    try {
      const items: SheetItem[] = [];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const sheetNames = await getExcelSheetNames(buffer);
        for (let i = 0; i < sheetNames.length; i++) {
          items.push({
            fileId: `${file.name}-${i}`,
            fileName: file.name,
            buffer,
            sheetIndex: i,
            sheetName: sheetNames[i],
          });
        }
      }

      setSheetItems(items);
      setUnstructuredStep("sheet_select");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
      setUnstructuredStep("idle");
    }
  }, []);

  const toggleSheetSelection = useCallback((sheetId: string) => {
    setSelectedSheetIds((prev) => {
      const next = new Set(prev);
      if (next.has(sheetId)) {
        next.delete(sheetId);
        setActiveSheetPreviewId((current) => (current === sheetId ? null : current));
      } else {
        next.add(sheetId);
        setActiveSheetPreviewId(sheetId);
      }
      return next;
    });
  }, []);

  // Unstructured: preview first sheet for confirmation
  const handlePreviewFirstSheet = useCallback(async () => {
    if (selectedSheetIds.size === 0) {
      setError("Please select at least one sheet");
      return;
    }

    const firstSheetId = Array.from(selectedSheetIds)[0];
    const sheetItem = sheetItems.find((s) => s.fileId === firstSheetId);
    if (!sheetItem) return;

    try {
      setUnstructuredStep("confirming");
      setError(null);
      setPreviewMapping([]);
      setPreviewRecord(null);
      setPreviewSourceTable(null);

      const sheetText = await dumpSheetAsText(sheetItem.buffer, sheetItem.sheetIndex);
      const sourcePreview = await extractExcelGridTopBottom(
        sheetItem.buffer,
        20,
        0,
        40,
        sheetItem.sheetIndex,
      );
      setPreviewSourceTable({
        rows: sourcePreview.rows,
        totalRows: sourcePreview.totalRows,
        totalColumns: sourcePreview.totalColumns,
      });
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "extract_unstructured",
          payload: { sheetText, targetPaths },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create preview job");
      }

      const { jobId } = await res.json();

      // Poll for preview job completion
      const pollPreview = async () => {
        const statusRes = await fetch(`/api/jobs?ids=${jobId}`);
        if (!statusRes.ok) return;
        const { jobs } = await statusRes.json();
        const job = jobs[0];
        if (job && job.status === "completed" && job.result) {
          setPreviewRecord(job.result.record);
          setPreviewMapping(job.result.mapping || []);
          setUnstructuredStep("confirming");
        } else if (job && job.status === "failed") {
          setError(job.error || "Preview extraction failed");
          setUnstructuredStep("sheet_select");
        } else {
          setTimeout(pollPreview, 2000);
        }
      };

      // Trigger processor
      fetch("/api/jobs/process", { method: "POST" }).catch(() => {});
      setTimeout(pollPreview, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to preview sheet");
      setUnstructuredStep("sheet_select");
    }
  }, [selectedSheetIds, sheetItems, targetPaths]);

  // Unstructured: confirm and start batch extraction
  const handleConfirmAndExtract = useCallback(async () => {
    if (selectedSheetIds.size === 0) return;

    try {
      setUnstructuredStep("extracting");
      setError(null);
      setReviewItems([]);
      setReviewIndex(0);

      const selectedItems = sheetItems.filter((s) => selectedSheetIds.has(s.fileId));
      const jobIds: string[] = [];
      const jobsById = new Map<string, SheetItem>();

      // Enqueue jobs for all selected sheets
      for (const item of selectedItems) {
        const sheetText = await dumpSheetAsText(item.buffer, item.sheetIndex);
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "extract_unstructured",
            payload: { sheetText, targetPaths },
          }),
        });

        if (res.ok) {
          const { jobId } = await res.json();
          jobIds.push(jobId);
          jobsById.set(jobId, item);
        }
      }

      setJobIds(jobIds);

      // Trigger processor
      fetch("/api/jobs/process", { method: "POST" }).catch(() => {});

      // Start polling
      const poll = async () => {
        if (jobIds.length === 0) return;
        const res = await fetch(`/api/jobs?ids=${jobIds.join(",")}`);
        if (!res.ok) return;
        const { jobs } = await res.json();
        const statusMap = new Map<string, JobStatus>();
        for (const job of jobs) {
          statusMap.set(job.id, {
            id: job.id,
            status: job.status,
            result: job.result,
            error: job.error,
          });
        }
        setJobStatuses(statusMap);

        const allDone = jobs.every((j: JobStatus) => j.status === "completed" || j.status === "failed");
        if (allDone) {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }

          const reviewList: UnstructuredReviewItem[] = [];
          for (const jobId of jobIds) {
            const job = jobs.find((j: JobStatus) => j.id === jobId);
            const item = jobsById.get(jobId);
            if (!item || job?.status !== "completed" || !job.result?.record) continue;

            const sourcePreview = await extractExcelGridTopBottom(
              item.buffer,
              20,
              0,
              40,
              item.sheetIndex,
            );

            const recordDraft: Record<string, string> = {};
            for (const path of targetPaths) {
              recordDraft[path] = stringifyRecordValue(job.result.record[path]);
            }
            for (const [k, v] of Object.entries(job.result.record)) {
              if (!(k in recordDraft)) {
                recordDraft[k] = stringifyRecordValue(v);
              }
            }

            reviewList.push({
              jobId,
              fileId: item.fileId,
              fileName: item.fileName,
              sheetName: item.sheetName,
              sourcePreview: {
                rows: sourcePreview.rows,
                totalRows: sourcePreview.totalRows,
                totalColumns: sourcePreview.totalColumns,
              },
              mapping: job.result.mapping || [],
              recordDraft,
              confirmed: false,
            });
          }

          if (reviewList.length > 0) {
            setReviewItems(reviewList);
            setReviewIndex(0);
            setUnstructuredStep("reviewing");
          } else {
            setError("All jobs failed. Please try again.");
            setUnstructuredStep("sheet_select");
          }
        }
      };

      const interval = setInterval(poll, POLL_INTERVAL_MS);
      setPollingInterval(interval);
      poll(); // Initial poll
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start extraction");
      setUnstructuredStep("sheet_select");
    }
  }, [selectedSheetIds, sheetItems, targetPaths, pollingInterval]);

  const currentReviewItem = reviewItems[reviewIndex] ?? null;
  const currentReviewFieldOrder = useMemo(() => {
    if (!currentReviewItem) return [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const path of targetPaths) {
      if (path in currentReviewItem.recordDraft) {
        ordered.push(path);
        seen.add(path);
      }
    }
    for (const m of currentReviewItem.mapping) {
      if (!seen.has(m.targetPath) && m.targetPath in currentReviewItem.recordDraft) {
        ordered.push(m.targetPath);
        seen.add(m.targetPath);
      }
    }
    for (const key of Object.keys(currentReviewItem.recordDraft)) {
      if (!seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }
    return ordered;
  }, [currentReviewItem, targetPaths]);

  const updateReviewValue = useCallback((index: number, targetPath: string, value: string) => {
    setReviewItems((prev) => prev.map((item, i) => (
      i === index
        ? { ...item, recordDraft: { ...item.recordDraft, [targetPath]: value } }
        : item
    )));
  }, []);

  const confirmCurrentReview = useCallback(() => {
    setReviewItems((prev) => prev.map((item, i) => (
      i === reviewIndex ? { ...item, confirmed: true } : item
    )));
    setReviewIndex((idx) => Math.min(idx + 1, Math.max(0, reviewItems.length - 1)));
  }, [reviewIndex, reviewItems.length]);

  const finalizeReviewedUnstructuredRecords = useCallback(() => {
    if (reviewItems.length === 0) return;
    const rows = reviewItems.map((item) => {
      const row: Record<string, unknown> = {};
      for (const path of targetPaths) {
        row[path] = item.recordDraft[path] ?? "";
      }
      for (const [k, v] of Object.entries(item.recordDraft)) {
        if (!(k in row)) row[k] = v;
      }
      return row;
    });
    setRawData(targetPaths, rows);
    if (schemaId) {
      setUploadState({ schemaId, step: "done", uploadMode: "unstructured" });
    }
    router.push("/mapping");
  }, [reviewItems, targetPaths, setRawData, schemaId, setUploadState, router]);

  const allReviewItemsConfirmed = reviewItems.length > 0 && reviewItems.every((i) => i.confirmed);

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
          <div className="flex items-center gap-2">
            {uploadMode === "structured" && structuredStep === "preview" && preview && boundary && (
              <>
                <Button variant="outline" onClick={resetToIdle}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Upload different file
                </Button>
                <Button onClick={confirmAndParse}>
                  Confirm & Continue to Mapping
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}
            {uploadMode === "unstructured" && sheetItems.length > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={resetUnstructuredToIdle}
                title="Clear loaded sheets and return to upload view"
                aria-label="Clear loaded sheets and return to upload view"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Mode selector */}
        {structuredStep === "idle" && unstructuredStep === "idle" && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Upload Mode</CardTitle>
              <CardDescription>Choose how you want to upload your data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button
                  variant={uploadMode === "structured" ? "default" : "outline"}
                  onClick={() => setUploadMode("structured")}
                  className="flex-1"
                >
                  Structured Data Upload
                </Button>
                <Button
                  variant={uploadMode === "unstructured" ? "default" : "outline"}
                  onClick={() => setUploadMode("unstructured")}
                  className="flex-1"
                >
                  Unstructured Data Upload
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                {uploadMode === "structured"
                  ? "Upload a single CSV or Excel file. The AI will detect headers and boundaries, then you can map columns to your schema."
                  : "Upload multiple Excel files. Select sheets from each file. The AI will extract one record per sheet and map fields automatically."}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-1 min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pb-4">
          {/* Structured mode UI */}
          {uploadMode === "structured" && (
            <>
              {structuredStep === "idle" && (
                <Card className="border border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Sparkles className="h-4 w-4" />
                      AI-assisted header & mapping
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      The table below is a direct preview of your file. You can adjust the header row and data boundaries manually, then
                      the AI will help you map columns to your final schema in the next step.
                    </p>
                  </CardContent>
                </Card>
              )}
              

              {structuredStep === "preview" && preview && boundary && (
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
            </>
          )}

          {/* Unstructured mode UI */}
          {uploadMode === "unstructured" && (
            <>
              {unstructuredStep === "sheet_select" && sheetItems.length > 0 && (
                <Card className="min-h-screen w-full">
                  <CardHeader>
                    <CardTitle>Select Sheets to Process</CardTitle>
                    <CardDescription>
                      Select which sheets from the uploaded files you want to extract data from. Each sheet will become one row in the final output.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid min-h-[calc(100vh-14rem)] w-full grid-cols-1 gap-4 overflow-hidden px-4 pb-4 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] lg:items-start">
                    <div className="flex h-[calc(100vh-18rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-md border">
                      <div className="border-b px-4 py-3">
                        <div className="text-sm font-medium">
                          Sheets ({selectedSheetIds.size} selected)
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 p-2">
                        <ScrollArea className="h-full w-full">
                          <div className="space-y-2 pr-2">
                            {sheetItems.map((item) => {
                              const isSelected = selectedSheetIds.has(item.fileId);
                              const isPreviewed = sheetSelectionPreview?.fileId === item.fileId;
                              return (
                                <label
                                  key={item.fileId}
                                  className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                                    isSelected
                                      ? "border-primary/40 bg-primary/5"
                                      : "hover:bg-muted/50"
                                  } ${isPreviewed ? "ring-1 ring-primary/30" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSheetSelection(item.fileId)}
                                    className="w-4 h-4"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium">{item.sheetName}</div>
                                    <div className="truncate text-sm text-muted-foreground">{item.fileName}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                      <div className="border-t p-3">
                        <div className="flex gap-2">
                          <Button
                            onClick={handlePreviewFirstSheet}
                            disabled={selectedSheetIds.size === 0}
                          >
                            Preview First Sheet
                          </Button>
                          <Button
                            onClick={handleConfirmAndExtract}
                            disabled={selectedSheetIds.size === 0}
                            variant="default"
                          >
                            Extract All Selected ({selectedSheetIds.size})
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex h-[calc(100vh-18rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-md border lg:sticky lg:top-4">
                      <div className="flex items-center justify-between border-b px-4 py-3">
                        <div>
                          <div className="text-sm font-medium">Sheet Preview</div>
                          {sheetSelectionPreview && (
                            <div className="text-xs text-muted-foreground">
                              {sheetSelectionPreview.fileName} • {sheetSelectionPreview.sheetName}
                            </div>
                          )}
                        </div>
                        {sheetSelectionPreview && (
                          <div className="text-xs text-muted-foreground">
                            {sheetSelectionPreview.preview.totalRows} rows, {sheetSelectionPreview.preview.totalColumns} cols
                          </div>
                        )}
                      </div>

                      <div className="min-h-0 flex-1 p-3 overflow-hidden">
                        {sheetSelectionPreviewLoading ? (
                          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading sheet preview...
                          </div>
                        ) : !sheetSelectionPreview ? (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            Select a sheet to preview it here.
                          </div>
                        ) : (
                          <ScrollArea className="h-full w-full rounded-md border">
                            <Table>
                              <TableBody>
                                {sheetSelectionPreview.preview.rows.slice(0, 20).map((row) => (
                                  <TableRow key={row.originalIndex}>
                                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                      Row {row.originalIndex + 1}
                                    </TableCell>
                                    {row.data.slice(0, 20).map((cell, ci) => (
                                      <TableCell key={ci} className="max-w-48 truncate whitespace-nowrap text-xs">
                                        {cell || <span className="text-muted-foreground">-</span>}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                          </ScrollArea>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {unstructuredStep === "confirming" && previewMapping.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Confirm Field Mapping</CardTitle>
                    <CardDescription>
                      Review how the AI extracted fields from the first selected sheet. You can inspect each extracted sheet one by one after batch extraction and edit values before continuing.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {previewSourceTable && (
                      <div className="mb-4 space-y-2">
                        <div className="text-sm font-medium">Original source table preview (first selected sheet)</div>
                        <ScrollArea className="w-full rounded-md border">
                          <Table>
                            <TableBody>
                              {previewSourceTable.rows.slice(0, 20).map((row) => (
                                <TableRow key={row.originalIndex}>
                                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                    Row {row.originalIndex + 1}
                                  </TableCell>
                                  {row.data.slice(0, 20).map((cell, ci) => (
                                    <TableCell key={ci} className="max-w-48 truncate whitespace-nowrap text-xs">
                                      {cell || <span className="text-muted-foreground">-</span>}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                        <p className="text-xs text-muted-foreground">
                          Showing first {Math.min(20, previewSourceTable.rows.length)} preview rows of {previewSourceTable.totalRows} total rows.
                        </p>
                      </div>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Target Field</TableHead>
                          <TableHead>Source / Extracted Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewMapping.map((m) => (
                          <TableRow key={m.targetPath}>
                            <TableCell className="font-medium">{m.targetPath}</TableCell>
                            <TableCell>
                              <div className="text-sm text-muted-foreground">{m.source}</div>
                              {previewRecord && previewRecord[m.targetPath] != null && (
                                <div className="text-sm mt-1">
                                  Value: {String(previewRecord[m.targetPath])}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" onClick={() => setUnstructuredStep("sheet_select")}>
                        Back
                      </Button>
                      <Button onClick={handleConfirmAndExtract}>
                        Confirm & Extract All Sheets
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {unstructuredStep === "extracting" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Extracting Data</CardTitle>
                    <CardDescription>
                      Processing {jobIds.length} sheet(s). This may take a few moments...
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {jobIds.map((jobId) => {
                        const status = jobStatuses.get(jobId);
                        return (
                          <div key={jobId} className="flex items-center gap-2 p-2 border rounded">
                            {status?.status === "completed" && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            {status?.status === "failed" && (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            {(status?.status === "pending" || status?.status === "running" || !status) && (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            <span className="text-sm">
                              {status?.status === "completed" && "Completed"}
                              {status?.status === "failed" && `Failed: ${status.error}`}
                              {(status?.status === "pending" || status?.status === "running" || !status) && "Processing..."}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {unstructuredStep === "reviewing" && currentReviewItem && (
                <Card>
                  <CardHeader>
                    <CardTitle>Review Extracted Record ({reviewIndex + 1}/{reviewItems.length})</CardTitle>
                    <CardDescription>
                      {currentReviewItem.fileName} • {currentReviewItem.sheetName}. Review the original source preview and edit extracted values before continuing.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Original source table preview</div>
                        <div className="text-xs text-muted-foreground">
                          {currentReviewItem.sourcePreview.totalRows} rows, {currentReviewItem.sourcePreview.totalColumns} columns
                        </div>
                      </div>
                      <ScrollArea className="w-full rounded-md border">
                        <Table>
                          <TableBody>
                            {currentReviewItem.sourcePreview.rows.slice(0, 20).map((row) => (
                              <TableRow key={row.originalIndex}>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                  Row {row.originalIndex + 1}
                                </TableCell>
                                {row.data.slice(0, 20).map((cell, ci) => (
                                  <TableCell key={ci} className="max-w-48 truncate whitespace-nowrap text-xs">
                                    {cell || <span className="text-muted-foreground">-</span>}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Extracted values (editable)</div>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[280px]">Target Field</TableHead>
                              <TableHead>Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentReviewFieldOrder.map((targetPath) => (
                              <TableRow key={targetPath}>
                                <TableCell className="font-medium">{targetPath}</TableCell>
                                <TableCell>
                                  <Input
                                    value={currentReviewItem.recordDraft[targetPath] ?? ""}
                                    onChange={(e) => updateReviewValue(reviewIndex, targetPath, e.target.value)}
                                    placeholder="Enter value"
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {currentReviewItem.mapping.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">LLM extraction mapping reference</div>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Target Field</TableHead>
                                <TableHead>Source</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {currentReviewItem.mapping.map((m) => (
                                <TableRow key={`${currentReviewItem.jobId}-${m.targetPath}`}>
                                  <TableCell className="font-medium">{m.targetPath}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{m.source}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setReviewIndex((idx) => Math.max(0, idx - 1))}
                          disabled={reviewIndex === 0}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setReviewIndex((idx) => Math.min(reviewItems.length - 1, idx + 1))}
                          disabled={reviewIndex >= reviewItems.length - 1}
                        >
                          Next
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setUnstructuredStep("sheet_select")}>
                          Back to Sheet Selection
                        </Button>
                        {reviewIndex < reviewItems.length - 1 && (
                          <Button onClick={confirmCurrentReview}>
                            Confirm & Next
                          </Button>
                        )}
                        {reviewIndex === reviewItems.length - 1 && (
                          <Button
                            onClick={() => {
                              const lastNeedsConfirm = !currentReviewItem.confirmed;
                              if (lastNeedsConfirm) {
                                setReviewItems((prev) => prev.map((item, i) => (
                                  i === reviewIndex ? { ...item, confirmed: true } : item
                                )));
                              }
                              setTimeout(() => {
                                // Finalize from the latest edited drafts after confirming the last item.
                                finalizeReviewedUnstructuredRecords();
                              }, 0);
                            }}
                            disabled={reviewItems.length === 0}
                          >
                            Confirm & Continue to Mapping
                          </Button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Confirmed {reviewItems.filter((i) => i.confirmed).length} of {reviewItems.length} extracted record(s).
                      {allReviewItemsConfirmed ? " All records are confirmed." : ""}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* File upload card */}
          {!(uploadMode === "unstructured" && sheetItems.length > 0) && (
          <Card
            className={`border-2 border-dashed transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
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
                {uploadMode === "structured" && preview
                  ? preview.fileName
                  : uploadMode === "unstructured" && sheetItems.length > 0
                  ? `${sheetItems.length} sheet(s) loaded`
                  : "Drag and drop"}
              </CardTitle>
              <CardDescription>
                {uploadMode === "structured"
                  ? preview
                    ? "File loaded. Adjust boundaries below and click Continue when ready."
                    : "Drop an Excel (.xlsx, .xls) or CSV file here, or click to browse."
                  : "Drop one or more Excel (.xlsx, .xls) files here, or click to browse."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept={uploadMode === "structured" ? ".xlsx,.xls,.csv" : ".xlsx,.xls"}
                multiple={uploadMode === "unstructured"}
                className="hidden"
                onChange={onFileInput}
              />
              {(uploadMode === "structured" && structuredStep === "idle") ||
              (uploadMode === "unstructured" && unstructuredStep === "idle") ? (
                <Button
                  size="lg"
                  onClick={() => {
                    if (uploadMode === "structured") {
                      fileInputRef.current?.click();
                    } else {
                      unstructuredFileInputRef.current?.click();
                    }
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Choose file{uploadMode === "unstructured" ? "s" : ""}
                </Button>
              ) : null}
              {(uploadMode === "structured" &&
                (structuredStep === "loading_preview" || structuredStep === "analyzing")) && (
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {structuredStep === "analyzing"
                      ? "AI is analyzing structure…"
                      : "Loading preview…"}
                  </span>
                </div>
              )}
              {uploadMode === "structured" && structuredStep === "parsing" && (
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
          )}

          {uploadMode === "structured" && structuredStep === "idle" && targetPaths.length > 0 && (
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
      <input
        ref={unstructuredFileInputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            handleUnstructuredFiles(files);
          }
          e.target.value = "";
        }}
      />
    </DashboardLayout>
  );
}
