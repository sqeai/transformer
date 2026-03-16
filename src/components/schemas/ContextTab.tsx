"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, Trash2, BookOpen, CheckSquare, Table2 } from "lucide-react";
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

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  const togglePreview = useCallback(async (ctx: SchemaContext) => {
    if (expandedId === ctx.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ctx.id);
    setPreviewRows([]);
    setPreviewError(null);

    if (ctx.type !== "lookup_table" || !ctx.dataSourceId || !ctx.bqDataset || !ctx.bqTable) return;

    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/data-sources/${ctx.dataSourceId}/tables/${encodeURIComponent(ctx.bqDataset)}/${encodeURIComponent(ctx.bqTable)}/preview`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load preview");
      }
      const data = await res.json();
      setPreviewRows(data.rows ?? []);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [expandedId]);

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
            const isLookup = ctx.type === "lookup_table";
            const isExpanded = expandedId === ctx.id;
            return (
              <Card key={ctx.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left"
                      onClick={() => isLookup && togglePreview(ctx)}
                    >
                      {isLookup ? (
                        isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <CardTitle className="text-sm">{ctx.name}</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">
                        {CONTEXT_TYPE_LABELS[ctx.type]}
                      </Badge>
                    </button>
                    <div className="flex items-center gap-1">
                      {isLookup && ctx.bqProject && ctx.bqDataset && ctx.bqTable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-muted-foreground"
                          asChild
                        >
                          <a
                            href={`https://console.cloud.google.com/bigquery?project=${encodeURIComponent(ctx.bqProject)}&ws=!1m5!1m4!4m3!1s${encodeURIComponent(ctx.bqProject)}!2s${encodeURIComponent(ctx.bqDataset)}!3s${encodeURIComponent(ctx.bqTable)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open in BigQuery
                          </a>
                        </Button>
                      )}
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
                  </div>
                </CardHeader>
                <CardContent>
                  {isLookup && !isExpanded && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {ctx.bqDataset && <p>Dataset: <span className="font-mono">{ctx.bqDataset}</span></p>}
                      {ctx.bqTable && <p>Table: <span className="font-mono">{ctx.bqTable}</span></p>}
                    </div>
                  )}
                  {isLookup && isExpanded && (
                    <div className="space-y-3">
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {ctx.bqDataset && <p>Dataset: <span className="font-mono">{ctx.bqDataset}</span></p>}
                        {ctx.bqTable && <p>Table: <span className="font-mono">{ctx.bqTable}</span></p>}
                      </div>
                      {previewLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading preview…
                        </div>
                      )}
                      {previewError && (
                        <p className="text-sm text-destructive py-2">{previewError}</p>
                      )}
                      {!previewLoading && !previewError && previewRows.length > 0 && (
                        <div className="rounded-md border overflow-auto max-h-[360px]">
                          <Table className="min-w-max">
                            <TableHeader>
                              <TableRow>
                                {Object.keys(previewRows[0]).map((col) => (
                                  <TableHead key={col} className="whitespace-nowrap text-xs">
                                    {col}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewRows.map((row, rIdx) => (
                                <TableRow key={rIdx}>
                                  {Object.values(row).map((val, cIdx) => (
                                    <TableCell key={cIdx} className="whitespace-nowrap max-w-[200px] truncate text-xs">
                                      {val == null ? "" : String(val)}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                      {!previewLoading && !previewError && previewRows.length === 0 && (
                        <p className="text-sm text-muted-foreground py-2">No rows found in this table.</p>
                      )}
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
