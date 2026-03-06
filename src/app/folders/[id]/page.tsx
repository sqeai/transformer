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
import { Badge } from "@/components/ui/badge";
import {
  Folder,
  FolderOpen,
  FileText,
  Database,
  FileStack,
  LayoutDashboard,
  Cable,
  Bell,
  Loader2,
  ArrowLeft,
  Plus,
} from "lucide-react";
import Link from "next/link";
import {
  useSchemaStore,
  flattenFields,
  type UploadedFileEntry,
} from "@/lib/schema-store";
import { AddSchemaDialog } from "@/components/schemas/AddSchemaDialog";
import { SheetPickerDialog } from "@/components/schemas/SheetPickerDialog";
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";
import { getExcelSheetNames, extractExcelGrid } from "@/lib/parse-excel-preview";
import type { FinalSchema } from "@/lib/types";

interface FolderDetail {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

interface FolderChild {
  id: string;
  name: string;
}

interface SchemaItem {
  id: string;
  name: string;
  createdAt: string;
  fieldCount?: number;
}

interface DatasetItem {
  id: string;
  name: string;
  state: string;
  rowCount: number | null;
  createdAt: string;
}

const SECTIONS = [
  { key: "context", label: "Context", icon: FileText, description: "Business context and documentation" },
  { key: "data-sources", label: "Data Sources", icon: Cable, description: "Database connections" },
  { key: "dashboards", label: "Dashboards", icon: LayoutDashboard, description: "Charts and analytics" },
  { key: "alerts", label: "Alerts", icon: Bell, description: "Threshold alerts and notifications" },
];

const STATE_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  approved: "default",
  pending_approval: "secondary",
  rejected: "destructive",
};

export default function FolderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [folder, setFolder] = useState<FolderDetail | null>(null);
  const [children, setChildren] = useState<FolderChild[]>([]);
  const [loading, setLoading] = useState(true);

  const [schemas, setSchemas] = useState<SchemaItem[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);

  const { addSchema, resetDatasetWorkflow, setDatasetWorkflow } = useSchemaStore();

  // Schema creation dialog state
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

  // Dataset creation dialog state
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);

  const fetchFolder = useCallback(async () => {
    try {
      const res = await fetch(`/api/folders/${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setFolder(data.folder);
        setChildren(data.children ?? []);
      } else {
        router.push("/folders");
      }
    } catch {
      router.push("/folders");
    } finally {
      setLoading(false);
    }
  }, [folderId, router]);

  const fetchSchemas = useCallback(async () => {
    setSchemasLoading(true);
    try {
      const res = await fetch(`/api/schemas?folderId=${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setSchemas(data.schemas ?? []);
      }
    } catch { /* ignore */ }
    finally { setSchemasLoading(false); }
  }, [folderId]);

  const fetchDatasets = useCallback(async () => {
    setDatasetsLoading(true);
    try {
      const res = await fetch(`/api/datasets?folderId=${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setDatasets(data.datasets ?? []);
      }
    } catch { /* ignore */ }
    finally { setDatasetsLoading(false); }
  }, [folderId]);

  useEffect(() => {
    fetchFolder();
    fetchSchemas();
    fetchDatasets();
  }, [fetchFolder, fetchSchemas, fetchDatasets]);

  // --- Schema creation helpers ---

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

  // --- Dataset creation handler ---

  const handleUploadFromDialog = useCallback(
    (schemaId: string, files: UploadedFileEntry[]) => {
      resetDatasetWorkflow();
      setDatasetWorkflow({
        schemaId,
        step: "upload",
        files,
        selectedFiles: [],
      });
      router.push(`/datasets/new?schemaId=${schemaId}&folderId=${folderId}`);
    },
    [resetDatasetWorkflow, setDatasetWorkflow, router, folderId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!folder) return null;

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          {folder.parent_id && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/folders/${folder.parent_id}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-amber-500" />
              {folder.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Created {new Date(folder.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Schemas */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileStack className="h-5 w-5 text-primary" />
              Schemas
            </h2>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button size="sm" onClick={() => setAddSchemaOpen(true)} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                New Schema
              </Button>
            </div>
          </div>
          {schemasLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : schemas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <FileStack className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No schemas yet. Create one to define your data structure.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {schemas.map((schema) => (
                <Card
                  key={schema.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/schemas/${schema.id}`)}
                >
                  <CardHeader className="pb-2">
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

        {/* Datasets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Datasets
            </h2>
            <Button size="sm" onClick={() => setDatasetDialogOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New Dataset
            </Button>
          </div>
          {datasetsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : datasets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <Database className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No datasets yet. Create one to start processing data.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {datasets.map((ds) => (
                <Card
                  key={ds.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/datasets/${ds.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base truncate">{ds.name}</CardTitle>
                      <Badge variant={STATE_BADGE[ds.state] ?? "outline"} className="text-xs shrink-0">
                        {ds.state}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {ds.rowCount !== null && `${ds.rowCount} rows · `}
                      Created {new Date(ds.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Other sections */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section) => (
            <Link key={section.key} href={`/folders/${folderId}/${section.key}`}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <section.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{section.label}</CardTitle>
                      <CardDescription className="text-xs">
                        {section.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        {/* Sub-Folders */}
        {children.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Sub-Folders</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {children.map((child) => (
                <Card
                  key={child.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/folders/${child.id}`)}
                >
                  <CardContent className="flex items-center gap-3 py-4">
                    <Folder className="h-5 w-5 text-amber-500" />
                    <span className="font-medium">{child.name}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Schema creation dialogs */}
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

      {/* Dataset creation dialog */}
      <UploadDatasetDialog
        open={datasetDialogOpen}
        onOpenChange={setDatasetDialogOpen}
        onUpload={handleUploadFromDialog}
      />
    </>
  );
}
