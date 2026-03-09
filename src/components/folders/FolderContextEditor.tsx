"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Save,
  X,
  Edit3,
  ChevronRight,
  ChevronDown,
  Database,
  Table2,
  FolderOpen,
  Check,
  ImagePlus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DataSource {
  id: string;
  name: string;
  type: string;
}

interface TableInfo {
  schema: string;
  name: string;
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

type TreeNode = {
  dataSourceId: string;
  dataSourceName: string;
  schemas: {
    schemaName: string;
    tables: { tableName: string; selected: boolean }[];
  }[];
};

function buildTree(
  dataSources: DataSource[],
  allTables: Map<string, TableInfo[]>,
  selectedTables: ContextTable[],
): TreeNode[] {
  const selectedSet = new Set(
    selectedTables.map(
      (t) => `${t.dataSourceId}::${t.schemaName}::${t.tableName}`,
    ),
  );

  return dataSources.map((ds) => {
    const tables = allTables.get(ds.id) ?? [];
    const schemaMap = new Map<
      string,
      { tableName: string; selected: boolean }[]
    >();

    for (const t of tables) {
      const key = `${ds.id}::${t.schema}::${t.name}`;
      const list = schemaMap.get(t.schema) ?? [];
      list.push({ tableName: t.name, selected: selectedSet.has(key) });
      schemaMap.set(t.schema, list);
    }

    const schemas = Array.from(schemaMap.entries())
      .map(([schemaName, tables]) => ({
        schemaName,
        tables: tables.sort((a, b) => a.tableName.localeCompare(b.tableName)),
      }))
      .sort((a, b) => a.schemaName.localeCompare(b.schemaName));

    return { dataSourceId: ds.id, dataSourceName: ds.name, schemas };
  });
}

function buildSelectedTree(selectedTables: ContextTable[]): TreeNode[] {
  const dsMap = new Map<
    string,
    { name: string; schemas: Map<string, string[]> }
  >();

  for (const t of selectedTables) {
    let ds = dsMap.get(t.dataSourceId);
    if (!ds) {
      ds = { name: t.dataSourceName ?? t.dataSourceId, schemas: new Map() };
      dsMap.set(t.dataSourceId, ds);
    }
    const tables = ds.schemas.get(t.schemaName) ?? [];
    tables.push(t.tableName);
    ds.schemas.set(t.schemaName, tables);
  }

  return Array.from(dsMap.entries()).map(([dataSourceId, ds]) => ({
    dataSourceId,
    dataSourceName: ds.name,
    schemas: Array.from(ds.schemas.entries())
      .map(([schemaName, tables]) => ({
        schemaName,
        tables: tables
          .sort((a, b) => a.localeCompare(b))
          .map((t) => ({ tableName: t, selected: true })),
      }))
      .sort((a, b) => a.schemaName.localeCompare(b.schemaName)),
  }));
}

export function FolderContextEditor({ folderId }: FolderContextEditorProps) {
  const [content, setContent] = useState("");
  const [contextTables, setContextTables] = useState<ContextTable[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [allTablesMap, setAllTablesMap] = useState<Map<string, TableInfo[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [savingContent, setSavingContent] = useState(false);
  const [savingTables, setSavingTables] = useState(false);
  const [previewMode, setPreviewMode] = useState(true);
  const [editingTables, setEditingTables] = useState(false);
  const [loadingAllTables, setLoadingAllTables] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const [refreshingAllDimensions, setRefreshingAllDimensions] = useState(false);

  const [hasLogo, setHasLogo] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
      const res = await fetch(`/api/data-sources?folderId=${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setDataSources(data.dataSources ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [folderId]);

  const fetchFolderLogo = useCallback(async () => {
    try {
      const res = await fetch(`/api/folder-logos/${folderId}`, { method: "HEAD" });
      setHasLogo(res.ok);
    } catch {
      setHasLogo(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchContext();
    fetchDataSources();
    fetchFolderLogo();
  }, [fetchContext, fetchDataSources, fetchFolderLogo]);

  const handleLogoUpload = useCallback(async (file: File) => {
    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only image files are allowed (PNG, JPEG, GIF, WebP, SVG)");
      return;
    }

    setUploadingLogo(true);
    try {
      const presignRes = await fetch(`/api/folders/${folderId}/logo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, fileName: file.name }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to get upload URL");
      }

      const { uploadUrl } = await presignRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload logo");
      }

      setHasLogo(true);
      setLogoVersion((v) => v + 1);
      window.dispatchEvent(new CustomEvent("folder-logo-updated"));
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  }, [folderId]);

  const handleRemoveLogo = useCallback(async () => {
    setRemovingLogo(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/logo`, { method: "DELETE" });
      if (res.ok) {
        setHasLogo(false);
        setLogoVersion((v) => v + 1);
        window.dispatchEvent(new CustomEvent("folder-logo-updated"));
        toast.success("Logo removed");
      } else {
        toast.error("Failed to remove logo");
      }
    } catch {
      toast.error("Failed to remove logo");
    } finally {
      setRemovingLogo(false);
    }
  }, [folderId]);

  const fetchAllTables = useCallback(async () => {
    if (dataSources.length === 0) return;
    setLoadingAllTables(true);
    const newMap = new Map<string, TableInfo[]>();
    await Promise.all(
      dataSources.map(async (ds) => {
        try {
          const res = await fetch(`/api/data-sources/${ds.id}/tables`);
          if (res.ok) {
            const data = await res.json();
            newMap.set(ds.id, data.tables ?? []);
          }
        } catch {
          /* ignore */
        }
      }),
    );
    setAllTablesMap(newMap);
    setLoadingAllTables(false);
  }, [dataSources]);

  const handleEditTables = useCallback(() => {
    setEditingTables(true);
    if (allTablesMap.size === 0) {
      fetchAllTables();
    }
  }, [allTablesMap.size, fetchAllTables]);

  const saveContent = async () => {
    setSavingContent(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, tables: contextTables }),
      });
      if (res.ok) {
        toast.success("Context saved");
        setPreviewMode(true);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save context");
      }
    } catch {
      toast.error("Failed to save context");
    } finally {
      setSavingContent(false);
    }
  };

  const saveTables = async () => {
    setSavingTables(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, tables: contextTables }),
      });
      if (res.ok) {
        toast.success("Related tables saved");
        setEditingTables(false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save tables");
      }
    } catch {
      toast.error("Failed to save tables");
    } finally {
      setSavingTables(false);
    }
  };

  const refreshAllDimensions = async () => {
    if (contextTables.length === 0) return;
    setRefreshingAllDimensions(true);
    const results = await Promise.allSettled(
      contextTables.map(async (t) => {
        const res = await fetch(
          `/api/data-sources/${t.dataSourceId}/tables/${t.schemaName}/${t.tableName}/dimensions`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error(t.tableName);
      }),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.success("All dimensions refreshed");
    } else {
      toast.warning(`Refreshed with ${failed} failure${failed > 1 ? "s" : ""}`);
    }
    setRefreshingAllDimensions(false);
  };

  const toggleTable = (
    dataSourceId: string,
    dataSourceName: string,
    schemaName: string,
    tableName: string,
  ) => {
    const exists = contextTables.some(
      (t) =>
        t.dataSourceId === dataSourceId &&
        t.schemaName === schemaName &&
        t.tableName === tableName,
    );
    if (exists) {
      setContextTables((prev) =>
        prev.filter(
          (t) =>
            !(
              t.dataSourceId === dataSourceId &&
              t.schemaName === schemaName &&
              t.tableName === tableName
            ),
        ),
      );
    } else {
      setContextTables((prev) => [
        ...prev,
        { dataSourceId, dataSourceName, schemaName, tableName },
      ]);
    }
  };

  const removeTable = (
    dataSourceId: string,
    schemaName: string,
    tableName: string,
  ) => {
    setContextTables((prev) =>
      prev.filter(
        (t) =>
          !(
            t.dataSourceId === dataSourceId &&
            t.schemaName === schemaName &&
            t.tableName === tableName
          ),
      ),
    );
  };

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
  };

  const fullTree = useMemo(
    () => buildTree(dataSources, allTablesMap, contextTables),
    [dataSources, allTablesMap, contextTables],
  );

  const selectedTree = useMemo(
    () => buildSelectedTree(contextTables),
    [contextTables],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Context</h2>
      </div>

      {/* Logo */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Logo</h3>
        <div className="flex items-center gap-4">
          {hasLogo ? (
            <div className="relative group">
              <img
                src={`/api/folder-logos/${folderId}?v=${logoVersion}`}
                alt="Folder logo"
                className="h-14 w-14 rounded-lg border border-border object-cover bg-muted"
              />
              <button
                onClick={handleRemoveLogo}
                disabled={removingLogo}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                title="Remove logo"
              >
                {removingLogo ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
              <FolderOpen className="h-6 w-6 text-muted-foreground/50" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
              )}
              {hasLogo ? "Change Logo" : "Upload Logo"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Replaces the folder icon in the sidebar and context panel
            </p>
          </div>
        </div>
      </div>

      {/* Markdown Editor / Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Description</h3>
          <div className="flex items-center gap-2">
            {previewMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewMode(false)}
              >
                <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewMode(true)}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button size="sm" onClick={saveContent} disabled={savingContent}>
                  {savingContent ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
        {previewMode ? (
          <div className="rounded-lg border bg-muted/30 p-4 min-h-[300px] overflow-auto prose prose-sm dark:prose-invert max-w-none">
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground italic">No content yet.</p>
            )}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full min-h-[300px] rounded-lg border bg-background p-4 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Describe what this entity does... (Markdown supported)"
          />
        )}
      </div>

      {/* Related Tables */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Related Tables</h3>
          {!editingTables ? (
            <div className="flex items-center gap-2">
              {contextTables.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshAllDimensions}
                  disabled={refreshingAllDimensions}
                >
                  {refreshingAllDimensions ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Refresh All Dimensions
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditTables}
              >
                <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingTables(false)}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveTables}
                disabled={savingTables}
              >
                {savingTables ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </div>
          )}
        </div>

        {editingTables ? (
          <EditableTableTree
            tree={fullTree}
            loading={loadingAllTables}
            expandedNodes={expandedNodes}
            toggleNode={toggleNode}
            toggleTable={toggleTable}
          />
        ) : (
          <SelectedTableTree
            tree={selectedTree}
            expandedNodes={expandedNodes}
            toggleNode={toggleNode}
            removeTable={removeTable}
          />
        )}
      </div>
    </div>
  );
}

function SelectedTableTree({
  tree,
  expandedNodes,
  toggleNode,
  removeTable,
}: {
  tree: TreeNode[];
  expandedNodes: Set<string>;
  toggleNode: (key: string) => void;
  removeTable: (dsId: string, schema: string, table: string) => void;
}) {
  const [refreshingKeys, setRefreshingKeys] = useState<Set<string>>(new Set());

  const refreshDimensions = async (
    dataSourceId: string,
    schemaName: string,
    tableName: string,
  ) => {
    const key = `${dataSourceId}::${schemaName}::${tableName}`;
    setRefreshingKeys((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(
        `/api/data-sources/${dataSourceId}/tables/${schemaName}/${tableName}/dimensions`,
        { method: "POST" },
      );
      if (res.ok) {
        toast.success(`Dimensions refreshed for ${tableName}`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to refresh dimensions");
      }
    } catch {
      toast.error("Failed to refresh dimensions");
    } finally {
      setRefreshingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  if (tree.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No tables selected.
      </p>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="rounded-lg border bg-muted/20 p-2 space-y-0.5">
        {tree.map((ds) => {
          const dsKey = `selected-ds-${ds.dataSourceId}`;
          const dsExpanded = expandedNodes.has(dsKey);
          return (
            <div key={ds.dataSourceId}>
              <button
                onClick={() => toggleNode(dsKey)}
                className="flex items-center gap-1.5 w-full rounded px-2 py-1.5 text-sm font-medium hover:bg-muted/60 transition-colors"
              >
                {dsExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="truncate">{ds.dataSourceName}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {ds.schemas.reduce((n, s) => n + s.tables.length, 0)}
                </span>
              </button>
              {dsExpanded && (
                <div className="ml-4 overflow-y-auto">
                  {ds.schemas.map((schema) => {
                    const schemaKey = `selected-schema-${ds.dataSourceId}-${schema.schemaName}`;
                    const schemaExpanded = expandedNodes.has(schemaKey);
                    return (
                      <div key={schema.schemaName}>
                        <button
                          onClick={() => toggleNode(schemaKey)}
                          className="flex items-center gap-1.5 w-full rounded px-2 py-1 text-sm hover:bg-muted/60 transition-colors"
                        >
                          {schemaExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">{schema.schemaName}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {schema.tables.length}
                          </span>
                        </button>
                        {schemaExpanded && (
                          <div className="ml-4 overflow-y-auto">
                            {schema.tables.map((t) => {
                              const refreshKey = `${ds.dataSourceId}::${schema.schemaName}::${t.tableName}`;
                              const isRefreshing = refreshingKeys.has(refreshKey);
                              return (
                                <div
                                  key={t.tableName}
                                  className="flex items-center gap-1.5 rounded px-2 py-1 text-sm group hover:bg-muted/60 transition-colors"
                                >
                                  <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate">{t.tableName}</span>
                                  <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() =>
                                        refreshDimensions(
                                          ds.dataSourceId,
                                          schema.schemaName,
                                          t.tableName,
                                        )
                                      }
                                      disabled={isRefreshing}
                                      className="p-0.5 rounded hover:bg-muted transition-colors"
                                      title="Refresh dimensions"
                                    >
                                      {isRefreshing ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                      ) : (
                                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() =>
                                        removeTable(
                                          ds.dataSourceId,
                                          schema.schemaName,
                                          t.tableName,
                                        )
                                      }
                                      className="p-0.5 rounded hover:bg-destructive/10"
                                    >
                                      <X className="h-3.5 w-3.5 text-destructive" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function EditableTableTree({
  tree,
  loading,
  expandedNodes,
  toggleNode,
  toggleTable,
}: {
  tree: TreeNode[];
  loading: boolean;
  expandedNodes: Set<string>;
  toggleNode: (key: string) => void;
  toggleTable: (
    dsId: string,
    dsName: string,
    schema: string,
    table: string,
  ) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading tables...
        </span>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No data sources available.
      </p>
    );
  }

  const sortedTree = tree.map((ds) => ({
    ...ds,
    schemas: ds.schemas.map((s) => {
      const selected = s.tables.filter((t) => t.selected);
      const unselected = s.tables.filter((t) => !t.selected);
      return { ...s, tables: [...selected, ...unselected] };
    }),
  }));

  const withSelected = sortedTree.filter((ds) =>
    ds.schemas.some((s) => s.tables.some((t) => t.selected)),
  );
  const withoutSelected = sortedTree.filter(
    (ds) => !ds.schemas.some((s) => s.tables.some((t) => t.selected)),
  );
  const orderedTree = [...withSelected, ...withoutSelected];

  return (
    <ScrollArea className="max-h-[500px] overflow-y-auto">
      <div className="rounded-lg border bg-muted/20 p-2 space-y-0.5">
        {orderedTree.map((ds) => {
          const dsKey = `edit-ds-${ds.dataSourceId}`;
          const dsExpanded = expandedNodes.has(dsKey);
          const selectedCount = ds.schemas.reduce(
            (n, s) => n + s.tables.filter((t) => t.selected).length,
            0,
          );
          return (
            <div key={ds.dataSourceId}>
              <button
                onClick={() => toggleNode(dsKey)}
                className="flex items-center gap-1.5 w-full rounded px-2 py-1.5 text-sm font-medium hover:bg-muted/60 transition-colors"
              >
                {dsExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="truncate">{ds.dataSourceName}</span>
                {selectedCount > 0 && (
                  <span className="ml-auto text-xs font-normal rounded-full bg-primary/10 text-primary px-1.5 py-0.5">
                    {selectedCount} selected
                  </span>
                )}
              </button>
              {dsExpanded && (
                <div className="ml-4 overflow-y-auto">
                  {ds.schemas.map((schema) => {
                    const schemaKey = `edit-schema-${ds.dataSourceId}-${schema.schemaName}`;
                    const schemaExpanded = expandedNodes.has(schemaKey);
                    const schemaSelectedCount = schema.tables.filter(
                      (t) => t.selected,
                    ).length;
                    return (
                      <div key={schema.schemaName}>
                        <button
                          onClick={() => toggleNode(schemaKey)}
                          className="flex items-center gap-1.5 w-full rounded px-2 py-1 text-sm hover:bg-muted/60 transition-colors"
                        >
                          {schemaExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">{schema.schemaName}</span>
                          {schemaSelectedCount > 0 && (
                            <span className="ml-auto text-xs font-normal rounded-full bg-primary/10 text-primary px-1.5 py-0.5">
                              {schemaSelectedCount}
                            </span>
                          )}
                        </button>
                        {schemaExpanded && (
                          <div className="ml-4 overflow-y-auto">
                            {schema.tables.map((t) => (
                              <button
                                key={t.tableName}
                                onClick={() =>
                                  toggleTable(
                                    ds.dataSourceId,
                                    ds.dataSourceName,
                                    schema.schemaName,
                                    t.tableName,
                                  )
                                }
                                className={cn(
                                  "flex items-center gap-1.5 w-full rounded px-2 py-1 text-sm hover:bg-muted/60 transition-colors",
                                  t.selected && "bg-primary/5",
                                )}
                              >
                                <div
                                  className={cn(
                                    "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                    t.selected
                                      ? "bg-primary border-primary"
                                      : "border-muted-foreground/40",
                                  )}
                                >
                                  {t.selected && (
                                    <Check className="h-3 w-3 text-primary-foreground" />
                                  )}
                                </div>
                                <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">{t.tableName}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
