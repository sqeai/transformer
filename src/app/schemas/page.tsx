"use client";

import { useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSchemaStore, flattenFields } from "@/lib/schema-store";
import { Plus, Trash2, Loader2, ChevronRight, Play, FileSpreadsheet, Pencil } from "lucide-react";
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

export default function SchemasPage() {
  const { user } = useAuth();
  const { schemas, schemasLoading, deleteSchema, addSchema, setCurrentSchema, resetWorkflow } = useSchemaStore();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [addSchemaOpen, setAddSchemaOpen] = useState(false);
  const [addingManual, setAddingManual] = useState(false);

  const handleUploadClick = () => {
    setAddSchemaOpen(false);
    fileInputRef.current?.click();
  };

  const handleAddFieldsManually = async () => {
    setAddingManual(true);
    try {
      const schema: FinalSchema = {
        id: crypto.randomUUID(),
        name: "New Schema",
        fields: [],
        createdAt: new Date().toISOString(),
      };
      const created = await addSchema(schema);
      setAddSchemaOpen(false);
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create schema");
    } finally {
      setAddingManual(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
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
      router.push(`/schemas/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Final Schemas</h1>
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
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add New Schema
            </Button>
          </div>
        </div>

        {schemas.length === 0 ? (
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
                    <TableHead className="w-[140px]">Step 1 — Use schema</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemasLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading schemas...
                      </TableCell>
                    </TableRow>
                  ) : (
                    schemas.map((s) => {
                    const fieldCount = flattenFields(s.fields).filter(
                      (f) => !f.children?.length,
                    ).length;
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            onClick={() => {
                              resetWorkflow();
                              setCurrentSchema(s.id);
                              router.push("/upload");
                            }}
                            className="font-medium"
                          >
                            <Play className="mr-1.5 h-4 w-4" />
                            Use this schema
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {s.creator?.name ?? s.creator?.email ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {createdDate}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {user && s.creator && s.creator.id === user.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteId(s.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
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

      <Dialog open={addSchemaOpen} onOpenChange={setAddSchemaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Schema</DialogTitle>
            <DialogDescription>
              Upload from an existing Excel file or add fields manually.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-3 py-2">
            <Button
              variant="outline"
              className="h-auto min-w-0 flex-shrink-0 flex-col items-start gap-1.5 whitespace-normal py-4 text-left"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              <span className="flex w-full items-center gap-2 font-medium">
                {uploading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 break-words">Upload from existing Excel</span>
              </span>
              <span className="w-full text-left text-muted-foreground text-sm font-normal break-words">
                Parse a header row from an Excel file into a schema you can configure.
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto min-w-0 flex-shrink-0 flex-col items-start gap-1.5 whitespace-normal py-4 text-left"
              onClick={handleAddFieldsManually}
              disabled={addingManual}
            >
              <span className="flex w-full items-center gap-2 font-medium">
                {addingManual ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Pencil className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 break-words">Add fields manually</span>
              </span>
              <span className="w-full text-left text-muted-foreground text-sm font-normal break-words">
                Create an empty schema and define each field yourself.
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
