"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import type { SchemaTransformationStep } from "@/lib/types";
import { getToolDefinition, type ToolParamDefinition } from "./tool-definitions";

interface TransformationParamsEditorProps {
  step: SchemaTransformationStep | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (params: Record<string, unknown>, reasoning?: string) => void;
}

export function TransformationParamsEditor({
  step,
  open,
  onOpenChange,
  onSave,
}: TransformationParamsEditorProps) {
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [reasoning, setReasoning] = useState("");

  const toolDef = step ? getToolDefinition(step.tool) : null;

  useEffect(() => {
    if (step) {
      setParams({ ...step.params });
      setReasoning(step.reasoning ?? "");
    } else {
      setParams({});
      setReasoning("");
    }
  }, [step]);

  const handleSave = () => {
    onSave(params, reasoning || undefined);
  };

  if (!step || !toolDef) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit {toolDef.name}</DialogTitle>
          <DialogDescription>{toolDef.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {toolDef.params.map((param) => (
            <ParamField
              key={param.name}
              param={param}
              value={params[param.name]}
              onChange={(value) => setParams({ ...params, [param.name]: value })}
            />
          ))}

          <div className="space-y-2">
            <Label htmlFor="reasoning">Reasoning (optional)</Label>
            <Textarea
              id="reasoning"
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="Describe why this step is needed..."
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              This helps document the purpose of this transformation step.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ParamFieldProps {
  param: ToolParamDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ParamField({ param, value, onChange }: ParamFieldProps) {
  switch (param.type) {
    case "boolean":
      return (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor={param.name}>{param.label}</Label>
            <p className="text-xs text-muted-foreground">{param.description}</p>
          </div>
          <Switch
            id={param.name}
            checked={value as boolean ?? param.default as boolean ?? false}
            onCheckedChange={onChange}
          />
        </div>
      );

    case "string":
      return (
        <div className="space-y-2">
          <Label htmlFor={param.name}>
            {param.label}
            {param.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Input
            id={param.name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={param.placeholder}
          />
          <p className="text-xs text-muted-foreground">{param.description}</p>
        </div>
      );

    case "number":
      return (
        <div className="space-y-2">
          <Label htmlFor={param.name}>
            {param.label}
            {param.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Input
            id={param.name}
            type="number"
            value={(value as number) ?? param.default ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            placeholder={param.placeholder}
          />
          <p className="text-xs text-muted-foreground">{param.description}</p>
        </div>
      );

    case "select":
      return (
        <div className="space-y-2">
          <Label htmlFor={param.name}>
            {param.label}
            {param.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Select
            value={(value as string) ?? (param.default as string) ?? ""}
            onValueChange={onChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {param.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{param.description}</p>
        </div>
      );

    case "string[]":
      return (
        <StringArrayField
          param={param}
          value={value as string[] ?? []}
          onChange={onChange}
        />
      );

    case "object[]":
      return (
        <ObjectArrayField
          param={param}
          value={value as Record<string, unknown>[] ?? []}
          onChange={onChange}
        />
      );

    default:
      return null;
  }
}

interface StringArrayFieldProps {
  param: ToolParamDefinition;
  value: string[];
  onChange: (value: string[]) => void;
}

function StringArrayField({ param, value, onChange }: StringArrayFieldProps) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    if (inputValue.trim()) {
      onChange([...value, inputValue.trim()]);
      setInputValue("");
    }
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      <Label>
        {param.label}
        {param.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={param.placeholder || "Type and press Enter to add..."}
        />
        <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((item, index) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {item}
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{param.description}</p>
    </div>
  );
}

interface ObjectArrayFieldProps {
  param: ToolParamDefinition;
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
}

function ObjectArrayField({ param, value, onChange }: ObjectArrayFieldProps) {
  const [jsonInput, setJsonInput] = useState(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[]";
    }
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setJsonInput(JSON.stringify(value, null, 2));
    } catch {
      // Keep current input
    }
  }, [value]);

  const handleJsonChange = (text: string) => {
    setJsonInput(text);
    setError(null);
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setError("Value must be an array");
        return;
      }
      onChange(parsed);
    } catch (err) {
      setError("Invalid JSON");
    }
  };

  return (
    <div className="space-y-2">
      <Label>
        {param.label}
        {param.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Textarea
        value={jsonInput}
        onChange={(e) => handleJsonChange(e.target.value)}
        className="font-mono text-xs"
        rows={6}
        placeholder='[{"key": "value"}]'
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{param.description}</p>
    </div>
  );
}
