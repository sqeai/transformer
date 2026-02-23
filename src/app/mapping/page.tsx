"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ReactFlow, Position, addEdge, Background, Controls, MiniMap, useNodesState, useEdgesState, type Connection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { useSchemaStore } from "@/lib/schema-store";
import { flattenFields } from "@/lib/schema-store";
import type { ColumnMapping } from "@/lib/types";
import { ArrowRight, Sparkles, Loader2 } from "lucide-react";

const NODE_WIDTH = 220;
const NODE_GAP = 48;
const LEFT_X = 20;
const RIGHT_X = LEFT_X + NODE_WIDTH + 160;

export default function MappingPage() {
  const router = useRouter();
  const { workflow, getSchema, setColumnMappings } = useSchemaStore();
  const { currentSchemaId, rawColumns, rawRows } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;
  const targetPaths = useMemo(
    () => (schema ? flattenFields(schema.fields).filter((f) => !f.children?.length).map((f) => f.path) : []),
    [schema],
  );

  const [autoMapping, setAutoMapping] = useState(false);
  const autoMapDone = useRef(false);

  const rawNodes: Node[] = useMemo(
    () =>
      rawColumns.map((col, i) => ({
        id: `raw_${i}`,
        type: "default",
        position: { x: LEFT_X, y: 20 + i * NODE_GAP },
        data: { label: col },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })),
    [rawColumns],
  );

  const targetNodes: Node[] = useMemo(
    () =>
      targetPaths.map((path, i) => ({
        id: `target_${path}`,
        type: "default",
        position: { x: RIGHT_X, y: 20 + i * NODE_GAP },
        data: { label: path },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        draggable: true,
      })),
    [targetPaths],
  );

  const initialNodes = useMemo(
    () => [...rawNodes, ...targetNodes],
    [rawNodes, targetNodes],
  );

  const edgesFromMappings = useMemo(() => {
    return workflow.columnMappings
      .map((m, i) => ({
        id: `e_${i}_${m.rawColumn}_${m.targetPath}`,
        source: `raw_${rawColumns.indexOf(m.rawColumn)}`,
        target: `target_${m.targetPath}`,
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
      }))
      .filter(
        (e) =>
          rawColumns[Number(e.source.replace("raw_", ""))] !== undefined,
      );
  }, [workflow.columnMappings, rawColumns]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(edgesFromMappings);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 } }, eds));
      const rawIdx = params.source?.replace("raw_", "");
      const targetPath = params.target?.replace("target_", "");
      if (rawIdx != null && targetPath != null) {
        const col = rawColumns[Number(rawIdx)];
        if (col) {
          setColumnMappings([
            ...workflow.columnMappings.filter((m) => m.targetPath !== targetPath),
            { rawColumn: col, targetPath },
          ]);
        }
      }
    },
    [rawColumns, workflow.columnMappings, setColumnMappings, setEdges],
  );

  const syncMappingsFromEdges = useCallback(() => {
    const mappings: ColumnMapping[] = edges
      .map((e) => {
        const rawIdx = e.source?.replace("raw_", "");
        const targetPath = e.target?.replace("target_", "");
        if (rawIdx == null || targetPath == null) return null;
        const col = rawColumns[Number(rawIdx)];
        return col ? { rawColumn: col, targetPath } : null;
      })
      .filter((m): m is ColumnMapping => m != null);
    setColumnMappings(mappings);
  }, [edges, rawColumns, setColumnMappings]);

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
      const { mappings } = (await res.json()) as { mappings: ColumnMapping[] };
      if (mappings.length > 0) {
        setColumnMappings(mappings);
        const newEdges: Edge[] = mappings.map((m, i) => ({
          id: `auto_${i}_${m.rawColumn}_${m.targetPath}`,
          source: `raw_${rawColumns.indexOf(m.rawColumn)}`,
          target: `target_${m.targetPath}`,
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
        }));
        setEdges(newEdges);
      }
    } catch {
      // auto-map failed silently — user can still map manually
    } finally {
      setAutoMapping(false);
    }
  }, [rawColumns, targetPaths, setColumnMappings, setEdges]);

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
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mapping Builder</h1>
            <p className="text-muted-foreground">
              Connect raw columns (left) to target fields (right) by clicking handles. {mappedCount} mapping{mappedCount !== 1 ? "s" : ""} active — only mapped fields will be transformed.
            </p>
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

        <div className="flex-1 min-h-0 rounded-lg border bg-muted/20">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            connectOnClick
            fitView
            fitViewOptions={{ padding: 0.2 }}
            onEdgesDelete={() => {
              setTimeout(syncMappingsFromEdges, 0);
            }}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>
    </DashboardLayout>
  );
}
