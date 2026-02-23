"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ReactFlow, Position, addEdge, Background, Controls, MiniMap, Handle, useNodesState, useEdgesState, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { useSchemaStore } from "@/lib/schema-store";
import { flattenFields } from "@/lib/schema-store";
import type { ColumnMapping, PivotConfig } from "@/lib/types";
import { ArrowRight, ArrowLeft, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import PivotConfigPanel from "@/components/PivotConfigPanel";

const NODE_WIDTH = 240;
const NODE_GAP = 60;
const LEFT_X = 20;
const RIGHT_X = LEFT_X + NODE_WIDTH + 160;

interface MappingNodeData {
  label: string;
  internalId: string;
  isDuplicate?: boolean;
  duplicateIndex?: number;
  [key: string]: unknown;
}

const MappingNode = memo(({ data }: NodeProps) => {
  const { label, internalId, isDuplicate, duplicateIndex } = data as MappingNodeData;
  const lines = label.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const isMultiLine = lines.length >= 2;

  const bgClass = isDuplicate
    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
    : "border-border/60 bg-white dark:bg-zinc-900";

  return (
    <div
      className={`rounded-md border px-3 py-2 shadow-sm ${bgClass}`}
      style={{ minWidth: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
MappingNode.displayName = "MappingNode";

const nodeTypes = { mapping: MappingNode };

export default function MappingPage() {
  const router = useRouter();
  const { workflow, getSchema, setColumnMappings, setPivotConfig } = useSchemaStore();
  const { currentSchemaId, rawColumns, rawRows, pivotConfig } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;
  const targetPaths = useMemo(
    () => (schema ? flattenFields(schema.fields).filter((f) => !f.children?.length).map((f) => f.path) : []),
    [schema],
  );

  const [autoMapping, setAutoMapping] = useState(false);
  const autoMapDone = useRef(false);

  const rawDuplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const col of rawColumns) {
      counts.set(col, (counts.get(col) ?? 0) + 1);
    }
    const dupNames = new Set<string>();
    for (const [name, count] of counts) {
      if (count > 1) dupNames.add(name);
    }
    const indexTracker = new Map<string, number>();
    return rawColumns.map((col) => {
      const isDup = dupNames.has(col);
      const idx = (indexTracker.get(col) ?? 0) + 1;
      indexTracker.set(col, idx);
      return { isDuplicate: isDup, duplicateIndex: isDup ? idx : undefined };
    });
  }, [rawColumns]);

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
      rawColumns.map((col, i) => ({
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
    [rawColumns, rawDuplicates],
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
    workflow.columnMappings.forEach((m, i) => {
      const targetNodeId = targetPathToNodeId.get(m.targetPath);
      if (!targetNodeId) return;
      const rawIdx = rawColumns.indexOf(m.rawColumn);
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
  }, [workflow.columnMappings, rawColumns, targetPathToNodeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(edgesFromMappings);
  const edgesRef = useRef(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(edgesFromMappings);
  }, [edgesFromMappings, setEdges]);

  const aggLookup = useMemo(() => {
    const map = new Map<string, ColumnMapping["aggregation"]>();
    for (const m of workflow.columnMappings) {
      if (m.aggregation) map.set(m.rawColumn, m.aggregation);
    }
    return map;
  }, [workflow.columnMappings]);

  const extractMappingFromEdge = useCallback(
    (e: Edge): ColumnMapping | null => {
      const rawIdx = e.source?.replace("raw_", "");
      const targetPath = e.target ? nodeIdToTargetPath.get(e.target) : undefined;
      if (rawIdx == null || targetPath == null) return null;
      const col = rawColumns[Number(rawIdx)];
      if (!col) return null;
      const existing = aggLookup.get(col);
      return { rawColumn: col, targetPath, ...(existing ? { aggregation: existing } : {}) };
    },
    [rawColumns, nodeIdToTargetPath, aggLookup],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 } }, eds));
      const rawIdx = params.source?.replace("raw_", "");
      const targetPath = params.target ? nodeIdToTargetPath.get(params.target) : undefined;
      if (rawIdx != null && targetPath != null) {
        const col = rawColumns[Number(rawIdx)];
        if (col) {
          const existing = aggLookup.get(col);
          setColumnMappings([
            ...workflow.columnMappings.filter((m) => m.targetPath !== targetPath),
            { rawColumn: col, targetPath, ...(existing ? { aggregation: existing } : {}) },
          ]);
        }
      }
    },
    [rawColumns, workflow.columnMappings, setColumnMappings, setEdges, aggLookup, nodeIdToTargetPath],
  );

  const onEdgesDeleted = useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id));
      const remaining = edgesRef.current.filter((e) => !deletedIds.has(e.id));
      const mappings = remaining
        .map(extractMappingFromEdge)
        .filter((m): m is ColumnMapping => m != null);
      setColumnMappings(mappings);
    },
    [extractMappingFromEdge, setColumnMappings],
  );

  const syncMappingsFromEdges = useCallback(() => {
    const mappings = edgesRef.current
      .map(extractMappingFromEdge)
      .filter((m): m is ColumnMapping => m != null);
    setColumnMappings(mappings);
  }, [extractMappingFromEdge, setColumnMappings]);

  const runAutoMap = useCallback(async () => {
    if (rawColumns.length === 0 || targetPaths.length === 0) return;
    setAutoMapping(true);
    try {
      const res = await fetch("/api/auto-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawColumns, targetPaths }),
      });
      if (!res.ok) return;
      const { mappings, pivot } = (await res.json()) as {
        mappings: ColumnMapping[];
        pivot?: PivotConfig;
      };
      if (mappings.length > 0) {
        setColumnMappings(mappings);
        const newEdges: Edge[] = mappings.map((m, i) => {
          const targetNodeId = targetPathToNodeId.get(m.targetPath) ?? `target_${m.targetPath}_0`;
          return {
            id: `auto_${i}_${m.rawColumn}_${m.targetPath}`,
            source: `raw_${rawColumns.indexOf(m.rawColumn)}`,
            target: targetNodeId,
            animated: true,
            style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
          };
        });
        setEdges(newEdges);
      }
      if (pivot) {
        setPivotConfig(pivot);
      }
    } catch {
      // auto-map failed silently — user can still map manually
    } finally {
      setAutoMapping(false);
    }
  }, [rawColumns, targetPaths, setColumnMappings, setEdges, setPivotConfig, targetPathToNodeId]);

  useEffect(() => {
    if (
      !autoMapDone.current &&
      rawColumns.length > 0 &&
      targetPaths.length > 0 &&
      workflow.columnMappings.length === 0
    ) {
      autoMapDone.current = true;
      runAutoMap();
    }
  }, [rawColumns, targetPaths, workflow.columnMappings.length, runAutoMap]);

  const onContinue = () => {
    syncMappingsFromEdges();
    router.push("/preview");
  };

  if (!schema || rawColumns.length === 0) {
    return (
      <DashboardLayout>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-muted-foreground">
            No schema or raw data. Upload a schema, then upload raw data from the Upload page.
          </p>
          <Button className="mt-4" onClick={() => router.push("/schemas")}>
            Go to Schemas
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const mappedCount = workflow.columnMappings.length;

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-3rem)] flex-col animate-fade-in">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/upload?schemaId=${currentSchemaId}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Mapping Builder</h1>
              <p className="text-muted-foreground">
                Connect raw columns (left) to target fields (right) by clicking handles. {mappedCount} mapping{mappedCount !== 1 ? "s" : ""} active — only mapped fields will be transformed.
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
            <Button onClick={onContinue} disabled={mappedCount === 0}>
              Continue to Preview
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {autoMapping && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary flex items-center gap-2 mb-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI is analysing column names and matching them to the target schema…
          </div>
        )}

        <div className="flex flex-1 min-h-0 gap-3">
          <div className="flex-1 min-h-0 rounded-lg border bg-muted/20">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgesDelete={onEdgesDeleted}
              connectOnClick
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.2 }}
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>

          <div className="w-80 shrink-0 overflow-y-auto">
            <PivotConfigPanel
              rawColumns={rawColumns}
              columnMappings={workflow.columnMappings}
              pivotConfig={pivotConfig}
              onPivotConfigChange={setPivotConfig}
              onColumnMappingsChange={setColumnMappings}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
