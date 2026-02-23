"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSchemaStore } from "@/lib/schema-store";
import { flattenFields } from "@/lib/schema-store";
import { parseExcelToRows } from "@/lib/parse-excel";
import { parseCsvToRows } from "@/lib/parse-csv";
import type { RawDataAnalysis } from "@/lib/llm-schema";
import { Upload, FileSpreadsheet, Loader2, Sparkles, Info, ArrowLeft } from "lucide-react";

type Step = "idle" | "analyzing" | "parsing" | "done";

export default function UploadPage() {
  const searchParams = useSearchParams();
  const schemaId = searchParams.get("schemaId");
  const router = useRouter();
  const { getSchema, setCurrentSchema, setRawData, resetWorkflow } = useSchemaStore();
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RawDataAnalysis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const schema = schemaId ? getSchema(schemaId) : null;

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setAnalysis(null);
      resetWorkflow();
      const ext = file.name.toLowerCase();
      const isExcel = ext.endsWith(".xlsx") || ext.endsWith(".xls");
      const isCsv = ext.endsWith(".csv");

      if (!isExcel && !isCsv) {
        setError("Please upload a CSV or Excel (.xlsx, .xls) file.");
        return;
      }

      try {
        let llmAnalysis: RawDataAnalysis | undefined;

        if (isExcel) {
          setStep("analyzing");
          const formData = new FormData();
          formData.append("file", file);
          try {
            const res = await fetch("/api/analyze-raw", {
              method: "POST",
              body: formData,
            });
            if (res.ok) {
              llmAnalysis = await res.json();
              setAnalysis(llmAnalysis!);
            }
          } catch {
            // LLM analysis failed — fall back to basic parsing
          }
        }

        setStep("parsing");
        if (isCsv) {
          const text = await file.text();
          const { columns, rows } = parseCsvToRows(text);
          setRawData(columns, rows);
        } else {
          const buffer = await file.arrayBuffer();
          const { columns, rows } = await parseExcelToRows(buffer, {
            analysis: llmAnalysis,
          });
          setRawData(columns, rows);
        }

        if (schemaId) setCurrentSchema(schemaId);
        setStep("done");
        router.push("/mapping");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to parse file");
        setStep("idle");
      }
    },
    [schemaId, setCurrentSchema, setRawData, resetWorkflow, router],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const loading = step !== "idle" && step !== "done";

  if (!schemaId || !schema) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Select a schema first</CardTitle>
            <CardDescription>
              Go to Final Schemas and click &quot;Use&quot; on a schema to upload raw data for it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/schemas")}>Go to Schemas</Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const targetPaths = flattenFields(schema.fields).map((f) => f.path);

  const stepLabel: Record<Step, string> = {
    idle: "Choose file",
    analyzing: "AI is analyzing structure…",
    parsing: "Parsing cleaned data…",
    done: "Done",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/schemas")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Upload raw data</h1>
            <p className="text-muted-foreground">
              Use schema &quot;{schema.name}&quot;. Upload Excel or CSV to map to the final structure.
            </p>
          </div>
        </div>

        <Card className="border border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              AI-powered data cleaning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The AI agent will automatically analyse your raw file to detect the real header row,
              trim metadata/title rows, remove noise columns, and extract clean data — even if the
              headers aren&apos;t on the first row.
            </p>
          </CardContent>
        </Card>

        <Card
          className={`border-2 border-dashed transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Drag and drop
            </CardTitle>
            <CardDescription>
              Drop an Excel (.xlsx, .xls) or CSV file here, or click to browse.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFileInput}
            />
            <Button
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {stepLabel[step]}
            </Button>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>

        {analysis && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4" />
                AI Analysis Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Header detected at row {analysis.headerRowIndex + 1} — trimmed {analysis.trimmedRowCount} metadata row(s)</p>
              <p>Keeping {analysis.columnsToKeep.length} of {analysis.headers.length + (analysis.columnsToKeep.length)} columns</p>
              <p>Headers found: {analysis.headers.slice(0, 10).join(", ")}{analysis.headers.length > 10 ? "…" : ""}</p>
              {analysis.notes && <p className="italic">{analysis.notes}</p>}
            </CardContent>
          </Card>
        )}

        {targetPaths.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Target fields ({targetPaths.length})</CardTitle>
              <CardDescription>
                After upload you will map your columns to these: {targetPaths.slice(0, 8).join(", ")}
                {targetPaths.length > 8 ? "…" : ""}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
