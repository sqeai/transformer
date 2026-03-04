"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
} from "lucide-react";
import type { SheetJobResult } from "@/lib/schema-store";

interface ExportStepProps {
  exportableResults: SheetJobResult[];
  exportTargetDatasetId: string;
  onExportTargetChange: (value: string) => void;
  newDatasetName: string;
  onNewDatasetNameChange: (value: string) => void;
  existingDatasets: Array<{ id: string; name: string }>;
  exporting: boolean;
  downloadingExcel: boolean;
  onExport: () => void;
  onDownloadExcel: () => void;
  onBack: () => void;
}

export function ExportStep({
  exportableResults,
  exportTargetDatasetId,
  onExportTargetChange,
  newDatasetName,
  onNewDatasetNameChange,
  existingDatasets,
  exporting,
  downloadingExcel,
  onExport,
  onDownloadExcel,
  onBack,
}: ExportStepProps) {
  const exportableCount = exportableResults.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Export Dataset</CardTitle>
            <CardDescription className="mt-1.5">
              Choose where to save {exportableCount} processed sheet
              {exportableCount !== 1 ? "s" : ""}.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              variant="outline"
              onClick={onDownloadExcel}
              disabled={downloadingExcel || exportableCount === 0}
            >
              {downloadingExcel ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download Excel
            </Button>
            <Button onClick={onExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {exportTargetDatasetId === "__new"
                ? "Create Dataset"
                : "Add to Dataset"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Destination</label>
          <Select
            value={exportTargetDatasetId}
            onValueChange={onExportTargetChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select destination..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__new">Create new dataset</SelectItem>
              {existingDatasets.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {exportTargetDatasetId === "__new" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Dataset Name</label>
            <Input
              value={newDatasetName}
              onChange={(e) => onNewDatasetNameChange(e.target.value)}
              placeholder={`Dataset ${new Date().toLocaleDateString()}`}
            />
          </div>
        )}

        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm font-medium">Summary</p>
          {exportableResults.map((r) => (
            <div
              key={`${r.sheet.fileId}:${r.sheet.sheetIndex}`}
              className="flex items-center gap-2 text-sm"
            >
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <span className="truncate">
                {r.sheet.fileName} / {r.sheet.sheetName}
              </span>
              <span className="text-muted-foreground ml-auto shrink-0">
                {r.result?.transformedRows?.length ?? 0} rows
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
