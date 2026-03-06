"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { toast } from "sonner";

function NewDataSourceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") as "bigquery" | "mysql" | "postgres" | "redshift" | null;
  const folderId = searchParams.get("folderId");
  const backHref = folderId ? `/folders/${folderId}/data-sources` : "/folders";

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // MySQL fields
  const [mysqlHost, setMysqlHost] = useState("localhost");
  const [mysqlPort, setMysqlPort] = useState("3306");
  const [mysqlUser, setMysqlUser] = useState("");
  const [mysqlPassword, setMysqlPassword] = useState("");
  const [mysqlDatabase, setMysqlDatabase] = useState("");

  // BigQuery fields
  const [bqProjectId, setBqProjectId] = useState("");
  const [bqCredentials, setBqCredentials] = useState("");

  // Postgres fields
  const [pgHost, setPgHost] = useState("localhost");
  const [pgPort, setPgPort] = useState("5432");
  const [pgUser, setPgUser] = useState("");
  const [pgPassword, setPgPassword] = useState("");
  const [pgDatabase, setPgDatabase] = useState("");
  const [pgSsl, setPgSsl] = useState(false);

  // Redshift fields
  const [rsHost, setRsHost] = useState("");
  const [rsPort, setRsPort] = useState("5439");
  const [rsUser, setRsUser] = useState("");
  const [rsPassword, setRsPassword] = useState("");
  const [rsDatabase, setRsDatabase] = useState("");

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const buildConfig = useCallback(() => {
    if (type === "mysql") {
      return {
        host: mysqlHost,
        port: parseInt(mysqlPort, 10) || 3306,
        user: mysqlUser,
        password: mysqlPassword,
        database: mysqlDatabase,
      };
    }
    if (type === "bigquery") {
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
    if (type === "postgres") {
      return {
        host: pgHost,
        port: parseInt(pgPort, 10) || 5432,
        user: pgUser,
        password: pgPassword,
        database: pgDatabase,
        ssl: pgSsl,
      };
    }
    if (type === "redshift") {
      return {
        host: rsHost,
        port: parseInt(rsPort, 10) || 5439,
        user: rsUser,
        password: rsPassword,
        database: rsDatabase,
      };
    }
    return {};
  }, [type, mysqlHost, mysqlPort, mysqlUser, mysqlPassword, mysqlDatabase, bqProjectId, bqCredentials, pgHost, pgPort, pgUser, pgPassword, pgDatabase, pgSsl, rsHost, rsPort, rsUser, rsPassword, rsDatabase]);

  const handleTestConnection = async () => {
    const config = buildConfig();
    if (!config) {
      toast.error("Invalid credentials JSON");
      return;
    }
    if (type === "bigquery" && bqCredentials.trim()) {
      try {
        const parsed = JSON.parse(bqCredentials.trim());
        const creds = (parsed.credentials && typeof parsed.credentials === "object")
          ? parsed.credentials
          : parsed;
        if (!creds.client_email || !creds.private_key) {
          toast.error(
            "Service account JSON is missing required fields (client_email, private_key). " +
            "Please paste the full JSON key file from Google Cloud Console."
          );
          setTestResult({
            ok: false,
            error: "Missing client_email or private_key in credentials JSON",
          });
          return;
        }
      } catch {
        toast.error("Invalid credentials JSON");
        return;
      }
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/data-sources/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, config }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) toast.success("Connection successful!");
      else toast.error(data.error ?? "Connection failed");
    } catch {
      setTestResult({ ok: false, error: "Network error" });
      toast.error("Network error");
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
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          config,
          ...(folderId ? { folderId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Data source created");
      if (folderId) {
        router.push(`/folders/${folderId}/data-sources`);
      } else {
        router.push(`/data-sources/${data.dataSource.id}`);
      }
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const validTypes = ["bigquery", "mysql", "postgres", "redshift"] as const;
  if (!type || !validTypes.includes(type)) {
    router.replace(backHref);
    return null;
  }

  const TYPE_DISPLAY: Record<string, { icon: typeof Database; label: string; color: string; bg: string }> = {
    bigquery: { icon: Database, label: "BigQuery", color: "text-blue-500", bg: "bg-blue-500/10" },
    mysql: { icon: Server, label: "MySQL", color: "text-orange-500", bg: "bg-orange-500/10" },
    postgres: { icon: Container, label: "PostgreSQL", color: "text-sky-500", bg: "bg-sky-500/10" },
    redshift: { icon: Warehouse, label: "AWS Redshift", color: "text-red-500", bg: "bg-red-500/10" },
  };
  const meta = TYPE_DISPLAY[type];
  const TypeIcon = meta.icon;
  const typeLabel = meta.label;
  const typeColor = meta.color;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => router.push(backHref)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Data Sources
        </Button>

        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.bg}`}>
            <TypeIcon className={`h-5 w-5 ${typeColor}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              New {typeLabel} Connection
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure your {typeLabel} connection details.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connection Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Connection Name</Label>
              <Input
                id="name"
                placeholder={`My ${typeLabel} Database`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {type === "mysql" && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="host">Host</Label>
                    <Input
                      id="host"
                      placeholder="localhost"
                      value={mysqlHost}
                      onChange={(e) => setMysqlHost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      placeholder="3306"
                      value={mysqlPort}
                      onChange={(e) => setMysqlPort(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="database">Database</Label>
                  <Input
                    id="database"
                    placeholder="my_database"
                    value={mysqlDatabase}
                    onChange={(e) => setMysqlDatabase(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="user">Username</Label>
                    <Input
                      id="user"
                      placeholder="root"
                      value={mysqlUser}
                      onChange={(e) => setMysqlUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={mysqlPassword}
                      onChange={(e) => setMysqlPassword(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {type === "bigquery" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="projectId">Project ID</Label>
                  <Input
                    id="projectId"
                    placeholder="my-gcp-project"
                    value={bqProjectId}
                    onChange={(e) => setBqProjectId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credentials">
                    Service Account Key (JSON)
                  </Label>
                  <Textarea
                    id="credentials"
                    placeholder='Paste the contents of your service account key JSON file...'
                    className="font-mono text-xs min-h-[160px]"
                    value={bqCredentials}
                    onChange={(e) => setBqCredentials(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use Application Default Credentials.
                  </p>
                </div>
              </>
            )}

            {type === "postgres" && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="pg-host">Host</Label>
                    <Input
                      id="pg-host"
                      placeholder="localhost"
                      value={pgHost}
                      onChange={(e) => setPgHost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pg-port">Port</Label>
                    <Input
                      id="pg-port"
                      placeholder="5432"
                      value={pgPort}
                      onChange={(e) => setPgPort(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pg-database">Database</Label>
                  <Input
                    id="pg-database"
                    placeholder="my_database"
                    value={pgDatabase}
                    onChange={(e) => setPgDatabase(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pg-user">Username</Label>
                    <Input
                      id="pg-user"
                      placeholder="postgres"
                      value={pgUser}
                      onChange={(e) => setPgUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pg-password">Password</Label>
                    <Input
                      id="pg-password"
                      type="password"
                      placeholder="••••••••"
                      value={pgPassword}
                      onChange={(e) => setPgPassword(e.target.value)}
                    />
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

            {type === "redshift" && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="rs-host">Cluster Endpoint</Label>
                    <Input
                      id="rs-host"
                      placeholder="my-cluster.abc123.us-east-1.redshift.amazonaws.com"
                      value={rsHost}
                      onChange={(e) => setRsHost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-port">Port</Label>
                    <Input
                      id="rs-port"
                      placeholder="5439"
                      value={rsPort}
                      onChange={(e) => setRsPort(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rs-database">Database</Label>
                  <Input
                    id="rs-database"
                    placeholder="dev"
                    value={rsDatabase}
                    onChange={(e) => setRsDatabase(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rs-user">Username</Label>
                    <Input
                      id="rs-user"
                      placeholder="awsuser"
                      value={rsUser}
                      onChange={(e) => setRsUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-password">Password</Label>
                    <Input
                      id="rs-password"
                      type="password"
                      placeholder="••••••••"
                      value={rsPassword}
                      onChange={(e) => setRsPassword(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing}
              >
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
                <span
                  className={`text-sm ${testResult.ok ? "text-green-500" : "text-destructive"}`}
                >
                  {testResult.ok ? "Connected" : testResult.error}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.push(backHref)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Save Connection
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function NewDataSourcePage() {
  return (
    <Suspense fallback={null}>
      <NewDataSourceContent />
    </Suspense>
  );
}
