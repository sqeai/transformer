"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Database, Plus, Loader2, ArrowLeft } from "lucide-react";
import {
  useSchemaStore,
  type UploadedFileEntry,
} from "@/lib/schema-store";
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";

interface Dataset {
  id: string;
  name: string;
  state: string;
  rowCount: number | null;
  createdAt: string;
}

export default function FolderDatasetsPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { resetDatasetWorkflow, setDatasetWorkflow } = useSchemaStore();

  const fetchDatasets = useCallback(async () => {
    try {
      const res = await fetch(`/api/datasets?folderId=${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setDatasets(data.datasets ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

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

  const stateColor = (state: string) => {
    switch (state) {
      case "completed":
        return "default" as const;
      case "approved":
        return "default" as const;
      case "pending_approval":
        return "secondary" as const;
      case "rejected":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
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
              <h1 className="text-2xl font-bold tracking-tight">Datasets</h1>
              <p className="text-sm text-muted-foreground">
                Processed datasets in this folder
              </p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Dataset
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : datasets.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No datasets yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a dataset to start processing data.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {datasets.map((ds) => (
              <Card
                key={ds.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/datasets/${ds.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base truncate">
                      {ds.name}
                    </CardTitle>
                    <Badge variant={stateColor(ds.state)} className="text-xs shrink-0">
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

      <UploadDatasetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        folderId={folderId}
        onUpload={handleUploadFromDialog}
      />
    </>
  );
}
