"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Database,
  RefreshCw,
  Unlink,
  Search,
  Plus,
  Link,
  Lock,
  Zap,
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
import type { SchemaDataSource } from "@/lib/types";

interface DataSourceTabProps {
  schemaId: string;
  isOwner: boolean;
  onDataSourceChange?: (hasDataSource: boolean) => void;
}

interface AvailableDataSource {
  id: string;
  name: string;
  type: string;
}

interface TableOption {
  schema: string;
  name: string;
}

const DEFAULT_BQ_SELECTOR_ID = "__default_bq__";

export function DataSourceTab({ schemaId, isOwner, onDataSourceChange }: DataSourceTabProps) {
  const [linked, setLinked] = useState<SchemaDataSource | null>(null);
  const [availableDataSources, setAvailableDataSources] = useState<AvailableDataSource[]>([]);
  const [defaultBqAvailable, setDefaultBqAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  // Link form
  const [mode, setMode] = useState<"link" | "create" | "default">("link");
  const [selectedDsId, setSelectedDsId] = useState("");
  const [tables, setTables] = useState<TableOption[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState("");
  const [newTableSchema, setNewTableSchema] = useState("");
  const [newTableName, setNewTableName] = useState("");

  const isDefaultBqSelected = selectedDsId === DEFAULT_BQ_SELECTOR_ID;

  // Preview
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filterCol, setFilterCol] = useState("");
  const [filterVal, setFilterVal] = useState("");

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/schemas/${schemaId}/data-source`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { dataSource: null, availableDataSources: [], defaultBqAvailable: false }))
      .then((data) => {
        setLinked(data.dataSource ?? null);
        setAvailableDataSources(data.availableDataSources ?? []);
        setDefaultBqAvailable(!!data.defaultBqAvailable);
        onDataSourceChange?.(!!data.dataSource);
      })
      .finally(() => setLoading(false));
  }, [schemaId, onDataSourceChange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedDsId) {
      setTables([]);
      return;
    }
    setTablesLoading(true);
    setSelectedTable("");
    const url = selectedDsId === DEFAULT_BQ_SELECTOR_ID
      ? "/api/default-bigquery/tables"
      : `/api/data-sources/${selectedDsId}/tables`;
    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { tables: [] }))
      .then((data) => setTables(data.tables ?? []))
      .finally(() => setTablesLoading(false));
  }, [selectedDsId]);

  const loadPreview = useCallback(() => {
    if (!linked) return;
    setPreviewLoading(true);
    const params = new URLSearchParams();
    if (filterCol && filterVal) {
      params.set("filterColumn", filterCol);
      params.set("filterValue", filterVal);
    }
    fetch(`/api/schemas/${schemaId}/data-source/preview?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { rows: [], columns: [] }))
      .then((data) => {
        setPreviewRows(data.rows ?? []);
        if (data.columns?.length) setPreviewColumns(data.columns);
      })
      .finally(() => setPreviewLoading(false));
  }, [schemaId, linked, filterCol, filterVal]);

  useEffect(() => {
    if (linked) loadPreview();
  }, [linked]);

  const handleLink = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let body: Record<string, unknown>;

      if (mode === "default") {
        body = { useDefault: true };
      } else if (mode === "create") {
        if (isDefaultBqSelected) {
          body = { useDefault: true, tableSchema: newTableSchema, tableName: newTableName };
        } else {
          body = {
            dataSourceId: selectedDsId,
            tableSchema: newTableSchema,
            tableName: newTableName,
            isNewTable: true,
          };
        }
      } else {
        if (isDefaultBqSelected) {
          body = {
            useDefault: true,
            tableSchema: selectedTable.split(".")[0],
            tableName: selectedTable.split(".")[1],
            linkExisting: true,
          };
        } else {
          body = {
            dataSourceId: selectedDsId,
            tableSchema: selectedTable.split(".")[0],
            tableName: selectedTable.split(".")[1],
            isNewTable: false,
          };
        }
      }

      const res = await fetch(`/api/schemas/${schemaId}/data-source`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to link data source");
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to link");
    } finally {
      setSaving(false);
    }
  };

  const handleLinkDefault = async () => {
    if (saving) return;
    setMode("default");
    setSaving(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/data-source`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useDefault: true }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to link default BigQuery");
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to link");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (unlinking) return;
    setUnlinking(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/data-source`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to unlink");
      }
      setLinked(null);
      setPreviewRows([]);
      setPreviewColumns([]);
      setShowUnlinkConfirm(false);
      onDataSourceChange?.(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setUnlinking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (linked) {
    const previewCols = previewRows.length > 0
      ? Object.keys(previewRows[0])
      : previewColumns;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Data Source</h3>
            <p className="text-sm text-muted-foreground">
              Connected to <span className="font-mono text-foreground">{linked.dataSourceName ?? linked.dataSourceId}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowUnlinkConfirm(true)}
              >
                <Unlink className="h-4 w-4 mr-1.5" />
                Unlink
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                <span className="font-mono">{linked.tableSchema}.{linked.tableName}</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                {linked.isDefault && (
                  <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600">
                    <Lock className="h-3 w-3 mr-1" />
                    Default
                  </Badge>
                )}
                {linked.dataSourceType && (
                  <Badge variant="secondary" className="text-[10px]">{linked.dataSourceType}</Badge>
                )}
                {linked.isNewTable && (
                  <Badge variant="outline" className="text-[10px]">Created by schema</Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Table Preview</CardTitle>
              <Button variant="ghost" size="sm" onClick={loadPreview} disabled={previewLoading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${previewLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <CardDescription>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  placeholder="Column name"
                  value={filterCol}
                  onChange={(e) => setFilterCol(e.target.value)}
                  className="h-8 max-w-[180px]"
                />
                <Input
                  placeholder="Filter value"
                  value={filterVal}
                  onChange={(e) => setFilterVal(e.target.value)}
                  className="h-8 max-w-[180px]"
                />
                <Button variant="outline" size="sm" className="h-8" onClick={loadPreview}>
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : previewCols.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No columns found.</p>
            ) : (
              <div className="rounded-md border overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {previewCols.map((col) => (
                        <TableHead key={col} className="text-xs whitespace-nowrap">
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={previewCols.length}
                          className="text-sm text-muted-foreground text-center py-6"
                        >
                          Table is empty — no rows yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      previewRows.map((row, i) => (
                        <TableRow key={i}>
                          {previewCols.map((col) => (
                            <TableCell key={col} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                              {row[col] == null ? "" : String(row[col])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={showUnlinkConfirm} onOpenChange={setShowUnlinkConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unlink data source?</AlertDialogTitle>
              <AlertDialogDescription>
                This will disconnect the schema from its data source. The underlying table will not be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleUnlink}
                disabled={unlinking}
              >
                {unlinking && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Unlink
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // No data source linked - show link form
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Data Source</h3>
        <p className="text-sm text-muted-foreground">
          Configure where this schema stores data. Link an existing table or create a new one.
        </p>
      </div>

      {(availableDataSources.length === 0 && !defaultBqAvailable) ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No data sources available in this folder. Add a data source to the folder first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {defaultBqAvailable && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-500" />
                  Quick: Use Default BigQuery
                </CardTitle>
                <CardDescription>
                  Automatically create a BigQuery table backed by the system default connection. Schema changes will sync to BigQuery in real-time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleLinkDefault}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {saving && mode === "default" && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  <Database className="h-4 w-4 mr-1.5" />
                  Connect Default BigQuery
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect Data Source</CardTitle>
              <CardDescription>
                Select a data source and link to an existing table, or create a new one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Data Source</label>
                <Select value={selectedDsId} onValueChange={(v) => { setSelectedDsId(v); setMode("link"); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a data source" />
                  </SelectTrigger>
                  <SelectContent>
                    {defaultBqAvailable && (
                      <SelectItem value={DEFAULT_BQ_SELECTOR_ID}>
                        <span className="flex items-center gap-2">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                          Default BigQuery
                        </span>
                      </SelectItem>
                    )}
                    {availableDataSources.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>
                        {ds.name} ({ds.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedDsId && (
                <>
                  <div className="flex gap-1 border-b pb-2">
                    <button
                      type="button"
                      className={`px-4 py-2 text-sm rounded-md transition-colors ${
                        mode === "link" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                      }`}
                      onClick={() => setMode("link")}
                    >
                      <Link className="h-3.5 w-3.5 inline mr-1.5" />
                      Link Existing Table
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 text-sm rounded-md transition-colors ${
                        mode === "create" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                      }`}
                      onClick={() => setMode("create")}
                    >
                      <Plus className="h-3.5 w-3.5 inline mr-1.5" />
                      Create New Table
                    </button>
                  </div>

                  {mode === "link" && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Table</label>
                      {tablesLoading ? (
                        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading tables...
                        </div>
                      ) : tables.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No tables found in this data source.</p>
                      ) : (
                        <Select value={selectedTable} onValueChange={setSelectedTable}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a table" />
                          </SelectTrigger>
                          <SelectContent>
                            {tables.map((t) => (
                              <SelectItem key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>
                                {t.schema}.{t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {mode === "create" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Dataset / Schema</label>
                        <Input
                          placeholder="my_dataset"
                          value={newTableSchema}
                          onChange={(e) => setNewTableSchema(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Table Name</label>
                        <Input
                          placeholder="my_table"
                          value={newTableName}
                          onChange={(e) => setNewTableName(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      onClick={handleLink}
                      disabled={
                        saving ||
                        !selectedDsId ||
                        (mode === "link" && !selectedTable) ||
                        (mode === "create" && (!newTableSchema || !newTableName))
                      }
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                      {mode === "create" ? "Create & Link Table" : "Link Table"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
