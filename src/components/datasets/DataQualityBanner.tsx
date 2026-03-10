"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveScanResult,
  getScanResult,
  removeScanResult,
} from "@/lib/data-quality-storage";
import type { DataQualityScanResult } from "@/lib/agents/data-quality-agent";

interface DataQualityBannerProps {
  datasetId: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export function DataQualityBanner({
  datasetId,
  columns,
  rows,
}: DataQualityBannerProps) {
  const [scanResult, setScanResult] = useState<DataQualityScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScanned, setAutoScanned] = useState(false);

  useEffect(() => {
    const cached = getScanResult(datasetId);
    if (cached) {
      setScanResult(cached);
    }
  }, [datasetId]);

  const runScan = useCallback(async () => {
    if (columns.length === 0 || rows.length === 0) return;
    setScanning(true);
    setError(null);
    setDismissed(false);

    try {
      const res = await fetch("/api/data-quality-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, columns, rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Scan failed");

      const result = data.scanResult as DataQualityScanResult;
      setScanResult(result);
      saveScanResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [datasetId, columns, rows]);

  useEffect(() => {
    if (autoScanned) return;
    if (columns.length === 0 || rows.length === 0) return;
    const cached = getScanResult(datasetId);
    if (cached) return;

    setAutoScanned(true);
    runScan();
  }, [datasetId, columns, rows, autoScanned, runScan]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleClear = useCallback(() => {
    removeScanResult(datasetId);
    setScanResult(null);
    setDismissed(false);
    setExpanded(false);
  }, [datasetId]);

  if (scanning) {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
        <AlertDescription className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
          <span>AI Data Quality Agent is scanning your dataset for issues...</span>
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50">
        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-red-700 dark:text-red-300">
            Data quality scan failed: {error}
          </span>
          <Button variant="ghost" size="sm" onClick={runScan}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!scanResult || dismissed) {
    if (!scanResult) return null;
    return (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setDismissed(false)}
        >
          Show data quality report
        </Button>
      </div>
    );
  }

  const { hasMissingData, hasAbnormalities, overallScore } = scanResult;
  const hasIssues = hasMissingData || hasAbnormalities;

  const columnsWithMissing = scanResult.missingDataSummary.filter(
    (col) => col.missingCount > 0,
  );
  const totalMissingCells = columnsWithMissing.reduce(
    (sum, col) => sum + col.missingCount,
    0,
  );

  if (!hasIssues) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50">
        <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-green-700 dark:text-green-300">
            Data quality scan complete — no issues found. Quality score: {overallScore}/100
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={runScan}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Re-scan
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDismiss}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const severityColor =
    overallScore >= 80
      ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/50"
      : overallScore >= 50
        ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/50"
        : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50";

  const textColor =
    overallScore >= 80
      ? "text-yellow-700 dark:text-yellow-300"
      : overallScore >= 50
        ? "text-orange-700 dark:text-orange-300"
        : "text-red-700 dark:text-red-300";

  const iconColor =
    overallScore >= 80
      ? "text-yellow-600 dark:text-yellow-400"
      : overallScore >= 50
        ? "text-orange-600 dark:text-orange-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Alert className={cn(severityColor)}>
      <AlertTriangle className={cn("h-4 w-4", iconColor)} />
      <AlertDescription className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={cn("font-medium", textColor)}>
            {hasMissingData && (
              <>
                Missing data detected: {totalMissingCells.toLocaleString()} missing value{totalMissingCells !== 1 ? "s" : ""} across{" "}
                {columnsWithMissing.length} column{columnsWithMissing.length !== 1 ? "s" : ""}
              </>
            )}
            {hasMissingData && hasAbnormalities && " · "}
            {hasAbnormalities && (
              <>
                {scanResult.abnormalities.length} abnormalit{scanResult.abnormalities.length !== 1 ? "ies" : "y"} found
              </>
            )}
            <span className="ml-2 text-xs font-normal opacity-75">
              (Score: {overallScore}/100)
            </span>
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="mr-1 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="mr-1 h-3.5 w-3.5" />
              )}
              {expanded ? "Less" : "Details"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={runScan}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Re-scan
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDismiss}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 space-y-4 text-sm">
            {columnsWithMissing.length > 0 && (
              <div>
                <h4 className={cn("font-semibold mb-2", textColor)}>
                  Missing Data
                </h4>
                <div className="rounded-md border bg-background/50 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-1.5 text-left font-medium">Column</th>
                        <th className="px-3 py-1.5 text-right font-medium">Missing</th>
                        <th className="px-3 py-1.5 text-right font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columnsWithMissing
                        .sort((a, b) => b.missingPercentage - a.missingPercentage)
                        .map((col) => (
                          <tr key={col.column} className="border-b last:border-0">
                            <td className="px-3 py-1.5 font-mono">{col.column}</td>
                            <td className="px-3 py-1.5 text-right">
                              {col.missingCount.toLocaleString()} / {col.totalRows.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span
                                className={cn(
                                  "inline-block min-w-[3rem] rounded px-1.5 py-0.5 text-center font-medium",
                                  col.missingPercentage > 50
                                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                    : col.missingPercentage > 20
                                      ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
                                )}
                              >
                                {col.missingPercentage.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {scanResult.abnormalities.length > 0 && (
              <div>
                <h4 className={cn("font-semibold mb-2", textColor)}>
                  Abnormalities
                </h4>
                <div className="space-y-2">
                  {scanResult.abnormalities.map((abnormality, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md border bg-background/50 px-3 py-2"
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          abnormality.severity === "high"
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : abnormality.severity === "medium"
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
                        )}
                      >
                        {abnormality.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-medium">
                            {abnormality.column}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {abnormality.type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {abnormality.description}
                          {abnormality.affectedRows > 0 && (
                            <span className="ml-1">
                              ({abnormality.affectedRows.toLocaleString()} row{abnormality.affectedRows !== 1 ? "s" : ""})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
              <span>
                Scanned at {new Date(scanResult.scannedAt).toLocaleString()}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={handleClear}
              >
                Clear results
              </Button>
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
