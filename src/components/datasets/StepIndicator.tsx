"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = "upload" | "processing" | "review" | "export";

export const STEPS: { key: Step; label: string; number: number }[] = [
  { key: "upload", label: "Upload Raw Data", number: 1 },
  { key: "processing", label: "Processing", number: 2 },
  { key: "review", label: "Review", number: 3 },
  { key: "export", label: "Export", number: 4 },
];

export function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
              i < currentIndex
                ? "bg-primary text-primary-foreground"
                : i === currentIndex
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < currentIndex ? <Check className="h-4 w-4" /> : step.number}
          </div>
          <span
            className={cn(
              "text-sm font-medium hidden sm:inline",
              i === currentIndex
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "h-px w-8",
                i < currentIndex ? "bg-primary" : "bg-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
