"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GitMerge, Loader2 } from "lucide-react";

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowCount: number;
  targetTable: string;
  onMerge: () => void;
  merging: boolean;
}

export function MergeDialog({
  open,
  onOpenChange,
  rowCount,
  targetTable,
  onMerge,
  merging,
}: MergeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-blue-500" />
            Merge into data source?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              This will insert <strong className="text-foreground">{rowCount.toLocaleString()} rows</strong> into{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{targetTable}</code>.
            </span>
            <span className="block">
              The dataset will be marked as completed after a successful merge.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onMerge}
            disabled={merging}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {merging && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            <GitMerge className="h-4 w-4 mr-1.5" />
            Merge
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
