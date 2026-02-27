"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PipelineDescriptor } from "@/lib/schema-store";
import { cn } from "@/lib/utils";
import {
  Database,
  Filter,
  Columns3,
  GitBranch,
  Layers,
  ArrowRightLeft,
  Target,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  source: Database,
  filter: Filter,
  unpivot: Columns3,
  expand: GitBranch,
  aggregate: Layers,
  map: ArrowRightLeft,
  target: Target,
};

const COLOR_MAP: Record<string, string> = {
  source: "border-blue-500/50 bg-blue-500/10",
  filter: "border-orange-500/50 bg-orange-500/10",
  unpivot: "border-purple-500/50 bg-purple-500/10",
  expand: "border-green-500/50 bg-green-500/10",
  aggregate: "border-yellow-500/50 bg-yellow-500/10",
  map: "border-cyan-500/50 bg-cyan-500/10",
  target: "border-emerald-500/50 bg-emerald-500/10",
};

function PipelineNode({ data }: { data: { label: string; nodeType: string; params: Record<string, unknown> } }) {
  const Icon = ICON_MAP[data.nodeType] ?? Database;
  const colorClass = COLOR_MAP[data.nodeType] ?? "border-border bg-muted/30";

  const paramEntries = Object.entries(data.params ?? {}).filter(
    ([key]) => !["resultRowCount", "removedCount", "groupCount"].includes(key),
  );

  return (
    <div className={cn("rounded-lg border-2 px-4 py-3 min-w-[180px] max-w-[280px] shadow-sm", colorClass)}>
      <Handle type="target" position={Position.Top} className="!bg-border !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold">{data.label}</span>
      </div>
      {paramEntries.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {paramEntries.slice(0, 4).map(([key, value]) => (
            <div key={key} className="flex gap-1">
              <span className="font-medium shrink-0">{key}:</span>
              <span className="truncate">
                {Array.isArray(value)
                  ? value.length > 3
                    ? `[${value.slice(0, 3).join(", ")}... +${value.length - 3}]`
                    : `[${value.join(", ")}]`
                  : typeof value === "object"
                    ? JSON.stringify(value).slice(0, 50)
                    : String(value)}
              </span>
            </div>
          ))}
          {paramEntries.length > 4 && (
            <div className="text-muted-foreground/60">+{paramEntries.length - 4} more</div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-border !w-3 !h-3" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
};

interface MappingFlowProps {
  pipeline: PipelineDescriptor;
  className?: string;
}

export default function MappingFlow({ pipeline, className }: MappingFlowProps) {
  const initialNodes: Node[] = useMemo(
    () =>
      pipeline.nodes.map((node, i) => ({
        id: node.id,
        type: "pipeline",
        position: { x: 200, y: i * 160 },
        data: {
          label: node.label,
          nodeType: node.type,
          params: node.data,
        },
        draggable: true,
      })),
    [pipeline.nodes],
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      pipeline.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
      })),
    [pipeline.edges],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className={cn("h-[700px] w-full rounded-lg border bg-background", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
