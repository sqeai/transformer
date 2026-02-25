"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ColumnMapping,
  DefaultValues,
  FinalSchema,
  PivotConfig,
  RawColumn,
  SchemaField,
  VerticalPivotConfig,
} from "./types";
import { idbGet, idbSet, idbDelete } from "./idb-storage";
import { useAuth } from "@/hooks/useAuth";

const WORKFLOW_STORAGE_KEY = "ai_data_cleanser_workflow";
const IDB_RAW_COLUMNS_KEY = "workflow_rawColumns";
const IDB_RAW_ROWS_KEY = "workflow_rawRows";
const IDB_UPLOAD_STATE_KEY = "workflow_uploadState";

const api = (path: string, init?: RequestInit) =>
  fetch(path, { ...init, credentials: "include" });

interface WorkflowState {
  currentSchemaId: string | null;
  rawColumns: RawColumn[];
  rawRows: Record<string, unknown>[];
  columnMappings: ColumnMapping[];
  pivotConfig: PivotConfig;
  verticalPivotConfig: VerticalPivotConfig;
  defaultValues: DefaultValues;
  /** Persisted upload page state so we can restore when navigating back to /upload */
  uploadState: {
    schemaId: string;
    step: string;
    preview?: unknown;
    boundary?: unknown;
    analysis?: unknown;
    uploadMode?: "structured" | "unstructured";
    unstructured?: unknown;
    datasetTargetId?: string;
  } | null;
}

/** Lightweight subset stored in localStorage (no large arrays). */
interface WorkflowMeta {
  currentSchemaId: string | null;
  columnMappings: ColumnMapping[];
  pivotConfig: PivotConfig;
  verticalPivotConfig: VerticalPivotConfig;
  defaultValues: DefaultValues;
}

function loadWorkflowMeta(): WorkflowMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const w = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    return w ? JSON.parse(w) : null;
  } catch {
    return null;
  }
}

function saveWorkflowMeta(workflow: WorkflowState) {
  if (typeof window === "undefined") return;
  const meta: WorkflowMeta = {
    currentSchemaId: workflow.currentSchemaId,
    columnMappings: workflow.columnMappings,
    pivotConfig: workflow.pivotConfig,
    verticalPivotConfig: workflow.verticalPivotConfig,
    defaultValues: workflow.defaultValues,
  };
  localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(meta));
}

async function saveWorkflowLargeData(workflow: WorkflowState) {
  await Promise.all([
    idbSet(IDB_RAW_COLUMNS_KEY, workflow.rawColumns),
    idbSet(IDB_RAW_ROWS_KEY, workflow.rawRows),
    idbSet(IDB_UPLOAD_STATE_KEY, workflow.uploadState),
  ]);
}

async function loadWorkflowLargeData(): Promise<{
  rawColumns: RawColumn[];
  rawRows: Record<string, unknown>[];
  uploadState: WorkflowState["uploadState"];
}> {
  const [rawColumns, rawRows, uploadState] = await Promise.all([
    idbGet<RawColumn[]>(IDB_RAW_COLUMNS_KEY),
    idbGet<Record<string, unknown>[]>(IDB_RAW_ROWS_KEY),
    idbGet<WorkflowState["uploadState"]>(IDB_UPLOAD_STATE_KEY),
  ]);
  return {
    rawColumns: rawColumns ?? [],
    rawRows: rawRows ?? [],
    uploadState: uploadState ?? null,
  };
}

async function clearWorkflowLargeData() {
  await Promise.all([
    idbDelete(IDB_RAW_COLUMNS_KEY),
    idbDelete(IDB_RAW_ROWS_KEY),
    idbDelete(IDB_UPLOAD_STATE_KEY),
  ]);
}

interface SchemaStoreContextType {
  schemas: FinalSchema[];
  schemasLoading: boolean;
  addSchema: (schema: FinalSchema) => Promise<FinalSchema>;
  updateSchema: (id: string, updates: Partial<FinalSchema>) => Promise<void>;
  deleteSchema: (id: string) => Promise<void>;
  getSchema: (id: string) => FinalSchema | undefined;
  workflow: WorkflowState;
  setCurrentSchema: (id: string | null) => void;
  setRawData: (columns: RawColumn[], rows: Record<string, unknown>[]) => void;
  setColumnMappings: (mappings: ColumnMapping[]) => void;
  setPivotConfig: (config: PivotConfig) => void;
  setVerticalPivotConfig: (config: VerticalPivotConfig) => void;
  setDefaultValues: (values: DefaultValues) => void;
  resetWorkflow: () => void;
  setUploadState: (state: WorkflowState["uploadState"]) => void;
}

const defaultVerticalPivotConfig: VerticalPivotConfig = {
  enabled: false,
  outputTargetPaths: [],
  columns: [],
};

const defaultWorkflow: WorkflowState = {
  currentSchemaId: null,
  rawColumns: [],
  rawRows: [],
  columnMappings: [],
  pivotConfig: { enabled: false, groupByColumns: [] },
  verticalPivotConfig: defaultVerticalPivotConfig,
  defaultValues: {},
  uploadState: null,
};

const SchemaStoreContext = createContext<SchemaStoreContextType | undefined>(
  undefined,
);

export function SchemaStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [schemas, setSchemas] = useState<FinalSchema[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [workflow, setWorkflow] = useState<WorkflowState>(defaultWorkflow);
  const [hydrated, setHydrated] = useState(false);
  const prevWorkflowRef = useRef<WorkflowState>(defaultWorkflow);

  // Load schemas from API when user is set
  useEffect(() => {
    if (!user) {
      setSchemas([]);
      setSchemasLoading(false);
      return;
    }
    setSchemasLoading(true);
    api("/api/schemas")
      .then((res) => (res.ok ? res.json() : { schemas: [] }))
      .then((data) => {
        setSchemas(Array.isArray(data?.schemas) ? data.schemas : []);
      })
      .catch(() => setSchemas([]))
      .finally(() => setSchemasLoading(false));
  }, [user?.id]);

  useEffect(() => {
    const meta = loadWorkflowMeta();

    loadWorkflowLargeData()
      .then((large) => {
        const restored: WorkflowState = {
          currentSchemaId: meta?.currentSchemaId ?? null,
          columnMappings: meta?.columnMappings ?? [],
          pivotConfig: meta?.pivotConfig ?? defaultWorkflow.pivotConfig,
          verticalPivotConfig: meta?.verticalPivotConfig ?? defaultVerticalPivotConfig,
          defaultValues: meta?.defaultValues ?? {},
          rawColumns: large.rawColumns,
          rawRows: large.rawRows,
          uploadState: large.uploadState,
        };
        setWorkflow(restored);
        prevWorkflowRef.current = restored;
        setHydrated(true);
      })
      .catch(() => {
        if (meta) {
          setWorkflow((w) => ({ ...w, ...meta }));
        }
        setHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const prev = prevWorkflowRef.current;
    prevWorkflowRef.current = workflow;

    saveWorkflowMeta(workflow);

    const largeDataChanged =
      prev.rawColumns !== workflow.rawColumns ||
      prev.rawRows !== workflow.rawRows ||
      prev.uploadState !== workflow.uploadState;

    if (largeDataChanged) {
      saveWorkflowLargeData(workflow).catch(() => {});
    }
  }, [workflow, hydrated]);

  const addSchema = useCallback(async (schema: FinalSchema) => {
    const res = await api("/api/schemas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: schema.name, fields: schema.fields }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to create schema");
    }
    const data = await res.json();
    if (data?.schema) {
      setSchemas((prev) => [...prev, data.schema]);
      return data.schema;
    }
    setSchemas((prev) => [...prev, schema]);
    return schema;
  }, []);

  const updateSchema = useCallback(async (id: string, updates: Partial<FinalSchema>) => {
    const res = await api(`/api/schemas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.fields !== undefined && { fields: updates.fields }),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to update schema");
    }
    setSchemas((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  }, []);

  const deleteSchema = useCallback(async (id: string) => {
    const res = await api(`/api/schemas/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to delete schema");
    }
    setSchemas((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const getSchema = useCallback(
    (id: string) => schemas.find((s) => s.id === id),
    [schemas],
  );

  const setCurrentSchema = useCallback((currentSchemaId: string | null) => {
    setWorkflow((w) => ({ ...w, currentSchemaId }));
  }, []);

  const setRawData = useCallback(
    (rawColumns: RawColumn[], rawRows: Record<string, unknown>[]) => {
      setWorkflow((w) => ({
        ...w,
        rawColumns,
        rawRows,
      }));
    },
    [],
  );

  const setColumnMappings = useCallback((columnMappings: ColumnMapping[]) => {
    setWorkflow((w) => ({ ...w, columnMappings }));
  }, []);

  const setPivotConfig = useCallback((pivotConfig: PivotConfig) => {
    setWorkflow((w) => ({ ...w, pivotConfig }));
  }, []);

  const setVerticalPivotConfig = useCallback((verticalPivotConfig: VerticalPivotConfig) => {
    setWorkflow((w) => ({ ...w, verticalPivotConfig }));
  }, []);

  const setDefaultValues = useCallback((defaultValues: DefaultValues) => {
    setWorkflow((w) => ({ ...w, defaultValues }));
  }, []);

  const resetWorkflow = useCallback(() => {
    setWorkflow(defaultWorkflow);
    if (typeof window !== "undefined") {
      localStorage.removeItem(WORKFLOW_STORAGE_KEY);
      clearWorkflowLargeData().catch(() => {});
    }
  }, []);

  const setUploadState = useCallback(
    (uploadState: WorkflowState["uploadState"]) => {
      setWorkflow((w) => ({ ...w, uploadState }));
    },
    [],
  );

  const value = useMemo(
    () => ({
      schemas,
      schemasLoading,
      addSchema,
      updateSchema,
      deleteSchema,
      getSchema,
      workflow,
      setCurrentSchema,
      setRawData,
      setColumnMappings,
      setPivotConfig,
      setVerticalPivotConfig,
      setDefaultValues,
      resetWorkflow,
      setUploadState,
    }),
    [
      schemas,
      schemasLoading,
      addSchema,
      updateSchema,
      deleteSchema,
      getSchema,
      workflow,
      setCurrentSchema,
      setRawData,
      setColumnMappings,
      setPivotConfig,
      setVerticalPivotConfig,
      setDefaultValues,
      resetWorkflow,
      setUploadState,
    ],
  );

  return (
    <SchemaStoreContext.Provider value={value}>
      {children}
    </SchemaStoreContext.Provider>
  );
}

export function useSchemaStore() {
  const ctx = useContext(SchemaStoreContext);
  if (ctx === undefined) {
    throw new Error("useSchemaStore must be used within SchemaStoreProvider");
  }
  return ctx;
}

export function flattenFields(fields: SchemaField[], prefix = ""): SchemaField[] {
  const out: SchemaField[] = [];
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.name}` : f.name;
    out.push({ ...f, path });
    if (f.children?.length) {
      out.push(...flattenFields(f.children, path));
    }
  }
  return out;
}
