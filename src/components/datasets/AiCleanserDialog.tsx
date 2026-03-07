"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";

interface AiCleanserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  onRun: () => void;
  running: boolean;
  disabled: boolean;
}

export function AiCleanserDialog({
  open,
  onOpenChange,
  instructions,
  onInstructionsChange,
  onRun,
  running,
  disabled,
}: AiCleanserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Starlight
          </DialogTitle>
          <DialogDescription>
            Transform this dataset using the same AI agent. Output columns stay
            locked to the current schema.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Instructions{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </label>
          <Textarea
            rows={4}
            value={instructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            placeholder="Example: Normalize customer names and trim whitespace; remove obvious summary rows."
            disabled={running}
          />
          <p className="text-xs text-muted-foreground">
            This replaces current dataset rows with AI-cleansed rows while
            preserving this dataset&apos;s schema.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            Cancel
          </Button>
          <Button onClick={onRun} disabled={running || disabled}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {running ? "Running..." : "Run Cleanser"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
