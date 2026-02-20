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
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";

export default function UploadPage() {
  const searchParams = useSearchParams();
  const schemaId = searchParams.get("schemaId");
  const router = useRouter();
  const { getSchema, setCurrentSchema, setRawData, workflow } = useSchemaStore();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const schema = schemaId ? getSchema(schemaId) : null;

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const ext = file.name.toLowerCase();
        if (ext.endsWith(".csv")) {
          const text = await file.text();
          const { columns, rows } = parseCsvToRows(text);
          setRawData(columns, rows);
        } else if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
          const buffer = await file.arrayBuffer();
          const { columns, rows } = await parseExcelToRows(buffer);
          setRawData(columns, rows);
        } else {
          setError("Please upload a CSV or Excel (.xlsx, .xls) file.");
          setLoading(false);
          return;
        }
        if (schemaId) setCurrentSchema(schemaId);
        router.push("/mapping");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to parse file");
      } finally {
        setLoading(false);
      }
    },
    [schemaId, setCurrentSchema, setRawData, router],
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Upload raw data</h1>
          <p className="text-muted-foreground">
            Use schema &quot;{schema.name}&quot;. Upload Excel or CSV to map to the final structure.
          </p>
        </div>

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
              {loading ? "Processing…" : "Choose file"}
            </Button>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>

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
