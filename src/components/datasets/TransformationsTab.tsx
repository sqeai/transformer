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
}

export function TransformationsTab({
  allTransformations,
}: TransformationsTabProps) {
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const currentSheetTransformations =
    allTransformations[activeSheetIdx] ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transformations</CardTitle>
        <CardDescription>
          The AI agent&apos;s thought process and transformations applied to
          create this dataset.
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
          <TransformationStepList iterations={currentSheetTransformations} />
        )}
      </CardContent>
    </Card>
  );
}
