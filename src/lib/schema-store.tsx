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
} from "./types";
import { idbGet, idbSet, idbDelete } from "./idb-storage";

const SCHEMAS_STORAGE_KEY = "ai_data_cleanser_schemas";
const WORKFLOW_STORAGE_KEY = "ai_data_cleanser_workflow";
const IDB_RAW_COLUMNS_KEY = "workflow_rawColumns";
const IDB_RAW_ROWS_KEY = "workflow_rawRows";
const IDB_UPLOAD_STATE_KEY = "workflow_uploadState";

interface WorkflowState {
  currentSchemaId: string | null;
  rawColumns: RawColumn[];
  rawRows: Record<string, unknown>[];
  columnMappings: ColumnMapping[];
  pivotConfig: PivotConfig;
  defaultValues: DefaultValues;
  /** Persisted upload page state so we can restore when navigating back to /upload */
  uploadState: {
    schemaId: string;
    step: string;
    preview: unknown;
    boundary: unknown;
    analysis: unknown;
  } | null;
}

/** Lightweight subset stored in localStorage (no large arrays). */
interface WorkflowMeta {
  currentSchemaId: string | null;
  columnMappings: ColumnMapping[];
  pivotConfig: PivotConfig;
  defaultValues: DefaultValues;
}

function loadSchemas(): FinalSchema[] {
  if (typeof window === "undefined") return [];
  try {
    const s = localStorage.getItem(SCHEMAS_STORAGE_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function saveSchemas(schemas: FinalSchema[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCHEMAS_STORAGE_KEY, JSON.stringify(schemas));
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
  addSchema: (schema: FinalSchema) => void;
  updateSchema: (id: string, updates: Partial<FinalSchema>) => void;
  deleteSchema: (id: string) => void;
  getSchema: (id: string) => FinalSchema | undefined;
  workflow: WorkflowState;
  setCurrentSchema: (id: string | null) => void;
  setRawData: (columns: RawColumn[], rows: Record<string, unknown>[]) => void;
  setColumnMappings: (mappings: ColumnMapping[]) => void;
  setPivotConfig: (config: PivotConfig) => void;
  setDefaultValues: (values: DefaultValues) => void;
  resetWorkflow: () => void;
  setUploadState: (state: WorkflowState["uploadState"]) => void;
}

const defaultWorkflow: WorkflowState = {
  currentSchemaId: null,
  rawColumns: [],
  rawRows: [],
  columnMappings: [],
  pivotConfig: { enabled: false, groupByColumns: [] },
  defaultValues: {},
  uploadState: null,
};

const SchemaStoreContext = createContext<SchemaStoreContextType | undefined>(
  undefined,
);

export function SchemaStoreProvider({ children }: { children: ReactNode }) {
  const [schemas, setSchemas] = useState<FinalSchema[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowState>(defaultWorkflow);
  const [hydrated, setHydrated] = useState(false);
  const prevWorkflowRef = useRef<WorkflowState>(defaultWorkflow);

  useEffect(() => {
    setSchemas(loadSchemas());
    const meta = loadWorkflowMeta();

    loadWorkflowLargeData()
      .then((large) => {
        const restored: WorkflowState = {
          currentSchemaId: meta?.currentSchemaId ?? null,
          columnMappings: meta?.columnMappings ?? [],
          pivotConfig: meta?.pivotConfig ?? defaultWorkflow.pivotConfig,
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

  const addSchema = useCallback((schema: FinalSchema) => {
    setSchemas((prev) => {
      const next = [...prev, schema];
      saveSchemas(next);
      return next;
    });
  }, []);

  const updateSchema = useCallback((id: string, updates: Partial<FinalSchema>) => {
    setSchemas((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      );
      saveSchemas(next);
      return next;
    });
  }, []);

  const deleteSchema = useCallback((id: string) => {
    setSchemas((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSchemas(next);
      return next;
    });
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
      addSchema,
      updateSchema,
      deleteSchema,
      getSchema,
      workflow,
      setCurrentSchema,
      setRawData,
      setColumnMappings,
      setPivotConfig,
      setDefaultValues,
      resetWorkflow,
      setUploadState,
    }),
    [
      schemas,
      addSchema,
      updateSchema,
      deleteSchema,
      getSchema,
      workflow,
      setCurrentSchema,
      setRawData,
      setColumnMappings,
      setPivotConfig,
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
