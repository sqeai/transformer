"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileStack } from "lucide-react";
import type { DatasetSummary, DatasetState } from "@/lib/types";

interface DatasetsTabProps {
  schemaId: string;
}

const STATE_CONFIG: Record<DatasetState, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 border-gray-200" },
  pending_approval: { label: "Pending Approval", className: "bg-orange-100 text-orange-700 border-orange-200" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 border-green-200" },
};

export function DatasetsTab({ schemaId }: DatasetsTabProps) {
  const router = useRouter();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDatasets = useCallback(() => {
    setLoading(true);
    fetch(`/api/datasets?schemaId=${schemaId}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { datasets: [] }))
      .then((data) => setDatasets(data.datasets ?? []))
      .finally(() => setLoading(false));
  }, [schemaId]);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Datasets</h3>
        <p className="text-sm text-muted-foreground">
          All datasets created using this schema. {datasets.length} total.
        </p>
      </div>

      {datasets.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FileStack className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No datasets yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {datasets.map((ds) => {
            const config = STATE_CONFIG[ds.state] ?? STATE_CONFIG.draft;
            return (
              <Card
                key={ds.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/datasets/${ds.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-medium text-sm truncate">{ds.name}</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] whitespace-nowrap shrink-0 ${config.className}`}
                    >
                      {config.label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{ds.rowCount} row{ds.rowCount !== 1 ? "s" : ""}</span>
                    <span>{new Date(ds.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
