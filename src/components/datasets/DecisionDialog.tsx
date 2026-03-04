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
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decisionType: "approved" | "rejected" | null;
  onDecisionTypeChange: (type: "approved" | "rejected") => void;
  comment: string;
  onCommentChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function DecisionDialog({
  open,
  onOpenChange,
  decisionType,
  onDecisionTypeChange,
  comment,
  onCommentChange,
  onSubmit,
  submitting,
}: DecisionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Approval</DialogTitle>
          <DialogDescription>
            Review this dataset and submit your decision. You can leave a
            comment for the dataset owner.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Decision</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors",
                  decisionType === "approved"
                    ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 dark:border-green-600"
                    : "border-border hover:border-green-300 hover:bg-green-50/50 dark:hover:bg-green-950/30",
                )}
                onClick={() => onDecisionTypeChange("approved")}
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors",
                  decisionType === "rejected"
                    ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 dark:border-red-600"
                    : "border-border hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-950/30",
                )}
                onClick={() => onDecisionTypeChange("rejected")}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Comment{" "}
              {decisionType === "rejected" ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              )}
            </label>
            <Textarea
              placeholder={
                decisionType === "rejected"
                  ? "Explain why you are rejecting this dataset..."
                  : "Add a comment..."
              }
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              submitting ||
              !decisionType ||
              (decisionType === "rejected" && !comment.trim())
            }
            className={
              decisionType === "approved"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : ""
            }
            variant={decisionType === "rejected" ? "destructive" : "default"}
          >
            {submitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {decisionType === "approved"
              ? "Approve"
              : decisionType === "rejected"
                ? "Reject"
                : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
