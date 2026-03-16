"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { FileJobResult } from "@/lib/schema-store";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getJobDuration(r: FileJobResult): string | null {
  if (!r.createdAt || !r.completedAt) return null;
  const start = new Date(r.createdAt).getTime();
  const end = new Date(r.completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return formatDuration(end - start);
}

interface ProcessingStepProps {
  jobResults: FileJobResult[];
  allJobsDone: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function ProcessingStep({
  jobResults,
  allJobsDone,
  onBack,
  onContinue,
}: ProcessingStepProps) {
  const totalDuration = useMemo(() => {
    if (!allJobsDone || jobResults.length === 0) return null;
    const createdTimes = jobResults
      .map((r) => r.createdAt ? new Date(r.createdAt).getTime() : NaN)
      .filter((t) => !Number.isNaN(t));
    const completedTimes = jobResults
      .map((r) => r.completedAt ? new Date(r.completedAt).getTime() : NaN)
      .filter((t) => !Number.isNaN(t));
    if (createdTimes.length === 0 || completedTimes.length === 0) return null;
    const earliest = Math.min(...createdTimes);
    const latest = Math.max(...completedTimes);
    return formatDuration(latest - earliest);
  }, [allJobsDone, jobResults]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Transformer is Processing
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Each file is being analyzed and transformed by the AI agent.
            {allJobsDone && totalDuration && (
              <span className="inline-flex items-center gap-1 ml-2">
                <Clock className="h-3.5 w-3.5" />
                Completed in {totalDuration}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={onContinue}
            disabled={!allJobsDone}
          >
            {!allJobsDone ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Continue to Review
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {jobResults.map((r, i) => {
              const duration = getJobDuration(r);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                >
                  {r.status === "pending" || r.status === "running" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                  ) : r.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.file.fileName} / {r.file.worksheetName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.status === "pending" && "Waiting..."}
                      {r.status === "running" && "Processing..."}
                      {r.status === "completed" &&
                        `Done - ${r.result?.transformedRows?.length ?? 0} rows`}
                      {r.status === "completed" && duration && (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {duration}
                        </span>
                      )}
                      {r.status === "failed" && (r.error ?? "Failed")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
