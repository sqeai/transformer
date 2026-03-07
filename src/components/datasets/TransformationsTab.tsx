"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TransformationStepList } from "@/components/TransformationStepList";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import type { TransformationMappingEntry } from "@/lib/schema-store";
import {
  TRANSFORMATION_DESCRIPTIONS,
  PHASE_DESCRIPTIONS,
} from "@/lib/transformation-descriptions";

interface TransformationsTabProps {
  allTransformations: TransformationMappingEntry[][][];
  datasetTransformations?: TransformationMappingEntry[][];
}

export function TransformationsTab({
  allTransformations,
  datasetTransformations = [],
}: TransformationsTabProps) {
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const currentFileTransformations =
    allTransformations[activeFileIdx] ?? [];

  const hasFileTransformations = allTransformations.some((fileIterations) =>
    fileIterations.some((iteration) => iteration.length > 0),
  );
  const hasDatasetTransformations = datasetTransformations.some(
    (iteration) => iteration.length > 0,
  );

  const availableTransformationsTooltip = (
    <div className="space-y-2">
      {Object.entries(PHASE_DESCRIPTIONS).map(([key, phase]) => (
        <div key={key}>
          <p className="font-medium text-xs">{phase.label}</p>
          <p className="text-xs text-muted-foreground">{phase.description}</p>
        </div>
      ))}
      <hr className="border-border" />
      <p className="font-medium text-xs">Available transformations:</p>
      <ul className="space-y-1">
        {Object.entries(TRANSFORMATION_DESCRIPTIONS).map(([key, t]) => (
          <li key={key} className="text-xs">
            <span className="font-medium">{t.label}</span>
            <span className="text-muted-foreground"> — {t.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="space-y-6">
      {hasDatasetTransformations && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Dataset-Level Transformations</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm max-h-80 overflow-y-auto">
                  {availableTransformationsTooltip}
                </TooltipContent>
              </Tooltip>
            </div>
            <CardDescription>
              Transformations applied to the dataset after initial creation
              via the Starlight.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransformationStepList iterations={datasetTransformations} />
          </CardContent>
        </Card>
      )}

      {hasFileTransformations && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>File-Level Transformations</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm max-h-80 overflow-y-auto">
                  {availableTransformationsTooltip}
                </TooltipContent>
              </Tooltip>
            </div>
            <CardDescription>
              The AI agent&apos;s thought process and transformations applied
              to each source file during dataset creation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {allTransformations.length > 1 && (
              <div className="flex flex-wrap gap-2 border-b pb-3">
                {allTransformations.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-md border transition-colors",
                      activeFileIdx === idx
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => setActiveFileIdx(idx)}
                  >
                    File {idx + 1}
                  </button>
                ))}
              </div>
            )}

            {currentFileTransformations.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No transformation data available for this file.
              </p>
            ) : (
              <TransformationStepList
                iterations={currentFileTransformations}
              />
            )}
          </CardContent>
        </Card>
      )}

      {!hasFileTransformations && !hasDatasetTransformations && (
        <Card>
          <CardHeader>
            <CardTitle>Transformations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center py-4">
              No transformation data available.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
