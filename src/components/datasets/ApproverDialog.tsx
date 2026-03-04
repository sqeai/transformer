"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/lib/types";

interface ApproverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allUsers: AppUser[];
  selectedApproverIds: string[];
  onToggleApprover: (userId: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  onCancel: () => void;
}

export function ApproverDialog({
  open,
  onOpenChange,
  allUsers,
  selectedApproverIds,
  onToggleApprover,
  onSubmit,
  submitting,
  onCancel,
}: ApproverDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for Approval</DialogTitle>
          <DialogDescription>
            Select the users who need to approve this dataset. Once confirmed,
            the dataset will be submitted for their review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {allUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No other users found.
            </p>
          ) : (
            allUsers.map((u) => {
              const selected = selectedApproverIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-3 w-full p-3 rounded-lg border transition-colors text-left",
                    selected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50",
                  )}
                  onClick={() => onToggleApprover(u.id)}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {(u.name || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.email}
                    </p>
                  </div>
                  {selected && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={selectedApproverIds.length === 0 || submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Submit{" "}
            {selectedApproverIds.length > 0
              ? `(${selectedApproverIds.length} approver${selectedApproverIds.length !== 1 ? "s" : ""})`
              : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
