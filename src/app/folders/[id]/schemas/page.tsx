"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileStack, Plus, Loader2, ArrowLeft } from "lucide-react";
import { useSchemaStore } from "@/lib/schema-store";
import { AddSchemaDialog } from "@/components/schemas/AddSchemaDialog";
import { SheetPickerDialog } from "@/components/schemas/SheetPickerDialog";
import { getExcelSheetNames, extractExcelGrid } from "@/lib/parse-excel-preview";
import type { FinalSchema } from "@/lib/types";

interface Schema {
  id: string;
  name: string;
  createdAt: string;
  fieldCount?: number;
}

export default function FolderSchemasPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(true);

  const { addSchema } = useSchemaStore();

  const [addSchemaOpen, setAddSchemaOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetPreview, setSheetPreview] = useState<string[][]>([]);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [schemaUploadFile, setSchemaUploadFile] = useState<File | null>(null);
  const [schemaUploadBuffer, setSchemaUploadBuffer] = useState<ArrayBuffer | null>(null);

  const fetchSchemas = useCallback(async () => {
    try {
      const res = await fetch(`/api/schemas?folderId=${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setSchemas(data.schemas ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

  const resetSheetPickerState = () => {
    setSheetPickerOpen(false);
    setSheetNames([]);
    setActiveSheetIndex(0);
    setSheetPreview([]);
    setSchemaUploadFile(null);
    setSchemaUploadBuffer(null);
  };

  const loadSheetPreview = useCallback(async (buffer: ArrayBuffer, index: number) => {
    setSheetPreviewLoading(true);
    try {
      const { grid } = await extractExcelGrid(buffer, 6, undefined, index);
      setSheetPreview(grid);
    } catch {
      setSheetPreview([]);
    } finally {
      setSheetPreviewLoading(false);
    }
  }, []);

  const createSchemaFromFile = useCallback(async (file: File, sheetIndex = 0) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("sheetIndex", String(sheetIndex));
      const res = await fetch("/api/parse-schema", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const { fields } = await res.json();
      const schema: FinalSchema = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.(xlsx?|csv)$/i, "") || "New Schema",
        fields: fields.map((f: { id: string; name: string; path: string; level: number; order: number }) => ({
          ...f,
          children: [],
        })),
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema, folderId);
      resetSheetPickerState();
      setAddSchemaOpen(false);
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [addSchema, router, folderId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        await createSchemaFromFile(file, 0);
      } else {
        const buffer = await file.arrayBuffer();
        const names = await getExcelSheetNames(buffer);
        if (!names || names.length <= 1) {
          await createSchemaFromFile(file, 0);
        } else {
          setSchemaUploadFile(file);
          setSchemaUploadBuffer(buffer);
          setSheetNames(names);
          setActiveSheetIndex(0);
          setSheetPickerOpen(true);
          await loadSheetPreview(buffer, 0);
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      e.target.value = "";
    }
  };

  const handleSelectSheetForPreview = async (index: number) => {
    if (!schemaUploadBuffer) return;
    setActiveSheetIndex(index);
    await loadSheetPreview(schemaUploadBuffer, index);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/folders/${folderId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Schemas</h1>
              <p className="text-sm text-muted-foreground">
                Data schemas in this folder
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button onClick={() => setAddSchemaOpen(true)} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              New Schema
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : schemas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileStack className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No schemas yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a schema to define your data structure.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {schemas.map((schema) => (
              <Card
                key={schema.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/schemas/${schema.id}`)}
              >
                <CardHeader>
                  <CardTitle className="text-base">{schema.name}</CardTitle>
                  <CardDescription className="text-xs">
                    Created {new Date(schema.createdAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddSchemaDialog
        open={addSchemaOpen}
        onOpenChange={setAddSchemaOpen}
        uploading={uploading}
        onUploadClick={() => fileInputRef.current?.click()}
        folderId={folderId}
      />

      <SheetPickerDialog
        open={sheetPickerOpen}
        onOpenChange={(nextOpen) => { if (!nextOpen) resetSheetPickerState(); }}
        fileName={schemaUploadFile?.name ?? null}
        sheetNames={sheetNames}
        activeSheetIndex={activeSheetIndex}
        onSelectSheet={handleSelectSheetForPreview}
        sheetPreview={sheetPreview}
        sheetPreviewLoading={sheetPreviewLoading}
        uploading={uploading}
        onConfirm={() => { if (schemaUploadFile) void createSchemaFromFile(schemaUploadFile, activeSheetIndex); }}
        onCancel={resetSheetPickerState}
      />
    </>
  );
}
