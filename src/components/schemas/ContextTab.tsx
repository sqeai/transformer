"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface DataSourceOption {
  id: string;
  name: string;
  type: string;
}

export function ContextTab({ schemaId, isOwner, folderId }: ContextTabProps) {
  const [contexts, setContexts] = useState<SchemaContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SchemaContext | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);

  const [newType, setNewType] = useState<SchemaContextType>("text_instructions");
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newDataSourceId, setNewDataSourceId] = useState("");
  const [newBqDataset, setNewBqDataset] = useState("");
  const [newBqTable, setNewBqTable] = useState("");

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

  useEffect(() => {
    if (folderId) {
      fetch(`/api/data-sources?folderId=${folderId}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : { dataSources: [] }))
        .then((data) => setDataSources(data.dataSources ?? []));
    }
  }, [folderId]);

  const resetForm = () => {
    setNewType("text_instructions");
    setNewName("");
    setNewContent("");
    setNewDataSourceId("");
    setNewBqDataset("");
    setNewBqTable("");
    setShowAddForm(false);
  };

  const handleAdd = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: newType,
        name: newName.trim(),
        content: newContent || null,
      };
      if (newType === "lookup_table") {
        body.dataSourceId = newDataSourceId;
        body.bqDataset = newBqDataset;
        body.bqTable = newBqTable;
      }
      const res = await fetch(`/api/schemas/${schemaId}/contexts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add context");
      resetForm();
      fetchContexts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add context");
    } finally {
      setSaving(false);
    }
  };

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
        {isOwner && !showAddForm && (
          <Button onClick={() => setShowAddForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Context
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                <Select value={newType} onValueChange={(v) => setNewType(v as SchemaContextType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lookup_table">Lookup Table</SelectItem>
                    <SelectItem value="validation">Validation</SelectItem>
                    <SelectItem value="text_instructions">Text Instructions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <Input
                  placeholder="e.g. Country Codes"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            </div>

            {newType === "lookup_table" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Data Source (BigQuery)</label>
                  <Select value={newDataSourceId} onValueChange={setNewDataSourceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a data source" />
                    </SelectTrigger>
                    <SelectContent>
                      {dataSources
                        .filter((ds) => ds.type === "bigquery")
                        .map((ds) => (
                          <SelectItem key={ds.id} value={ds.id}>
                            {ds.name}
                          </SelectItem>
                        ))}
                      {dataSources.filter((ds) => ds.type === "bigquery").length === 0 && (
                        <SelectItem value="_none" disabled>
                          No BigQuery data sources in this folder
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">BigQuery Dataset</label>
                    <Input
                      placeholder="my_dataset"
                      value={newBqDataset}
                      onChange={(e) => setNewBqDataset(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">BigQuery Table</label>
                    <Input
                      placeholder="lookup_countries"
                      value={newBqTable}
                      onChange={(e) => setNewBqTable(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {(newType === "validation" || newType === "text_instructions") && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {newType === "validation" ? "Validation Rules" : "Instructions"}
                </label>
                <Textarea
                  placeholder={
                    newType === "validation"
                      ? "e.g. Amount must be > 0\nDate must be in YYYY-MM-DD format"
                      : "e.g. Use ISO country codes for the country field"
                  }
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                />
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contexts.length === 0 && !showAddForm ? (
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
