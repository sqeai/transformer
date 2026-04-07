"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { TRANSFORMATION_TOOLS, getToolsByPhase, type ToolDefinition } from "./tool-definitions";

interface TransformationToolPaletteProps {
  onAddTool: (toolId: string) => void;
  disabled?: boolean;
}

export function TransformationToolPalette({
  onAddTool,
  disabled = false,
}: TransformationToolPaletteProps) {
  const cleansingTools = getToolsByPhase("cleansing");
  const transformationTools = getToolsByPhase("transformation");

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-2">Cleansing Tools</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Prepare and clean data without losing information
        </p>
        <div className="space-y-2">
          {cleansingTools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onAdd={() => onAddTool(tool.id)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Transformation Tools</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Restructure and map data to the target schema
        </p>
        <div className="space-y-2">
          {transformationTools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onAdd={() => onAddTool(tool.id)}
              disabled={disabled}
              isMapTool={tool.id === "map"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ToolCardProps {
  tool: ToolDefinition;
  onAdd: () => void;
  disabled?: boolean;
  isMapTool?: boolean;
}

function ToolCard({ tool, onAdd, disabled = false, isMapTool = false }: ToolCardProps) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{tool.name}</span>
              {isMapTool && (
                <Badge variant="outline" className="text-[10px]">
                  Must be last
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {tool.description}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={onAdd}
            disabled={disabled}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
