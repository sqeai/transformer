"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ReactFlow, addEdge, Background, Controls, MiniMap, useNodesState, useEdgesState, type Connection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { useSchemaStore } from "@/lib/schema-store";
import { flattenFields } from "@/lib/schema-store";
import type { ColumnMapping } from "@/lib/types";
import { ArrowRight } from "lucide-react";

const NODE_WIDTH = 180;
const NODE_GAP = 48;

export default function MappingPage() {
  const router = useRouter();
  const { workflow, getSchema, setColumnMappings } = useSchemaStore();
  const { currentSchemaId, rawColumns, rawRows } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;
  const targetPaths = useMemo(
    () => (schema ? flattenFields(schema.fields).map((f) => f.path) : []),
    [schema],
  );

  const rawNodes: Node[] = useMemo(
    () =>
      rawColumns.map((col, i) => ({
        id: `raw_${i}`,
        type: "default",
        position: { x: 20, y: 20 + i * NODE_GAP },
        data: { label: col },
        sourcePosition: "right" as const,
      })),
    [rawColumns],
  );

  const targetNodes: Node[] = useMemo(
    () =>
      targetPaths.map((path, i) => ({
        id: `target_${path}`,
        type: "default",
        position: { x: 20 + NODE_WIDTH + 120, y: 20 + i * NODE_GAP },
        data: { label: path },
        targetPosition: "left" as const,
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
      }))
      .filter(
        (e) =>
          rawColumns[Number(e.source.replace("raw_", ""))] !== undefined,
      );
  }, [workflow.columnMappings, rawColumns]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesFromMappings);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
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

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mapping Builder</h1>
            <p className="text-muted-foreground">
              Connect raw columns (left) to target fields (right). One target can have one source.
            </p>
          </div>
          <Button onClick={onContinue}>
            Continue to Preview
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="h-[600px] rounded-lg border bg-muted/20">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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
