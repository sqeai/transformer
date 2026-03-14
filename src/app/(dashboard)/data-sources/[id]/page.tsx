"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  Server,
  Container,
  Warehouse,
  Save,
  Trash2,
  ChevronRight,
  ChevronDown,
  TableIcon,
  Columns3,
  Eye,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DataSourceDetail {
  id: string;
  name: string;
  type: "bigquery" | "mysql" | "postgres" | "redshift";
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  folderId?: string;
}

interface TableInfo {
  schema: string;
  name: string;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

interface TreeNodeState {
  expanded: boolean;
  columns?: ColumnInfo[];
  columnsLoading?: boolean;
  previewRows?: Record<string, unknown>[];
  previewLoading?: boolean;
  showPreview?: boolean;
}

const DEFAULT_BIGQUERY_ID = "__default_bigquery__";

export default function DataSourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [ds, setDs] = useState<DataSourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [mysqlHost, setMysqlHost] = useState("");
  const [mysqlPort, setMysqlPort] = useState("3306");
  const [mysqlUser, setMysqlUser] = useState("");
  const [mysqlPassword, setMysqlPassword] = useState("");
  const [mysqlDatabase, setMysqlDatabase] = useState("");
  const [bqProjectId, setBqProjectId] = useState("");
  const [bqCredentials, setBqCredentials] = useState("");
  const [bqCredentialsTouched, setBqCredentialsTouched] = useState(false);
  const [pgHost, setPgHost] = useState("");
  const [pgPort, setPgPort] = useState("5432");
  const [pgUser, setPgUser] = useState("");
  const [pgPassword, setPgPassword] = useState("");
  const [pgDatabase, setPgDatabase] = useState("");
  const [pgSsl, setPgSsl] = useState(false);
  const [rsHost, setRsHost] = useState("");
  const [rsPort, setRsPort] = useState("5439");
  const [rsUser, setRsUser] = useState("");
  const [rsPassword, setRsPassword] = useState("");
  const [rsDatabase, setRsDatabase] = useState("");

  // Test connection
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Table explorer
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesLoaded, setTablesLoaded] = useState(false);
  const [treeState, setTreeState] = useState<Record<string, TreeNodeState>>({});
  const [schemaExpanded, setSchemaExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (id === DEFAULT_BIGQUERY_ID) {
      router.replace("/");
    }
  }, [id, router]);

  const fetchDataSource = useCallback(async () => {
    if (id === DEFAULT_BIGQUERY_ID) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/data-sources/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const d = data.dataSource as DataSourceDetail;
      setDs(d);
      setName(d.name);
      if (d.type === "mysql") {
        const c = d.config as Record<string, unknown>;
        setMysqlHost((c.host as string) ?? "");
        setMysqlPort(String(c.port ?? "3306"));
        setMysqlUser((c.user as string) ?? "");
        setMysqlPassword((c.password as string) ?? "");
        setMysqlDatabase((c.database as string) ?? "");
      } else if (d.type === "bigquery") {
        const c = d.config as Record<string, unknown>;
        setBqProjectId((c.projectId as string) ?? "");
        if (c.credentials) {
          setBqCredentials(
            typeof c.credentials === "string"
              ? c.credentials
              : JSON.stringify(c.credentials, null, 2)
          );
        }
      } else if (d.type === "postgres") {
        const c = d.config as Record<string, unknown>;
        setPgHost((c.host as string) ?? "");
        setPgPort(String(c.port ?? "5432"));
        setPgUser((c.user as string) ?? "");
        setPgPassword((c.password as string) ?? "");
        setPgDatabase((c.database as string) ?? "");
        setPgSsl(!!c.ssl);
      } else if (d.type === "redshift") {
        const c = d.config as Record<string, unknown>;
        setRsHost((c.host as string) ?? "");
        setRsPort(String(c.port ?? "5439"));
        setRsUser((c.user as string) ?? "");
        setRsPassword((c.password as string) ?? "");
        setRsDatabase((c.database as string) ?? "");
      }
    } catch {
      toast.error("Failed to load data source");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDataSource();
  }, [fetchDataSource]);

  const buildConfig = useCallback(() => {
    if (!ds) return {};
    if (ds.type === "mysql") {
      return {
        host: mysqlHost,
        port: parseInt(mysqlPort, 10) || 3306,
        user: mysqlUser,
        password: mysqlPassword,
        database: mysqlDatabase,
      };
    }
    if (ds.type === "bigquery") {
      if (!bqCredentialsTouched) {
        return { projectId: bqProjectId };
      }
      let credentials: Record<string, unknown> | undefined;
      let projectId = bqProjectId;
      if (bqCredentials.trim()) {
        try {
          const parsed = JSON.parse(bqCredentials.trim());
          if (parsed.credentials && typeof parsed.credentials === "object") {
            credentials = parsed.credentials as Record<string, unknown>;
            if (!projectId && parsed.projectId) projectId = parsed.projectId;
          } else {
            credentials = parsed;
          }
        } catch {
          return null;
        }
      }
      return {
        projectId,
        ...(credentials ? { credentials } : {}),
      };
    }
    if (ds.type === "postgres") {
      return {
        host: pgHost,
        port: parseInt(pgPort, 10) || 5432,
        user: pgUser,
        password: pgPassword,
        database: pgDatabase,
        ssl: pgSsl,
      };
    }
    if (ds.type === "redshift") {
      return {
        host: rsHost,
        port: parseInt(rsPort, 10) || 5439,
        user: rsUser,
        password: rsPassword,
        database: rsDatabase,
      };
    }
    return {};
  }, [ds, mysqlHost, mysqlPort, mysqlUser, mysqlPassword, mysqlDatabase, bqProjectId, bqCredentials, bqCredentialsTouched, pgHost, pgPort, pgUser, pgPassword, pgDatabase, pgSsl, rsHost, rsPort, rsUser, rsPassword, rsDatabase]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/data-sources/${id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) toast.success("Connection successful!");
      else toast.error(data.error ?? "Connection failed");
    } catch {
      setTestResult({ ok: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const config = buildConfig();
    if (!config) {
      toast.error("Invalid credentials JSON");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/data-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Saved");
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/data-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Data source deleted");
      router.push(ds?.folderId ? `/folders/${ds.folderId}/data-sources` : "/folders");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleLoadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await fetch(`/api/data-sources/${id}/tables`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTables(data.tables ?? []);
      setTablesLoaded(true);
      const schemaNames: string[] = (data.tables ?? []).map((t: TableInfo) => t.schema);
      const expanded: Record<string, boolean> = {};
      for (const s of new Set(schemaNames)) { expanded[s] = true; }
      setSchemaExpanded(expanded);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setTablesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!ds || tablesLoaded) return;
    void handleLoadTables();
  }, [ds, tablesLoaded, handleLoadTables]);

  const toggleTable = (schema: string, table: string) => {
    const key = `${schema}.${table}`;
    setTreeState((prev) => {
      const node = prev[key] ?? { expanded: false };
      const next = { ...node, expanded: !node.expanded };
      if (next.expanded && !node.columns && !node.columnsLoading) {
        next.columnsLoading = true;
        fetchColumns(schema, table);
      }
      return { ...prev, [key]: next };
    });
  };

  const fetchColumns = async (schema: string, table: string) => {
    const key = `${schema}.${table}`;
    try {
      const res = await fetch(
        `/api/data-sources/${id}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/columns`,
      );
      const data = await res.json();
      setTreeState((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          columns: data.columns ?? [],
          columnsLoading: false,
        },
      }));
    } catch {
      setTreeState((prev) => ({
        ...prev,
        [key]: { ...prev[key], columnsLoading: false },
      }));
    }
  };

  const togglePreview = async (schema: string, table: string) => {
    const key = `${schema}.${table}`;
    setTreeState((prev) => {
      const node = prev[key] ?? { expanded: true };
      if (node.showPreview) {
        return { ...prev, [key]: { ...node, showPreview: false } };
      }
      const next = { ...node, showPreview: true };
      if (!node.previewRows && !node.previewLoading) {
        next.previewLoading = true;
        fetchPreview(schema, table);
      }
      return { ...prev, [key]: next };
    });
  };

  const fetchPreview = async (schema: string, table: string) => {
    const key = `${schema}.${table}`;
    try {
      const res = await fetch(
        `/api/data-sources/${id}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/preview`,
      );
      const data = await res.json();
      setTreeState((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          previewRows: data.rows ?? [],
          previewLoading: false,
        },
      }));
    } catch {
      setTreeState((prev) => ({
        ...prev,
        [key]: { ...prev[key], previewLoading: false },
      }));
    }
  };

  // Group tables by schema
  const tablesBySchema = tables.reduce<Record<string, TableInfo[]>>((acc, t) => {
    (acc[t.schema] ??= []).push(t);
    return acc;
  }, {});

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading...
        </div>
      </>
    );
  }

  if (!ds) {
    return (
      <>
        <div className="text-center py-20 text-muted-foreground">
          Data source not found.
        </div>
      </>
    );
  }

  const TYPE_DISPLAY: Record<string, { icon: typeof Database; label: string; color: string; bg: string }> = {
    bigquery: { icon: Database, label: "BigQuery", color: "text-blue-500", bg: "bg-blue-500/10" },
    mysql: { icon: Server, label: "MySQL", color: "text-orange-500", bg: "bg-orange-500/10" },
    postgres: { icon: Container, label: "PostgreSQL", color: "text-sky-500", bg: "bg-sky-500/10" },
    redshift: { icon: Warehouse, label: "AWS Redshift", color: "text-red-500", bg: "bg-red-500/10" },
  };
  const typeMeta = TYPE_DISPLAY[ds.type] ?? TYPE_DISPLAY.mysql;
  const TypeIcon = typeMeta.icon;
  const typeLabel = typeMeta.label;
  const typeColor = typeMeta.color;
  const typeBg = typeMeta.bg;

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => router.push(ds.folderId ? `/folders/${ds.folderId}/data-sources` : "/folders")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Data Sources
        </Button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", typeBg)}>
              <TypeIcon className={cn("h-5 w-5", typeColor)} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{ds.name}</h1>
              <p className="text-sm text-muted-foreground">{typeLabel} Connection</p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete data source?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove &ldquo;{ds.name}&rdquo;. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                  {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Connection config */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connection Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Connection Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {ds.type === "mysql" && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="host">Host</Label>
                      <Input id="host" value={mysqlHost} onChange={(e) => setMysqlHost(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="port">Port</Label>
                      <Input id="port" value={mysqlPort} onChange={(e) => setMysqlPort(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="database">Database</Label>
                    <Input id="database" value={mysqlDatabase} onChange={(e) => setMysqlDatabase(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="user">Username</Label>
                      <Input id="user" value={mysqlUser} onChange={(e) => setMysqlUser(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" value={mysqlPassword} onChange={(e) => setMysqlPassword(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              {ds.type === "bigquery" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="projectId">Project ID</Label>
                    <Input id="projectId" value={bqProjectId} onChange={(e) => setBqProjectId(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="credentials">Service Account Key (JSON)</Label>
                    <Textarea
                      id="credentials"
                      className="font-mono text-xs min-h-[120px]"
                      value={bqCredentials}
                      onChange={(e) => {
                        setBqCredentials(e.target.value);
                        setBqCredentialsTouched(true);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use Application Default Credentials.
                    </p>
                  </div>
                </>
              )}

              {ds.type === "postgres" && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="pg-host">Host</Label>
                      <Input id="pg-host" value={pgHost} onChange={(e) => setPgHost(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pg-port">Port</Label>
                      <Input id="pg-port" value={pgPort} onChange={(e) => setPgPort(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pg-database">Database</Label>
                    <Input id="pg-database" value={pgDatabase} onChange={(e) => setPgDatabase(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pg-user">Username</Label>
                      <Input id="pg-user" value={pgUser} onChange={(e) => setPgUser(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pg-password">Password</Label>
                      <Input id="pg-password" type="password" value={pgPassword} onChange={(e) => setPgPassword(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="pg-ssl"
                      type="checkbox"
                      checked={pgSsl}
                      onChange={(e) => setPgSsl(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <Label htmlFor="pg-ssl" className="text-sm font-normal">
                      Use SSL
                    </Label>
                  </div>
                </>
              )}

              {ds.type === "redshift" && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="rs-host">Cluster Endpoint</Label>
                      <Input id="rs-host" value={rsHost} onChange={(e) => setRsHost(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rs-port">Port</Label>
                      <Input id="rs-port" value={rsPort} onChange={(e) => setRsPort(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-database">Database</Label>
                    <Input id="rs-database" value={rsDatabase} onChange={(e) => setRsDatabase(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rs-user">Username</Label>
                      <Input id="rs-user" value={rsUser} onChange={(e) => setRsUser(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rs-password">Password</Label>
                      <Input id="rs-password" type="password" value={rsPassword} onChange={(e) => setRsPassword(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                  {testing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : testResult?.ok ? (
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                  ) : testResult && !testResult.ok ? (
                    <XCircle className="mr-2 h-4 w-4 text-destructive" />
                  ) : null}
                  Test Connection
                </Button>
                {testResult && (
                  <span className={cn("text-sm", testResult.ok ? "text-green-500" : "text-destructive")}>
                    {testResult.ok ? "Connected" : testResult.error}
                  </span>
                )}
              </div>

              <Separator />

              <div className="flex justify-end gap-3">
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right: Table Explorer */}
          <Card className="flex flex-col">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Table Explorer</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadTables}
                disabled={tablesLoading}
              >
                {tablesLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {tablesLoaded ? "Refresh" : "Load Tables"}
              </Button>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {!tablesLoaded && !tablesLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Click &ldquo;Load Tables&rdquo; to browse available tables.
                  </p>
                </div>
              ) : tablesLoading && tables.length === 0 ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading tables...</span>
                </div>
              ) : tables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <TableIcon className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No tables found.</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="p-3 space-y-0.5">
                    {Object.entries(tablesBySchema).map(([schema, schemaTables]) => (
                      <div key={schema}>
                        {/* Schema node */}
                        <button
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                          onClick={() =>
                            setSchemaExpanded((prev) => ({
                              ...prev,
                              [schema]: !prev[schema],
                            }))
                          }
                        >
                          {schemaExpanded[schema] ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
                          <span className="truncate">{schema}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {schemaTables.length}
                          </span>
                        </button>

                        {schemaExpanded[schema] &&
                          schemaTables.map((t) => {
                            const key = `${t.schema}.${t.name}`;
                            const node = treeState[key] ?? { expanded: false };
                            return (
                              <div key={key} className="ml-4">
                                {/* Table node */}
                                <div className="flex items-center gap-1">
                                  <button
                                    className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-muted/50 transition-colors"
                                    onClick={() => toggleTable(t.schema, t.name)}
                                  >
                                    {node.expanded ? (
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    )}
                                    <TableIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                                    <span className="truncate">{t.name}</span>
                                  </button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    onClick={() => togglePreview(t.schema, t.name)}
                                    title="Preview data"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </div>

                                {/* Columns */}
                                {node.expanded && (
                                  <div className="ml-6 space-y-0.5 py-0.5">
                                    {node.columnsLoading ? (
                                      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Loading columns...
                                      </div>
                                    ) : (
                                      (node.columns ?? []).map((col) => (
                                        <div
                                          key={col.name}
                                          className="flex items-center gap-1.5 px-2 py-0.5 text-xs"
                                        >
                                          <Columns3 className="h-3 w-3 shrink-0 text-muted-foreground" />
                                          <span className="font-medium truncate">
                                            {col.name}
                                          </span>
                                          <span className="ml-auto text-muted-foreground font-mono text-[10px] uppercase">
                                            {col.type}
                                          </span>
                                          {col.nullable && (
                                            <span className="text-muted-foreground/60 text-[10px]">
                                              null
                                            </span>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}

                                {/* Data preview */}
                                {node.showPreview && (
                                  <div className="ml-2 mt-1 mb-2 rounded-lg border bg-card overflow-hidden">
                                    {node.previewLoading ? (
                                      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Loading preview...
                                      </div>
                                    ) : !node.previewRows || node.previewRows.length === 0 ? (
                                      <div className="py-6 text-center text-xs text-muted-foreground">
                                        No data
                                      </div>
                                    ) : (
                                      <div className="overflow-auto max-h-[300px]">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              {Object.keys(node.previewRows[0]).map((col) => (
                                                <TableHead
                                                  key={col}
                                                  className="text-[11px] font-semibold whitespace-nowrap px-2 py-1.5 h-auto"
                                                >
                                                  {col}
                                                </TableHead>
                                              ))}
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {node.previewRows.slice(0, 20).map((row, i) => (
                                              <TableRow key={i}>
                                                {Object.values(row).map((val, j) => (
                                                  <TableCell
                                                    key={j}
                                                    className="text-[11px] whitespace-nowrap px-2 py-1 h-auto max-w-[200px] truncate"
                                                  >
                                                    {val === null ? (
                                                      <span className="text-muted-foreground italic">
                                                        null
                                                      </span>
                                                    ) : (
                                                      String(val)
                                                    )}
                                                  </TableCell>
                                                ))}
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                        {node.previewRows.length > 20 && (
                                          <div className="text-center text-[10px] text-muted-foreground py-1 border-t">
                                            Showing 20 of {node.previewRows.length} rows
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
