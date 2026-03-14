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
  ArrowDownToLine,
  ArrowUpFromLine,
  Unlink,
  Search,
  Plus,
  Link,
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

export function DataSourceTab({ schemaId, isOwner, onDataSourceChange }: DataSourceTabProps) {
  const [linked, setLinked] = useState<SchemaDataSource | null>(null);
  const [availableDataSources, setAvailableDataSources] = useState<AvailableDataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  // Link form
  const [mode, setMode] = useState<"link" | "create">("link");
  const [selectedDsId, setSelectedDsId] = useState("");
  const [tables, setTables] = useState<TableOption[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState("");
  const [newTableSchema, setNewTableSchema] = useState("");
  const [newTableName, setNewTableName] = useState("");

  // Preview
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filterCol, setFilterCol] = useState("");
  const [filterVal, setFilterVal] = useState("");

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/schemas/${schemaId}/data-source`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { dataSource: null, availableDataSources: [] }))
      .then((data) => {
        setLinked(data.dataSource ?? null);
        setAvailableDataSources(data.availableDataSources ?? []);
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
    fetch(`/api/data-sources/${selectedDsId}/tables`, { credentials: "include" })
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
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setPreviewRows(data.rows ?? []))
      .finally(() => setPreviewLoading(false));
  }, [schemaId, linked, filterCol, filterVal]);

  useEffect(() => {
    if (linked) loadPreview();
  }, [linked]);

  const handleLink = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const isNew = mode === "create";
      const body = isNew
        ? {
            dataSourceId: selectedDsId,
            tableSchema: newTableSchema,
            tableName: newTableName,
            isNewTable: true,
          }
        : {
            dataSourceId: selectedDsId,
            tableSchema: selectedTable.split(".")[0],
            tableName: selectedTable.split(".")[1],
            isNewTable: false,
          };

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
      setShowUnlinkConfirm(false);
      onDataSourceChange?.(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setUnlinking(false);
    }
  };

  const handleSync = async (direction: "push" | "pull") => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/data-source/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sync failed");
      if (direction === "pull") {
        window.location.reload();
      } else {
        loadPreview();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
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
    const previewCols = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];
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
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync("pull")}
                  disabled={syncing}
                  title="Pull columns from database into schema fields"
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ArrowDownToLine className="h-4 w-4 mr-1.5" />}
                  Pull from DB
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync("push")}
                  disabled={syncing}
                  title="Push schema fields to database as columns"
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ArrowUpFromLine className="h-4 w-4 mr-1.5" />}
                  Push to DB
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setShowUnlinkConfirm(true)}
                >
                  <Unlink className="h-4 w-4 mr-1.5" />
                  Unlink
                </Button>
              </>
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
            ) : previewRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No rows found.</p>
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
                    {previewRows.map((row, i) => (
                      <TableRow key={i}>
                        {previewCols.map((col) => (
                          <TableCell key={col} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                            {row[col] == null ? "" : String(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
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

      {availableDataSources.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No data sources available in this folder. Add a data source to the folder first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect Data Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data Source</label>
              <Select value={selectedDsId} onValueChange={setSelectedDsId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a data source" />
                </SelectTrigger>
                <SelectContent>
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
      )}
    </div>
  );
}
