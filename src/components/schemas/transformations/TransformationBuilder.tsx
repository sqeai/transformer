"use client";

import { useState, useCallback } from "react";
import { randomUUID } from "crypto";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Save,
  Loader2,
  Workflow,
  AlertCircle,
} from "lucide-react";
import type { SchemaTransformation, SchemaTransformationStep } from "@/lib/types";
import { TransformationStepCard } from "./TransformationStepCard";
import { TransformationToolPalette } from "./TransformationToolPalette";
import { TransformationParamsEditor } from "./TransformationParamsEditor";
import { getToolDefinition } from "./tool-definitions";

interface TransformationBuilderProps {
  schemaId: string;
  transformation?: SchemaTransformation | null;
  onSave: (transformation: SchemaTransformation) => void;
  onClose: () => void;
}

function generateUUID(): string {
  // Simple UUID generation for client-side
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function TransformationBuilder({
  schemaId,
  transformation,
  onSave,
  onClose,
}: TransformationBuilderProps) {
  const isEditing = !!transformation;

  const [name, setName] = useState(transformation?.name ?? "New Pipeline");
  const [description, setDescription] = useState(transformation?.description ?? "");
  const [isDefault, setIsDefault] = useState(transformation?.isDefault ?? false);
  const [steps, setSteps] = useState<SchemaTransformationStep[]>(
    transformation?.steps ?? []
  );
  const [saving, setSaving] = useState(false);
  const [editingStep, setEditingStep] = useState<SchemaTransformationStep | null>(null);
  const [showParamsEditor, setShowParamsEditor] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    setSteps(arrayMove(steps, oldIndex, newIndex).map((s, i) => ({ ...s, order: i })));
  }, [steps]);

  const handleAddTool = useCallback((toolId: string) => {
    const toolDef = getToolDefinition(toolId);
    if (!toolDef) return;

    // Build default params from tool definition
    const defaultParams: Record<string, unknown> = {};
    for (const param of toolDef.params) {
      if (param.default !== undefined) {
        defaultParams[param.name] = param.default;
      }
    }

    const newStep: SchemaTransformationStep = {
      id: generateUUID(),
      order: steps.length,
      tool: toolId,
      params: defaultParams,
      phase: toolDef.phase,
    };

    // If adding a "map" step, it should be last
    if (toolId === "map") {
      setSteps([...steps, newStep]);
    } else {
      // Insert before any existing map step
      const mapIndex = steps.findIndex((s) => s.tool === "map");
      if (mapIndex !== -1) {
        const newSteps = [...steps];
        newSteps.splice(mapIndex, 0, newStep);
        setSteps(newSteps.map((s, i) => ({ ...s, order: i })));
      } else {
        setSteps([...steps, newStep]);
      }
    }

    // Open params editor for the new step
    setEditingStep(newStep);
    setShowParamsEditor(true);
  }, [steps]);

  const handleEditStep = useCallback((step: SchemaTransformationStep) => {
    setEditingStep(step);
    setShowParamsEditor(true);
  }, []);

  const handleDeleteStep = useCallback((stepId: string) => {
    setSteps(steps.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, order: i })));
  }, [steps]);

  const handleSaveParams = useCallback(
    (params: Record<string, unknown>, reasoning?: string) => {
      if (!editingStep) return;

      setSteps(
        steps.map((s) =>
          s.id === editingStep.id
            ? { ...s, params, reasoning }
            : s
        )
      );
      setShowParamsEditor(false);
      setEditingStep(null);
    },
    [editingStep, steps]
  );

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Please enter a pipeline name");
      return;
    }

    // Validate: map step must be last
    const mapIndex = steps.findIndex((s) => s.tool === "map");
    if (mapIndex !== -1 && mapIndex !== steps.length - 1) {
      alert("The 'Map to Schema' step must be the last step in the pipeline");
      return;
    }

    setSaving(true);
    try {
      const endpoint = isEditing
        ? `/api/schemas/${schemaId}/transformations/${transformation.id}`
        : `/api/schemas/${schemaId}/transformations`;

      const method = isEditing ? "PATCH" : "POST";

      const body = {
        name: name.trim(),
        description: description.trim() || null,
        isDefault,
        steps,
      };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      const data = await res.json();
      onSave(data.transformation);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save pipeline");
    } finally {
      setSaving(false);
    }
  };

  const hasValidationError = steps.some(
    (s, i) => s.tool === "map" && i !== steps.length - 1
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h3 className="text-lg font-semibold">
              {isEditing ? "Edit Pipeline" : "Create Pipeline"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure transformation steps for the cleansing agent
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving || hasValidationError}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Pipeline
        </Button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Configuration */}
        <div className="lg:col-span-2 space-y-4">
          {/* Basic Info */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Pipeline Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter pipeline name..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this pipeline does..."
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isDefault">Set as Default</Label>
                  <p className="text-xs text-muted-foreground">
                    The default pipeline is automatically used when cleansing files
                  </p>
                </div>
                <Switch
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Pipeline Steps</h4>
              <span className="text-xs text-muted-foreground">
                {steps.length} step{steps.length !== 1 ? "s" : ""}
              </span>
            </div>

            {hasValidationError && (
              <Card className="border-destructive mb-3">
                <CardContent className="py-3 flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">
                    The &quot;Map to Schema&quot; step must be the last step
                  </span>
                </CardContent>
              </Card>
            )}

            {steps.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Workflow className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No steps yet. Add tools from the palette on the right.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={steps.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {steps.map((step, index) => (
                      <TransformationStepCard
                        key={step.id}
                        step={step}
                        index={index}
                        isLast={index === steps.length - 1}
                        onEdit={() => handleEditStep(step)}
                        onDelete={() => handleDeleteStep(step.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* Tool Palette */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardContent className="pt-6">
              <h4 className="text-sm font-medium mb-4">Available Tools</h4>
              <TransformationToolPalette onAddTool={handleAddTool} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Params Editor Dialog */}
      <TransformationParamsEditor
        step={editingStep}
        open={showParamsEditor}
        onOpenChange={(open) => {
          setShowParamsEditor(open);
          if (!open) setEditingStep(null);
        }}
        onSave={handleSaveParams}
      />
    </div>
  );
}
