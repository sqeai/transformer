"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Dimension {
  column: string;
  type: string;
  uniqueValues?: string[];
  sampleValues?: string[];
  nullPercentage?: number;
}

interface DimensionsCardProps {
  dataSourceId: string;
  schemaName: string;
  tableName: string;
}

export function DimensionsCard({
  dataSourceId,
  schemaName,
  tableName,
}: DimensionsCardProps) {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchDimensions = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/data-sources/${dataSourceId}/tables/${schemaName}/${tableName}/dimensions`,
      );
      if (res.ok) {
        const data = await res.json();
        setDimensions(data.dimensions ?? []);
        setLastRefreshed(data.lastRefreshedAt ?? null);
        setLoaded(true);
      }
    } catch {
      /* ignore */
    }
  }, [dataSourceId, schemaName, tableName]);

  const refreshDimensions = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/data-sources/${dataSourceId}/tables/${schemaName}/${tableName}/dimensions`,
        { method: "POST" },
      );
      if (res.ok) {
        toast.success("Dimensions refreshed");
        await fetchDimensions();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to refresh dimensions");
      }
    } catch {
      toast.error("Failed to refresh dimensions");
    } finally {
      setLoading(false);
    }
  };

  if (!loaded) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Dimensions</CardTitle>
            <Button size="sm" variant="outline" onClick={fetchDimensions}>
              Load
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            Dimensions
            {lastRefreshed && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Last refreshed: {new Date(lastRefreshed).toLocaleString()}
              </span>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshDimensions}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {dimensions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No dimensions data. Click Refresh to scan the table.
          </p>
        ) : (
          <div className="space-y-2">
            {dimensions.map((dim) => (
              <div
                key={dim.column}
                className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{dim.column}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">
                      {dim.type}
                    </Badge>
                    {dim.nullPercentage !== undefined && dim.nullPercentage > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {dim.nullPercentage.toFixed(1)}% null
                      </Badge>
                    )}
                  </div>
                  {dim.sampleValues && dim.sampleValues.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      e.g. {dim.sampleValues.slice(0, 3).join(", ")}
                    </p>
                  )}
                </div>
                {dim.uniqueValues && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {dim.uniqueValues.length} unique
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
