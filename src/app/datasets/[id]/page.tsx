"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { TransformationsTab } from "@/components/datasets/TransformationsTab";
import { ActivityLogTab } from "@/components/datasets/ActivityLogTab";
import { ApproverDialog } from "@/components/datasets/ApproverDialog";
import { DecisionDialog } from "@/components/datasets/DecisionDialog";
import { AiCleanserDialog } from "@/components/datasets/AiCleanserDialog";
import { ExportToDbDialog } from "@/components/datasets/ExportToDbDialog";
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";
import type { DatasetRecord, DatasetState, AppUser, SchemaField } from "@/lib/types";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Database,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { flattenFields, useSchemaStore, type UploadedFileEntry, type TransformationMappingEntry } from "@/lib/schema-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const ROWS_PER_PAGE = 100;

const STATE_CONFIG: Record<DatasetState, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700" },
  pending_approval: { label: "Pending Approval", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800" },
  completed: { label: "Completed", className: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
};

interface DataSourceItem {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}

interface DataSourceTableInfo {
  schema: string;
  name: string;
}

interface DataSourceColumnInfo {
  name: string;
}

interface ExportTableCandidate {
  schema: string;
  name: string;
  matchedColumns: number;
  requiredColumns: number;
  matchPercent: number;
  compatible: boolean;
}

interface AiCleanseJobResult {
  transformedRows: Record<string, unknown>[];
  toolsUsed?: unknown;
  mapping?: TransformationMappingEntry[];
}

export default function DatasetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [dataset, setDataset] = useState<DatasetRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [visibleRowCount, setVisibleRowCount] = useState(ROWS_PER_PAGE);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"data" | "transformations" | "activity">("data");

  // Approval state
  const [approverDialogOpen, setApproverDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [addingApprovers, setAddingApprovers] = useState(false);
  const [changingState, setChangingState] = useState(false);

  // Decision state
  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approved" | "rejected" | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceItem[]>([]);
  const [loadingDataSources, setLoadingDataSources] = useState(false);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState("");
  const [exportTables, setExportTables] = useState<ExportTableCandidate[]>([]);
  const [loadingExportTables, setLoadingExportTables] = useState(false);
  const [exportTablesError, setExportTablesError] = useState<string | null>(null);
  const [exportTargetSchema, setExportTargetSchema] = useState("");
  const [useNewExportSchema, setUseNewExportSchema] = useState(false);
  const [newExportSchemaName, setNewExportSchemaName] = useState("");
  const [exportTargetTable, setExportTargetTable] = useState("");
  const [showCreateTableForm, setShowCreateTableForm] = useState(false);
  const [exportingToDb, setExportingToDb] = useState(false);

  // AI cleanser state
  const [aiCleanserDialogOpen, setAiCleanserDialogOpen] = useState(false);
  const [aiCleanserInstructions, setAiCleanserInstructions] = useState("");
  const [aiCleanserRunning, setAiCleanserRunning] = useState(false);

  const { setDatasetWorkflow, resetDatasetWorkflow } = useSchemaStore();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // --- Derived state ---

  const isApprover = useMemo(() => {
    if (!user || !dataset?.approvers) return false;
    return dataset.approvers.some((a) => a.userId === user.id);
  }, [user, dataset]);

  const myApproverEntry = useMemo(() => {
    if (!user || !dataset?.approvers) return null;
    return dataset.approvers.find((a) => a.userId === user.id) ?? null;
  }, [user, dataset]);

  const allApproved = useMemo(() => {
    if (!dataset?.approvers || dataset.approvers.length === 0) return true;
    return dataset.approvers.every((a) => a.status === "approved");
  }, [dataset]);

  const canExportToDb = useMemo(() => {
    if (!dataset) return false;
    if (dataset.approvers && dataset.approvers.length > 0) return allApproved;
    return true;
  }, [dataset, allApproved]);

  const columns = useMemo(() => {
    if (!dataset) return [];
    const set = new Set<string>();
    for (const row of dataset.rows ?? []) Object.keys(row ?? {}).forEach((k) => set.add(k));
    return Array.from(set);
  }, [dataset]);

  const visibleRows = useMemo(() => {
    if (!dataset) return [];
    return dataset.rows.slice(0, visibleRowCount);
  }, [dataset, visibleRowCount]);

  const canLoadMore = dataset ? visibleRowCount < dataset.rows.length : false;

  const allTransformations = useMemo(() => {
    if (!dataset?.mappingSnapshot) return [];
    const t = (dataset.mappingSnapshot as Record<string, unknown>).transformations;
    if (!Array.isArray(t)) return [];
    const isLegacyShape = t.every((fileEntry) =>
      Array.isArray(fileEntry) && fileEntry.every((entry) => !Array.isArray(entry)),
    );
    if (isLegacyShape) return (t as TransformationMappingEntry[][]).map((fileEntries) => [fileEntries]);
    return t as TransformationMappingEntry[][][];
  }, [dataset]);

  const datasetTransformations = useMemo(() => {
    if (!dataset?.mappingSnapshot) return [];
    const dt = (dataset.mappingSnapshot as Record<string, unknown>).datasetTransformations;
    if (!Array.isArray(dt)) return [];
    return dt as TransformationMappingEntry[][];
  }, [dataset]);

  const hasTransformations =
    allTransformations.some((fileIterations) =>
      fileIterations.some((iteration) => iteration.length > 0),
    ) || datasetTransformations.some((iteration) => iteration.length > 0);

  // --- Data fetching ---

  const fetchDataset = useCallback(async () => {
    try {
      const res = await fetch(`/api/datasets/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to load dataset");
      setDataset(data.dataset as DatasetRecord);
      setNameDraft((data.dataset as DatasetRecord).name);
    } catch {
      setDataset(null);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchDataset();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchDataset]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setAllUsers(data.users ?? []);
    } catch { /* ignore */ }
  }, []);

  const normalizeColumnKey = useCallback((value: string) => {
    return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  }, []);

  const fetchDataSources = useCallback(async () => {
    setLoadingDataSources(true);
    try {
      const res = await fetch("/api/data-sources");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const sources: DataSourceItem[] = ((data.dataSources ?? []) as DataSourceItem[]).filter(
          (ds: DataSourceItem) => ds.type === "bigquery" || ds.type === "postgres",
        );
        setDataSources(sources);
        setSelectedDataSourceId((prev) => {
          if (prev && sources.some((ds: DataSourceItem) => ds.id === prev)) return prev;
          return "";
        });
      }
    } catch { /* ignore */ }
    finally { setLoadingDataSources(false); }
  }, []);

  // --- Actions ---

  const handleAddToDatasetUpload = useCallback(
    (schemaId: string, files: UploadedFileEntry[]) => {
      if (!dataset) return;
      resetDatasetWorkflow();
      setDatasetWorkflow({ schemaId, step: "upload", files, selectedFiles: [], exportTargetDatasetId: dataset.id });
      router.push(`/datasets/new?schemaId=${schemaId}&datasetId=${dataset.id}`);
    },
    [dataset, resetDatasetWorkflow, setDatasetWorkflow, router],
  );

  const saveName = async () => {
    if (!dataset) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === dataset.name) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed }) });
      if (!res.ok) throw new Error();
      setDataset({ ...dataset, name: trimmed });
    } finally { setSavingName(false); }
  };

  const changeState = async (newState: DatasetState) => {
    if (!dataset) return;
    setChangingState(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: newState }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to change state"); return; }
      toast.success(`State changed to ${STATE_CONFIG[newState]?.label ?? newState}`);
      await fetchDataset();
    } finally { setChangingState(false); }
  };

  const submitForApproval = async () => {
    if (!dataset || selectedApproverIds.length === 0) return;
    setAddingApprovers(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: "pending_approval", approverIds: selectedApproverIds }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to submit for approval"); return; }
      toast.success("Submitted for approval");
      setApproverDialogOpen(false);
      setSelectedApproverIds([]);
      await fetchDataset();
    } finally { setAddingApprovers(false); }
  };

  const submitDecision = async () => {
    if (!dataset || !decisionType) return;
    setSubmittingDecision(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/approvers/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: decisionType, comment: decisionComment }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to submit decision"); return; }
      toast.success(decisionType === "approved" ? "Dataset approved" : "Dataset rejected");
      setDecisionDialogOpen(false);
      setDecisionComment("");
      setDecisionType(null);
      await fetchDataset();
    } finally { setSubmittingDecision(false); }
  };

  const exportRows = async (format: "csv" | "excel") => {
    if (!dataset) return;
    setExporting(format);
    try {
      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data");
        sheet.addRow(columns);
        for (const row of dataset.rows) sheet.addRow(columns.map((c) => (row as Record<string, unknown>)[c] ?? ""));
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
    } finally { setExporting(null); }
  };

  const deleteDataset = async () => {
    if (!dataset) return;
    if (!confirm(`Delete dataset "${dataset.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push(dataset.folderId ? `/folders/${dataset.folderId}/datasets` : "/");
    } finally { setDeleting(false); }
  };

  // --- Export to DB ---

  const loadExportTables = useCallback(async () => {
    if (!selectedDataSourceId) { setExportTables([]); return; }
    setLoadingExportTables(true);
    setExportTablesError(null);
    try {
      const tablesRes = await fetch(`/api/data-sources/${selectedDataSourceId}/tables`);
      const tablesData = await tablesRes.json().catch(() => ({}));
      if (!tablesRes.ok) throw new Error(tablesData.error ?? "Failed to load tables");
      const tables = (tablesData.tables ?? []) as DataSourceTableInfo[];

      const requiredColumns = columns.map((col) => normalizeColumnKey(col)).filter(Boolean);
      const requiredColumnSet = new Set(requiredColumns);
      const requiredColumnCount = requiredColumnSet.size;

      const candidates = await Promise.all(
        tables.map(async (table: DataSourceTableInfo) => {
          try {
            const colsRes = await fetch(`/api/data-sources/${selectedDataSourceId}/tables/${encodeURIComponent(table.schema)}/${encodeURIComponent(table.name)}/columns`);
            const colsData = await colsRes.json().catch(() => ({}));
            if (!colsRes.ok) throw new Error(colsData.error ?? "Failed to load table columns");
            const tableColumns = new Set(((colsData.columns ?? []) as DataSourceColumnInfo[]).map((column) => normalizeColumnKey(column.name)).filter(Boolean));
            const matchedColumns = [...requiredColumnSet].filter((column) => tableColumns.has(column)).length;
            const tableColumnCount = tableColumns.size;
            const matchPercent = requiredColumnCount === 0 ? 0 : Math.round((matchedColumns / requiredColumnCount) * 100);
            const isSubsetSchema = tableColumnCount > 0 && [...tableColumns].every((column) => requiredColumnSet.has(column));
            return { schema: table.schema, name: table.name, matchedColumns, requiredColumns: requiredColumnCount, matchPercent, compatible: isSubsetSchema } as ExportTableCandidate;
          } catch {
            return { schema: table.schema, name: table.name, matchedColumns: 0, requiredColumns: requiredColumnCount, matchPercent: 0, compatible: false } as ExportTableCandidate;
          }
        }),
      );

      candidates.sort((a, b) => {
        if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
        if (b.matchPercent !== a.matchPercent) return b.matchPercent - a.matchPercent;
        const bySchema = a.schema.localeCompare(b.schema);
        if (bySchema !== 0) return bySchema;
        return a.name.localeCompare(b.name);
      });
      setExportTables(candidates);
      const schemas = Array.from(new Set(candidates.map((c) => c.schema))).sort((a, b) => a.localeCompare(b));
      if (!useNewExportSchema && schemas.length > 0) {
        const currentSchema = exportTargetSchema.trim();
        if (!currentSchema || !schemas.includes(currentSchema)) setExportTargetSchema(schemas[0]);
      }
    } catch (err: unknown) {
      setExportTables([]);
      setExportTablesError((err as Error).message);
    } finally { setLoadingExportTables(false); }
  }, [selectedDataSourceId, columns, normalizeColumnKey, exportTargetSchema, useNewExportSchema]);

  useEffect(() => {
    if (!exportDialogOpen || !selectedDataSourceId) return;
    void loadExportTables();
  }, [exportDialogOpen, selectedDataSourceId, loadExportTables]);

  const resolvedExportTargetSchema = useMemo(() => {
    if (showCreateTableForm && useNewExportSchema) return newExportSchemaName.trim();
    return exportTargetSchema.trim() || "public";
  }, [showCreateTableForm, useNewExportSchema, newExportSchemaName, exportTargetSchema]);

  const exportToDatabase = async () => {
    if (!dataset || !selectedDataSourceId || !exportTargetTable.trim()) return;
    setExportingToDb(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId: selectedDataSourceId, targetSchema: resolvedExportTargetSchema || "public", targetTable: exportTargetTable.trim(), createTable: showCreateTableForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Export failed"); return; }
      toast.success(`Exported ${data.exported} rows to ${data.target}`);
      setExportDialogOpen(false);
      await fetchDataset();
    } finally { setExportingToDb(false); }
  };

  const openExportDialog = () => {
    setSelectedDataSourceId("");
    setDataSources([]);
    setExportTargetTable("");
    setExportTargetSchema("");
    setUseNewExportSchema(false);
    setNewExportSchemaName("");
    setShowCreateTableForm(false);
    setExportTables([]);
    setExportTablesError(null);
    void fetchDataSources();
    setExportDialogOpen(true);
  };

  // --- Starlight ---

  const escapeCsvCell = useCallback((value: unknown): string => {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }, []);

  const rowsToCsv = useCallback((csvColumns: string[], csvRows: Record<string, unknown>[]): string => {
    const lines: string[] = [];
    lines.push(csvColumns.map((col) => escapeCsvCell(col)).join(","));
    for (const row of csvRows) lines.push(csvColumns.map((col) => escapeCsvCell(row[col])).join(","));
    return lines.join("\n");
  }, [escapeCsvCell]);

  const runAiDataCleanser = async () => {
    if (!dataset || columns.length === 0 || dataset.rows.length === 0) return;
    setAiCleanserRunning(true);
    try {
      const schemaRes = await fetch(`/api/schemas/${dataset.schemaId}`);
      const schemaData = await schemaRes.json().catch(() => ({}));
      if (!schemaRes.ok) throw new Error(schemaData.error ?? "Failed to load schema");

      const schemaFields = Array.isArray(schemaData?.schema?.fields) ? (schemaData.schema.fields as SchemaField[]) : [];
      const targetPaths = flattenFields(schemaFields).filter((field) => !field.children?.length).map((field) => field.path);
      if (targetPaths.length === 0) throw new Error("Schema does not contain any leaf fields");

      const presignRes = await fetch("/api/files/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${dataset.name} (dataset ai cleanse)`, type: "intermediary", dimensions: { rowCount: dataset.rows.length, columnCount: columns.length } }),
      });
      const presignData = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) throw new Error(presignData.error ?? "Failed to prepare upload");

      const csvPayload = rowsToCsv(columns, dataset.rows);
      const uploadRes = await fetch(String(presignData.uploadUrl), { method: "PUT", headers: { "Content-Type": "text/csv" }, body: csvPayload });
      if (!uploadRes.ok) throw new Error("Failed to upload dataset for AI cleansing");

      const jobRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "data_cleanse", fileId: String(presignData.fileId), payload: { filePath: String(presignData.filePath), targetPaths, fileName: dataset.name, userDirective: aiCleanserInstructions.trim() || undefined } }),
      });
      const jobData = await jobRes.json().catch(() => ({}));
      if (!jobRes.ok) throw new Error(jobData.error ?? "Failed to create AI cleanse job");

      await fetch("/api/jobs/process", { method: "POST" }).catch(() => {});

      const jobId = String(jobData.jobId);
      let nextResult: AiCleanseJobResult | null = null;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusRes = await fetch(`/api/jobs?ids=${encodeURIComponent(jobId)}`);
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) continue;
        const job = Array.isArray(statusData.jobs) ? statusData.jobs[0] : null;
        if (!job) continue;
        if (job.status === "completed") { nextResult = (job.result ?? null) as AiCleanseJobResult | null; break; }
        if (job.status === "failed") throw new Error(String(job.error ?? "Starlight job failed"));
      }

      if (!nextResult) throw new Error("Timed out waiting for Starlight");
      const finalResult = nextResult;

      const nextRows = Array.isArray(finalResult.transformedRows) ? finalResult.transformedRows : [];
      const existingSnapshot = (dataset.mappingSnapshot ?? {}) as Record<string, unknown>;
      const existingToolsUsed = Array.isArray(existingSnapshot.toolsUsed) ? existingSnapshot.toolsUsed : [];
      const existingDatasetTransformations = Array.isArray(existingSnapshot.datasetTransformations)
        ? (existingSnapshot.datasetTransformations as TransformationMappingEntry[][])
        : [];
      const nextDatasetTransformations = [
        ...existingDatasetTransformations,
        Array.isArray(finalResult.mapping) ? finalResult.mapping : [],
      ];

      const patchRes = await fetch(`/api/datasets/${dataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replaceRows: nextRows, mappingSnapshot: { ...existingSnapshot, toolsUsed: [...existingToolsUsed, finalResult.toolsUsed ?? []], datasetTransformations: nextDatasetTransformations } }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) throw new Error(patchData.error ?? "Failed to save cleansed dataset");

      toast.success(`Starlight updated dataset (${nextRows.length} rows)`);
      setAiCleanserDialogOpen(false);
      setAiCleanserInstructions("");
      await fetchDataset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run Starlight");
    } finally { setAiCleanserRunning(false); }
  };

  // --- Render ---

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
          <CardContent><Button onClick={() => router.push("/")}>Back to Home</Button></CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const stateInfo = STATE_CONFIG[dataset.state] ?? STATE_CONFIG.draft;
  const isReadOnlyApprover = isApprover && !myApproverEntry?.decidedAt && dataset.state === "pending_approval";

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push(dataset.folderId ? `/folders/${dataset.folderId}/datasets` : "/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{dataset.name}</h1>
                <Badge variant="outline" className={stateInfo.className}>{stateInfo.label}</Badge>
              </div>
              <p className="text-muted-foreground text-sm">{dataset.rowCount} rows &bull; Created {new Date(dataset.createdAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {dataset.state === "draft" && (
              <Button onClick={() => { fetchUsers(); setApproverDialogOpen(true); }} disabled={changingState}>
                {changingState ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Submit for Approval
              </Button>
            )}
            {dataset.state === "pending_approval" && !isReadOnlyApprover && (
              <Button variant="outline" onClick={() => changeState("draft")} disabled={changingState}>
                {changingState ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeft className="mr-2 h-4 w-4" />}
                Set back to Draft
              </Button>
            )}
            {dataset.state === "rejected" && (
              <Button variant="outline" onClick={() => changeState("draft")} disabled={changingState}>
                {changingState ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                Revise
              </Button>
            )}
            {isApprover && myApproverEntry?.status === "pending" && dataset.state === "pending_approval" && (
              <Button onClick={() => { setDecisionType(null); setDecisionComment(""); setDecisionDialogOpen(true); }}>
                <Send className="mr-2 h-4 w-4" />
                Submit Approval
              </Button>
            )}
            {!isReadOnlyApprover && (
              <>
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add To This Dataset
                </Button>
                <Button variant="destructive" onClick={deleteDataset} disabled={deleting}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!!exporting}>
                  {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {exporting ? "Exporting..." : "Export"}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onClick={() => exportRows("excel")}>
                  <svg className="mr-2 h-4 w-4 shrink-0 text-green-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 13l3 3 3-3M8 17l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportRows("csv")}>
                  <svg className="mr-2 h-4 w-4 shrink-0 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 13h8M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  CSV (.csv)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canExportToDb} onClick={canExportToDb ? openExportDialog : undefined}>
                  <Database className="mr-2 h-4 w-4 shrink-0 text-blue-500" />
                  <span>Export to External Database</span>
                  {!canExportToDb && <span className="ml-auto text-xs text-muted-foreground">Needs approval</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Info cards */}
        <div className={cn("grid gap-4", dataset.state === "draft" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
          <Card>
            <CardHeader><CardTitle>Dataset Name</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} disabled={isReadOnlyApprover} />
              {!isReadOnlyApprover && <Button onClick={saveName} disabled={savingName}>{savingName ? "Saving..." : "Save"}</Button>}
            </CardContent>
          </Card>

          <Link href={`/schemas/${dataset.schemaId}`} className="block">
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4 text-muted-foreground" />Schema</CardTitle>
                <CardDescription>The schema used by this dataset.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{dataset.schemaName ?? "Unnamed schema"}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          {dataset.state !== "draft" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-muted-foreground" />Approvers</CardTitle>
                <CardDescription>
                  {dataset.approvers && dataset.approvers.length > 0
                    ? (() => {
                        const approved = dataset.approvers.filter((a) => a.status === "approved").length;
                        const rejected = dataset.approvers.filter((a) => a.status === "rejected").length;
                        const pending = dataset.approvers.filter((a) => a.status === "pending").length;
                        const parts: string[] = [];
                        if (approved > 0) parts.push(`${approved} approved`);
                        if (rejected > 0) parts.push(`${rejected} rejected`);
                        if (pending > 0) parts.push(`${pending} pending`);
                        return `${dataset.approvers.length} approver${dataset.approvers.length !== 1 ? "s" : ""} — ${parts.join(", ")}`;
                      })()
                    : "No approvers assigned"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dataset.approvers?.map((a) => (
                    <div key={a.id} className="flex items-start gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0",
                        a.status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
                        a.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                        "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                      )}>
                        {(a.userName || a.userEmail || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{a.userName || a.userEmail || "?"}</span>
                          <Badge variant="outline" className={cn(
                            "text-[10px] px-1.5 py-0",
                            a.status === "approved" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" :
                            a.status === "rejected" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" :
                            "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
                          )}>
                            {a.status === "approved" ? "Approved" : a.status === "rejected" ? "Rejected" : "Pending"}
                          </Badge>
                        </div>
                        {a.comment && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">&ldquo;{a.comment}&rdquo;</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b pb-2">
          {(["data", ...(hasTransformations ? ["transformations"] : []), "activity"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "px-4 py-2 text-sm rounded-md transition-colors",
                activeTab === tab ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => setActiveTab(tab as typeof activeTab)}
            >
              {tab === "data" ? "Data" : tab === "transformations" ? "Transformations" : "Activity Log"}
            </button>
          ))}
        </div>

        {/* Data tab */}
        {activeTab === "data" && (
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Data</CardTitle>
                <CardDescription>Showing {visibleRows.length} of {dataset.rows.length} rows</CardDescription>
              </div>
              {!isReadOnlyApprover && (
                <div className="rounded-md bg-[linear-gradient(90deg,#f59e0b,#ef4444,#8b5cf6,#3b82f6,#10b981)] p-[1px]">
                  <Button
                    variant="outline"
                    className="border-0 bg-background hover:bg-muted"
                    onClick={() => setAiCleanserDialogOpen(true)}
                    disabled={aiCleanserRunning || dataset.rows.length === 0}
                  >
                    {aiCleanserRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Modify
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div ref={scrollAreaRef}>
                <DataTable
                  columns={columns}
                  rows={visibleRows}
                  totalRows={dataset.rows.length}
                  onLoadMore={canLoadMore ? () => {
                    const container = scrollAreaRef.current;
                    const scrollTop = container?.scrollTop ?? 0;
                    setVisibleRowCount((prev) => prev + ROWS_PER_PAGE);
                    requestAnimationFrame(() => { if (container) container.scrollTop = scrollTop; });
                  } : undefined}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "transformations" && (
          <TransformationsTab
            allTransformations={allTransformations}
            datasetTransformations={datasetTransformations}
          />
        )}

        {activeTab === "activity" && (
          <ActivityLogTab logs={dataset.logs} />
        )}
      </div>

      {/* Dialogs */}
      <UploadDatasetDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        defaultSchemaId={dataset.schemaId}
        datasetName={dataset.name}
        onUpload={handleAddToDatasetUpload}
      />

      <AiCleanserDialog
        open={aiCleanserDialogOpen}
        onOpenChange={setAiCleanserDialogOpen}
        instructions={aiCleanserInstructions}
        onInstructionsChange={setAiCleanserInstructions}
        onRun={runAiDataCleanser}
        running={aiCleanserRunning}
        disabled={dataset.rows.length === 0}
      />

      <ApproverDialog
        open={approverDialogOpen}
        onOpenChange={setApproverDialogOpen}
        allUsers={allUsers}
        selectedApproverIds={selectedApproverIds}
        onToggleApprover={(userId) =>
          setSelectedApproverIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
          )
        }
        onSubmit={submitForApproval}
        submitting={addingApprovers}
        onCancel={() => { setApproverDialogOpen(false); setSelectedApproverIds([]); }}
      />

      <DecisionDialog
        open={decisionDialogOpen}
        onOpenChange={setDecisionDialogOpen}
        decisionType={decisionType}
        onDecisionTypeChange={setDecisionType}
        comment={decisionComment}
        onCommentChange={setDecisionComment}
        onSubmit={submitDecision}
        submitting={submittingDecision}
      />

      <ExportToDbDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        rowCount={dataset.rowCount}
        dataSources={dataSources}
        loadingDataSources={loadingDataSources}
        selectedDataSourceId={selectedDataSourceId}
        onSelectDataSource={setSelectedDataSourceId}
        onFetchDataSources={fetchDataSources}
        exportTables={exportTables}
        loadingExportTables={loadingExportTables}
        exportTablesError={exportTablesError}
        onLoadExportTables={loadExportTables}
        exportTargetSchema={exportTargetSchema}
        onExportTargetSchemaChange={setExportTargetSchema}
        exportTargetTable={exportTargetTable}
        onExportTargetTableChange={setExportTargetTable}
        showCreateTableForm={showCreateTableForm}
        onToggleCreateTableForm={() => setShowCreateTableForm((prev) => !prev)}
        useNewExportSchema={useNewExportSchema}
        onUseNewExportSchemaChange={setUseNewExportSchema}
        newExportSchemaName={newExportSchemaName}
        onNewExportSchemaNameChange={setNewExportSchemaName}
        exportingToDb={exportingToDb}
        onExport={exportToDatabase}
      />
    </DashboardLayout>
  );
}
