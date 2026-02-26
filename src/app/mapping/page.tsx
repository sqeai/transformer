"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ReactFlow, Position, ConnectionMode, addEdge, Background, Controls, MiniMap, Handle, useNodesState, useEdgesState, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSchemaStore } from "@/lib/schema-store";
import { flattenFields } from "@/lib/schema-store";
import { applyMappings } from "@/lib/pivot-transform";
import type { ColumnMapping, DefaultValues } from "@/lib/types";
import { ArrowRight, ArrowLeft, Sparkles, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import PivotConfigPanel from "@/components/PivotConfigPanel";
import DefaultValuesPanel from "@/components/DefaultValuesPanel";
import VerticalPivotPanel from "@/components/VerticalPivotPanel";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

const NODE_WIDTH = 240;
const NODE_GAP = 60;
const LEFT_X = 20;
const RIGHT_X = LEFT_X + NODE_WIDTH + 160;
const HANDLE_SIZE = 16;
const HANDLE_Z_INDEX = 2000;

interface MappingNodeData {
  label: string;
  internalId: string;
  isTarget?: boolean;
  isDuplicate?: boolean;
  duplicateIndex?: number;
  [key: string]: unknown;
}

interface StructuredSheetData {
  sheetIndex: number;
  sheetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

interface StructuredMappingSession {
  sheets: StructuredSheetData[];
  reviewIndex?: number;
  confirmedSheets?: Array<{
    sheetIndex: number;
    mappings: ColumnMapping[];
    defaultValues: DefaultValues;
  }>;
}

function sheetId(sheet: StructuredSheetData): string {
  return String(sheet.sheetIndex);
}

function parseStructuredSession(value: unknown): StructuredMappingSession | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<StructuredMappingSession>;
  if (!Array.isArray(v.sheets)) return null;
  const sheets = v.sheets.filter((s): s is StructuredSheetData => {
    if (!s || typeof s !== "object") return false;
    const t = s as Partial<StructuredSheetData>;
    return typeof t.sheetIndex === "number" && typeof t.sheetName === "string" && Array.isArray(t.columns) && Array.isArray(t.rows);
  });
  if (sheets.length === 0) return null;
  return {
    sheets,
    reviewIndex: typeof v.reviewIndex === "number" ? v.reviewIndex : 0,
    confirmedSheets: Array.isArray(v.confirmedSheets) ? v.confirmedSheets : [],
  };
}

const MappingNode = memo(({ data }: NodeProps) => {
  const { label, internalId, isTarget, isDuplicate, duplicateIndex } = data as MappingNodeData;
  const lines = label.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const isMultiLine = lines.length >= 2;

  const bgClass = isTarget
    ? "border-border/60 bg-white dark:bg-zinc-900"
    : isDuplicate
    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
    : "border-border/60 bg-white dark:bg-zinc-900";

  return (
    <div
      className={`rounded-md border px-3 py-2 shadow-sm ${bgClass} relative overflow-visible`}
      style={{
        minWidth: NODE_WIDTH,
        ...(isTarget
          ? {
              background:
                "linear-gradient(135deg, rgba(255,99,71,0.06), rgba(255,165,0,0.06), rgba(255,215,0,0.06), rgba(154,205,50,0.06), rgba(100,149,237,0.06), rgba(186,85,211,0.06))",
            }
          : {}),
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          borderRadius: 9999,
          border: "2px solid hsl(var(--primary))",
          background: "hsl(var(--background))",
          zIndex: HANDLE_Z_INDEX,
          left: -8,
        }}
      />
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {isMultiLine ? (
            <>
              <span className="text-xs font-medium leading-tight truncate">{lines[0]}</span>
              <span className="text-[11px] text-muted-foreground leading-tight truncate">
                {lines.slice(1).join(" · ")}
              </span>
            </>
          ) : (
            <span className="text-xs font-medium truncate">{label}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isDuplicate && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-200 dark:bg-amber-800 px-1 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-2.5 w-2.5" />
              #{duplicateIndex}
            </span>
          )}
          <span className="text-[9px] text-muted-foreground/50 font-mono">{internalId}</span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          borderRadius: 9999,
          border: "2px solid hsl(var(--primary))",
          background: "hsl(var(--background))",
          zIndex: HANDLE_Z_INDEX,
          right: -8,
        }}
      />
    </div>
  );
});
MappingNode.displayName = "MappingNode";

const nodeTypes = { mapping: MappingNode };

export default function MappingPage() {
  const router = useRouter();
  const {
    workflow,
    getSchema,
    setRawData,
    setColumnMappings,
    setPivotConfig,
    setVerticalPivotConfig,
    setDefaultValues,
    setUploadState,
  } = useSchemaStore();
  const { currentSchemaId, rawColumns, rawRows, pivotConfig, verticalPivotConfig, defaultValues } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;
  const targetPaths = useMemo(
    () => (schema ? flattenFields(schema.fields).filter((f) => !f.children?.length).map((f) => f.path) : []),
    [schema],
  );

  const structuredSession = useMemo(
    () => parseStructuredSession(workflow.uploadState?.uploadMode === "structured" ? workflow.uploadState?.structuredMapping : null),
    [workflow.uploadState],
  );
  const isStructuredLoop = structuredSession != null;

  const [sheetReviewIndex, setSheetReviewIndex] = useState(0);
  const [sheetMappingsById, setSheetMappingsById] = useState<Record<string, ColumnMapping[]>>({});
  const [sheetDefaultsById, setSheetDefaultsById] = useState<Record<string, DefaultValues>>({});
  const [confirmedSheetIds, setConfirmedSheetIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!structuredSession) return;
    const nextMappings: Record<string, ColumnMapping[]> = {};
    const nextDefaults: Record<string, DefaultValues> = {};
    const nextConfirmed = new Set<string>();

    for (const sheet of structuredSession.sheets) {
      const sid = sheetId(sheet);
      nextMappings[sid] = [];
      nextDefaults[sid] = {};
    }

    for (const confirmed of structuredSession.confirmedSheets ?? []) {
      const sid = String(confirmed.sheetIndex);
      if (!(sid in nextMappings)) continue;
      nextMappings[sid] = Array.isArray(confirmed.mappings) ? confirmed.mappings : [];
      nextDefaults[sid] = confirmed.defaultValues ?? {};
      nextConfirmed.add(sid);
    }

    setSheetMappingsById(nextMappings);
    setSheetDefaultsById(nextDefaults);
    setConfirmedSheetIds(nextConfirmed);
    setSheetReviewIndex(Math.min(Math.max(structuredSession.reviewIndex ?? 0, 0), structuredSession.sheets.length - 1));
  }, [structuredSession]);

  const activeSheet = isStructuredLoop ? structuredSession.sheets[sheetReviewIndex] : null;
  const activeSheetId = activeSheet ? sheetId(activeSheet) : "";
  const effectiveRawColumns = isStructuredLoop ? (activeSheet?.columns ?? []) : rawColumns;
  const effectiveRawRows = isStructuredLoop ? (activeSheet?.rows ?? []) : rawRows;
  const effectiveColumnMappings = isStructuredLoop ? (sheetMappingsById[activeSheetId] ?? []) : workflow.columnMappings;
  const effectiveDefaultValues = isStructuredLoop ? (sheetDefaultsById[activeSheetId] ?? {}) : defaultValues;

  const setActiveMappings = useCallback((mappings: ColumnMapping[]) => {
    if (isStructuredLoop && activeSheetId) {
      setSheetMappingsById((prev) => ({ ...prev, [activeSheetId]: mappings }));
      setConfirmedSheetIds((prev) => {
        const next = new Set(prev);
        next.delete(activeSheetId);
        return next;
      });
      return;
    }
    setColumnMappings(mappings);
  }, [isStructuredLoop, activeSheetId, setColumnMappings]);

  const setActivePivotConfig = useCallback((config: typeof pivotConfig) => {
    setPivotConfig(config);
    if (isStructuredLoop && activeSheetId) {
      setConfirmedSheetIds((prev) => {
        const next = new Set(prev);
        next.delete(activeSheetId);
        return next;
      });
    }
  }, [setPivotConfig, isStructuredLoop, activeSheetId]);

  const setActiveVerticalPivotConfig = useCallback((config: typeof verticalPivotConfig) => {
    setVerticalPivotConfig(config);
    if (isStructuredLoop && activeSheetId) {
      setConfirmedSheetIds((prev) => {
        const next = new Set(prev);
        next.delete(activeSheetId);
        return next;
      });
    }
  }, [setVerticalPivotConfig, isStructuredLoop, activeSheetId]);

  const setActiveDefaultValues = useCallback((values: DefaultValues) => {
    if (isStructuredLoop && activeSheetId) {
      setSheetDefaultsById((prev) => ({ ...prev, [activeSheetId]: values }));
      setConfirmedSheetIds((prev) => {
        const next = new Set(prev);
        next.delete(activeSheetId);
        return next;
      });
      return;
    }
    setDefaultValues(values);
  }, [isStructuredLoop, activeSheetId, setDefaultValues]);

  const unmappedTargetPaths = useMemo(() => {
    const mappedPaths = new Set(effectiveColumnMappings.map((m) => m.targetPath));
    return targetPaths.filter((p) => !mappedPaths.has(p));
  }, [targetPaths, effectiveColumnMappings]);

  const [autoMapping, setAutoMapping] = useState(false);
  const autoMapDone = useRef(new Set<string>());

  const rawDuplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const col of effectiveRawColumns) {
      counts.set(col, (counts.get(col) ?? 0) + 1);
    }
    const dupNames = new Set<string>();
    for (const [name, count] of counts) {
      if (count > 1) dupNames.add(name);
    }
    const indexTracker = new Map<string, number>();
    return effectiveRawColumns.map((col) => {
      const isDup = dupNames.has(col);
      const idx = (indexTracker.get(col) ?? 0) + 1;
      indexTracker.set(col, idx);
      return { isDuplicate: isDup, duplicateIndex: isDup ? idx : undefined };
    });
  }, [effectiveRawColumns]);

  const targetDuplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of targetPaths) {
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const dupNames = new Set<string>();
    for (const [name, count] of counts) {
      if (count > 1) dupNames.add(name);
    }
    const indexTracker = new Map<string, number>();
    return targetPaths.map((p) => {
      const isDup = dupNames.has(p);
      const idx = (indexTracker.get(p) ?? 0) + 1;
      indexTracker.set(p, idx);
      return { isDuplicate: isDup, duplicateIndex: isDup ? idx : undefined };
    });
  }, [targetPaths]);

  const rawNodes: Node[] = useMemo(
    () =>
      effectiveRawColumns.map((col, i) => ({
        id: `raw_${i}`,
        type: "mapping",
        position: { x: LEFT_X, y: 20 + i * NODE_GAP },
        data: {
          label: col,
          internalId: `R${i}`,
          isDuplicate: rawDuplicates[i].isDuplicate,
          duplicateIndex: rawDuplicates[i].duplicateIndex,
        } satisfies MappingNodeData,
        draggable: true,
      })),
    [effectiveRawColumns, rawDuplicates],
  );

  const targetNodes: Node[] = useMemo(
    () =>
      targetPaths.map((path, i) => ({
        id: `target_${path}_${i}`,
        type: "mapping",
        position: { x: RIGHT_X, y: 20 + i * NODE_GAP },
        data: {
          label: path,
          internalId: `T${i}`,
          isTarget: true,
          isDuplicate: targetDuplicates[i].isDuplicate,
          duplicateIndex: targetDuplicates[i].duplicateIndex,
        } satisfies MappingNodeData,
        draggable: true,
      })),
    [targetPaths, targetDuplicates],
  );

  const initialNodes = useMemo(
    () => [...rawNodes, ...targetNodes],
    [rawNodes, targetNodes],
  );

  const targetPathToNodeId = useMemo(() => {
    const map = new Map<string, string>();
    targetPaths.forEach((path, i) => {
      if (!map.has(path)) map.set(path, `target_${path}_${i}`);
    });
    return map;
  }, [targetPaths]);

  const nodeIdToTargetPath = useMemo(() => {
    const map = new Map<string, string>();
    targetPaths.forEach((path, i) => {
      map.set(`target_${path}_${i}`, path);
    });
    return map;
  }, [targetPaths]);

  const edgesFromMappings: Edge[] = useMemo(() => {
    const result: Edge[] = [];
    effectiveColumnMappings.forEach((m, i) => {
      const targetNodeId = targetPathToNodeId.get(m.targetPath);
      if (!targetNodeId) return;
      const rawIdx = effectiveRawColumns.indexOf(m.rawColumn);
      if (rawIdx === -1) return;
      result.push({
        id: `e_${i}_${rawIdx}_${m.targetPath}`,
        source: `raw_${rawIdx}`,
        target: targetNodeId,
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
      });
    });
    return result;
  }, [effectiveColumnMappings, effectiveRawColumns, targetPathToNodeId]);

  const edgesFromUnpivot: Edge[] = useMemo(() => {
    if (!verticalPivotConfig.enabled || verticalPivotConfig.outputTargetPaths.length === 0) {
      return [];
    }
    const result: Edge[] = [];
    verticalPivotConfig.columns.forEach((col) => {
      const rawIdx = effectiveRawColumns.indexOf(col.rawColumn);
      if (rawIdx === -1) return;
      verticalPivotConfig.outputTargetPaths.forEach((targetPath) => {
        const targetNodeId = targetPathToNodeId.get(targetPath);
        if (!targetNodeId) return;
        result.push({
          id: `vp_${rawIdx}__${targetPath}`,
          source: `raw_${rawIdx}`,
          target: targetNodeId,
          data: { isUnpivot: true },
          style: { stroke: "hsl(262 83% 58%)", strokeWidth: 1 },
          deletable: true,
          selectable: true,
        });
      });
    });
    return result;
  }, [verticalPivotConfig, effectiveRawColumns, targetPathToNodeId]);

  const allEdges = useMemo(
    () => [...edgesFromMappings, ...edgesFromUnpivot],
    [edgesFromMappings, edgesFromUnpivot],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(allEdges);
  const edgesRef = useRef(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(allEdges);
  }, [allEdges, setEdges]);

  const mappingExtrasLookup = useMemo(() => {
    const map = new Map<string, Pick<ColumnMapping, "aggregation">>();
    for (const m of effectiveColumnMappings) {
      if (m.aggregation) map.set(m.rawColumn, { aggregation: m.aggregation });
    }
    return map;
  }, [effectiveColumnMappings]);

  const extractMappingFromEdge = useCallback(
    (e: Edge): ColumnMapping | null => {
      const rawIdx = e.source?.replace("raw_", "");
      const targetPath = e.target ? nodeIdToTargetPath.get(e.target) : undefined;
      if (rawIdx == null || targetPath == null) return null;
      const col = effectiveRawColumns[Number(rawIdx)];
      if (!col) return null;
      const extras = mappingExtrasLookup.get(col);
      return { rawColumn: col, targetPath, ...extras };
    },
    [effectiveRawColumns, nodeIdToTargetPath, mappingExtrasLookup],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 } }, eds));
      const rawIdx = params.source?.replace("raw_", "");
      const targetPath = params.target ? nodeIdToTargetPath.get(params.target) : undefined;
      if (rawIdx != null && targetPath != null) {
        const col = effectiveRawColumns[Number(rawIdx)];
        if (col) {
          const extras = mappingExtrasLookup.get(col);
          setActiveMappings([
            ...effectiveColumnMappings.filter((m) => m.targetPath !== targetPath),
            { rawColumn: col, targetPath, ...extras },
          ]);
        }
      }
    },
    [effectiveRawColumns, effectiveColumnMappings, setActiveMappings, setEdges, mappingExtrasLookup, nodeIdToTargetPath],
  );

  const onEdgesDeleted = useCallback(
    (deletedEdges: Edge[]) => {
      const vpDeleted: { rawIdx: number; targetPath: string }[] = [];
      for (const e of deletedEdges) {
        if (!e.id.startsWith("vp_")) continue;
        const rest = e.id.slice(3);
        const sep = rest.indexOf("__");
        if (sep === -1) continue;
        const rawIdx = parseInt(rest.slice(0, sep), 10);
        const targetPath = rest.slice(sep + 2);
        if (!Number.isNaN(rawIdx) && targetPath) {
          vpDeleted.push({ rawIdx, targetPath });
        }
      }
      if (vpDeleted.length > 0) {
        let next = { ...verticalPivotConfig };
        for (const { rawIdx, targetPath } of vpDeleted) {
          const rawColumn = effectiveRawColumns[rawIdx];
          if (!rawColumn) continue;
          const col = next.columns.find((c) => c.rawColumn === rawColumn);
          if (!col) continue;
          const { [targetPath]: _, ...restFieldValues } = col.fieldValues;
          const newFieldValues = restFieldValues;
          if (Object.keys(newFieldValues).length === 0) {
            next = {
              ...next,
              columns: next.columns.filter((c) => c.rawColumn !== rawColumn),
            };
          } else {
            next = {
              ...next,
              columns: next.columns.map((c) =>
                c.rawColumn === rawColumn ? { ...c, fieldValues: newFieldValues } : c,
              ),
            };
          }
          const stillUsed = next.columns.some((c) => targetPath in c.fieldValues);
          if (!stillUsed) {
            next = {
              ...next,
              outputTargetPaths: next.outputTargetPaths.filter((p) => p !== targetPath),
              columns: next.columns.map((c) => {
                const { [targetPath]: __, ...fv } = c.fieldValues;
                return { ...c, fieldValues: fv };
              }),
            };
          }
        }
        setActiveVerticalPivotConfig(next);
      }

      const deletedIds = new Set(deletedEdges.map((e) => e.id));
      const remaining = edgesRef.current.filter((e) => !deletedIds.has(e.id));
      const mappings = remaining
        .map(extractMappingFromEdge)
        .filter((m): m is ColumnMapping => m != null);
      setActiveMappings(mappings);
    },
    [
      verticalPivotConfig,
      effectiveRawColumns,
      setActiveVerticalPivotConfig,
      extractMappingFromEdge,
      setActiveMappings,
    ],
  );

  const buildMappingsFromEdges = useCallback(() => {
    return edgesRef.current
      .map(extractMappingFromEdge)
      .filter((m): m is ColumnMapping => m != null);
  }, [extractMappingFromEdge]);

  const syncMappingsFromEdges = useCallback(() => {
    setActiveMappings(buildMappingsFromEdges());
  }, [buildMappingsFromEdges, setActiveMappings]);

  const runAutoMap = useCallback(async () => {
    if (effectiveRawColumns.length === 0 || targetPaths.length === 0) return;
    setAutoMapping(true);
    try {
      const res = await fetch("/api/auto-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawColumns: effectiveRawColumns, targetPaths }),
      });
      if (!res.ok) return;
      const { mappings, defaultValues: dv } = (await res.json()) as {
        mappings: ColumnMapping[];
        defaultValues?: DefaultValues;
      };
      if (mappings.length > 0) {
        setActiveMappings(mappings);
        const newEdges: Edge[] = mappings.map((m, i) => {
          const targetNodeId = targetPathToNodeId.get(m.targetPath) ?? `target_${m.targetPath}_0`;
          return {
            id: `auto_${i}_${m.rawColumn}_${m.targetPath}`,
            source: `raw_${effectiveRawColumns.indexOf(m.rawColumn)}`,
            target: targetNodeId,
            animated: true,
            style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
          };
        });
        setEdges(newEdges);
      }
      if (dv && Object.keys(dv).length > 0) {
        setActiveDefaultValues(dv);
      }
    } catch {
      // auto-map failed silently — user can still map manually
    } finally {
      setAutoMapping(false);
    }
  }, [effectiveRawColumns, targetPaths, setActiveMappings, setEdges, setActiveDefaultValues, targetPathToNodeId]);

  useEffect(() => {
    if (isStructuredLoop) return;
    if (
      effectiveRawColumns.length > 0 &&
      targetPaths.length > 0 &&
      effectiveColumnMappings.length === 0 &&
      effectiveRawColumns.length === targetPaths.length &&
      effectiveRawColumns.every((col, i) => col === targetPaths[i])
    ) {
      const identityMappings: ColumnMapping[] = targetPaths.map((path) => ({
        rawColumn: path,
        targetPath: path,
      }));
      setColumnMappings(identityMappings);
      autoMapDone.current.add("single");
    }
  }, [isStructuredLoop, effectiveRawColumns, targetPaths, effectiveColumnMappings.length, setColumnMappings]);

  useEffect(() => {
    const key = isStructuredLoop ? `sheet:${activeSheetId}` : "single";
    if (autoMapDone.current.has(key)) return;
    if (effectiveRawColumns.length === 0 || targetPaths.length === 0) return;
    if (effectiveColumnMappings.length > 0) return;

    autoMapDone.current.add(key);
    runAutoMap();
  }, [isStructuredLoop, activeSheetId, effectiveRawColumns, targetPaths, effectiveColumnMappings.length, runAutoMap]);

  const persistStructuredProgress = useCallback(
    (
      nextIndex: number,
      nextConfirmedIds: Set<string>,
      nextMappingsById: Record<string, ColumnMapping[]>,
      nextDefaultsById: Record<string, DefaultValues>,
    ) => {
      if (!isStructuredLoop || !structuredSession || !workflow.uploadState?.schemaId) return;
      setUploadState({
        ...workflow.uploadState,
        structuredMapping: {
          sheets: structuredSession.sheets,
          reviewIndex: nextIndex,
          confirmedSheets: structuredSession.sheets
            .filter((sheet) => nextConfirmedIds.has(sheetId(sheet)))
            .map((sheet) => {
              const sid = sheetId(sheet);
              return {
                sheetIndex: sheet.sheetIndex,
                mappings: nextMappingsById[sid] ?? [],
                defaultValues: nextDefaultsById[sid] ?? {},
              };
            }),
        },
      });
    },
    [isStructuredLoop, structuredSession, workflow.uploadState, setUploadState],
  );

  const confirmCurrentMapping = useCallback(() => {
    if (!isStructuredLoop || !activeSheet || !activeSheetId) return;

    const mappings = buildMappingsFromEdges();
    const nextMappingsById = { ...sheetMappingsById, [activeSheetId]: mappings };
    const nextDefaultsById = { ...sheetDefaultsById };
    const nextConfirmedIds = new Set(confirmedSheetIds);
    nextConfirmedIds.add(activeSheetId);

    setSheetMappingsById(nextMappingsById);
    setConfirmedSheetIds(nextConfirmedIds);

    const nextUnconfirmedIndex = structuredSession.sheets.findIndex((sheet, idx) => {
      if (idx === sheetReviewIndex) return false;
      return !nextConfirmedIds.has(sheetId(sheet));
    });
    const nextIndex = nextUnconfirmedIndex >= 0 ? nextUnconfirmedIndex : sheetReviewIndex;

    setSheetReviewIndex(nextIndex);
    persistStructuredProgress(nextIndex, nextConfirmedIds, nextMappingsById, nextDefaultsById);
  }, [
    isStructuredLoop,
    activeSheet,
    activeSheetId,
    buildMappingsFromEdges,
    sheetMappingsById,
    sheetDefaultsById,
    confirmedSheetIds,
    structuredSession,
    sheetReviewIndex,
    persistStructuredProgress,
  ]);

  const finalizeStructuredLoop = useCallback(() => {
    if (!isStructuredLoop || !structuredSession) return;
    const isComplete = structuredSession.sheets.every((sheet) => confirmedSheetIds.has(sheetId(sheet)));
    if (!isComplete) return;

    const mergedRows: Record<string, unknown>[] = [];
    for (const sheet of structuredSession.sheets) {
      const sid = sheetId(sheet);
      const mappings = sheetMappingsById[sid] ?? [];
      const defaults = sheetDefaultsById[sid] ?? {};
      const rows = applyMappings(
        sheet.rows,
        mappings,
        pivotConfig,
        defaults,
        targetPaths,
        verticalPivotConfig,
      );
      mergedRows.push(...rows);
    }

    const identityMappings = targetPaths.map((path) => ({ rawColumn: path, targetPath: path }));

    setRawData(targetPaths, mergedRows);
    setColumnMappings(identityMappings);
    setPivotConfig({ enabled: false, groupByColumns: [] });
    setVerticalPivotConfig({ enabled: false, outputTargetPaths: [], columns: [] });
    setDefaultValues({});

    if (workflow.uploadState?.schemaId) {
      setUploadState({
        ...workflow.uploadState,
        structuredMapping: null,
      });
    }

    router.push("/preview");
  }, [
    isStructuredLoop,
    structuredSession,
    confirmedSheetIds,
    sheetMappingsById,
    sheetDefaultsById,
    targetPaths,
    setRawData,
    setColumnMappings,
    setPivotConfig,
    setVerticalPivotConfig,
    setDefaultValues,
    workflow.uploadState,
    setUploadState,
    router,
  ]);

  const onContinue = () => {
    syncMappingsFromEdges();
    router.push("/preview");
  };

  if (!schema || effectiveRawColumns.length === 0) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>No schema or raw data</CardTitle>
            <CardDescription>
              Upload a schema from Final Schemas, then use it and upload raw data from the Upload page. Come back here to map columns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/schemas")}>
              Go to Final Schemas
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const mappedCount = effectiveColumnMappings.length;
  const totalSheets = structuredSession?.sheets.length ?? 0;
  const allSheetsConfirmed = isStructuredLoop && structuredSession.sheets.every((sheet) => confirmedSheetIds.has(sheetId(sheet)));
  const currentSheetConfirmed = isStructuredLoop && activeSheet ? confirmedSheetIds.has(sheetId(activeSheet)) : false;

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-3rem)] flex-col animate-fade-in">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/upload")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Mapping Builder</h1>
              <p className="text-muted-foreground">
                {isStructuredLoop
                  ? `Confirm mapping for each selected sheet (${confirmedSheetIds.size}/${totalSheets} confirmed).`
                  : `Connect raw columns (left) to target fields (right) by clicking handles. ${mappedCount} mapping${mappedCount !== 1 ? "s" : ""} active.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={runAutoMap}
              disabled={autoMapping}
            >
              {autoMapping ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {autoMapping ? "Auto-mapping…" : "Auto-map with AI"}
            </Button>
            {isStructuredLoop ? (
              <>
                <Button
                  variant="default"
                  onClick={confirmCurrentMapping}
                >
                  {currentSheetConfirmed ? "Re-confirm Mapping" : "Confirm Mapping"}
                </Button>
                <Button onClick={finalizeStructuredLoop} disabled={!allSheetsConfirmed}>
                  Continue to Preview
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button onClick={onContinue} disabled={mappedCount === 0}>
                Continue to Preview
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {isStructuredLoop && structuredSession && (
          <div className="mb-3 rounded-lg border p-2">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex items-center gap-2">
                {structuredSession.sheets.map((sheet, idx) => {
                  const sid = sheetId(sheet);
                  const isActive = idx === sheetReviewIndex;
                  const isConfirmed = confirmedSheetIds.has(sid);
                  return (
                    <button
                      key={sid}
                      type="button"
                      onClick={() => setSheetReviewIndex(idx)}
                      className={[
                        "inline-flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                        isConfirmed
                          ? "border-green-300 bg-green-50 text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                          : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
                        isActive ? "ring-2 ring-primary/40 ring-offset-1" : "",
                      ].join(" ")}
                      title={sheet.sheetName}
                    >
                      {isConfirmed ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      <span className="font-medium">#{idx + 1}</span>
                      <span className="max-w-[220px] truncate">{sheet.sheetName}</span>
                    </button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        )}

        {autoMapping && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary flex items-center gap-2 mb-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI is analysing column names and matching them to the target schema…
          </div>
        )}

        <div className="flex-1 min-h-0">
          <ResizablePanelGroup orientation="horizontal" className="h-full rounded-lg border">
            <ResizablePanel defaultSize={55} minSize={30}>
              <div className="h-full relative overflow-hidden bg-muted/80">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onEdgesDelete={onEdgesDeleted}
                  connectOnClick={true}
                  connectionMode={ConnectionMode.Strict}
                  deleteKeyCode={["Backspace", "Delete"]}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                >
                  <Background />
                  <Controls />
                  <MiniMap />
                </ReactFlow>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={45} minSize={30}>
              <div className="h-full overflow-y-auto p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-muted-foreground">Configuration</h2>
                </div>
                <DefaultValuesPanel
                  unmappedTargetPaths={unmappedTargetPaths}
                  defaultValues={effectiveDefaultValues}
                  onDefaultValuesChange={setActiveDefaultValues}
                />
                <VerticalPivotPanel
                  rawColumns={effectiveRawColumns}
                  targetPaths={targetPaths}
                  verticalPivotConfig={verticalPivotConfig}
                  onVerticalPivotConfigChange={setActiveVerticalPivotConfig}
                />
                <PivotConfigPanel
                  rawColumns={effectiveRawColumns}
                  columnMappings={effectiveColumnMappings}
                  pivotConfig={pivotConfig}
                  onPivotConfigChange={setActivePivotConfig}
                  onColumnMappingsChange={setActiveMappings}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </DashboardLayout>
  );
}
