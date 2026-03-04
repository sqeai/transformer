"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, LayoutTemplate, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHEMA_PRESETS, type SchemaPreset } from "@/lib/schema-presets";

interface PresetPanelProps {
  selectedPreset: SchemaPreset | null;
  onSelectPreset: (preset: SchemaPreset) => void;
  onCreateFromPreset: (preset: SchemaPreset) => void;
  creating: boolean;
}

export function PresetPanel({
  selectedPreset,
  onSelectPreset,
  onCreateFromPreset,
  creating,
}: PresetPanelProps) {
  return (
    <>
      <DialogHeader className="shrink-0 pb-4">
        <DialogTitle>Use Preset</DialogTitle>
        <DialogDescription>
          Select a predefined schema template to get started quickly.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-1 min-h-0 gap-4">
        <div className="w-[260px] shrink-0 space-y-2">
          {SCHEMA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(
                "w-full rounded-lg border p-4 text-left transition-colors",
                selectedPreset?.id === preset.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/50",
              )}
              onClick={() => onSelectPreset(preset)}
            >
              <p className="font-medium text-sm">{preset.name}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {preset.description}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {preset.fields.length} fields
              </p>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {selectedPreset ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold">
                    {selectedPreset.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedPreset.fields.length} fields
                  </p>
                </div>
                <Button
                  onClick={() => onCreateFromPreset(selectedPreset)}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Use This Preset
                </Button>
              </div>
              <div className="flex-1 min-h-0 rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Field Name</TableHead>
                      <TableHead className="w-[140px]">Data Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPreset.fields.map((field, i) => (
                      <TableRow key={field.name}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {field.name}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                            {field.dataType ?? "STRING"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <LayoutTemplate className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">
                  Select a preset to preview its fields
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
