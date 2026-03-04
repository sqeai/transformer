"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSchemaStore, flattenFields } from "@/lib/schema-store";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";
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
import type { FinalSchema } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { getExcelSheetNames, extractExcelGrid } from "@/lib/parse-excel-preview";
import { AddSchemaDialog } from "@/components/schemas/AddSchemaDialog";
import { SheetPickerDialog } from "@/components/schemas/SheetPickerDialog";

export default function SchemasPage() {
  const { user } = useAuth();
  const { schemas, schemasLoading, deleteSchema, addSchema } = useSchemaStore();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [addSchemaOpen, setAddSchemaOpen] = useState(false);

  // Sheet picker state
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetPreview, setSheetPreview] = useState<string[][]>([]);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [schemaUploadFile, setSchemaUploadFile] = useState<File | null>(null);
  const [schemaUploadBuffer, setSchemaUploadBuffer] = useState<ArrayBuffer | null>(null);

  const schemasSorted = useMemo(
    () => [...schemas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [schemas],
  );

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
        name: file.name.replace(/\.xlsx?$/i, "") || "New Schema",
        fields: fields.map((f: { id: string; name: string; path: string; level: number; order: number }) => ({
          ...f,
          children: [],
        })),
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema);
      resetSheetPickerState();
      setAddSchemaOpen(false);
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [addSchema, router]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
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
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Schemas</h1>
            <p className="text-muted-foreground">
              Define and manage your target data structures. Click a schema to configure fields, descriptions, and defaults.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button onClick={() => setAddSchemaOpen(true)} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add New Schema
            </Button>
          </div>
        </div>

        {schemasLoading && schemas.length === 0 ? (
          <Card>
            <CardContent className="py-10">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading schemas...</span>
              </div>
            </CardContent>
          </Card>
        ) : schemas.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No schemas yet</CardTitle>
              <CardDescription>
                Add a new schema by uploading from an existing Excel file or by defining fields manually.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setAddSchemaOpen(true)} disabled={uploading}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Schema
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Schemas</CardTitle>
              <CardDescription>Click a schema to view and configure its fields.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemasLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Loading schemas...
                      </TableCell>
                    </TableRow>
                  ) : (
                    schemasSorted.map((s) => {
                      const fieldCount = flattenFields(s.fields).filter((f) => !f.children?.length).length;
                      const createdDate = new Date(s.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });

                      return (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/schemas/${s.id}`)}
                        >
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {s.creator?.name ?? s.creator?.email ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{createdDate}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {user && s.creator && s.creator.id === user.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); router.push(`/schemas/${s.id}`); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <AddSchemaDialog
        open={addSchemaOpen}
        onOpenChange={setAddSchemaOpen}
        uploading={uploading}
        onUploadClick={() => fileInputRef.current?.click()}
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schema?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The schema{deleteId ? ` "${schemas.find((s) => s.id === deleteId)?.name ?? ""}"` : ""} and all its fields will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteId) {
                  try {
                    await deleteSchema(deleteId);
                    setDeleteId(null);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Delete failed");
                  }
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
