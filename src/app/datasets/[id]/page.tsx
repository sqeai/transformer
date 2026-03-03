"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DatasetRecord, DatasetState, AppUser } from "@/lib/types";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Download,
  ExternalLink,
  History,
  Layers,
  Loader2,

  Plus,
  Send,
  Trash2,
  Upload,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { useSchemaStore, type UploadedFileEntry, type TransformationMappingEntry } from "@/lib/schema-store";
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";
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

const CREATE_NEW_SCHEMA_OPTION = "__create_new_schema__";

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
  const [expandedTransformStep, setExpandedTransformStep] = useState<string | null>(null);
  const [transformPreviewMode, setTransformPreviewMode] = useState<"before" | "after">("after");
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);

  // Approval state
  const [approverDialogOpen, setApproverDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [addingApprovers, setAddingApprovers] = useState(false);
  const [changingState, setChangingState] = useState(false);

  // Approver decision state
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

  const { setDatasetWorkflow, resetDatasetWorkflow } = useSchemaStore();

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
    if (dataset.approvers && dataset.approvers.length > 0) {
      return allApproved;
    }
    return true;
  }, [dataset, allApproved]);

  const availableExportSchemas = useMemo(() => {
    const unique = new Set(
      exportTables
        .map((table) => table.schema?.trim())
        .filter((schema): schema is string => Boolean(schema))
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [exportTables]);

  const resolvedExportTargetSchema = useMemo(() => {
    if (showCreateTableForm && useNewExportSchema) {
      return newExportSchemaName.trim();
    }
    return exportTargetSchema.trim() || "public";
  }, [showCreateTableForm, useNewExportSchema, newExportSchemaName, exportTargetSchema]);

  const createTargetAlreadyExists = useMemo(() => {
    if (!showCreateTableForm) return false;
    const schema = resolvedExportTargetSchema.toLowerCase();
    const table = exportTargetTable.trim().toLowerCase();
    if (!table) return false;
    return exportTables.some((candidate) => (
      candidate.schema.toLowerCase() === schema
      && candidate.name.toLowerCase() === table
    ));
  }, [showCreateTableForm, resolvedExportTargetSchema, exportTargetTable, exportTables]);

  const handleAddToDatasetUpload = useCallback(
    (schemaId: string, files: UploadedFileEntry[]) => {
      if (!dataset) return;
      resetDatasetWorkflow();
      setDatasetWorkflow({
        schemaId,
        step: "upload",
        files,
        selectedSheets: [],
        exportTargetDatasetId: dataset.id,
      });
      router.push(`/datasets/new?schemaId=${schemaId}&datasetId=${dataset.id}`);
    },
    [dataset, resetDatasetWorkflow, setDatasetWorkflow, router],
  );

  const fetchDataset = useCallback(async () => {
    try {
      const res = await fetch(`/api/datasets/${id}`);
      const data = await res.json().catch(() => ({}));
      console.log("data", data);
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
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  }, []);

  const fetchDataSources = useCallback(async () => {
    setLoadingDataSources(true);
    try {
      const res = await fetch("/api/data-sources");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const sources: DataSourceItem[] = ((data.dataSources ?? []) as DataSourceItem[]).filter(
          (ds: DataSourceItem) => ds.type === "bigquery" || ds.type === "postgres"
        );
        setDataSources(sources);
        setSelectedDataSourceId((prev) => {
          if (prev && sources.some((ds: DataSourceItem) => ds.id === prev)) return prev;
          return "";
        });
      }
    } catch { /* ignore */ }
    finally {
      setLoadingDataSources(false);
    }
  }, []);

  const columns = useMemo(() => {
    if (!dataset) return [];
    const set = new Set<string>();
    for (const row of dataset.rows ?? []) {
      Object.keys(row ?? {}).forEach((k) => set.add(k));
    }
    return Array.from(set);
  }, [dataset]);

  const visibleRows = useMemo(() => {
    if (!dataset) return [];
    return dataset.rows.slice(0, visibleRowCount);
  }, [dataset, visibleRowCount]);

  const canLoadMore = dataset ? visibleRowCount < dataset.rows.length : false;
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const allTransformations = useMemo(() => {
    if (!dataset?.mappingSnapshot) return [];
    const t = (dataset.mappingSnapshot as Record<string, unknown>).transformations;
    if (!Array.isArray(t)) return [];
    const isLegacyShape = t.every((sheetEntry) =>
      Array.isArray(sheetEntry)
      && sheetEntry.every((entry) => !Array.isArray(entry)),
    );
    if (isLegacyShape) {
      return (t as TransformationMappingEntry[][]).map((sheetEntries) => [sheetEntries]);
    }
    return t as TransformationMappingEntry[][][];
  }, [dataset]);

  const hasTransformations = allTransformations.some((sheetIterations) =>
    sheetIterations.some((iteration) => iteration.length > 0),
  );
  const currentSheetTransformations = allTransformations[activeSheetIdx] ?? [];

  const saveName = async () => {
    if (!dataset) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === dataset.name) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error();
      setDataset({ ...dataset, name: trimmed });
    } finally {
      setSavingName(false);
    }
  };

  const changeState = async (newState: DatasetState) => {
    if (!dataset) return;
    setChangingState(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to change state");
        return;
      }
      toast.success(`State changed to ${STATE_CONFIG[newState]?.label ?? newState}`);
      await fetchDataset();
    } finally {
      setChangingState(false);
    }
  };

  const submitForApproval = async () => {
    if (!dataset || selectedApproverIds.length === 0) return;
    setAddingApprovers(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: "pending_approval",
          approverIds: selectedApproverIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to submit for approval");
        return;
      }
      toast.success("Submitted for approval");
      setApproverDialogOpen(false);
      setSelectedApproverIds([]);
      await fetchDataset();
    } finally {
      setAddingApprovers(false);
    }
  };

  const submitDecision = async () => {
    if (!dataset || !decisionType) return;
    setSubmittingDecision(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/approvers/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decisionType, comment: decisionComment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to submit decision");
        return;
      }
      toast.success(decisionType === "approved" ? "Dataset approved" : "Dataset rejected");
      setDecisionDialogOpen(false);
      setDecisionComment("");
      setDecisionType(null);
      await fetchDataset();
    } finally {
      setSubmittingDecision(false);
    }
  };

  const exportRows = async (format: "csv" | "excel") => {
    if (!dataset) return;
    setExporting(format);
    try {
      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data");
        sheet.addRow(columns);
        for (const row of dataset.rows) {
          sheet.addRow(columns.map((c) => (row as Record<string, unknown>)[c] ?? ""));
        }
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
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
    } finally {
      setExporting(null);
    }
  };

  const exportToDatabase = async () => {
    if (!dataset || !selectedDataSourceId || !exportTargetTable.trim() || createTargetAlreadyExists) return;
    setExportingToDb(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataSourceId: selectedDataSourceId,
            targetSchema: resolvedExportTargetSchema || "public",
          targetTable: exportTargetTable.trim(),
          createTable: showCreateTableForm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Export failed");
        return;
      }
      toast.success(`Exported ${data.exported} rows to ${data.target}`);
      setExportDialogOpen(false);
      await fetchDataset();
    } finally {
      setExportingToDb(false);
    }
  };

  const loadExportTables = useCallback(async () => {
    if (!selectedDataSourceId) {
      setExportTables([]);
      return;
    }
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
            const colsRes = await fetch(
              `/api/data-sources/${selectedDataSourceId}/tables/${encodeURIComponent(table.schema)}/${encodeURIComponent(table.name)}/columns`,
            );
            const colsData = await colsRes.json().catch(() => ({}));
            if (!colsRes.ok) throw new Error(colsData.error ?? "Failed to load table columns");
            const tableColumns = new Set(
              ((colsData.columns ?? []) as DataSourceColumnInfo[])
                .map((column) => normalizeColumnKey(column.name))
                .filter(Boolean)
            );
            const matchedColumns = [...requiredColumnSet].filter((column) => tableColumns.has(column)).length;
            const tableColumnCount = tableColumns.size;
            const matchPercent = requiredColumnCount === 0
              ? 0
              : Math.round((matchedColumns / requiredColumnCount) * 100);
            const isSubsetSchema = tableColumnCount > 0 && [...tableColumns].every((column) => requiredColumnSet.has(column));
            return {
              schema: table.schema,
              name: table.name,
              matchedColumns,
              requiredColumns: requiredColumnCount,
              matchPercent,
              compatible: isSubsetSchema,
            } as ExportTableCandidate;
          } catch {
            return {
              schema: table.schema,
              name: table.name,
              matchedColumns: 0,
              requiredColumns: requiredColumnCount,
              matchPercent: 0,
              compatible: false,
            } as ExportTableCandidate;
          }
        })
      );

      candidates.sort((a, b) => {
        if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
        if (b.matchPercent !== a.matchPercent) return b.matchPercent - a.matchPercent;
        const bySchema = a.schema.localeCompare(b.schema);
        if (bySchema !== 0) return bySchema;
        return a.name.localeCompare(b.name);
      });
      setExportTables(candidates);
      const schemas = Array.from(new Set(candidates.map((candidate) => candidate.schema))).sort((a, b) => a.localeCompare(b));
      if (!useNewExportSchema && schemas.length > 0) {
        const currentSchema = exportTargetSchema.trim();
        if (!currentSchema || !schemas.includes(currentSchema)) {
          setExportTargetSchema(schemas[0]);
        }
      }
    } catch (err: unknown) {
      setExportTables([]);
      setExportTablesError((err as Error).message);
    } finally {
      setLoadingExportTables(false);
    }
  }, [selectedDataSourceId, columns, normalizeColumnKey, exportTargetSchema, useNewExportSchema]);

  useEffect(() => {
    if (!exportDialogOpen || !selectedDataSourceId) return;
    void loadExportTables();
  }, [exportDialogOpen, selectedDataSourceId, loadExportTables]);

  const deleteDataset = async () => {
    if (!dataset) return;
    if (!confirm(`Delete dataset "${dataset.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/datasets");
    } finally {
      setDeleting(false);
    }
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
          <CardContent><Button onClick={() => router.push("/datasets")}>Back to Datasets</Button></CardContent>
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
            <Button variant="ghost" size="icon" onClick={() => router.push("/datasets")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{dataset.name}</h1>
                <Badge variant="outline" className={stateInfo.className}>
                  {stateInfo.label}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">{dataset.rowCount} rows &bull; Created {new Date(dataset.createdAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* State transition buttons */}
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

            {/* Approver decision button */}
            {isApprover && myApproverEntry?.status === "pending" && dataset.state === "pending_approval" && (
              <Button
                onClick={() => { setDecisionType(null); setDecisionComment(""); setDecisionDialogOpen(true); }}
              >
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
                  {exporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
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
                <DropdownMenuItem
                  disabled={!canExportToDb}
                  onClick={canExportToDb ? openExportDialog : undefined}
                >
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
            <CardHeader>
              <CardTitle>Dataset Name</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} disabled={isReadOnlyApprover} />
              {!isReadOnlyApprover && (
                <Button onClick={saveName} disabled={savingName}>{savingName ? "Saving..." : "Save"}</Button>
              )}
            </CardContent>
          </Card>

          <Link href={`/schemas/${dataset.schemaId}`} className="block">
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Schema
                </CardTitle>
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
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  Approvers
                </CardTitle>
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
                  {dataset.approvers && dataset.approvers.length > 0 ? (
                    dataset.approvers.map((a) => (
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
                          {a.comment && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">&ldquo;{a.comment}&rdquo;</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : null}
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
                activeTab === tab
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/50",
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
            <CardHeader>
              <CardTitle>Data</CardTitle>
              <CardDescription>
                Showing {visibleRows.length} of {dataset.rows.length} rows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea ref={scrollAreaRef} className="w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-14 whitespace-nowrap bg-background">#</TableHead>
                      {columns.map((c) => <TableHead key={c} className="whitespace-nowrap bg-background">{c}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        {columns.map((c) => (
                          <TableCell key={c} className="whitespace-nowrap max-w-[200px] truncate">
                            {String((row as Record<string, unknown>)[c] ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              {canLoadMore && (
                <div className="flex flex-col items-center gap-2 mt-4">
                  <p className="text-xs text-muted-foreground">
                    Showing {visibleRows.length} of {dataset.rows.length} rows
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
                      const scrollTop = viewport?.scrollTop ?? 0;
                      setVisibleRowCount((prev) => prev + ROWS_PER_PAGE);
                      requestAnimationFrame(() => {
                        if (viewport) viewport.scrollTop = scrollTop;
                      });
                    }}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Transformations tab */}
        {activeTab === "transformations" && (
          <Card>
            <CardHeader>
              <CardTitle>Transformations</CardTitle>
              <CardDescription>
                The AI agent&apos;s thought process and transformations applied to create this dataset.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {allTransformations.length > 1 && (
                <div className="flex flex-wrap gap-2 border-b pb-3">
                  {allTransformations.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md border transition-colors",
                        activeSheetIdx === idx
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                      onClick={() => {
                        setActiveSheetIdx(idx);
                        setExpandedTransformStep(null);
                      }}
                    >
                      Sheet {idx + 1}
                    </button>
                  ))}
                </div>
              )}

              {currentSheetTransformations.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No transformation data available for this sheet.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {currentSheetTransformations.length} iteration{currentSheetTransformations.length !== 1 ? "s" : ""} recorded
                  </p>
                  {currentSheetTransformations.map((iteration, iterationIdx) => (
                    <div key={iterationIdx} className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Iteration {iterationIdx + 1}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {iteration.length} transformation{iteration.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {iteration.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          No transformations were applied in this iteration.
                        </p>
                      ) : iteration.map((entry, idx) => {
                        const stepKey = `${iterationIdx}:${idx}`;
                        const isExpanded = expandedTransformStep === stepKey;
                        const snapshot = transformPreviewMode === "before" ? entry.before : entry.after;
                        const rowDelta = entry.rowCountAfter - entry.rowCountBefore;
                        const colDelta = entry.outputColumns.length - entry.inputColumns.length;
                        return (
                          <div key={stepKey} className="rounded-lg border overflow-hidden">
                            <button
                              type="button"
                              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setExpandedTransformStep(isExpanded ? null : stepKey);
                                setTransformPreviewMode("after");
                              }}
                            >
                              <div className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium shrink-0",
                                entry.phase === "cleansing"
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                  : "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
                              )}>
                                {entry.step}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    {entry.tool.charAt(0).toUpperCase() + entry.tool.slice(1)}
                                  </span>
                                  <span className={cn(
                                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider",
                                    entry.phase === "cleansing"
                                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                      : "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
                                  )}>
                                    {entry.phase}
                                  </span>
                                </div>
                                {entry.reasoning && (
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {entry.reasoning}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                <span className={cn(
                                  rowDelta > 0 ? "text-green-600" : rowDelta < 0 ? "text-orange-600" : "",
                                )}>
                                  {entry.rowCountBefore} → {entry.rowCountAfter} rows
                                </span>
                                {colDelta !== 0 && (
                                  <span className={cn(
                                    colDelta > 0 ? "text-green-600" : "text-orange-600",
                                  )}>
                                    {colDelta > 0 ? "+" : ""}{colDelta} col{Math.abs(colDelta) !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t px-4 py-3 space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1 rounded-md border p-0.5">
                                <button
                                  type="button"
                                  className={cn(
                                    "px-3 py-1 text-xs rounded transition-colors",
                                    transformPreviewMode === "before"
                                      ? "bg-muted font-medium"
                                      : "text-muted-foreground hover:bg-muted/50",
                                  )}
                                  onClick={() => setTransformPreviewMode("before")}
                                >
                                  Before
                                </button>
                                <button
                                  type="button"
                                  className={cn(
                                    "px-3 py-1 text-xs rounded transition-colors",
                                    transformPreviewMode === "after"
                                      ? "bg-muted font-medium"
                                      : "text-muted-foreground hover:bg-muted/50",
                                  )}
                                  onClick={() => setTransformPreviewMode("after")}
                                >
                                  After
                                </button>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {snapshot
                                  ? `${snapshot.sampleRows.length} of ${snapshot.totalRows} rows (${snapshot.columns.length} columns)`
                                  : "No preview available"}
                              </span>
                            </div>

                            {snapshot && snapshot.sampleRows.length > 0 && (
                              <ScrollArea className="w-full rounded-md border max-h-[400px] overflow-auto">
                                <Table>
                                  <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow>
                                      <TableHead className="w-14 whitespace-nowrap bg-background">#</TableHead>
                                      {snapshot.columns.map((col) => (
                                        <TableHead key={col} className="whitespace-nowrap bg-background text-xs">{col}</TableHead>
                                      ))}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {snapshot.sampleRows.map((row, ri) => (
                                      <TableRow key={ri}>
                                        <TableCell className="text-muted-foreground text-xs">{ri + 1}</TableCell>
                                        {snapshot.columns.map((col) => (
                                          <TableCell key={col} className="whitespace-nowrap max-w-[180px] truncate text-xs">
                                            {String((row as Record<string, unknown>)[col] ?? "")}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                <ScrollBar orientation="horizontal" />
                              </ScrollArea>
                            )}

                            {snapshot && snapshot.totalRows > snapshot.sampleRows.length && (
                              <p className="text-xs text-muted-foreground text-center">
                                Showing {snapshot.sampleRows.length} of {snapshot.totalRows} rows
                              </p>
                            )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Activity log tab */}
        {activeTab === "activity" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Activity Log
              </CardTitle>
              <CardDescription>
                Audit trail of all state changes and actions on this dataset.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!dataset.logs || dataset.logs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No activity recorded yet.</p>
              ) : (
                <div className="space-y-0">
                  {dataset.logs.map((log, idx) => (
                    <div key={log.id} className="flex gap-3 pb-4">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                          log.action === "state_change" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" :
                          log.action === "approval_approved" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
                          log.action === "approval_rejected" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                          log.action === "export" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" :
                          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                        )}>
                          {log.action === "state_change" ? <Clock className="h-3.5 w-3.5" /> :
                           log.action === "approval_approved" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                           log.action === "approval_rejected" ? <XCircle className="h-3.5 w-3.5" /> :
                           log.action === "export" ? <Upload className="h-3.5 w-3.5" /> :
                           <History className="h-3.5 w-3.5" />}
                        </div>
                        {idx < dataset.logs!.length - 1 && (
                          <div className="w-px flex-1 bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{log.userName || log.userEmail}</span>
                          <span className="text-sm text-muted-foreground">
                            {log.action === "state_change" && log.fromState && log.toState
                              ? `changed state from ${STATE_CONFIG[log.fromState as DatasetState]?.label ?? log.fromState} to ${STATE_CONFIG[log.toState as DatasetState]?.label ?? log.toState}`
                              : log.action === "approval_approved" ? "approved the dataset"
                              : log.action === "approval_rejected" ? "rejected the dataset"
                              : log.action === "export" ? "exported the dataset"
                              : log.action}
                          </span>
                        </div>
                        {log.comment && (
                          <p className="text-xs text-muted-foreground mt-0.5">{log.comment}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add to dataset dialog */}
      <UploadDatasetDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        defaultSchemaId={dataset.schemaId}
        datasetName={dataset.name}
        onUpload={handleAddToDatasetUpload}
      />

      {/* Submit for approval dialog */}
      <Dialog open={approverDialogOpen} onOpenChange={setApproverDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for Approval</DialogTitle>
            <DialogDescription>
              Select the users who need to approve this dataset. Once confirmed, the dataset will be submitted for their review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {allUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No other users found.</p>
            ) : (
              allUsers.map((u) => {
                const selected = selectedApproverIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-3 w-full p-3 rounded-lg border transition-colors text-left",
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                    onClick={() => {
                      setSelectedApproverIds((prev) =>
                        selected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                      );
                    }}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                      selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}>
                      {(u.name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApproverDialogOpen(false); setSelectedApproverIds([]); }}>Cancel</Button>
            <Button onClick={submitForApproval} disabled={selectedApproverIds.length === 0 || addingApprovers}>
              {addingApprovers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Submit {selectedApproverIds.length > 0 ? `(${selectedApproverIds.length} approver${selectedApproverIds.length !== 1 ? "s" : ""})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit approval dialog */}
      <Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Approval</DialogTitle>
            <DialogDescription>
              Review this dataset and submit your decision. You can leave a comment for the dataset owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Decision</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors",
                    decisionType === "approved"
                      ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 dark:border-green-600"
                      : "border-border hover:border-green-300 hover:bg-green-50/50 dark:hover:bg-green-950/30",
                  )}
                  onClick={() => setDecisionType("approved")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors",
                    decisionType === "rejected"
                      ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 dark:border-red-600"
                      : "border-border hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-950/30",
                  )}
                  onClick={() => setDecisionType("rejected")}
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Comment {decisionType === "rejected" ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal">(optional)</span>}
              </label>
              <Textarea
                placeholder={decisionType === "rejected" ? "Explain why you are rejecting this dataset..." : "Add a comment..."}
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitDecision}
              disabled={submittingDecision || !decisionType || (decisionType === "rejected" && !decisionComment.trim())}
              className={decisionType === "approved" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              variant={decisionType === "rejected" ? "destructive" : "default"}
            >
              {submittingDecision && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {decisionType === "approved" ? "Approve" : decisionType === "rejected" ? "Reject" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export to database dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Export to Database
            </DialogTitle>
            <DialogDescription>
              Export {dataset.rowCount} rows to an external database data source.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Data Source</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingDataSources}
                  onClick={() => { void fetchDataSources(); }}
                >
                  {loadingDataSources ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                  {loadingDataSources ? "Loading..." : "Load Connections"}
                </Button>
              </div>
              <Select value={selectedDataSourceId} onValueChange={setSelectedDataSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a data source..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingDataSources ? (
                    <SelectItem value="_loading" disabled>Loading connections...</SelectItem>
                  ) : dataSources.length === 0 ? (
                    <SelectItem value="_none" disabled>Load connections to choose a data source</SelectItem>
                  ) : (
                    dataSources.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>
                        <div className="flex w-full items-center gap-2">
                          <Database className="h-3 w-3" />
                          {ds.name}
                          <span className="text-xs text-muted-foreground">({ds.type})</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Available Tables</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedDataSourceId || loadingExportTables}
                    onClick={() => { void loadExportTables(); }}
                  >
                    {loadingExportTables ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                    {loadingExportTables ? "Loading Tables..." : "Load Tables"}
                  </Button>
                  <Button
                    type="button"
                    variant={showCreateTableForm ? "destructive" : "outline"}
                    size="icon"
                    disabled={!selectedDataSourceId}
                    onClick={() => {
                      setShowCreateTableForm((prev) => !prev);
                    }}
                    title={showCreateTableForm ? "Cancel table creation" : "Create a new table"}
                    aria-label={showCreateTableForm ? "Cancel table creation" : "Create a new table"}
                  >
                    {showCreateTableForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {showCreateTableForm ? (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Schema / Dataset</label>
                      <Select
                        value={useNewExportSchema ? CREATE_NEW_SCHEMA_OPTION : exportTargetSchema}
                        onValueChange={(value) => {
                          if (value === CREATE_NEW_SCHEMA_OPTION) {
                            setUseNewExportSchema(true);
                            return;
                          }
                          setUseNewExportSchema(false);
                          setExportTargetSchema(value);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select schema / dataset..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableExportSchemas.length === 0 ? (
                            <SelectItem value={CREATE_NEW_SCHEMA_OPTION}>Create new schema / dataset</SelectItem>
                          ) : (
                            <>
                              {availableExportSchemas.map((schema) => (
                                <SelectItem key={schema} value={schema}>{schema}</SelectItem>
                              ))}
                              <SelectItem value={CREATE_NEW_SCHEMA_OPTION}>+ Create new schema / dataset</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      {useNewExportSchema ? (
                        <Input
                          value={newExportSchemaName}
                          onChange={(e) => setNewExportSchemaName(e.target.value)}
                          placeholder="new_schema"
                        />
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Table Name</label>
                      <Input
                        value={exportTargetTable}
                        onChange={(e) => setExportTargetTable(e.target.value)}
                        placeholder="my_table"
                      />
                    </div>
                  </div>
                  {createTargetAlreadyExists ? (
                    <p className="text-sm text-destructive">
                      Table already exists in this schema. Choose a different table name.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="max-h-44 overflow-auto rounded-md border">
                  {!selectedDataSourceId ? (
                    <div className="p-3 text-sm text-muted-foreground">Select a data source first.</div>
                  ) : loadingExportTables && exportTables.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">Checking table schemas...</div>
                  ) : exportTablesError ? (
                    <div className="p-3 text-sm text-destructive">{exportTablesError}</div>
                  ) : exportTables.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No tables found in this data source.</div>
                  ) : (
                    <div className="divide-y">
                      {exportTables.map((table) => (
                        <button
                          key={`${table.schema}.${table.name}`}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                            table.compatible
                              ? "hover:bg-muted/50"
                              : "cursor-not-allowed text-muted-foreground opacity-80",
                            exportTargetSchema === table.schema && exportTargetTable === table.name
                              ? "bg-primary/10 ring-2 ring-primary/40"
                              : ""
                          )}
                          disabled={!table.compatible}
                          onClick={() => {
                            setExportTargetSchema(table.schema);
                            setExportTargetTable(table.name);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{table.schema}.{table.name}</span>
                          <span className="shrink-0 text-xs">
                            {table.compatible ? (
                              <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-800 dark:text-green-300">
                                {table.matchPercent === 100 ? "100% Match" : `Compatible (${table.matchPercent}% Match)`}
                              </Badge>
                            ) : (
                              <Badge variant="outline">Schema Incompatible</Badge>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={exportToDatabase}
              disabled={
                exportingToDb
                || !selectedDataSourceId
                || !exportTargetTable.trim()
                || (showCreateTableForm && !resolvedExportTargetSchema.trim())
                || createTargetAlreadyExists
              }
            >
              {exportingToDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {exportingToDb ? "Exporting..." : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
