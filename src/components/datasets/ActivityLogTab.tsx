"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckCircle2,
  Clock,
  History,
  Upload,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DatasetLog } from "@/lib/types";

const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

interface ActivityLogTabProps {
  logs: DatasetLog[] | undefined;
}

export function ActivityLogTab({ logs }: ActivityLogTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Activity Log
        </CardTitle>
        <CardDescription>
          Audit trail of all state changes and actions on this dataset.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!logs || logs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No activity recorded yet.
          </p>
        ) : (
          <div className="space-y-0">
            {logs.map((log, idx) => (
              <div key={log.id} className="flex gap-3 pb-4">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                      log.action === "state_change"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : log.action === "approval_approved"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : log.action === "approval_rejected"
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : log.action === "export"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                    )}
                  >
                    {log.action === "state_change" ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : log.action === "approval_approved" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : log.action === "approval_rejected" ? (
                      <XCircle className="h-3.5 w-3.5" />
                    ) : log.action === "export" ? (
                      <Upload className="h-3.5 w-3.5" />
                    ) : (
                      <History className="h-3.5 w-3.5" />
                    )}
                  </div>
                  {idx < logs.length - 1 && (
                    <div className="w-px flex-1 bg-border mt-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {log.userName || log.userEmail}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {log.action === "state_change" &&
                      log.fromState &&
                      log.toState
                        ? `changed state from ${STATE_LABELS[log.fromState] ?? log.fromState} to ${STATE_LABELS[log.toState] ?? log.toState}`
                        : log.action === "approval_approved"
                          ? "approved the dataset"
                          : log.action === "approval_rejected"
                            ? "rejected the dataset"
                            : log.action === "export"
                              ? "exported the dataset"
                              : log.action}
                    </span>
                  </div>
                  {log.comment && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {log.comment}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
