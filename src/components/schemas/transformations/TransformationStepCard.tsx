"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Pencil, Trash2, AlertCircle } from "lucide-react";
import type { SchemaTransformationStep } from "@/lib/types";
import { getToolDefinition } from "./tool-definitions";

interface TransformationStepCardProps {
  step: SchemaTransformationStep;
  index: number;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}

export function TransformationStepCard({
  step,
  index,
  isLast,
  onEdit,
  onDelete,
  readOnly = false,
}: TransformationStepCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const toolDef = getToolDefinition(step.tool);
  const isMapStep = step.tool === "map";
  const hasError = isMapStep && !isLast;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "z-50" : ""} ${hasError ? "border-destructive" : ""}`}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing touch-none p-1 rounded hover:bg-muted"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                #{index + 1}
              </span>
              <CardTitle className="text-sm">{toolDef?.name ?? step.tool}</CardTitle>
              <Badge
                variant={step.phase === "cleansing" ? "secondary" : "outline"}
                className="text-[10px]"
              >
                {step.phase}
              </Badge>
              {hasError && (
                <Badge variant="destructive" className="text-[10px]">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Must be last
                </Badge>
              )}
            </div>
            {toolDef && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {toolDef.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {step.reasoning && (
        <CardContent className="pt-0 pb-3 px-4">
          <p className="text-xs text-muted-foreground italic">
            {step.reasoning}
          </p>
        </CardContent>
      )}
      {Object.keys(step.params).length > 0 && (
        <CardContent className="pt-0 pb-3 px-4">
          <div className="text-xs text-muted-foreground font-mono bg-muted/50 rounded p-2 max-h-24 overflow-auto">
            {formatParams(step.params)}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function formatParams(params: Record<string, unknown>): string {
  const simplified: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;
    simplified[key] = value;
  }
  if (Object.keys(simplified).length === 0) return "(no parameters)";
  return JSON.stringify(simplified, null, 2);
}
