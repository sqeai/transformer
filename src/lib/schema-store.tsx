"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  FinalSchema,
  SchemaField,
} from "./types";
import { idbGet, idbSet, idbDelete } from "./idb-storage";
import { useAuth } from "@/hooks/useAuth";

const IDB_DATASET_WORKFLOW_KEY = "dataset_workflow";

const api = (path: string, init?: RequestInit) =>
  fetch(path, { ...init, credentials: "include" });

export interface UploadedFileEntry {
  fileId: string;
  fileName: string;
  buffer: ArrayBuffer;
  sheetNames: string[];
}

export interface SheetSelection {
  fileId: string;
  fileName: string;
  sheetIndex: number;
  sheetName: string;
}

export interface SheetJobResult {
  jobId: string;
  sheet: SheetSelection;
  status: "pending" | "running" | "completed" | "failed";
  result?: {
    transformedColumns: string[];
    transformedRows: Record<string, unknown>[];
    toolsUsed: Array<{ tool: string; params: Record<string, unknown> }>;
    pipeline: PipelineDescriptor;
    outputFilePath?: string;
  };
  error?: string;
}

export interface PipelineNode {
  id: string;
  type:
    | "source"
    | "seeDataDimensions"
    | "determineFormattingType"
    | "handleStructuredData"
    | "handleBalanceSheet"
    | "handleUnstructuredData"
    | "filter"
    | "trimColumns"
    | "padColumns"
    | "unpivot"
    | "expand"
    | "aggregate"
    | "map"
    | "target";
  label: string;
  data: Record<string, unknown>;
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}

export interface PipelineDescriptor {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface DatasetWorkflowState {
  schemaId: string | null;
  step: "upload" | "processing" | "review" | "export";
  files: UploadedFileEntry[];
  selectedSheets: SheetSelection[];
  jobResults: SheetJobResult[];
  confirmedSheetIds: string[];
  exportTargetDatasetId: string | null;
}

const defaultDatasetWorkflow: DatasetWorkflowState = {
  schemaId: null,
  step: "upload",
  files: [],
  selectedSheets: [],
  jobResults: [],
  confirmedSheetIds: [],
  exportTargetDatasetId: null,
};

interface SchemaStoreContextType {
  schemas: FinalSchema[];
  schemasLoading: boolean;
  addSchema: (schema: FinalSchema) => Promise<FinalSchema>;
  updateSchema: (id: string, updates: Partial<FinalSchema>) => Promise<void>;
  deleteSchema: (id: string) => Promise<void>;
  getSchema: (id: string) => FinalSchema | undefined;
  datasetWorkflow: DatasetWorkflowState;
  setDatasetWorkflow: (state: Partial<DatasetWorkflowState>) => void;
  resetDatasetWorkflow: () => void;
}

const SchemaStoreContext = createContext<SchemaStoreContextType | undefined>(
  undefined,
);

export function SchemaStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [schemas, setSchemas] = useState<FinalSchema[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [datasetWorkflow, setDatasetWorkflowState] = useState<DatasetWorkflowState>(defaultDatasetWorkflow);
  const [hydrated, setHydrated] = useState(false);

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
    idbGet<DatasetWorkflowState>(IDB_DATASET_WORKFLOW_KEY)
      .then((saved) => {
        if (saved) {
          setDatasetWorkflowState(saved);
        }
        setHydrated(true);
      })
      .catch(() => {
        setHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    idbSet(IDB_DATASET_WORKFLOW_KEY, datasetWorkflow).catch(() => {});
  }, [datasetWorkflow, hydrated]);

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

  const setDatasetWorkflow = useCallback((updates: Partial<DatasetWorkflowState>) => {
    setDatasetWorkflowState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetDatasetWorkflow = useCallback(() => {
    setDatasetWorkflowState(defaultDatasetWorkflow);
    idbDelete(IDB_DATASET_WORKFLOW_KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      schemas,
      schemasLoading,
      addSchema,
      updateSchema,
      deleteSchema,
      getSchema,
      datasetWorkflow,
      setDatasetWorkflow,
      resetDatasetWorkflow,
    }),
    [
      schemas,
      schemasLoading,
      addSchema,
      updateSchema,
      deleteSchema,
      getSchema,
      datasetWorkflow,
      setDatasetWorkflow,
      resetDatasetWorkflow,
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
