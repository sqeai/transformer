"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TransformationStepList } from "@/components/TransformationStepList";
import { cn } from "@/lib/utils";
import type { TransformationMappingEntry } from "@/lib/schema-store";

interface TransformationsTabProps {
  allTransformations: TransformationMappingEntry[][][];
  datasetTransformations?: TransformationMappingEntry[][];
}

export function TransformationsTab({
  allTransformations,
  datasetTransformations = [],
}: TransformationsTabProps) {
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const currentSheetTransformations =
    allTransformations[activeSheetIdx] ?? [];

  const hasSheetTransformations = allTransformations.some((sheetIterations) =>
    sheetIterations.some((iteration) => iteration.length > 0),
  );
  const hasDatasetTransformations = datasetTransformations.some(
    (iteration) => iteration.length > 0,
  );

  return (
    <div className="space-y-6">
      {hasDatasetTransformations && (
        <Card>
          <CardHeader>
            <CardTitle>Dataset-Level Transformations</CardTitle>
            <CardDescription>
              Transformations applied to the dataset after initial creation
              via the AI Data Cleanser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransformationStepList iterations={datasetTransformations} />
          </CardContent>
        </Card>
      )}

      {hasSheetTransformations && (
        <Card>
          <CardHeader>
            <CardTitle>Sheet-Level Transformations</CardTitle>
            <CardDescription>
              The AI agent&apos;s thought process and transformations applied
              to each source sheet during dataset creation.
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
                      activeSheetIdx === idx
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => setActiveSheetIdx(idx)}
                  >
                    Sheet {idx + 1}
                  </button>
                ))}
              </div>
            )}

            {currentSheetTransformations.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No transformation data available for this sheet.
              </p>
            ) : (
              <TransformationStepList
                iterations={currentSheetTransformations}
              />
            )}
          </CardContent>
        </Card>
      )}

      {!hasSheetTransformations && !hasDatasetTransformations && (
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
