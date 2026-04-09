"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Workflow,
  Star,
  Database,
  FileStack,
} from "lucide-react";
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
import type { SchemaTransformation, DatasetSummary } from "@/lib/types";
import { TransformationBuilder } from "./transformations/TransformationBuilder";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface TransformationsTabProps {
  schemaId: string;
  isOwner: boolean;
  canEdit?: boolean;
}

export function TransformationsTab({ schemaId, isOwner, canEdit = false }: TransformationsTabProps) {
  const [transformations, setTransformations] = useState<SchemaTransformation[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SchemaTransformation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingTransformation, setEditingTransformation] = useState<SchemaTransformation | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showDatasetPicker, setShowDatasetPicker] = useState(false);
  const [loadingFromDataset, setLoadingFromDataset] = useState(false);

  const fetchTransformations = useCallback(() => {
    setLoading(true);
    fetch(`/api/schemas/${schemaId}/transformations`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { transformations: [] }))
      .then((data) => setTransformations(data.transformations ?? []))
      .finally(() => setLoading(false));
  }, [schemaId]);

  const fetchDatasets = useCallback(() => {
    fetch(`/api/schemas/${schemaId}/datasets`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { datasets: [] }))
      .then((data) => {
        const completedDatasets = (data.datasets ?? []).filter(
          (d: DatasetSummary) => d.state === "completed" || d.state === "approved"
        );
        setDatasets(completedDatasets);
      });
  }, [schemaId]);

  useEffect(() => {
    fetchTransformations();
    fetchDatasets();
  }, [fetchTransformations, fetchDatasets]);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/transformations/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      setDeleteTarget(null);
      fetchTransformations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete transformation");
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (transformation: SchemaTransformation) => {
    try {
      const res = await fetch(`/api/schemas/${schemaId}/transformations/${transformation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to set as default");
      }
      fetchTransformations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set as default");
    }
  };

  const handleCreateFromDataset = async (datasetId: string) => {
    setLoadingFromDataset(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/transformations/from-dataset/${datasetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create from dataset");
      }
      const data = await res.json();
      setShowDatasetPicker(false);
      fetchTransformations();
      // Open the builder to edit the new transformation
      setEditingTransformation(data.transformation);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create from dataset");
    } finally {
      setLoadingFromDataset(false);
    }
  };

  const handleSaveTransformation = async (transformation: SchemaTransformation) => {
    // Save is handled inside the builder, just close and refresh
    setEditingTransformation(null);
    setIsCreating(false);
    fetchTransformations();
  };

  const handleCloseBuilder = () => {
    setEditingTransformation(null);
    setIsCreating(false);
    fetchTransformations();
  };

  // Show builder if editing or creating
  if (editingTransformation || isCreating) {
    return (
      <TransformationBuilder
        schemaId={schemaId}
        transformation={editingTransformation}
        onSave={handleSaveTransformation}
        onClose={handleCloseBuilder}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Transformation Pipelines</h3>
          <p className="text-sm text-muted-foreground">
            Configure transformation pipelines that serve as starting points for the cleansing agent.
          </p>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Pipeline
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsCreating(true)}>
                <Workflow className="h-4 w-4 mr-2" />
                Create New Pipeline
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDatasetPicker(true)}
                disabled={datasets.length === 0}
              >
                <Database className="h-4 w-4 mr-2" />
                Create from Dataset
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {transformations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Workflow className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No transformation pipelines yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a pipeline to guide the cleansing agent when processing files.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {transformations.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-muted-foreground shrink-0" />
                    <CardTitle className="text-sm">{t.name}</CardTitle>
                    {t.isDefault && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isOwner && !t.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={() => handleSetDefault(t)}
                      >
                        <Star className="h-3.5 w-3.5 mr-1" />
                        Set Default
                      </Button>
                    )}
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingTransformation(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {t.description && (
                  <CardDescription className="text-xs">{t.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><span className="font-medium">{t.steps.length}</span> transformation step{t.steps.length !== 1 ? "s" : ""}</p>
                  {t.steps.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.steps.map((step) => (
                        <Badge key={step.id} variant="outline" className="text-[10px]">
                          {step.tool}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the pipeline &quot;{deleteTarget?.name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dataset Picker Dialog */}
      <Dialog open={showDatasetPicker} onOpenChange={setShowDatasetPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Pipeline from Dataset</DialogTitle>
            <DialogDescription>
              Select a completed dataset to extract its transformation steps.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {datasets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No completed datasets available.
              </p>
            ) : (
              datasets.map((dataset) => (
                <Button
                  key={dataset.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleCreateFromDataset(dataset.id)}
                  disabled={loadingFromDataset}
                >
                  <FileStack className="h-4 w-4 mr-2" />
                  <span className="truncate">{dataset.name}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {dataset.rowCount} rows
                  </Badge>
                </Button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
