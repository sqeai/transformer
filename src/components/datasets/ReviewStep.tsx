"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { UnstructuredPreview } from "@/components/datasets/UnstructuredPreview";
import { TransformationStepList } from "@/components/TransformationStepList";
import { ArrowLeft, ArrowRight, Download, Loader2, Sparkles, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FileJobResult,
  PipelineDescriptor,
  TransformationMappingEntry,
  UploadedFileEntry,
} from "@/lib/schema-store";

const MappingFlow = dynamic<{
  pipeline?: PipelineDescriptor;
  pipelines?: PipelineDescriptor[];
  className?: string;
}>(() => import("@/components/MappingFlow"), { ssr: false });

const PREVIEW_ROWS = 100;

function buildPipelineFromSteps(
  steps: TransformationMappingEntry[],
): PipelineDescriptor {
  const sourceId = "pipeline-source";
  const targetId = "pipeline-target";

  const nodes: PipelineDescriptor["nodes"] = [
    { id: sourceId, type: "source", label: "Input", data: {} },
    ...steps.map((entry, idx) => ({
      id: `pipeline-step-${idx}`,
      type: "map" as const,
      label: `${entry.step}. ${entry.tool}`,
      data: {
        ...entry.params,
        phase: entry.phase,
        rowCountBefore: entry.rowCountBefore,
        rowCountAfter: entry.rowCountAfter,
      },
    })),
    { id: targetId, type: "target", label: "Output", data: {} },
  ];

  const edges: PipelineDescriptor["edges"] = [];
  const firstStepId =
    steps.length > 0
      ? "pipeline-step-0"
      : targetId;
  edges.push({
    id: "pipeline-edge-source",
    source: sourceId,
    target: firstStepId,
  });

  for (let idx = 0; idx < steps.length - 1; idx += 1) {
    edges.push({
      id: `pipeline-edge-${idx}`,
      source: `pipeline-step-${idx}`,
      target: `pipeline-step-${idx + 1}`,
    });
  }

  if (steps.length > 0) {
    edges.push({
      id: "pipeline-edge-target",
      source: `pipeline-step-${steps.length - 1}`,
      target: targetId,
    });
  }

  return { nodes, edges };
}

type ReviewSubTab = "original" | "modified" | "transformations" | "mapping";

interface ReviewStepProps {
  reviewableResults: FileJobResult[];
  exportableCount: number;
  anySheetProcessing: boolean;
  modifyPrompt: string;
  onModifyPromptChange: (value: string) => void;
  onModifyWithAI: (result: FileJobResult) => void;
  onStopModify: () => void;
  modifySubmittingSheetKey: string | null;
  originalPreview: {
    columns: string[];
    rows: Record<string, unknown>[];
    totalRows: number;
    visibleRows: number;
  } | null;
  originalPreviewLoading: boolean;
  onLoadOriginalPreview: (result: FileJobResult) => void;
  originalVisibleCount: number;
  onLoadMoreOriginal: () => void;
  files: UploadedFileEntry[];
  downloadingExcel: boolean;
  onDownloadOriginalExcel: (result: FileJobResult) => void;
  onDownloadModifiedExcel: (result: FileJobResult) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ReviewStep({
  reviewableResults,
  exportableCount,
  anySheetProcessing,
  modifyPrompt,
  onModifyPromptChange,
  onModifyWithAI,
  onStopModify,
  modifySubmittingSheetKey,
  originalPreview,
  originalPreviewLoading,
  onLoadOriginalPreview,
  originalVisibleCount,
  onLoadMoreOriginal,
  files,
  downloadingExcel,
  onDownloadOriginalExcel,
  onDownloadModifiedExcel,
  onBack,
  onNext,
}: ReviewStepProps) {
  const [reviewSheetIndex, setReviewSheetIndex] = useState(0);
  const [reviewSubTab, setReviewSubTab] = useState<ReviewSubTab>("modified");
  const [modifiedVisibleCount, setModifiedVisibleCount] = useState(PREVIEW_ROWS);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Transform Dataset</h2>
          <p className="text-sm text-muted-foreground">
            Review and refine the transformed data before exporting.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={anySheetProcessing}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={onNext}
            disabled={exportableCount === 0 || anySheetProcessing}
          >
            Next: Export {exportableCount} file
            {exportableCount !== 1 ? "s" : ""}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {reviewableResults.map((r, i) => {
          const key = `${r.file.fileId}:${r.file.worksheetIndex}`;
          return (
            <button
              key={key}
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm border transition-colors bg-background",
                reviewSheetIndex === i
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
              onClick={() => {
                setReviewSheetIndex(i);
                setReviewSubTab("modified");
                setModifiedVisibleCount(PREVIEW_ROWS);
              }}
            >
              {r.file.worksheetName}
            </button>
          );
        })}
      </div>

      {reviewableResults.length > 0 &&
        reviewableResults[reviewSheetIndex] &&
        (() => {
          const currentResult = reviewableResults[reviewSheetIndex];
          const transformedRows =
            currentResult.result?.transformedRows ?? [];
          const transformedCols =
            currentResult.result?.transformedColumns ?? [];
          const pipeline = currentResult.result?.pipeline;
          const mappingIterations =
            currentResult.result?.mappingIterations ??
            (currentResult.result?.mapping
              ? [currentResult.result.mapping]
              : []);
          const allSteps = mappingIterations.flat();
          const builtPipeline = allSteps.length > 0 ? buildPipelineFromSteps(allSteps) : null;
          const currentFileProcessing =
            currentResult.status === "pending" ||
            currentResult.status === "running";
          const currentFileKey = `${currentResult.file.fileId}:${currentResult.file.worksheetIndex}`;
          const currentFileSubmitting =
            modifySubmittingSheetKey === currentFileKey;
          const showModifyLoading =
            currentFileProcessing || currentFileSubmitting;

          return (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {currentResult.file.fileName} /{" "}
                      {currentResult.file.worksheetName}
                    </CardTitle>
                    <CardDescription>
                      {transformedRows.length} rows,{" "}
                      {transformedCols.length} columns
                    </CardDescription>
                  </div>
                  {(reviewSubTab === "original" || reviewSubTab === "modified") && transformedRows.length > 0 && !currentFileProcessing && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloadingExcel}
                      onClick={() =>
                        reviewSubTab === "original"
                          ? onDownloadOriginalExcel(currentResult)
                          : onDownloadModifiedExcel(currentResult)
                      }
                    >
                      {downloadingExcel ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-4 w-4" />
                      )}
                      {reviewSubTab === "original" ? "Download Original Excel" : "Download Modified Excel"}
                    </Button>
                  )}
                </div>

                <div className="flex gap-1 mt-3">
                  {(
                    [
                      "original",
                      "modified",
                      "transformations",
                      "mapping",
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md transition-colors",
                        reviewSubTab === tab
                          ? "bg-muted font-medium"
                          : "text-muted-foreground hover:bg-muted/50",
                      )}
                      onClick={() => {
                        setReviewSubTab(tab);
                        if (tab === "original" && !originalPreview) {
                          const file = files.find(
                            (f) => f.fileId === currentResult.file.fileId,
                          );
                          if (!file?.unstructuredType) {
                            onLoadOriginalPreview(currentResult);
                          }
                        }
                      }}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {reviewSubTab === "original" && (() => {
                  const originalFile = files.find(
                    (f) => f.fileId === currentResult.file.fileId,
                  );
                  return (
                    <div className="space-y-4">
                      {originalFile?.unstructuredType ? (
                        <UnstructuredPreview file={originalFile} />
                      ) : (
                        <DataTable
                          columns={originalPreview?.columns ?? []}
                          rows={
                            originalPreview?.rows.slice(0, originalVisibleCount) ??
                            []
                          }
                          totalRows={originalPreview?.totalRows}
                          loading={originalPreviewLoading}
                          loadingMessage="Loading original data..."
                          emptyMessage="No preview available."
                          onLoadMore={onLoadMoreOriginal}
                        />
                      )}
                    </div>
                  );
                })()}

                {reviewSubTab === "modified" && (
                  <div className="space-y-4">
                    <div className="flex items-end gap-2">
                      <Textarea
                        placeholder="Describe how to modify this data (e.g. 'Remove all rows where amount is 0', 'Combine first and last name columns')..."
                        value={modifyPrompt}
                        onChange={(e) =>
                          onModifyPromptChange(e.target.value)
                        }
                        className="flex-4"
                        rows={2}
                        disabled={showModifyLoading}
                      />
                      <div className="rounded-md bg-[linear-gradient(90deg,#f59e0b,#ef4444,#8b5cf6,#3b82f6,#10b981)] p-[1px]">
                        <Button
                          onClick={() => onModifyWithAI(currentResult)}
                          disabled={
                            !modifyPrompt.trim() ||
                            anySheetProcessing ||
                            currentFileSubmitting
                          }
                          variant="outline"
                          className="border-0 bg-background hover:bg-muted min-h-[80px] disabled:text-gray disabled:opacity-100"
                        >
                          {showModifyLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                          )}
                          Modify using AI
                        </Button>
                      </div>
                    </div>

                    {currentFileProcessing && (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          Transformer is re-processing this file...
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onStopModify}
                        >
                          <Square className="mr-1.5 h-3.5 w-3.5" />
                          Stop
                        </Button>
                      </div>
                    )}

                    <DataTable
                      columns={transformedCols}
                      rows={transformedRows.slice(0, modifiedVisibleCount)}
                      totalRows={transformedRows.length}
                      onLoadMore={() =>
                        setModifiedVisibleCount(
                          (prev) => prev + PREVIEW_ROWS,
                        )
                      }
                    />
                  </div>
                )}

                {reviewSubTab === "transformations" && (
                  <TransformationStepList iterations={mappingIterations} />
                )}

                {reviewSubTab === "mapping" &&
                  builtPipeline && (
                    <div className="overflow-auto">
                      <MappingFlow pipelines={[builtPipeline]} />
                    </div>
                  )}
                {reviewSubTab === "mapping" &&
                  !builtPipeline &&
                  pipeline && (
                    <div className="overflow-auto">
                      <MappingFlow pipeline={pipeline} />
                    </div>
                  )}
                {reviewSubTab === "mapping" &&
                  !builtPipeline &&
                  !pipeline && (
                    <p className="text-muted-foreground text-center py-4">
                      No pipeline data available.
                    </p>
                  )}
              </CardContent>
            </Card>
          );
        })()}
    </div>
  );
}
