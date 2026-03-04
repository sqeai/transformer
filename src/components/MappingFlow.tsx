"use client";

import { useEffect, useMemo } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getTransformationDescription } from "@/lib/transformation-descriptions";
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

  const desc = getTransformationDescription(data.nodeType);

  return (
    <div className={cn("rounded-lg border-2 max-w-[260px] max-h-[260px] flex flex-col shadow-sm", colorClass)}>
      <Handle type="target" position={Position.Left} className="!bg-border !w-3 !h-3" />
      <div className="px-4 pt-3 pb-1 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold truncate">{data.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{desc.description}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      {paramEntries.length > 0 && (
        <div className="px-4 pb-3 overflow-y-auto flex-1 space-y-1 text-xs text-muted-foreground">
          {paramEntries.map(([key, value]) => {
            const formatValue = (v: unknown): string => {
              if (v == null) return "null";
              if (Array.isArray(v)) return `[${v.map(formatValue).join(", ")}]`;
              if (typeof v === "object") return JSON.stringify(v);
              return String(v);
            };
            return (
              <div key={key} className="flex gap-1">
                <span className="font-medium shrink-0">{key}:</span>
                <span className="break-all">{formatValue(value)}</span>
              </div>
            );
          })}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-border !w-3 !h-3" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
};

interface MappingFlowProps {
  pipeline?: PipelineDescriptor;
  pipelines?: PipelineDescriptor[];
  className?: string;
}

export default function MappingFlow({ pipeline, pipelines, className }: MappingFlowProps) {
  const flowPipelines = useMemo(
    () => (pipelines && pipelines.length > 0 ? pipelines : pipeline ? [pipeline] : []),
    [pipeline, pipelines],
  );

  const initialNodes: Node[] = useMemo(
    () => {
      const nodes: Node[] = [];
      flowPipelines.forEach((singlePipeline, pipelineIdx) => {
        const yOffset = pipelineIdx * 320;
        singlePipeline.nodes.forEach((node, nodeIdx) => {
          nodes.push({
            id: `pipeline-${pipelineIdx}-${node.id}`,
            type: "pipeline",
            position: { x: nodeIdx * 320, y: yOffset + 100 },
            data: {
              label: node.label,
              nodeType: node.type,
              params: node.data,
            },
            draggable: false,
          });
        });
      });
      return nodes;
    },
    [flowPipelines],
  );

  const initialEdges: Edge[] = useMemo(
    () => {
      const edges: Edge[] = [];
      flowPipelines.forEach((singlePipeline, pipelineIdx) => {
        singlePipeline.edges.forEach((edge) => {
          edges.push({
            id: `pipeline-${pipelineIdx}-${edge.id}`,
            source: `pipeline-${pipelineIdx}-${edge.source}`,
            target: `pipeline-${pipelineIdx}-${edge.target}`,
            animated: true,
            style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
          });
        });

        if (pipelineIdx < flowPipelines.length - 1) {
          const lastNode = singlePipeline.nodes[singlePipeline.nodes.length - 1];
          const nextFirstNode = flowPipelines[pipelineIdx + 1].nodes[0];
          if (lastNode && nextFirstNode) {
            edges.push({
              id: `chain-${pipelineIdx}-to-${pipelineIdx + 1}`,
              source: `pipeline-${pipelineIdx}-${lastNode.id}`,
              target: `pipeline-${pipelineIdx + 1}-${nextFirstNode.id}`,
              animated: true,
              style: {
                stroke: "hsl(var(--muted-foreground))",
                strokeWidth: 2,
                strokeDasharray: "6 3",
              },
              label: `Iter ${pipelineIdx + 1} → ${pipelineIdx + 2}`,
            });
          }
        }
      });
      return edges;
    },
    [flowPipelines],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setEdges, setNodes]);

  return (
    <div className={cn("h-[700px] w-full rounded-lg border bg-background", className)}>
      {flowPipelines.length > 1 && (
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">
          Showing {flowPipelines.length} iterations in sequence.
        </div>
      )}
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
