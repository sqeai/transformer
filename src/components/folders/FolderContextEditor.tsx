"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Plus, X, Eye, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DataSource {
  id: string;
  name: string;
  type: string;
}

interface TableInfo {
  schema: string;
  table: string;
}

interface ContextTable {
  id?: string;
  dataSourceId: string;
  dataSourceName?: string;
  schemaName: string;
  tableName: string;
}

interface FolderContextEditorProps {
  folderId: string;
}

export function FolderContextEditor({ folderId }: FolderContextEditorProps) {
  const [content, setContent] = useState("");
  const [contextTables, setContextTables] = useState<ContextTable[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [selectedDataSource, setSelectedDataSource] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/context`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content ?? "");
        setContextTables(data.tables ?? []);
      }
    } catch {
      toast.error("Failed to load context");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  const fetchDataSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/folders/${folderId}/data-connections`);
      if (res.ok) {
        const data = await res.json();
        setDataSources(data.dataSources ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [folderId]);

  useEffect(() => {
    fetchContext();
    fetchDataSources();
  }, [fetchContext, fetchDataSources]);

  const fetchTablesForSource = useCallback(async (dsId: string) => {
    if (!dsId) return;
    setLoadingTables(true);
    try {
      const res = await fetch(`/api/data-sources/${dsId}/tables`);
      if (res.ok) {
        const data = await res.json();
        setAvailableTables(data.tables ?? []);
      }
    } catch {
      setAvailableTables([]);
    } finally {
      setLoadingTables(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDataSource) {
      fetchTablesForSource(selectedDataSource);
    } else {
      setAvailableTables([]);
    }
  }, [selectedDataSource, fetchTablesForSource]);

  const saveContext = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, tables: contextTables }),
      });
      if (res.ok) {
        toast.success("Context saved");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save context");
      }
    } catch {
      toast.error("Failed to save context");
    } finally {
      setSaving(false);
    }
  };

  const addTable = () => {
    if (!selectedDataSource || !selectedTable) return;
    const [schema, table] = selectedTable.split(".");
    const ds = dataSources.find((d) => d.id === selectedDataSource);
    const alreadyAdded = contextTables.some(
      (t) =>
        t.dataSourceId === selectedDataSource &&
        t.schemaName === schema &&
        t.tableName === table,
    );
    if (alreadyAdded) {
      toast.info("Table already added");
      return;
    }
    setContextTables((prev) => [
      ...prev,
      {
        dataSourceId: selectedDataSource,
        dataSourceName: ds?.name,
        schemaName: schema,
        tableName: table,
      },
    ]);
    setSelectedTable("");
  };

  const removeTable = (index: number) => {
    setContextTables((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Context</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
          >
            {previewMode ? (
              <>
                <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </>
            ) : (
              <>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Preview
              </>
            )}
          </Button>
          <Button size="sm" onClick={saveContext} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
        {!previewMode ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full min-h-[400px] rounded-lg border bg-background p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Describe what this entity does... (Markdown supported)"
          />
        ) : null}
        <div
          className={cn(
            "rounded-lg border bg-muted/30 p-4 overflow-auto prose prose-sm dark:prose-invert max-w-none",
            previewMode && "col-span-2",
          )}
        >
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground italic">No content yet.</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Related Tables</h3>
        <div className="flex flex-wrap gap-2">
          {contextTables.map((t, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              {t.dataSourceName ?? t.dataSourceId}: {t.schemaName}.{t.tableName}
              <button
                onClick={() => removeTable(i)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Select value={selectedDataSource} onValueChange={setSelectedDataSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select data source" />
              </SelectTrigger>
              <SelectContent>
                {dataSources.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.name} ({ds.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Select
              value={selectedTable}
              onValueChange={setSelectedTable}
              disabled={!selectedDataSource || loadingTables}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={loadingTables ? "Loading..." : "Select table"}
                />
              </SelectTrigger>
              <SelectContent>
                {availableTables.map((t) => (
                  <SelectItem key={`${t.schema}.${t.table}`} value={`${t.schema}.${t.table}`}>
                    {t.schema}.{t.table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={addTable}
            disabled={!selectedDataSource || !selectedTable}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
