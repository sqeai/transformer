"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, BookOpen, CheckSquare, Table2 } from "lucide-react";
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
import type { SchemaContext, SchemaContextType } from "@/lib/types";
import { AddContextDialog } from "./AddContextDialog";

interface ContextTabProps {
  schemaId: string;
  isOwner: boolean;
  folderId?: string | null;
}

const CONTEXT_TYPE_LABELS: Record<SchemaContextType, string> = {
  lookup_table: "Lookup Table",
  validation: "Validation",
  text_instructions: "Text Instructions",
};

const CONTEXT_TYPE_ICONS: Record<SchemaContextType, typeof Table2> = {
  lookup_table: Table2,
  validation: CheckSquare,
  text_instructions: BookOpen,
};

export function ContextTab({ schemaId, isOwner, folderId }: ContextTabProps) {
  const [contexts, setContexts] = useState<SchemaContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SchemaContext | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchContexts = useCallback(() => {
    setLoading(true);
    fetch(`/api/schemas/${schemaId}/contexts`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { contexts: [] }))
      .then((data) => setContexts(data.contexts ?? []))
      .finally(() => setLoading(false));
  }, [schemaId]);

  useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/contexts/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      setDeleteTarget(null);
      fetchContexts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete context");
    } finally {
      setDeleting(false);
    }
  };

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
          <h3 className="text-lg font-semibold">Contexts</h3>
          <p className="text-sm text-muted-foreground">
            Add lookup tables, validation rules, or text instructions to this schema.
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Context
          </Button>
        )}
      </div>

      <AddContextDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        schemaId={schemaId}
        folderId={folderId}
        onContextAdded={fetchContexts}
      />

      {contexts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No contexts yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contexts.map((ctx) => {
            const Icon = CONTEXT_TYPE_ICONS[ctx.type];
            return (
              <Card key={ctx.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm">{ctx.name}</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">
                        {CONTEXT_TYPE_LABELS[ctx.type]}
                      </Badge>
                    </div>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(ctx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {ctx.type === "lookup_table" && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {ctx.bqDataset && <p>Dataset: <span className="font-mono">{ctx.bqDataset}</span></p>}
                      {ctx.bqTable && <p>Table: <span className="font-mono">{ctx.bqTable}</span></p>}
                    </div>
                  )}
                  {(ctx.type === "validation" || ctx.type === "text_instructions") && ctx.content && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ctx.content}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete context?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the context &quot;{deleteTarget?.name}&quot;.
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
    </div>
  );
}
