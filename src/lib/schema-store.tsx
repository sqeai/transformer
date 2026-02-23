"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ColumnMapping,
  FinalSchema,
  PivotConfig,
  RawColumn,
  SchemaField,
} from "./types";

const SCHEMAS_STORAGE_KEY = "ai_data_cleanser_schemas";

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

interface WorkflowState {
  currentSchemaId: string | null;
  rawColumns: RawColumn[];
  rawRows: Record<string, unknown>[];
  columnMappings: ColumnMapping[];
  pivotConfig: PivotConfig;
  /** Persisted upload page state so we can restore when navigating back to /upload */
  uploadState: {
    schemaId: string;
    step: string;
    preview: unknown;
    boundary: unknown;
    analysis: unknown;
  } | null;
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
  resetWorkflow: () => void;
  setUploadState: (state: WorkflowState["uploadState"]) => void;
}

const defaultWorkflow: WorkflowState = {
  currentSchemaId: null,
  rawColumns: [],
  rawRows: [],
  columnMappings: [],
  pivotConfig: { enabled: false, groupByColumns: [] },
  uploadState: null,
};

const SchemaStoreContext = createContext<SchemaStoreContextType | undefined>(
  undefined,
);

export function SchemaStoreProvider({ children }: { children: ReactNode }) {
  const [schemas, setSchemas] = useState<FinalSchema[]>(loadSchemas);
  const [workflow, setWorkflow] = useState<WorkflowState>(defaultWorkflow);

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

  const resetWorkflow = useCallback(() => {
    setWorkflow(defaultWorkflow);
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
